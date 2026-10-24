"""Per-customer extraction cache: original uploads + reusable per-file observations.

No shared cache across customers. Cache validity includes model, prompt and output schema.
"""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import threading
import time

import ai_extract
import evidence_workflow

_LOCKS = [threading.RLock() for _ in range(32)]
CACHE_VERSION = 'evidence-v1'  # bump when normalization or reconciliation semantics change
FILE_TYPES = {'.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}


def load_records(folder):
    path = Path(folder) / 'raw' / 'extraction_cache.json'
    if not path.exists():
        return []
    try:
        cache = json.loads(path.read_text())
    except ValueError:
        raise ai_extract.ExtractionError('The saved extraction could not be read. Your original files are still available.', 502) from None
    records = []
    for record in cache.get('records', []):
        # Current validation also applies to older cache entries, without another paid request.
        validated = ai_extract.validate_result(record['result'], {record['name']})
        if 'metrics' in record['result']:
            validated['metrics'] = record['result']['metrics']
        records.append({**record, 'result': validated})
    return records


def revision():
    return hashlib.sha256((CACHE_VERSION + os.environ.get('OPENAI_MODEL', 'gpt-4.1-mini') + ai_extract.INSTRUCTIONS
                           + json.dumps(ai_extract.schema(), sort_keys=True)).encode()).hexdigest()


def extract_customer(folder, body, questionnaire):
    folder = Path(folder)
    lock = _LOCKS[int(hashlib.sha256(str(folder).encode()).hexdigest()[:4], 16) % len(_LOCKS)]
    with lock:
        return _extract_customer(folder, body, questionnaire)


def _extract_customer(folder, body, questionnaire):
    started, raw = time.monotonic(), folder / 'raw'
    raw.mkdir(parents=True, exist_ok=True)
    cache_path = raw / 'extraction_cache.json'
    records = load_records(folder)
    version = revision()
    available = {}
    for sub in ('documents', 'photos'):
        for path in sorted((raw / sub).glob('*')):
            if path.is_file() and path.suffix.lower() in FILE_TYPES:
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                available.setdefault(digest, (path, FILE_TYPES[path.suffix.lower()]))
    requested = body.get('files') or []
    if requested:
        ai_extract.validate_files({'files': requested})
        wanted = list(dict.fromkeys(hashlib.sha256(base64.b64decode(f['data'])).hexdigest() for f in requested))
        if any(d not in available for d in wanted):
            raise ai_extract.ExtractionError('Wait for the selected files to finish saving, then try again.', 409)
    else:
        wanted = list(available)
    by_id = {r['id']: r for r in records}
    cached = [d for d in wanted if d in by_id and by_id[d].get('revision') == version]
    pending = [d for d in wanted if d not in cached]
    chosen, remaining = pending[:ai_extract.MAX_FILES], len(pending[ai_extract.MAX_FILES:])
    if not wanted:
        raise ai_extract.ExtractionError('Choose a bill or photo first.')
    def read_one(digest):
        path, mime = available[digest]
        payload = {'files': [{'name': path.name, 'type': mime, 'data': base64.b64encode(path.read_bytes()).decode()}]}
        result = ai_extract.extract(payload, questionnaire)
        return {'id': digest, 'name': path.name, 'revision': version, 'result': result}
    failures, read_ids, calls = [], [], len(chosen)
    with ThreadPoolExecutor(max_workers=max(1, len(chosen))) as pool:
        futures = [(digest, pool.submit(read_one, digest)) for digest in chosen]
        for digest, future in futures:
            try:
                by_id[digest] = future.result()
                read_ids.append(digest)
            except ai_extract.ExtractionError as exc:
                failures.append({'file': available[digest][0].name, 'message': str(exc), 'status': exc.status})
    valid_records = list(by_id.values())
    if failures and not valid_records:
        raise ai_extract.ExtractionError(failures[0]['message'], failures[0]['status'])
    # Replace atomically; another request for this customer cannot see a half-written cache.
    temporary = cache_path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'records': list(by_id.values())}, ensure_ascii=False, indent=2))
    temporary.replace(cache_path)
    result = evidence_workflow.merge(valid_records, questionnaire)
    result['metrics'] = {'api_calls': calls, 'cached_files': len(valid_records) - len(read_ids), 'files_read': len(chosen) - len(failures),
                         'total_documents': len(valid_records), 'remaining_files': remaining,
                         'elapsed_ms': round((time.monotonic() - started) * 1000),
                         'model': os.environ.get('OPENAI_MODEL', 'gpt-4.1-mini'),
                         'input_tokens': sum((by_id[d]['result'].get('metrics') or {}).get('input_tokens') or 0 for d in read_ids),
                         'output_tokens': sum((by_id[d]['result'].get('metrics') or {}).get('output_tokens') or 0 for d in read_ids)}
    result['failures'] = failures
    result['warnings'].extend(f"{f['file']}: {f['message']} Earlier evidence is kept." for f in failures)
    if remaining:
        result['warnings'].append(f'{remaining} saved files still need reading. Choose Read remaining files to continue.')
    return result
