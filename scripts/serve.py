"""Local server: the browser app (index.html, src/browser/) plus the Python decision engine as a small JSON API.

usage: python3 scripts/serve.py        -> http://127.0.0.1:4173   (PORT=4174 python3 scripts/serve.py to change)
       HOST=0.0.0.0 python3 scripts/serve.py   also reachable from phones on the same network (prints the address);
                                              anyone on that network can then use the app and its AI key
  POST /api/assess      customer_input -> {processed, outputs}
  POST /api/scenarios   {processed, values} -> assumptions, what-if result and per-input sweeps
  POST /api/upload      {customer_id, files} -> files saved to data/demo/<customer_id>/raw/{photos,documents}/
  GET  /api/samples     five challenge homes plus completed saved examples (no development labels)
  GET  /api/demo/<id>   {processed, outputs} for a demo customer's hand-extracted processed/ files
  GET  /api/evaluation  internal competition evaluation, shown at /evaluation.html
  GET  /api/customer/<id>/files, /api/customer/<id>/raw/<path>   list / open a customer's raw inputs (developer view)
  Live demo customer data/demo/B-Live (page /live.html), one saved step per upload:
  GET  /api/live         its timeline and latest step      POST /api/live/start   step 00 from B-05's questionnaire
  POST /api/live/upload  {files} -> next step              POST /api/live/reset   empty the folder
  GET  /api/live/demo-files, /api/live/demo-file/<name>     the demo files this server has (data/customer/demo)
  POST /api/live/use-demo  {name} -> next step from the server's own copy (for phones that don't have the file)
"""
import base64
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import customer_steps  # noqa: E402
import intake  # noqa: E402
import engine  # noqa: E402
import prepare  # noqa: E402
import scenarios  # noqa: E402
from evaluate import evaluate  # noqa: E402
import ai_extract  # noqa: E402
import evidence_store  # noqa: E402
import evidence_workflow  # noqa: E402
from run_engine import DEMO as FIXTURE_DEMO, load_steps  # noqa: E402

# A serverless bundle is read-only. Keep supplied examples in the bundle and customer writes in /tmp.
DEMO = Path(os.environ.get('NUUENERGY_DATA_DIR', str(FIXTURE_DEMO)))
if DEMO != FIXTURE_DEMO:
    for source in FIXTURE_DEMO.glob('B-[0-9]*'):
        for relative in ('raw/customer_input.json', 'processed'):
            original, target = source / relative, DEMO / source.name / relative
            if original.is_dir():
                shutil.copytree(original, target, dirs_exist_ok=True)
            elif original.is_file() and not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(original, target)

ai_extract.load_env(ROOT / '.env')

ALLOWED = re.compile(r"^/(index\.html|evaluation\.html|live\.html|src/browser/[A-Za-z0-9_.-]+\.(js|css))$")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}
MAX_BODY = 100_000
SAVED_CUSTOMERS = ROOT / 'data' / 'customers'


def customer_folder(customer_id):
    base = SAVED_CUSTOMERS if re.fullmatch(r'D-B\d+', customer_id) else DEMO
    folder = base / customer_id
    if not folder.exists() and base == DEMO and (FIXTURE_DEMO / customer_id).exists():
        return FIXTURE_DEMO / customer_id
    return folder


def samples():
    """Challenge homes plus completed saved examples, excluding the mutable live workspace."""
    homes = [json.loads(p.read_text()) for p in sorted(DEMO.glob("B-[0-9]*/raw/customer_input.json"))]
    if not homes:
        homes = [json.loads(p.read_text()) for p in sorted(FIXTURE_DEMO.glob("B-[0-9]*/raw/customer_input.json"))]
    for path in sorted(SAVED_CUSTOMERS.glob('D-B[0-9]*/raw/customer_input.json')):
        folder = path.parent.parent
        if not customer_steps.step_dirs(folder):
            continue
        home = json.loads(path.read_text())
        home['building_id'] = folder.name
        home['example_label'] = f'{folder.name[2:]} with reviewed photos (saved demo)'
        home['example_evidence'] = {}
        # The review screen and result describe the same latest saved evidence.
        for step in customer_steps.latest_processed(folder).values():
            for key, fact in step['fields'].items():
                if key in intake.QUESTIONNAIRE_KEYS and fact['value'] is not None:
                    home[key] = fact['value']
                    if fact.get('source', '').startswith('upload:'):
                        home['example_evidence'][key] = {**fact, 'source_file': fact['source'].removeprefix('upload:')}
        homes.append(home)
    return homes


