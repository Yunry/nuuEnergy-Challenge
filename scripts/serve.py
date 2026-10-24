"""Local server: the browser app (index.html, src/browser/) plus the Python decision engine as a small JSON API.

usage: python3 scripts/serve.py        -> http://127.0.0.1:4173   (PORT=4174 python3 scripts/serve.py to change)
  POST /api/assess      customer_input -> {processed, outputs}
  GET  /api/samples     demo customers' raw input (no development labels)
  GET  /api/demo/<id>   {processed, outputs} for a demo customer's hand-extracted processed/ files
  GET  /api/evaluation  internal competition evaluation, shown at /evaluation.html
"""
import json
import os
import re
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import engine  # noqa: E402
import prepare  # noqa: E402
from evaluate import evaluate  # noqa: E402
from run_engine import DEMO, load_steps  # noqa: E402

ALLOWED = re.compile(r"^/(index\.html|evaluation\.html|src/browser/[A-Za-z0-9_.-]+\.(js|css))$")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}
MAX_BODY = 100_000


def samples():
    return [json.loads((d / "raw" / "customer_input.json").read_text()) for d in sorted(DEMO.glob("B-*"))]


def demo(building_id):
    steps = load_steps(building_id)
    return {"processed": steps, "outputs": engine.run(building_id, steps)}


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
        match = re.fullmatch(r"/api/demo/(B-\d+)", path)
        if match and any((DEMO / match[1] / "processed").glob("*.json")):
            return self.api(demo, match[1])
        path = "/index.html" if path == "/" else path
        if not ALLOWED.match(path):
            return self.send(404, b"Not found")
        self.send(200, (ROOT / path[1:]).read_bytes(), TYPES[Path(path).suffix])

    def do_POST(self):
        if urlparse(self.path).path != "/api/assess":
            return self.send(404, b"Not found")
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send(413, b"Request too large")
        try:
            customer_input = json.loads(self.rfile.read(length))
            assert isinstance(customer_input, dict)
        except (ValueError, AssertionError):
            return self.send(400, b"Expected a JSON object")
        self.api(assess, customer_input)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4173))
    print(f"Local: http://127.0.0.1:{port}   internal evaluation: http://127.0.0.1:{port}/evaluation.html")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
