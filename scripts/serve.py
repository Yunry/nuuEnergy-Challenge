"""Local server: the browser app (index.html, src/browser/) plus the Python decision engine as a small JSON API.

usage: python3 scripts/serve.py        -> http://127.0.0.1:4173   (PORT=4174 python3 scripts/serve.py to change)
  POST /api/assess      customer_input -> {processed, outputs}
  POST /api/scenarios   {processed, values} -> assumptions, what-if result and per-input sweeps
  POST /api/upload      {customer_id, files} -> files saved to data/demo/<customer_id>/raw/{photos,documents}/
  GET  /api/samples     demo customers' raw input (no development labels)
  GET  /api/demo/<id>   {processed, outputs} for a demo customer's hand-extracted processed/ files
  GET  /api/evaluation  internal competition evaluation, shown at /evaluation.html
  Live demo customer data/demo/B-Live (page /live.html), one saved step per upload:
  GET  /api/live         its timeline and latest step      POST /api/live/start   step 00 from B-03's input
  POST /api/live/upload  {files} -> next step              POST /api/live/reset   empty the folder
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
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import customer_steps  # noqa: E402
import engine  # noqa: E402
import prepare  # noqa: E402
import scenarios  # noqa: E402
from evaluate import evaluate  # noqa: E402
import ai_extract  # noqa: E402
from run_engine import DEMO, load_steps  # noqa: E402

ai_extract.load_env(ROOT / '.env')

ALLOWED = re.compile(r"^/(index\.html|evaluation\.html|live\.html|src/browser/[A-Za-z0-9_.-]+\.(js|css))$")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}
MAX_BODY = 100_000


def samples():
    return [json.loads(p.read_text()) for p in sorted(DEMO.glob("B-*/raw/customer_input.json"))]


def demo(building_id):
    """A demo customer's processed files; for a customer collected step by step (B-Live), its latest step."""
    folder = DEMO / building_id
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
    saved = []
    for f in body["files"]:
        folder = demo / customer_id / "raw" / UPLOAD_FOLDER[f["type"]]
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{stamp}_{safe_name(f['name'])}"
        path.write_bytes(base64.b64decode(f["data"]))
        saved.append(str(path.relative_to(demo.parent.parent)))
    for sub in ("processed", "output"):
        (demo / customer_id / sub).mkdir(exist_ok=True)
    return {"customer_id": customer_id, "saved": saved}


# Live demo: data/demo/B-Live starts empty; Start adds B-03's input as step 00, every upload adds the next step.
LIVE = DEMO / "B-Live"
REGISTER = ROOT / "data" / "customers"  # documents whose facts are known (the D-B03 demo documents)


def known_facts(name, data, register=REGISTER):
    """Facts for a known demo document (same bytes as a file under data/customers/*/raw/), as extraction would return them.
    Stands in for AI extraction in the live demo; an unknown file gives no facts."""
    digest = hashlib.sha256(data).hexdigest()
    for added_path in sorted(register.glob("*/steps/*/added.json")):
        added, folder = json.loads(added_path.read_text()), added_path.parents[2]
        for f in added["files"]:
            p = folder / f
            if p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == digest:
                return {k: {**v, "source_file": name} for k, v in added["facts"].items()}
    return {}


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


def live_start(folder=LIVE):
    customer_input = {**json.loads((DEMO / "B-03" / "raw" / "customer_input.json").read_text()), "building_id": folder.name}
    customer_steps.start(folder, customer_input, load_steps("B-03"))
    return live_state(folder)


def live_reset(folder=LIVE):
    if folder.exists():
        shutil.rmtree(folder)
    return live_state(folder)


def live_upload(body, folder=LIVE, register=REGISTER):
    if not (folder / "timeline.json").exists():
        raise ai_extract.ExtractionError("Start the live demo first.", 409)
    ai_extract.validate_files(body)
    with tempfile.TemporaryDirectory() as tmp:
        paths, facts = [], {}
        for f in body["files"]:
            data, path = base64.b64decode(f["data"]), Path(tmp) / safe_name(f["name"])
            path.write_bytes(data)
            paths.append(path)
            facts.update(known_facts(path.name, data, register))
        customer_steps.add_upload(folder, paths[0].stem[:40], paths, facts)
    return live_state(folder)


def assess(customer_input):
    steps = prepare.run(customer_input)
    return {"processed": steps, "outputs": engine.run(customer_input.get("building_id") or "HOME", steps)}


class Handler(BaseHTTPRequestHandler):
    def send(self, code, body, content_type="text/plain; charset=utf-8"):
        self.send_response(code)
        for k, v in (("Content-Type", content_type), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer")):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def api(self, fn, *args):
        try:
            self.send(200, json.dumps(fn(*args), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        except Exception:
            traceback.print_exc()
            self.send(500, b"Engine error")

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
        match = re.fullmatch(r"/api/demo/(B-\d+|B-Live)", path)
        if match and (any((DEMO / match[1] / "processed").glob("*.json")) or (DEMO / match[1] / "steps").is_dir()):
            return self.api(demo, match[1])
        path = "/index.html" if path == "/" else path
        if not ALLOWED.match(path):
            return self.send(404, b"Not found")
        self.send(200, (ROOT / path[1:]).read_bytes(), TYPES[Path(path).suffix])

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/api/assess", "/api/scenarios", "/api/extract", "/api/upload", "/api/live/start", "/api/live/upload", "/api/live/reset"):
            return self.send(404, b"Not found")
        # This local API accepts same-origin JSON only, including for paid AI requests.
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.send(403, b"Cross-origin requests are not allowed")
        if self.headers.get_content_type() != 'application/json':
            return self.send(415, b"Expected application/json")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self.send(400, b"Invalid content length")
        if length < 1 or length > (15 * 1024 * 1024 if path in ('/api/extract', '/api/upload', '/api/live/upload') else MAX_BODY):
            return self.send(413, b"Request too large")
        try:
            body = json.loads(self.rfile.read(length))
            assert isinstance(body, dict)
        except (ValueError, AssertionError):
            return self.send(400, b"Expected a JSON object")
        if path == "/api/scenarios":
            return self.api(scenarios.run, body["processed"], body.get("values"))
        if path == "/api/live/start":
            return self.api(live_start)
        if path == "/api/live/reset":
            return self.api(live_reset)
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
                result = ai_extract.extract(body)
                return self.send(200, json.dumps(result, ensure_ascii=False).encode(), 'application/json; charset=utf-8')
            except ai_extract.ExtractionError as exc:
                return self.send(exc.status, json.dumps({'error': str(exc)}).encode(), 'application/json; charset=utf-8')
            except Exception:
                # Do not log document data, credentials or upstream response bodies.
                return self.send(502, b'{"error":"AI extraction failed. Try again or enter answers manually."}', 'application/json; charset=utf-8')
        self.api(assess, body)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4173))
    print(f"Local: http://127.0.0.1:{port}   internal evaluation: http://127.0.0.1:{port}/evaluation.html")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