def demo(building_id):
    """A demo customer's processed files; for a customer collected step by step (B-Live), its latest step."""
    folder = customer_folder(building_id)
    steps = customer_steps.latest_processed(folder) if (folder / "steps").is_dir() else load_steps(building_id)
    return {"processed": steps, "outputs": engine.run(building_id, steps)}


CUSTOMER_ID = re.compile(r"B-\d+|C-\d{8}-[0-9a-f]{4}")  # demo homes, and new homes created in the browser
UPLOAD_FOLDER = {"application/pdf": "documents", "image/jpeg": "photos", "image/png": "photos", "image/webp": "photos"}


def safe_name(name):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).lstrip("._")[-120:] or "file"


def save_uploads(body, demo=DEMO):
    """Save the customer's files, unchanged, to data/demo/<customer_id>/raw/; the browser calls this as soon as files are chosen."""
    customer_id = body.get("customer_id")
    if not isinstance(customer_id, str) or not CUSTOMER_ID.fullmatch(customer_id):
        raise ai_extract.ExtractionError("Unknown customer folder.")
    ai_extract.validate_files(body)  # same count, size, format and content checks as AI extraction
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    saved, duplicates = [], 0
    for f in body["files"]:
        folder = demo / customer_id / "raw" / UPLOAD_FOLDER[f["type"]]
        folder.mkdir(parents=True, exist_ok=True)
        data = base64.b64decode(f['data'])
        digest = hashlib.sha256(data).hexdigest()
        existing = next((p for sub in ('documents', 'photos') for p in (demo / customer_id / 'raw' / sub).glob('*')
                         if p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == digest), None)
        path = existing or folder / f"{stamp}_{digest[:12]}_{safe_name(f['name'])}"
        if existing:
            duplicates += 1
        else:
            path.write_bytes(data)
        saved.append(str(path.relative_to(demo.parent.parent)))
    for sub in ("processed", "output"):
        (demo / customer_id / sub).mkdir(exist_ok=True)
    return {"customer_id": customer_id, "saved": saved, "duplicates": duplicates}


# Live demo: Start adds B-05's questionnaire as step 00, every upload adds the next step.
LIVE = DEMO / "B-Live"
REGISTER = ROOT / "data" / "customer" / "demo" / "extraction_register.json"  # readings of the demo upload files


def known_facts(name, data, register=REGISTER):
    """(facts, note) for a demo file (data/customer/demo), by content; (None, None) for any other file.
    Stands in for AI extraction so the live demo is repeatable."""
    digest = hashlib.sha256(data).hexdigest()
    for entry in json.loads(Path(register).read_text())["files"] if Path(register).is_file() else []:
        if entry["sha256"] == digest:
            return {k: {**v, "source_file": name} for k, v in entry["facts"].items()}, entry["note"]
    return None, None


def read_file(name, mime, data, register=REGISTER):
    """Facts from one uploaded file: the demo register if it is a demo file, otherwise the AI (if configured)."""
    facts, note = known_facts(name, data, register)
    if facts is not None:
        return facts, f"{name}: {note} (read from the demo register)"
    if not ai_extract.configured():
        return {}, f"{name}: not a demo file and AI extraction is not configured, so no facts were read."
    result = ai_extract.extract({"files": [{"name": name, "type": mime, "data": base64.b64encode(data).decode()}]})
    facts = {k: f for k, f in result["fields"].items() if f["value"] is not None and f["confidence"] in ("high", "medium")}
    return facts, f"{name}: read by AI ({os.environ.get('OPENAI_MODEL', 'gpt-4.1-mini')}); low-confidence readings are left out."


