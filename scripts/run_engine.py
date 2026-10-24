"""Run the decision engine for one demo customer: data/demo/<id>/processed/*.json -> data/demo/<id>/output/*.json

usage: python3 scripts/run_engine.py B-03
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "data" / "demo"
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import engine  # noqa: E402


def load(path):
    return json.loads(path.read_text())


def save(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")
    print("wrote", path.relative_to(ROOT))


def load_steps(building_id):
    data_dir = Path(os.environ.get('NUUENERGY_DATA_DIR', str(DEMO)))
    folder = data_dir / building_id / "processed"
    if not folder.exists():
        folder = DEMO / building_id / "processed"
    return {p.stem: load(p) for p in sorted(folder.glob("*.json"))}


def dev_check(building_id, heat, verdict):
    """Compare against the labels in data/raw/buildings/buildings_dev.json; None for eval buildings."""
    labels = {b["building_id"]: b for b in load(ROOT / "data" / "raw" / "buildings" / "buildings_dev.json")}
    if building_id not in labels:
        return None
    ref, expected = labels[building_id]["reference_heating_load_kw"], labels[building_id]["expected_verdict"]
    used = heat["heating_load_kw"]["used"]
    return {
        "reference_heating_load_kw": ref,
        "expected_verdict": expected,
        "verdict_match": verdict == expected,
        "reference_in_range": used is not None and used[0] <= ref <= used[1],
    }


def main(building_id):
    outputs = engine.run(building_id, load_steps(building_id))
    outputs["decision"]["dev_check"] = dev_check(building_id, outputs["01_heat_load"], outputs["decision"]["verdict"])
    for name, obj in outputs.items():
        save(DEMO / building_id / "output" / f"{name}.json", obj)


if __name__ == "__main__":
    main(sys.argv[1])
