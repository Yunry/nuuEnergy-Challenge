"""Vercel entrypoint for the same API used by scripts/serve.py locally."""
import os
from pathlib import Path
import sys
import tempfile
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
if os.environ.get('VERCEL'):
    # The deployed source tree is read-only. Demo/customer writes use instance-local scratch space.
    os.environ.setdefault('NUUENERGY_DATA_DIR', str(Path(tempfile.gettempdir()) / 'nuuenergy' / 'data' / 'demo'))

from serve import Handler  # noqa: E402


class handler(Handler):
    def original_path(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        route = qs.pop('_route', [None])[0]
        if route and not route.startswith('/api/:path'):
            base = urlparse(route).path
            orig_qs = parse_qs(urlparse(route).query)
            all_qs = {**orig_qs, **qs}
            self.path = base + (('?' + urlencode(all_qs, doseq=True)) if all_qs else '')
        elif self.headers.get('x-matched-path') and not self.headers.get('x-matched-path', '').startswith('/api/index'):
            base = self.headers.get('x-matched-path')
            self.path = base + (('?' + parsed.query) if parsed.query else '')

    def do_GET(self):
        self.original_path()
        super().do_GET()

    def do_POST(self):
        self.original_path()
        super().do_POST()
