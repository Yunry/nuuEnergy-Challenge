"""Files added in the browser are saved, unchanged, to the customer's raw folder (scripts/serve.py save_uploads).

run: python3 -m unittest discover -s tests -v
"""
import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import ai_extract  # noqa: E402
from serve import demo_file, demo_files, known_facts, live_reset, live_start, live_state, live_upload, live_use_demo, save_uploads  # noqa: E402

DEMO_DOCS = Path(__file__).resolve().parents[1] / "data" / "customer" / "demo"  # the live-demo upload files

PDF = b"%PDF-1.4\n% test bill\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def upload(customer_id, *files):
    return {"customer_id": customer_id, "files": [{"name": n, "type": t, "data": base64.b64encode(b).decode()} for n, t, b in files]}


class SaveUploads(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.demo = Path(self.tmp.name) / "data" / "demo"

    def tearDown(self):
        self.tmp.cleanup()

    def test_pdf_and_photo_go_to_the_customer_raw_folder_unchanged(self):
        r = save_uploads(upload("C-20261024-a1b2", ("Gas bill 2025.pdf", "application/pdf", PDF), ("radiator.png", "image/png", PNG)), self.demo)
        self.assertEqual(r["customer_id"], "C-20261024-a1b2")
        pdf = next((self.demo / "C-20261024-a1b2" / "raw" / "documents").glob("*_Gas_bill_2025.pdf"))
        png = next((self.demo / "C-20261024-a1b2" / "raw" / "photos").glob("*_radiator.png"))
        self.assertEqual(pdf.read_bytes(), PDF)
        self.assertEqual(png.read_bytes(), PNG)
        self.assertTrue((self.demo / "C-20261024-a1b2" / "processed").is_dir())

    def test_demo_customer_folder_is_used_for_example_homes(self):
        save_uploads(upload("B-03", ("bill.pdf", "application/pdf", PDF)), self.demo)
        self.assertEqual(len(list((self.demo / "B-03" / "raw" / "documents").iterdir())), 1)

    def test_unknown_customer_ids_and_unsafe_names_cannot_escape_the_folder(self):
        for bad in ("../x", "HOME", "C-1", ""):
            with self.assertRaises(ai_extract.ExtractionError):
                save_uploads(upload(bad, ("bill.pdf", "application/pdf", PDF)), self.demo)
        save_uploads(upload("B-01", ("../../etc/passwd.pdf", "application/pdf", PDF)), self.demo)
        saved = list((self.demo / "B-01" / "raw" / "documents").iterdir())
        self.assertEqual(len(saved), 1)
        self.assertNotIn("/", saved[0].name.split("_", 2)[-1])

    def test_wrong_content_is_rejected_before_anything_is_written(self):
        with self.assertRaises(ai_extract.ExtractionError):
            save_uploads(upload("B-02", ("bill.pdf", "application/pdf", b"not a pdf")), self.demo)
        self.assertFalse((self.demo / "B-02").exists())



class LiveDemo(unittest.TestCase):
    """The demo story: short questionnaire (not enough to decide) -> energy certificate (possible: radiator type open)
    -> clear radiator photo 05 (green)."""
    PDF, CLEAR, UNCLEAR = "energieausweis_b03_hamburg_1970_oel.pdf", "05_zweirohr-vermutet_kompakt.jpeg", "07_unklar_bad-multiblock.jpeg"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name) / "B-Live"

    def tearDown(self):
        self.tmp.cleanup()

    def upload_doc(self, name, mime="image/jpeg"):
        return live_upload(upload("B-Live", (name, mime, (DEMO_DOCS / name).read_bytes())), self.folder)

    def test_certificate_makes_it_possible_then_radiator_photo_makes_it_green(self):
        self.assertFalse(live_state(self.folder)["started"])
        with self.assertRaises(ai_extract.ExtractionError):
            self.upload_doc(self.CLEAR)  # not started yet
        start = live_start(self.folder)["latest"]
        self.assertEqual((start["heat_load"]["used"], start["flow"]["required"]), (None, None))  # not enough to decide yet
        pdf = self.upload_doc(self.PDF, "application/pdf")["latest"]
        self.assertEqual(set(pdf["added"]["facts"]), {"energy_carrier", "annual_consumption_kwh", "consumption_full_year", "construction_year", "floor_area_m2"})
        self.assertEqual((pdf["decision"]["verdict"], pdf["decision"]["verdict_kind"]), ("yellow", "unknown"))
        self.assertEqual(pdf["what_if"]["result_with_assumptions"]["verdict"], "yellow")
        self.assertEqual(pdf["cost"]["today"], 6800)  # oil from the certificate brings the oil price
        clear = self.upload_doc(self.CLEAR)["latest"]
        self.assertEqual((clear["decision"]["verdict"], clear["flow"]["required"]), ("green", [50, 52]))
        self.assertEqual(clear["what_if"]["result_with_assumptions"]["verdict"], "green")
        self.assertFalse(live_reset(self.folder)["started"])
        self.assertFalse(self.folder.exists())

    def test_unclear_photo_changes_nothing(self):
        live_start(self.folder)
        self.upload_doc(self.PDF, "application/pdf")
        unclear = self.upload_doc(self.UNCLEAR)["latest"]
        self.assertEqual(unclear["added"]["facts"], {})
        self.assertEqual(unclear["decision"]["verdict_kind"], "unknown")

    def test_a_device_without_the_files_can_use_the_servers_demo_files(self):
        self.assertEqual({f["name"] for f in demo_files()} >= {self.CLEAR, self.UNCLEAR}, True)
        self.assertIsNone(demo_file("../../.env"))  # only files listed in the register
        live_start(self.folder)
        live_use_demo({"name": self.PDF}, self.folder)
        state = live_use_demo({"name": self.CLEAR}, self.folder)
        self.assertEqual(state["latest"]["decision"]["verdict"], "green")
        with self.assertRaises(ai_extract.ExtractionError):
            live_use_demo({"name": "secret.pdf"}, self.folder)

    def test_register_reads_demo_files_by_content_only(self):
        facts, note = known_facts("renamed.jpg", (DEMO_DOCS / self.CLEAR).read_bytes())
        self.assertEqual((facts["radiator_type"]["value"], facts["radiator_type"]["source_file"]), ("22", "renamed.jpg"))
        self.assertTrue(note)
        self.assertEqual(known_facts("other.pdf", PDF), (None, None))

if __name__ == "__main__":
    unittest.main()
