"""Evidence accumulation is independent of verdict rules and live model availability."""
import base64
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import ai_extract as ai
import evidence_store
import evidence_workflow as workflow
import serve


def fact(value, source='bill.pdf', confidence='high'):
    return {'value': value, 'source_file': source, 'confidence': confidence, 'evidence': 'Page 1: explicit observation', 'page': 1}


def record(id='a', billing=None, **values):
    return {'id': id, 'name': id + '.pdf', 'result': {'fields': {k: fact(v, id + '.pdf') for k, v in values.items()}, 'warnings': [], 'billing': billing or {}}}


def billing(start='2024-01-01', end='2024-12-31', **changes):
    return {'start_date': start, 'end_date': end, 'consumption_amount': 18000, 'consumption_unit': 'kwh',
            'energy_carrier': 'gas', 'meter_reading_type': 'actual', 'page': 1, 'evidence': 'Gasverbrauch: 18.000 kWh', **changes}


class Reconciliation(unittest.TestCase):
    def test_extra_files_retain_earlier_facts_and_do_not_invent_missing_ones(self):
        result = workflow.merge([record('a', floor_area_m2=150), record('b', radiator_count=12)])
        self.assertEqual(result['fields']['floor_area_m2']['value'], 150)
        self.assertEqual(len(result['documents']), 2)
        self.assertEqual(len(result['observations']), 2)
        self.assertEqual(result['conflicts'], [])

    def test_conflicting_areas_are_kept_and_never_averaged(self):
        result = workflow.merge([record('a', floor_area_m2=150), record('b', floor_area_m2=180)])
        self.assertIsNone(result['fields']['floor_area_m2']['value'])
        self.assertEqual([o['value'] for o in result['conflicts'][0]['candidates']], [150, 180])
        self.assertIn('heated rooms', result['conflicts'][0]['question'])

    def test_equal_consumption_for_different_years_still_requires_a_bill_choice(self):
        result = workflow.merge([record('a', billing(), annual_consumption_kwh=18000),
                                 record('b', billing('2023-01-01', '2023-12-31'), annual_consumption_kwh=18000)])
        self.assertEqual(result['conflicts'][0]['kind'], 'different_periods')
        self.assertIsNone(result['fields']['annual_consumption_kwh']['value'])

    def test_questionnaire_disagreement_is_a_review_not_a_silent_override(self):
        result = workflow.merge([record('a', floor_area_m2=180)], {'floor_area_m2': 150})
        self.assertEqual(result['conflicts'][0]['current_value'], 150)
        self.assertEqual(result['observations'][0]['value'], 180)

    def test_resolution_is_valid_only_for_the_exact_observations_and_current_answer(self):
        records = [record('a', floor_area_m2=150), record('b', floor_area_m2=180)]
        review = {'floor_area_m2': {'considered_ids': ['a:floor_area_m2', 'b:floor_area_m2'], 'selected_id': 'b:floor_area_m2', 'value': 180}}
        q = {'floor_area_m2': 180, 'extraction_evidence': {'_reviews': review}}
        self.assertEqual(workflow.merge(records, q)['conflicts'], [])
        self.assertTrue(workflow.merge(records, {**q, 'floor_area_m2': 200})['conflicts'])
        self.assertTrue(workflow.merge(records + [record('c', floor_area_m2=160)], q)['conflicts'])
        self.assertEqual(len(workflow.merge(records, q)['observations']), 2)

    def test_repetition_does_not_upgrade_model_confidence(self):
        r = record('a', floor_area_m2=150)
        r['result']['fields']['floor_area_m2']['confidence'] = 'medium'
        other = copy.deepcopy(r); other['id'] = 'b'
        self.assertEqual(workflow.merge([r, other])['fields']['floor_area_m2']['confidence'], 'medium')

    def test_leave_unknown_is_remembered_without_becoming_a_fake_document_fact(self):
        q = {'floor_area_m2': None, 'extraction_evidence': {'_reviews': {'floor_area_m2': {
            'considered_ids': ['a:floor_area_m2', 'b:floor_area_m2'], 'selected_id': 'unknown', 'value': None}}}}
        merged = workflow.merge([record('a', floor_area_m2=150), record('b', floor_area_m2=180)], q)
        self.assertEqual(merged['conflicts'], [])
        self.assertIsNone(merged['fields']['floor_area_m2']['value'])
        self.assertEqual(len(merged['observations']), 2)


