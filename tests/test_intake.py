"""The intake rule (docs/data-contract.md): questionnaire -> customer folder -> uniform processed data -> decision.
These tests fail when a questionnaire change breaks the contract, so a new question cannot silently be lost.

run: python3 -m unittest discover -s tests -v
"""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src" / "decision_engine"), str(ROOT / "scripts")]

import intake  # noqa: E402
import serve  # noqa: E402

UI_ONLY = {"amount", "unit"}  # form fields the browser turns into annual_consumption_kwh before sending
NOT_FOR_ENGINE = {"building_id", "building_notes"}  # identity, and free text kept for the technician handoff

QUESTIONNAIRE = {"building_id": "C-20261024-abcd", "construction_year": 1970, "floor_area_m2": 200, "renovation_status": "partially",
                 "heat_distribution": "radiators", "annual_consumption_kwh": 40000, "consumption_full_year": True, "energy_carrier": "oil",
                 "persons_in_household": 2, "hot_water_via_heating": True, "flow_temperature_c": None, "pipe_system": "two-pipe",
                 "radiator_count": 15, "radiator_type": None, "other_heat_source": None, "solar_thermal": False, "building_notes": None}


def js_list(path, name):
    src = (ROOT / path).read_text()
    body = re.search(rf"{name} = \[(.*?)\];", src, re.S).group(1)
    return re.findall(r"'([a-z0-9_]+)'", body)


class Contract(unittest.TestCase):
    def test_browser_sends_exactly_the_contract_keys(self):
        self.assertEqual(js_list("src/browser/assessment.js", "INPUT_KEYS"), intake.QUESTIONNAIRE_KEYS)

    def test_every_question_in_the_form_maps_to_a_contract_key(self):
        src = (ROOT / "src" / "browser" / "app.js").read_text()
        form_keys = set(re.findall(r"(\w+):", re.search(r"const empty = \(\) => \(\{(.*?)\}\);", src, re.S).group(1)))
        missing = form_keys - set(intake.QUESTIONNAIRE_KEYS) - UI_ONLY
        self.assertFalse(missing, f"questions without a contract key (add them to intake.QUESTIONNAIRE_KEYS and prepare.py): {missing}")

    def test_every_contract_key_is_read_when_processed_data_is_built(self):
        src = (ROOT / "src" / "decision_engine" / "prepare.py").read_text()
        unread = [k for k in intake.QUESTIONNAIRE_KEYS if k not in NOT_FOR_ENGINE and f'"{k}"' not in src]
        self.assertFalse(unread, f"questionnaire keys that never reach the processed data: {unread}")

    def test_unknown_keys_are_rejected(self):
        with self.assertRaises(intake.IntakeError):
            intake.check_questionnaire({**QUESTIONNAIRE, "heat_pump_colour": "blue"})


class Pipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.demo = Path(self.tmp.name)
        self.folder = self.demo / QUESTIONNAIRE["building_id"]

    def tearDown(self):
        self.tmp.cleanup()

    def test_questionnaire_processed_data_and_decision_are_saved_in_the_customer_folder(self):
        result = intake.run(self.folder, QUESTIONNAIRE)
        self.assertEqual(json.loads((self.folder / "raw" / "questionnaire.json").read_text()), QUESTIONNAIRE)
        self.assertEqual(sorted(p.stem for p in (self.folder / "processed").glob("*.json")), sorted(result["processed"]))
        self.assertTrue((self.folder / "output" / "decision.json").exists())
        self.assertEqual(result["outputs"]["decision"]["verdict"], "yellow")

    def test_processed_data_is_uniform_whatever_its_source(self):
        steps = intake.run(self.folder, {**QUESTIONNAIRE, "extraction_evidence": {"radiator_count": {
            "value": 15, "confidence": "high", "evidence": "15 radiators listed", "source_file": "protocol.pdf"}}})["processed"]
        for step in steps.values():
            for f in {**step["fields"], **step["reference_data"]}.values():
                self.assertLessEqual(intake.UNIFORM_FIELD_KEYS, set(f))
        self.assertEqual(steps["02_radiator_check"]["fields"]["radiator_count"]["source"], "confirmed_upload.protocol.pdf")

    def test_extraction_gets_the_questionnaire_and_saved_files_and_is_kept(self):
        (self.folder / "raw" / "documents").mkdir(parents=True)
        (self.folder / "raw" / "documents" / "bill.pdf").write_bytes(b"%PDF-1.4\n")
        fake = {"fields": {}, "warnings": []}
        with mock.patch.object(serve, "DEMO", self.demo), mock.patch.object(serve.ai_extract, "extract", return_value=fake) as call:
            serve.extract({"customer_id": self.folder.name, "questionnaire": QUESTIONNAIRE, "files": []})
        payload, questionnaire = call.call_args.args
        self.assertEqual([f["name"] for f in payload["files"]], ["bill.pdf"])
        self.assertEqual(questionnaire, QUESTIONNAIRE)
        self.assertEqual(json.loads((self.folder / "raw" / "extraction.json").read_text())["files"], ["bill.pdf"])

    def test_developer_view_lists_every_raw_input(self):
        intake.run(self.folder, QUESTIONNAIRE)
        (self.folder / "raw" / "photos").mkdir()
        (self.folder / "raw" / "photos" / "radiator.png").write_bytes(b"\x89PNG\r\n\x1a\n")
        with mock.patch.object(serve, "DEMO", self.demo):
            listed = {f["path"]: f["kind"] for f in serve.raw_inputs(self.folder.name)}
        self.assertEqual(listed, {"questionnaire.json": "json", "photos/radiator.png": "png"})


if __name__ == "__main__":
    unittest.main()
