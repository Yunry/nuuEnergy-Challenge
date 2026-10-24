"""Files added in the browser are saved, unchanged, to the customer's raw folder (scripts/serve.py save_uploads).

run: python3 -m unittest discover -s tests -v
"""
import base64
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import ai_extract  # noqa: E402
from serve import known_facts, live_reset, live_start, live_state, live_upload, save_uploads  # noqa: E402

DEMO_DOCS = Path(__file__).resolve().parents[1] / "data" / "customers" / "D-B03" / "raw" / "documents"

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
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name) / "B-Live"

    def tearDown(self):
        self.tmp.cleanup()

    def upload_doc(self, name):
        return live_upload(upload("B-Live", (name, "application/pdf", (DEMO_DOCS / name).read_bytes())), self.folder)

    def test_starts_empty_then_each_upload_is_the_next_step(self):
        self.assertFalse(live_state(self.folder)["started"])
        with self.assertRaises(ai_extract.ExtractionError):
            self.upload_doc("heating_check_report.pdf")  # not started yet
        self.assertEqual(live_start(self.folder)["timeline"][0]["verdict"], "yellow")
        state = self.upload_doc("heating_check_report.pdf")  # one upload settles it
        self.assertEqual([r["verdict"] for r in state["timeline"]], ["yellow", "green"])
        self.assertEqual(state["latest"]["decision"]["homeowner_can_provide"], [])
        self.assertTrue((self.folder / "raw" / "documents" / "heating_check_report.pdf").exists())
        self.assertFalse(live_reset(self.folder)["started"])
        self.assertFalse(self.folder.exists())

    def test_known_demo_documents_give_their_facts_and_unknown_files_none(self):
        facts = known_facts("x.pdf", (DEMO_DOCS / "heating_check_report.pdf").read_bytes())
        self.assertEqual(facts["radiator_type"]["value"], "22")
        self.assertEqual(facts["radiator_type"]["source_file"], "x.pdf")
        self.assertEqual(known_facts("y.pdf", PDF), {})


if __name__ == "__main__":
    unittest.main()
