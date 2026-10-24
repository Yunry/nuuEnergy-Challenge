"""A customer folder grows step by step: each upload adds files and facts, and the result is saved per step.

run: python3 -m unittest discover -s tests -v
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import customer_steps  # noqa: E402

B03 = ROOT / "data" / "demo" / "B-03"


def fact(value, evidence="test evidence"):
    return {"value": value, "confidence": "high", "evidence": evidence, "source_file": "doc.pdf"}


class CustomerSteps(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name) / "D-TEST"
        self.doc = Path(self.tmp.name) / "doc.pdf"
        self.doc.write_bytes(b"%PDF-1.4\n")
        processed = {p.stem: json.loads(p.read_text()) for p in sorted((B03 / "processed").glob("*.json"))}
        customer_steps.start(self.folder, json.loads((B03 / "raw" / "customer_input.json").read_text()), processed)

    def tearDown(self):
        self.tmp.cleanup()

    def timeline(self):
        return json.loads((self.folder / "timeline.json").read_text())

    def test_each_upload_is_a_saved_step_with_its_files_facts_and_report(self):
        customer_steps.add_upload(self.folder, "radiators", [self.doc], {"radiator_type": fact("22"), "radiator_size_mm": fact([600, 1400])})
        step = self.folder / "steps" / "01_radiators"
        self.assertTrue((self.folder / "raw" / "documents" / "doc.pdf").exists())
        self.assertEqual(json.loads((step / "added.json").read_text())["files"], ["raw/documents/doc.pdf"])
        field = json.loads((step / "processed" / "02_radiator_check.json").read_text())["fields"]["radiator_type"]
        self.assertEqual((field["value"], field["source"]), ("22", "upload:doc.pdf"))
        self.assertIn("step 1 (radiators)", (step / "report.md").read_text())

    def test_fewer_open_inputs_and_a_changed_verdict_after_the_upload(self):
        customer_steps.add_upload(self.folder, "radiators", [self.doc], {"radiator_type": fact("22"), "radiator_size_mm": fact([600, 1400])})
        before, after = self.timeline()
        self.assertEqual(before["verdict"], "yellow")
        self.assertEqual(after["verdict"], "green")
        self.assertLess(len(after["open_inputs"]), len(before["open_inputs"]))

    def test_steps_build_on_each_other(self):
        customer_steps.add_upload(self.folder, "floor_plan", [self.doc], {"unheated_area": fact(45)})
        customer_steps.add_upload(self.folder, "valves", [], {"valves_to_replace": fact(0)})
        last = customer_steps.latest_processed(self.folder)
        self.assertEqual(last["01a_heat_load_by_area"]["fields"]["unheated_area"]["value"], 45)
        self.assertEqual(last["02_radiator_check"]["fields"]["valves_to_replace"]["value"], 0)
        self.assertEqual([r["step"] for r in self.timeline()], [0, 1, 2])


if __name__ == "__main__":
    unittest.main()
