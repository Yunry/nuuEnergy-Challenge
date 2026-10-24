"""Exercise supplied PDFs/photos through upload, extraction and assessment HTTP APIs.

python3 scripts/check_data_uploads.py             # local upload checks only
python3 scripts/check_data_uploads.py --live      # sends data files to OpenAI, uses credits
All customer folders and extraction records live in a temporary directory. Original data is read-only.
Duplicate file contents are tested once. Output contains status/counts, not document text or identifiers.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
import hashlib
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import tempfile
import threading
from unittest.mock import patch
import urllib.error
import urllib.request

import serve

ROOT = Path(__file__).resolve().parents[1]


def supplied_files():
    groups = {}
    for root in ('raw', 'customer', 'customers'):
        for path in sorted((ROOT / 'data' / root).rglob('*')):
            if path.is_file() and path.suffix.lower() in serve.FILE_TYPES:
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                groups.setdefault(digest, []).append(path)
    return list(groups.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Send supplied files to OpenAI (uses API credits).')
    parser.add_argument('--output', type=Path, help='Optional JSON status report, without extracted document text.')
    args = parser.parse_args()
    if args.live and not serve.ai_extract.configured():
        parser.error('OPENAI_API_KEY is not configured.')
    groups = supplied_files()
    class QuietHandler(serve.Handler):
        def log_message(self, *_):
            pass
    with tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
        demo = Path(tmp) / 'data' / 'demo'
        for folder in serve.DEMO.glob('B-[0-9]*'):
            shutil.copytree(folder, demo / folder.name)
        original_save = serve.save_uploads
        stack.enter_context(patch.object(serve, 'DEMO', demo))
        stack.enter_context(patch.object(serve, 'save_uploads', lambda body: original_save(body, demo)))
        server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        def request(path, body=None):
            req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req, timeout=110) as response:
                    return json.load(response)
            except urllib.error.HTTPError as exc:
                try:
                    message = json.load(exc).get('error', f'HTTP {exc.code}')
                except ValueError:
                    message = f'HTTP {exc.code}'
                raise RuntimeError(message) from None
        try:
            examples = request('/api/samples')
            for home in examples:
                result = request('/api/demo/' + home['building_id'])
                serve.intake.check_uniform(result['processed'])
                assert result['outputs']['decision']['verdict'] in ('green', 'yellow', 'red')
            def check(item):
                i, paths = item
                path = paths[0]
                customer_id = f'C-20000101-{i:04x}'
                payload = {'customer_id': customer_id, 'files': [{'name': path.name,
                           'type': serve.FILE_TYPES[path.suffix.lower()],
                           'data': base64.b64encode(path.read_bytes()).decode()}]}
                row = {'file': str(path.relative_to(ROOT)), 'copies': len(paths)}
                try:
                    saved = request('/api/upload', payload)
                    assert len(saved['saved']) == 1
                    row['upload'] = 'passed'
                    if args.live:
                        extraction = request('/api/extract', {**payload, 'questionnaire': {'building_id': customer_id}})
                        assert not extraction.get('failures'), 'Extraction failed'
                        assert extraction.get('metrics', {}).get('api_calls') == 1
                        fields = extraction['fields']
                        # Simulate explicit review, preserving evidence and nulls rather than inventing answers.
                        kept = {k: v for k, v in fields.items() if k in serve.intake.QUESTIONNAIRE_KEYS
                                and v['value'] is not None and v['confidence'] in ('high', 'medium')}
                        answers = {k: v['value'] for k, v in kept.items()}
                        answers.update({'building_id': customer_id, 'extraction_evidence': kept})
                        assessed = request('/api/assess', answers)
                        serve.intake.check_uniform(assessed['processed'])
                        assert (demo / customer_id / 'raw' / 'extraction.json').exists()
                        row.update(extraction='passed', assessment='passed', facts=len(kept),
                                   verdict=assessed['outputs']['decision']['verdict'])
                        cached = request('/api/extract', {**payload, 'questionnaire': {'building_id': customer_id}})
                        assert cached['metrics']['api_calls'] == 0, 'Repeat upload made another API call'
                        row['cache'] = 'passed'
                except (AssertionError, OSError, RuntimeError, ValueError) as exc:
                    row['error'] = str(exc)
                print(json.dumps(row), flush=True)
                return row
            with ThreadPoolExecutor(max_workers=3) as pool:
                rows = list(pool.map(check, enumerate(groups)))
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
    report = {'live': args.live, 'examples': [e['building_id'] for e in examples],
              'unique_files': len(rows), 'passed': sum('error' not in r for r in rows), 'files': rows}
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}))
    raise SystemExit(0 if report['passed'] == len(rows) else 1)


if __name__ == '__main__':
    main()