class Billing(unittest.TestCase):
    def normalize(self, bill, **values):
        data = {'fields': {k: fact(values.get(k)) for k in ai.FIELD_KEYS}, 'warnings': [], 'billing': bill}
        return ai.normalize_billing(data, {'bill.pdf'})

    def test_leap_year_and_partial_period_are_verified_in_python(self):
        full = self.normalize(billing(), energy_carrier='gas', annual_consumption_kwh=18000)
        self.assertEqual(full['billing']['days'], 366)
        self.assertTrue(full['fields']['consumption_full_year']['value'])
        partial = self.normalize(billing(end='2024-06-30'), energy_carrier='gas', annual_consumption_kwh=18000)
        self.assertFalse(partial['fields']['consumption_full_year']['value'])
        self.assertEqual(partial['fields']['annual_consumption_kwh']['value'], 18000)
        out = serve.assess({'annual_consumption_kwh': 18000, 'energy_carrier': 'gas', 'consumption_full_year': False})
        self.assertIsNone(out['outputs']['01_heat_load']['heating_load_kw']['by_consumption'])

    def test_invalid_dates_and_reversed_period_cannot_keep_an_annual_flag(self):
        for bill in (billing(start='2024-13-01'), billing(start='2025-01-01'), billing(end=None)):
            self.assertIsNone(self.normalize(bill, consumption_full_year=True)['fields']['consumption_full_year']['value'])

    def test_absence_of_a_mention_cannot_become_a_negative_fact(self):
        data = {'fields': {k: fact(None) for k in ai.FIELD_KEYS}, 'warnings': []}
        data['fields']['solar_thermal'] = {**fact(False), 'evidence': 'No mention or indication of solar thermal in billing document'}
        self.assertIsNone(ai.validate_result(data, {'bill.pdf'})['fields']['solar_thermal']['value'])
        data['fields']['solar_thermal']['evidence'] = 'No solar thermal system installed (installer survey)'
        self.assertFalse(ai.validate_result(data, {'bill.pdf'})['fields']['solar_thermal']['value'])

    def test_oil_conversion_is_explicit_approximate_and_not_annualized(self):
        out = self.normalize(billing(consumption_amount=2000, consumption_unit='litres', energy_carrier='oil'), energy_carrier='oil')
        f = out['fields']['annual_consumption_kwh']
        self.assertEqual(f['value'], 20000)
        self.assertEqual(f['confidence'], 'medium')
        self.assertIn('approximation', f['evidence'])
        self.assertEqual(out['billing']['consumption_amount'], 2000)

    def test_wrong_fuel_and_unit_and_household_electricity_cannot_fill_heating_demand(self):
        wrong = self.normalize(billing(consumption_unit='litres'), energy_carrier='gas', annual_consumption_kwh=18000)
        self.assertIsNone(wrong['fields']['annual_consumption_kwh']['value'])
        electric = self.normalize(billing(energy_carrier='electric'), energy_carrier=None, annual_consumption_kwh=18000)
        self.assertIsNone(electric['fields']['annual_consumption_kwh']['value'])
        mixed = self.normalize(billing(energy_carrier='oil'), energy_carrier='gas', annual_consumption_kwh=18000)
        self.assertIsNone(mixed['fields']['annual_consumption_kwh']['value'])


