"""Run the decision engine for one demo customer: data/demo/<id>/processed/*.json -> data/demo/<id>/output/*.json

usage: python3 scripts/run_engine.py B-03
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import decision, heat_load, operating_cost, radiator_check  # noqa: E402


def load(path):
    return json.loads(path.read_text())


def save(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")
    print("wrote", path.relative_to(ROOT))


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
    proc = ROOT / "data" / "demo" / building_id / "processed"
    out = ROOT / "data" / "demo" / building_id / "output"
    head = {"schema_version": "0.1", "building_id": building_id}

    heat = {**head, "step": "01_heat_load", **heat_load.run(
        load(proc / "01a_heat_load_by_area.json"), load(proc / "01b_heat_load_by_consumption.json"))}
    save(out / "01_heat_load.json", heat)

    rad = {**head, "step": "02_radiator_check", **radiator_check.run(load(proc / "02_radiator_check.json"), heat)}
    save(out / "02_radiator_check.json", rad)

    cost = {**head, "step": "03_operating_cost", **operating_cost.run(load(proc / "03_operating_cost.json"), rad)}
    save(out / "03_operating_cost.json", cost)

    dec = {**head, **decision.run(load(proc / "02_radiator_check.json"), heat, rad, cost)}
    dec["dev_check"] = dev_check(building_id, heat, dec["verdict"])
    save(out / "decision.json", dec)


if __name__ == "__main__":
    main(sys.argv[1])
