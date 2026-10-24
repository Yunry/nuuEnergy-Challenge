"""Build the demo customer data/customers/D-B05, the saved version of the live demo:
step 0 B-05's questionnaire (yellow: a decision is possible, the radiators are unknown), step 1 the unclear photo 07
(nothing readable, unchanged), step 2 the clear radiator photo 05 (narrowed to "possible": green with the standard
assumptions; only the bill-based heat load could still tip it).

Files come from data/customer/demo/, their readings from data/customer/demo/extraction_register.json (the stand-in
for AI extraction). Rebuild from scratch:  python3 scripts/build_demo_customer.py
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import customer_steps  # noqa: E402

FOLDER = ROOT / "data" / "customers" / "D-B05"
BASE = ROOT / "data" / "demo" / "B-05"
FILES = ROOT / "data" / "customer" / "demo"
UPLOADS = [("unclear_photo", "07_unklar_bad-multiblock.jpeg"), ("clear_photo", "05_zweirohr-vermutet_kompakt.jpeg")]


def main():
    register = {e["sha256"]: e for e in json.loads((FILES / "extraction_register.json").read_text())["files"]}
    customer_input = {**json.loads((BASE / "raw" / "customer_input.json").read_text()), "building_id": FOLDER.name}
    processed = {p.stem: json.loads(p.read_text()) for p in sorted((BASE / "processed").glob("*.json"))}
    print("wrote", customer_steps.start(FOLDER, customer_input, processed, label="questionnaire").relative_to(ROOT))
    for label, name in UPLOADS:
        entry = register[hashlib.sha256((FILES / name).read_bytes()).hexdigest()]
        facts = {k: {**v, "source_file": name} for k, v in entry["facts"].items()}
        print("wrote", customer_steps.add_upload(FOLDER, label, [FILES / name], facts, [f"{name}: {entry['note']}"]).relative_to(ROOT))
    print((FOLDER / "timeline.md").read_text())


if __name__ == "__main__":
    main()
