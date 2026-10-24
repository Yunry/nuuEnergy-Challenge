"""Every supplied customer document/photo must pass the actual upload boundary unchanged."""
import base64
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import check_data_uploads
import serve


class SuppliedFiles(unittest.TestCase):
    def test_all_supplied_media_can_be_saved_and_encoded_for_the_provider(self):
        groups = check_data_uploads.supplied_files()
        self.assertGreaterEqual(len(groups), 20)
        with tempfile.TemporaryDirectory() as tmp:
            demo = Path(tmp) / 'data' / 'demo'
            for i, paths in enumerate(groups):
                path = paths[0]
                with self.subTest(file=str(path)):
                    mime = serve.FILE_TYPES[path.suffix.lower()]
                    raw = path.read_bytes()
                    payload = {'customer_id': f'C-20000101-{i:04x}', 'files': [
                        {'name': path.name, 'type': mime, 'data': base64.b64encode(raw).decode()}]}
                    encoded, names = serve.ai_extract.validate_files(payload)
                    self.assertEqual(names, {path.name})
                    self.assertEqual(encoded[1]['type'], 'input_file' if mime == 'application/pdf' else 'input_image')
                    saved = serve.save_uploads(payload, demo)
                    self.assertEqual((demo.parent.parent / saved['saved'][0]).read_bytes(), raw)
                    self.assertEqual(serve.save_uploads(payload, demo)['duplicates'], 1)
