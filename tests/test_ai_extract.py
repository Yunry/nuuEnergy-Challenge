"""Extraction contract, external API failures and real local HTTP boundary tests."""
import base64
import io
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import ai_extract as ai
import serve


def upload(raw=b'%PDF-1.4\nfixture', name='bill.pdf', mime='application/pdf'):
    return {'files': [{'name': name, 'type': mime, 'data': base64.b64encode(raw).decode()}]}


def extracted(**values):
    return {'fields': {k: {'value': values.get(k), 'confidence': 'high', 'evidence': 'Page 1: documented fact',
                           'source_file': 'bill.pdf' if k in values else None} for k in ai.FIELD_KEYS}, 'warnings': []}


class Extraction(unittest.TestCase):
    def test_file_limits_formats_and_signatures(self):
        for payload in ({'files': []}, upload(b'not a PDF'), upload(mime='text/html'),
                        {'files': [upload()['files'][0]] * 4},
                        {'files': [upload()['files'][0], upload()['files'][0]]}):
            with self.subTest(payload=str(payload)[:80]), self.assertRaises(ai.ExtractionError):
                ai.validate_files(payload)
        with patch.object(ai, 'MAX_FILE_BYTES', 3), self.assertRaises(ai.ExtractionError):
            ai.validate_files(upload())
        with self.assertRaises(ai.ExtractionError):
            ai.validate_files({'files': [{'name': 'x.pdf', 'type': 'application/pdf', 'data': '%%%'}]})

    def test_pdf_and_image_use_distinct_response_content_types(self):
        pdf, _ = ai.validate_files(upload())
        png, _ = ai.validate_files(upload(b'\x89PNG\r\n\x1a\nfixture', 'photo.png', 'image/png'))
        self.assertEqual(pdf[1]['type'], 'input_file')
        self.assertEqual(png[1]['type'], 'input_image')

    def test_invalid_values_and_missing_provenance_cannot_be_used(self):
        for key, value in [('radiator_count', 0), ('floor_area_m2', float('nan')),
                           ('persons_in_household', True), ('pipe_system', 'guess'), ('hot_water_via_heating', 'yes')]:
            with self.subTest(key=key), self.assertRaises(ai.ExtractionError):
                ai.validate_result(extracted(**{key: value}), {'bill.pdf'})
        result = extracted(annual_consumption_kwh=18000)
        result['fields']['annual_consumption_kwh']['source_file'] = 'invented.pdf'
        self.assertIsNone(ai.validate_result(result, {'bill.pdf'})['fields']['annual_consumption_kwh']['value'])

    @patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}, clear=False)
    def test_responses_request_and_success(self):
        response = {'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': json.dumps(extracted(annual_consumption_kwh=18000, energy_carrier='gas', consumption_full_year=False))}]}]}
        with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(response).encode())) as call:
            result = ai.extract(upload())
        request = json.loads(call.call_args.args[0].data)
        self.assertFalse(request['store'])
        self.assertTrue(request['text']['format']['strict'])
        self.assertEqual(request['input'][0]['content'][1]['type'], 'input_file')
        self.assertFalse(result['fields']['consumption_full_year']['value'])
        self.assertEqual(result['fields']['annual_consumption_kwh']['value'], 18000)

    @patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}, clear=False)
    def test_provider_failures_are_actionable_without_secret_details(self):
        for code in (400, 401, 429, 500):
            with self.subTest(code=code), patch('urllib.request.urlopen', side_effect=urllib.error.HTTPError('url', code, 'SECRET', {}, None)):
                with self.assertRaises(ai.ExtractionError) as caught:
                    ai.extract(upload())
                self.assertNotIn('SECRET', str(caught.exception))
        for response in ({'status': 'incomplete'}, {'status': 'completed', 'output': []},
                         {'status': 'completed', 'output': [{'content': [{'type': 'refusal'}]}]}):
            with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(response).encode())), self.assertRaises(ai.ExtractionError):
                ai.extract(upload())

    @patch.dict(os.environ, {'OPENAI_API_KEY': ''}, clear=False)
    def test_missing_key_keeps_manual_engine_working(self):
        with self.assertRaises(ai.ExtractionError) as caught:
            ai.extract(upload())
        self.assertEqual(caught.exception.status, 503)
        self.assertIn('outputs', serve.assess({}))

    def test_confirmed_evidence_cannot_restore_partial_year_consumption(self):
        ci = {'annual_consumption_kwh': 18000, 'consumption_full_year': False, 'energy_carrier': 'gas',
              'extraction_evidence': extracted(annual_consumption_kwh=18000)['fields']}
        assessment = serve.assess(ci)
        fact = assessment['processed']['01b_heat_load_by_consumption']['fields']['annual_consumption_kwh']
        self.assertEqual(fact['confidence'], 'low')
        self.assertEqual(fact['source'], 'confirmed_upload.bill.pdf')
        self.assertIsNone(assessment['outputs']['01_heat_load']['heating_load_kw']['by_consumption'])
        ci['annual_consumption_kwh'] = 20000
        fact = serve.assess(ci)['processed']['01b_heat_load_by_consumption']['fields']['annual_consumption_kwh']
        self.assertEqual(fact['source'], 'homeowner.annual_consumption_kwh')


class LocalHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), serve.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path, body=None, headers=None):
        req = urllib.request.Request(self.url + path, data=json.dumps(body).encode() if body is not None else None,
                                     headers=headers or {'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            body = error.read()
            self.assertEqual(int(error.headers['Content-Length']), len(body))
            return error.code, body

    def test_upstream_demo_routes_keep_all_five_examples_working(self):
        for i in range(1, 6):
            building_id = f'B-{i:02d}'
            with self.subTest(building_id=building_id):
                status, body = self.request('/api/demo/' + building_id)
                self.assertEqual(status, 200)
                result = json.loads(body)
                self.assertEqual(result['outputs']['decision']['building_id'], building_id)
                self.assertEqual(len(result['processed']), 4)
        self.assertEqual(self.request('/api/demo/B-99')[0], 404)

    def test_completed_photo_example_loads_latest_evidence_and_original_photos(self):
        status, body = self.request('/api/samples')
        self.assertEqual(status, 200)
        homes = json.loads(body)
        self.assertTrue({'B-01', 'B-02', 'B-03', 'B-04', 'B-05', 'D-B05'} <= {h['building_id'] for h in homes})
        for home in homes:
            self.assertNotIn('expected_verdict', home)
            self.assertNotIn('reference_heating_load_kw', home)
        saved = next(h for h in homes if h['building_id'] == 'D-B05')
        self.assertEqual(saved['radiator_type'], '22')
        self.assertEqual(saved['example_evidence']['pipe_system']['confidence'], 'medium')
        status, body = self.request('/api/demo/D-B05')
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result['outputs']['02_radiator_check']['flow_temp_c']['required'], [42, 61])
        self.assertEqual(result['processed']['02_radiator_check']['fields']['heat_distribution']['value'], 'mixed')
        status, body = self.request('/api/customer/D-B05/files')
        self.assertEqual(status, 200)
        photos = [f for f in json.loads(body) if f['kind'] == 'jpeg']
        self.assertEqual(len(photos), 2)
        for photo in photos:
            status, body = self.request('/api/customer/D-B05/raw/' + photo['path'])
            self.assertEqual(status, 200)
            self.assertEqual(body, (serve.SAVED_CUSTOMERS / 'D-B05' / 'raw' / photo['path']).read_bytes())

    def test_http_upload_to_assessment_and_private_files(self):
        with patch.object(ai, 'extract', return_value=extracted(energy_carrier='gas')):
            status, body = self.request('/api/extract', upload())
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['fields']['energy_carrier']['value'], 'gas')
        self.assertEqual(self.request('/api/assess', {'energy_carrier': 'gas'})[0], 200)
        for path in ('/.env', '/.git/config', '/scripts/ai_extract.py'):
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request('/api/ai-status')[0], 200)
        self.assertEqual(self.request('/src/browser/extraction.js')[0], 200)
        self.assertEqual(self.request('/api/extract', upload(), {'Origin': 'https://other.example', 'Content-Type': 'application/json'})[0], 403)
        self.assertEqual(self.request('/api/extract', upload(), {'Content-Type': 'text/plain'})[0], 415)


if __name__ == '__main__':
    unittest.main()