def live_state(folder=LIVE):
    if not (folder / "timeline.json").exists():
        return {"customer_id": folder.name, "started": False, "timeline": []}
    last = customer_steps.step_dirs(folder)[-1]
    out = {p.stem: json.loads(p.read_text()) for p in (last / "output").glob("*.json")}
    return {"customer_id": folder.name, "started": True, "timeline": json.loads((folder / "timeline.json").read_text()),
            "latest": {"folder": f"data/demo/{folder.name}/steps/{last.name}", "added": json.loads((last / "added.json").read_text()),
                       "decision": out["decision"], "heat_load": out["01_heat_load"]["heating_load_kw"],
                       "flow": out["02_radiator_check"]["flow_temp_c"], "cost": out["03_operating_cost"]["cost_eur_per_year"],
                       "what_if": json.loads((last / "what_if.json").read_text())}}


LIVE_BASE = "B-05"  # the live demo starts from this home's questionnaire: a decision is possible, but not certain


def live_start(folder=LIVE):
    customer_input = {**json.loads((DEMO / LIVE_BASE / "raw" / "customer_input.json").read_text()), "building_id": folder.name}
    customer_steps.start(folder, customer_input, load_steps(LIVE_BASE), label="questionnaire")
    return live_state(folder)


def live_reset(folder=LIVE):
    if folder.exists():
        shutil.rmtree(folder)
    return live_state(folder)


def demo_files(register=REGISTER):
    """The demo files in the register that this server has, so any device can preview and use them."""
    entries = json.loads(Path(register).read_text())["files"] if Path(register).is_file() else []
    return [{"name": e["file"], "kind": Path(e["file"]).suffix.lower().lstrip("."), "note": e["note"], "url": f"/api/live/demo-file/{e['file']}"}
            for e in entries if (Path(register).parent / e["file"]).is_file()]


def demo_file(name, register=REGISTER):
    """Path of a demo file by name, only for names listed in the register."""
    if name in {f["name"] for f in demo_files(register)}:
        return Path(register).parent / name
    return None


def live_use_demo(body, folder=LIVE, register=REGISTER):
    """Add a demo file from the server's own copy as the next live step, as if it had been uploaded."""
    path = demo_file(body.get("name"), register)
    if path is None:
        raise ai_extract.ExtractionError("Unknown demo file.", 404)
    files = [{"name": path.name, "type": FILE_TYPES[path.suffix.lower()], "data": base64.b64encode(path.read_bytes()).decode()}]
    return live_upload({"files": files}, folder, register)


def live_upload(body, folder=LIVE, register=REGISTER):
    if not (folder / "timeline.json").exists():
        raise ai_extract.ExtractionError("Start the live demo first.", 409)
    ai_extract.validate_files(body)
    with tempfile.TemporaryDirectory() as tmp:
        paths, facts, notes = [], {}, []
        for f in body["files"]:
            data, path = base64.b64decode(f["data"]), Path(tmp) / safe_name(f["name"])
            path.write_bytes(data)
            paths.append(path)
            read, note = read_file(path.name, f["type"], data, register)
            facts.update(read)
            notes.append(note)
        customer_steps.add_upload(folder, paths[0].stem[:40], paths, facts, notes)
    return live_state(folder)


NEW_CUSTOMER = re.compile(r"C-\d{8}-[0-9a-f]{4}")  # customers created in the browser; the demo dataset (B-*) stays read-only
FILE_TYPES = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def assess(customer_input):
    """Intake, followed by evidence reconciliation and a deterministic next useful question."""
    intake.check_questionnaire(customer_input)
    customer_id = customer_input.get('building_id')
    conflicts = []
    if isinstance(customer_id, str) and NEW_CUSTOMER.fullmatch(customer_id):
        folder = DEMO / customer_id
        result = intake.run(folder, customer_input)
        records = evidence_store.load_records(folder)
        if records:
            conflicts = evidence_workflow.merge(records, customer_input)['conflicts']
    else:
        steps = prepare.run(customer_input)
        result = {'processed': steps, 'outputs': engine.run(customer_id or 'HOME', steps)}
    result['follow_up'] = evidence_workflow.next_question(customer_input, result, conflicts)
    result['evidence_conflicts'] = conflicts
    return result


