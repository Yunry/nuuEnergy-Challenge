"""Internal competition evaluation (not part of the product): run the engine on every data/demo/<id>/processed/
and compare with the organizers' labels. Served to /evaluation.html by scripts/serve.py.

usage: python3 scripts/evaluate.py   (prints the same JSON)
"""
import json
import sys

from run_engine import DEMO, dev_check, engine, load, load_steps


def evaluate():
    rows = []
    for d in sorted(p for p in DEMO.glob("B-*") if any((p / "processed").glob("*.json"))):
        steps = load_steps(d.name)
        outputs = engine.run(d.name, steps)
        rows.append({
            "building_id": d.name,
            "customer_input": load(d / "raw" / "customer_input.json"),
            "processed": steps,
            "outputs": outputs,
            "dev_check": dev_check(d.name, outputs["01_heat_load"], outputs["decision"]["verdict"]),
        })
    return rows


if __name__ == "__main__":
    json.dump(evaluate(), sys.stdout, ensure_ascii=False, indent=1)