class Cache(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name) / 'data' / 'demo' / 'C-20261024-a1b2'
        (self.folder / 'raw' / 'documents').mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def add(self, i):
        (self.folder / 'raw' / 'documents' / f'bill{i}.pdf').write_bytes(f'%PDF-1.4\nfixture {i}'.encode())

    def extract(self, payload, questionnaire):
        name = payload['files'][0]['name']
        return {'fields': {k: fact(150 if k == 'floor_area_m2' else None, name) for k in ai.FIELD_KEYS}, 'warnings': [], 'billing': {}}

    def test_more_than_three_uploads_accumulate_and_repeat_is_free_of_api_calls(self):
        for i in range(4): self.add(i)
        with patch.object(ai, 'extract', side_effect=self.extract) as call:
            first = evidence_store.extract_customer(self.folder, {}, {})
            self.assertEqual(first['metrics']['remaining_files'], 1)
            second = evidence_store.extract_customer(self.folder, {}, {})
            self.assertEqual(len(second['documents']), 4)
            self.assertEqual(call.call_count, 4)
            third = evidence_store.extract_customer(self.folder, {}, {})
            self.assertEqual(third['metrics']['api_calls'], 0)
            self.assertEqual(third['metrics']['cached_files'], 4)
            self.assertEqual(len(third['observations']), 4)
            self.assertEqual(call.call_count, 4)

    def test_questionnaire_changes_reconcile_cached_facts_without_another_model_call(self):
        self.add(1)
        with patch.object(ai, 'extract', side_effect=self.extract) as call:
            evidence_store.extract_customer(self.folder, {}, {})
            changed = evidence_store.extract_customer(self.folder, {}, {'floor_area_m2': 180})
        self.assertEqual(call.call_count, 1)
        self.assertEqual(changed['conflicts'][0]['kind'], 'questionnaire')

    def test_failed_new_file_keeps_earlier_evidence_and_can_be_retried(self):
        self.add(1)
        with patch.object(ai, 'extract', side_effect=self.extract):
            evidence_store.extract_customer(self.folder, {}, {})
        self.add(2)
        with patch.object(ai, 'extract', side_effect=ai.ExtractionError('Temporary outage', 502)):
            result = evidence_store.extract_customer(self.folder, {}, {})
        self.assertEqual(len(result['documents']), 1)
        self.assertEqual(len(result['failures']), 1)
        with patch.object(ai, 'extract', side_effect=self.extract):
            self.assertEqual(len(evidence_store.extract_customer(self.folder, {}, {})['documents']), 2)

    def test_duplicate_bytes_are_saved_once_even_with_a_different_filename(self):
        raw = b'%PDF-1.4\nSame file'
        body = {'customer_id': self.folder.name, 'files': [{'name': 'bill.pdf', 'type': 'application/pdf', 'data': base64.b64encode(raw).decode()}]}
        demo = self.folder.parent
        serve.save_uploads(body, demo)
        body['files'][0]['name'] = 'renamed.pdf'
        result = serve.save_uploads(body, demo)
        self.assertEqual(result['duplicates'], 1)
        self.assertEqual(len(list((self.folder / 'raw' / 'documents').glob('*'))), 1)


class FollowUp(unittest.TestCase):
    def test_conflicts_are_first_then_full_year_bill_then_radiator_evidence(self):
        result = serve.assess({})
        self.assertEqual(result['follow_up']['id'], 'annual_bill')
        next_q = workflow.next_question({}, result, [{'field': 'floor_area_m2', 'question': 'Which area?'}])
        self.assertEqual(next_q['id'], 'conflict:floor_area_m2')
        q = {'annual_consumption_kwh': 20000, 'consumption_full_year': True, 'heat_distribution': 'radiators', 'radiator_count': 12}
        self.assertEqual(workflow.next_question(q, result)['id'], 'radiator_photo')
        self.assertEqual(workflow.next_question({**q, 'radiator_type': '22'}, result)['id'], 'pipe_layout')