FOLDER_ID = r"B-\d+|D-B\d+|B-Live|C-\d{8}-[0-9a-f]{4}"
RAW_TYPES = {**FILE_TYPES, ".json": "application/json; charset=utf-8"}


def raw_inputs(customer_id):
    """Everything in the customer's raw folder (questionnaire, uploads, extraction), for the developer view."""
    raw = customer_folder(customer_id) / "raw"
    return [{"path": str(p.relative_to(raw)), "name": p.name, "kind": p.suffix.lower().lstrip("."), "size": p.stat().st_size}
            for p in sorted(raw.rglob("*")) if p.is_file() and p.suffix.lower() in RAW_TYPES]


def customer_files(customer_id, limit=ai_extract.MAX_FILES):
    """The customer's saved documents and photos (newest first), as an extraction payload."""
    raw = DEMO / customer_id / "raw"
    paths = sorted((p for sub in ("documents", "photos") for p in (raw / sub).glob("*") if p.suffix.lower() in FILE_TYPES),
                   key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    return [{"name": p.name, "type": FILE_TYPES[p.suffix.lower()], "data": base64.b64encode(p.read_bytes()).decode()} for p in paths]


def extract(body):
    """Extract only new files, retain all earlier observations, and reconcile without an LLM call."""
    customer_id, questionnaire = body.get('customer_id'), body.get('questionnaire') or {}
    intake.check_questionnaire(questionnaire)
    if not (isinstance(customer_id, str) and NEW_CUSTOMER.fullmatch(customer_id)):
        return ai_extract.extract(body, questionnaire)
    folder = DEMO / customer_id
    intake.write(folder / 'raw' / 'questionnaire.json', questionnaire)
    result = evidence_store.extract_customer(folder, body, questionnaire)
    intake.save_extraction(folder, {'files': [d['name'] for d in result['documents']], **result})
    return result


class Handler(BaseHTTPRequestHandler):
    def send(self, code, body, content_type="text/plain; charset=utf-8"):
        self.send_response(code)
        # Frame responses even when an upload is rejected before its body is read.
        self.send_header("Content-Length", str(len(body)))
        for k, v in (("Content-Type", content_type), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer")):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def api(self, fn, *args):
        try:
            self.send(200, json.dumps(fn(*args), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        except Exception:
            traceback.print_exc()
            self.send(500, json.dumps({"error": "Engine error"}).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/samples":
            return self.api(samples)
        if path == "/api/evaluation":
            return self.api(evaluate)
        if path == "/api/ai-status":
            return self.api(lambda: {"available": ai_extract.configured()})
        if path == "/api/live":
            return self.api(live_state)
        if path == "/api/live/demo-files":
            return self.api(demo_files)
        if path.startswith("/api/live/demo-file/"):
            file = demo_file(unquote(path.rsplit("/", 1)[1]))
            if file is None:
                return self.send(404, json.dumps({"error": "Not found"}).encode(), "application/json; charset=utf-8")
            return self.send(200, file.read_bytes(), FILE_TYPES[file.suffix.lower()])
        match = re.fullmatch(rf"/api/customer/({FOLDER_ID})/files", path)
        if match:
            return self.api(raw_inputs, match[1])
        match = re.fullmatch(rf"/api/customer/({FOLDER_ID})/raw/((?:documents/|photos/)?[A-Za-z0-9._-]+)", path)
        if match:
            raw = customer_folder(match[1]) / "raw"
            file = raw / match[2]
            if file.is_file() and file.suffix.lower() in RAW_TYPES and file.resolve().parent in (raw.resolve(), (raw / "documents").resolve(), (raw / "photos").resolve()):
                return self.send(200, file.read_bytes(), RAW_TYPES[file.suffix.lower()])
            return self.send(404, json.dumps({"error": "Not found"}).encode(), "application/json; charset=utf-8")
        match = re.fullmatch(r"/api/demo/(B-\d+|D-B\d+|B-Live)", path)
        if match and (any((customer_folder(match[1]) / "processed").glob("*.json")) or customer_steps.step_dirs(customer_folder(match[1]))):
            return self.api(demo, match[1])
        path = "/index.html" if path == "/" else path
        if not ALLOWED.match(path):
            return self.send(404, b"Not found")
        self.send(200, (ROOT / path[1:]).read_bytes(), TYPES[Path(path).suffix])

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/api/assess", "/api/scenarios", "/api/extract", "/api/upload", "/api/live/start", "/api/live/upload", "/api/live/reset", "/api/live/use-demo"):
            return self.send(404, json.dumps({"error": "Not found"}).encode(), "application/json; charset=utf-8")
        # This local API accepts same-origin JSON only, including for paid AI requests.
        origin = self.headers.get('Origin')
        host = self.headers.get('X-Forwarded-Host') or self.headers.get('Host', '')
        if origin:
            origin_host = origin.split('://', 1)[-1].rstrip('/')
            is_local = origin_host.split(':')[0] in ('localhost', '127.0.0.1') and host.split(':')[0] in ('localhost', '127.0.0.1')
            if origin_host != host and not is_local:
                return self.send(403, json.dumps({"error": "Cross-origin requests are not allowed"}).encode(), "application/json; charset=utf-8")
        if self.headers.get_content_type() != 'application/json':
            return self.send(415, json.dumps({"error": "Expected application/json"}).encode(), "application/json; charset=utf-8")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self.send(400, json.dumps({"error": "Invalid content length"}).encode(), "application/json; charset=utf-8")
        if length < 1 or length > (15 * 1024 * 1024 if path in ('/api/extract', '/api/upload', '/api/live/upload') else MAX_BODY):
            return self.send(413, json.dumps({"error": "Request too large"}).encode(), "application/json; charset=utf-8")
        try:
            body = json.loads(self.rfile.read(length))
            assert isinstance(body, dict)
        except (ValueError, AssertionError):
            return self.send(400, json.dumps({"error": "Expected a JSON object"}).encode(), "application/json; charset=utf-8")
        if path == "/api/scenarios":
            return self.api(scenarios.run, body["processed"], body.get("values"))
        if path == "/api/live/start":
            return self.api(live_start)
        if path == "/api/live/reset":
            return self.api(live_reset)
        if path == "/api/live/use-demo":
            try:
                return self.send(200, json.dumps(live_use_demo(body), ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except ai_extract.ExtractionError as exc:
                return self.send(exc.status, json.dumps({"error": str(exc)}).encode(), "application/json; charset=utf-8")
        if path == "/api/live/upload":
            try:
                return self.send(200, json.dumps(live_upload(body), ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except ai_extract.ExtractionError as exc:
                return self.send(exc.status, json.dumps({"error": str(exc)}).encode(), "application/json; charset=utf-8")
        if path == "/api/upload":
            try:
                return self.send(200, json.dumps(save_uploads(body)).encode(), "application/json; charset=utf-8")
            except ai_extract.ExtractionError as exc:
                return self.send(exc.status, json.dumps({"error": str(exc)}).encode(), "application/json; charset=utf-8")
        if path == '/api/extract':
            try:
                result = extract(body)
                return self.send(200, json.dumps(result, ensure_ascii=False).encode(), 'application/json; charset=utf-8')
            except ai_extract.ExtractionError as exc:
                return self.send(exc.status, json.dumps({'error': str(exc)}).encode(), 'application/json; charset=utf-8')
            except Exception:
                # Do not log document data, credentials or upstream response bodies.
                return self.send(502, b'{"error":"AI extraction failed. Try again or enter answers manually."}', 'application/json; charset=utf-8')
        try:
            intake.check_questionnaire(body)
        except intake.IntakeError as exc:
            return self.send(400, json.dumps({"error": str(exc)}).encode(), "application/json; charset=utf-8")
        self.api(assess, body)


def lan_address():
    """This machine's address on the local network (no traffic is sent)."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("192.0.2.1", 9))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


if __name__ == "__main__":
    port, host = int(os.environ.get("PORT", 4173)), os.environ.get("HOST", "127.0.0.1")
    print(f"Local: http://127.0.0.1:{port}   internal evaluation: http://127.0.0.1:{port}/evaluation.html", flush=True)
    if host != "127.0.0.1":
        print(f"Phone / other devices on this network: http://{lan_address()}:{port}   live demo: http://{lan_address()}:{port}/live.html?fresh=1", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
