"""Small manually checked extraction regression set, separate from engine verdict labels.

python3 scripts/evaluate_extraction.py --live [--model MODEL] [--case combined_utilities]
Each selected case makes one paid OpenAI call. Nothing is uploaded without --live.
The expectations never enter the model prompt. This is a regression set, not an accuracy study.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path

import ai_extract

ROOT = Path(__file__).resolve().parents[1]


def score(case, result):
    fields = result['fields']
    checks = []
    for key, expected in case['expected_fields'].items():
        actual = fields.get(key, {}).get('value')
        checks.append({'field': key, 'expected': expected, 'actual': actual,
                       'pass': type(actual) is type(expected) and actual == expected
                       or type(actual) in (int, float) and type(expected) in (int, float) and actual == expected})
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--model')
    parser.add_argument('--case')
    args = parser.parse_args()
    cases = json.loads((ROOT / 'tests/fixtures/extraction_eval.json').read_text())
    if args.case:
        cases = [c for c in cases if c['id'] == args.case]
        if not cases:
            parser.error('Unknown evaluation case.')
    if not args.live:
        for c in cases:
            print(c['id'] + ': ' + c['notes'])
        print('Add --live to run these cases against OpenAI (uses API credits).')
        return
    ai_extract.load_env(ROOT / '.env')
    if args.model:
        os.environ['OPENAI_MODEL'] = args.model
    failed = False
    for case in cases:
        path = ROOT / case['file']
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != case['sha256']:
            raise SystemExit('Evaluation file changed; verify the labels before rerunning: ' + case['id'])
        payload = {'files': [{'name': path.name, 'type': case['type'], 'data': base64.b64encode(raw).decode()}]}
        try:
            result = ai_extract.extract(payload)
            checks = score(case, result)
            failed = failed or any(not c['pass'] for c in checks)
            print(json.dumps({'case': case['id'], 'checks': checks, 'metrics': result.get('metrics')}, ensure_ascii=False))
        except ai_extract.ExtractionError as exc:
            failed = True
            print(json.dumps({'case': case['id'], 'error': str(exc)}))
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
