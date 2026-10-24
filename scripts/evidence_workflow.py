"""Accumulate document observations, reconcile them and choose one useful follow-up.

This layer never calculates a verdict or changes the questionnaire/processed-data contract.
"""
import json

LABELS = {
    'floor_area_m2': 'heated floor area', 'construction_year': 'construction year',
    'annual_consumption_kwh': 'heating consumption', 'energy_carrier': 'heating fuel',
    'consumption_full_year': 'billing period', 'heat_distribution': 'room heating',
    'pipe_system': 'pipe layout', 'radiator_type': 'radiator type', 'radiator_count': 'radiator count',
}
BILL_KEYS = {'annual_consumption_kwh', 'consumption_full_year', 'energy_carrier'}


def observation_id(digest, key):
    return digest + ':' + key


def reviews(questionnaire):
    evidence = questionnaire.get('extraction_evidence') or {}
    return evidence.get('_reviews', {}) if isinstance(evidence, dict) else {}


def same(a, b):
    # bool and integer must not compare as equal (True != one radiator).
    return type(a) is type(b) and a == b or (type(a) in (int, float) and type(b) in (int, float) and a == b)


def merge(records, questionnaire=None):
    """One candidate per file/field, retained even when documents disagree. Never sum bills."""
    questionnaire = questionnaire or {}
    observations, warnings, documents = [], [], []
    keys = set()
    for record in records:
        digest, result = record['id'], record['result']
        billing = result.get('billing') or {}
        documents.append({'id': digest, 'name': record['name'], 'billing': billing})
        warnings.extend(result.get('warnings', []))
        for key, fact in result.get('fields', {}).items():
            keys.add(key)
            if fact.get('value') is not None:
                observations.append({**fact, 'id': observation_id(digest, key), 'field': key,
                                     'file_id': digest, 'billing': billing})
    fields, conflicts = {}, []
    resolutions = reviews(questionnaire)
    for key in sorted(keys):
        candidates = [o for o in observations if o['field'] == key]
        empty = {'value': None, 'confidence': 'low', 'evidence': '', 'source_file': None}
        if not candidates:
            fields[key] = empty
            continue
        distinct = {json.dumps(o['value'], sort_keys=True) for o in candidates}
        periods = {(o['billing'].get('start_date'), o['billing'].get('end_date')) for o in candidates}
        different_bills = key == 'annual_consumption_kwh' and len({o['file_id'] for o in candidates}) > 1 and (len(periods) > 1 or (None, None) in periods)
        current = questionnaire.get(key)
        mismatch = current is not None and any(not same(current, o['value']) for o in candidates)
        conflict = len(distinct) > 1 or different_bills or mismatch
        if key == 'building_notes':
            # Notes are independent observations, not competing scalar answers.
            fields[key] = {**candidates[0], 'value': '\n\n'.join(dict.fromkeys(o['value'] for o in candidates))[:3000]}
            continue
        review = resolutions.get(key, {}) if isinstance(resolutions, dict) else {}
        ids = sorted(o['id'] for o in candidates)
        resolved = (isinstance(review, dict) and review.get('considered_ids') == ids
                    and same(review.get('value'), current))
        selected = next((o for o in candidates if o['id'] == review.get('selected_id')), None) if isinstance(review, dict) else None
        if resolved and (review.get('selected_id') in ('answer', 'unknown') or (selected and same(selected['value'], current))):
            fields[key] = {**selected, 'resolved': True} if selected else {**empty, 'resolved': True}
        elif conflict:
            kind = 'different_periods' if different_bills else 'questionnaire' if mismatch and len(distinct) == 1 else 'documents'
            question = ('These bills cover different or unconfirmed periods. Which one represents a full year of heating?'
                        if different_bills else 'Do these floor areas include the same heated rooms?' if key == 'floor_area_m2'
                        else f'We found different answers for {LABELS.get(key, key.replace("_", " "))}. Which should we use?')
            conflicts.append({'field': key, 'kind': kind, 'question': question,
                              'current_value': current, 'candidates': candidates})
            fields[key] = empty
        else:
            # Keep the strongest single observation; repetition never upgrades confidence.
            fields[key] = max(candidates, key=lambda o: {'low': 0, 'medium': 1, 'high': 2}.get(o['confidence'], 0))
    return {'fields': fields, 'observations': observations, 'conflicts': conflicts,
            'documents': documents, 'warnings': list(dict.fromkeys(warnings))}


def next_question(questionnaire, assessment, conflicts=None):
    """Deterministic priorities: resolve contradictions, then demand, then heating evidence."""
    q, outputs = questionnaire, assessment['outputs']
    def question(key, title, reason, upload, step, target):
        return {'id': key, 'title': title, 'reason': reason, 'upload_hint': upload,
                'step': step, 'target': target}
    if conflicts:
        c = conflicts[0]
        key = c['field']
        return question('conflict:' + key, c['question'], 'Your sources disagree. Choosing one preserves the others in the evidence history.',
                        'Add a clearer document or review both readings.', 1, 'extraction-review')
    if q.get('annual_consumption_kwh') is None or q.get('consumption_full_year') is not True:
        return question('annual_bill', 'Can you provide one full year of heating use?',
                        'A short or unknown billing period cannot establish annual heating demand.',
                        'Add the consumption page showing heating fuel, dates and units. Keep different years separate.', 3, 'amount')
    if outputs['01_heat_load']['heating_load_kw'].get('consistent') is False:
        return question('demand_disagreement', 'Does the floor area include rooms you do not heat?',
                        'The bill and size-based heat estimates disagree. Check the period, heated area and any wood stove or other heat source.',
                        'A floor plan or a bill for the matching period can help explain the difference.', 1, 'floor_area_m2')
    if q.get('heat_distribution') is None:
        return question('heating_type', 'How do you heat your rooms?', 'The heat emitters determine the temperature checks we can make.',
                        'Add a photo of the room heating, or choose radiators, underfloor heating or both.', 2, 'heat_distribution')
    if q.get('heat_distribution') in ('radiators', 'mixed'):
        if q.get('radiator_count') is None:
            return question('radiator_count', 'How many radiators heat your home?', 'One close-up cannot tell us the whole-house radiator count.',
                            'Count them yourself or add a radiator schedule covering the home.', 2, 'radiator_count')
        if q.get('radiator_type') is None:
            return question('radiator_photo', 'Can you show a typical radiator from the side?', 'Panel type affects the range of possible radiator outputs.',
                            'Include its side, height and width. A photograph alone cannot certify its heating capacity.', 2, 'radiator_type')
        if q.get('pipe_system') is None:
            return question('pipe_layout', 'Do you know the heating pipe layout?', 'An ambiguous valve block does not establish single-pipe or two-pipe heating.',
                            'Add a wider photo of the radiator connection or an installer’s hydraulic diagram.', 3, 'pipe_system')
    return None
