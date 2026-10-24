"""Build the demo customer data/customers/D-B03: B-03's input (yellow), then three uploads that each remove
uncertainty, saved step by step so the change in result and technician report can be shown.

The three documents are ILLUSTRATIVE (made up for the demo, not real customer data); their facts are what the
document extraction would return. Rebuild from scratch:  python3 scripts/build_demo_customer.py
"""
import json
import sys
import tempfile
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import customer_steps  # noqa: E402

FOLDER = ROOT / "data" / "customers" / "D-B03"
BASE = ROOT / "data" / "demo" / "B-03"

UPLOADS = [
    ("floor_plan", "floor_plan_top_floor.pdf", "Floor plan, top floor (Dachgeschoss)", [
        "Top floor added in the 1990s: 45 m², marked 'not heated, not lived in'.",
        "Ground and first floor: 155 m² heated living space.",
    ], {"unheated_area": (45, "high", "Floor plan p.1: top floor 45 m², marked 'not heated, not lived in'")}),
    ("radiator_measurement", "radiator_measurement.pdf", "Radiator measurement by the homeowner", [
        "Living room radiator: two panels with fins between them (type 22).",
        "Height 600 mm, width 1400 mm (tape measure).",
        "Homeowner note: all 15 radiators are the same model and size.",
    ], {"radiator_type": ("22", "high", "Two panels with fins between them, photo and tape measure"),
        "radiator_size_mm": ([600, 1400], "high", "Height 600 mm, width 1400 mm; all 15 radiators the same model")}),
    ("hydraulic_balancing", "hydraulic_balancing_protocol_2023.pdf", "Hydraulic balancing protocol, 03/2023", [
        "Heating system: two-pipe (Zweirohrsystem).",
        "All 15 thermostatic valves replaced and preset; hydraulic balancing done.",
        "Heating curve: 55 °C flow at -12 °C outside.",
    ], {"valves_to_replace": (0, "high", "All 15 thermostatic valves replaced and preset, hydraulic balancing done 03/2023"),
        "pipe_system": ("two-pipe", "high", "Protocol: two-pipe system (Zweirohrsystem)"),
        "flow_temperature_c": (55, "medium", "Heating curve set to 55 °C flow at -12 °C outside")}),
]


def make_pdf(path, title, lines, floor_plan=False):
    fig = plt.figure(figsize=(8.27, 11.69))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.axis("off")
    ax.text(0.08, 0.95, "ILLUSTRATIVE DEMO DOCUMENT · not real customer data", color="#a33f1e", fontsize=9, weight="bold")
    ax.text(0.08, 0.91, title, fontsize=16, weight="bold")
    ax.text(0.08, 0.885, "Customer D-B03 · Hamburg area (21xxx)", fontsize=9, color="#555555")
    for i, line in enumerate(lines):
        ax.text(0.08, 0.84 - i * 0.03, line, fontsize=11)
    if floor_plan:
        ax.add_patch(Rectangle((0.15, 0.35), 0.7, 0.3, fill=False, lw=2))
        ax.add_patch(Rectangle((0.15, 0.35), 0.3, 0.3, facecolor="#eeeeee", lw=2, edgecolor="black"))
        ax.text(0.3, 0.5, "Top floor\n45 m²\nnot heated", ha="center", va="center", fontsize=11)
        ax.text(0.65, 0.5, "Stairs / storage\n(roof slope)", ha="center", va="center", fontsize=10, color="#555555")
    fig.savefig(path)
    plt.close(fig)


def main():
    customer_input = {**json.loads((BASE / "raw" / "customer_input.json").read_text()), "building_id": FOLDER.name}
    processed = {p.stem: json.loads(p.read_text()) for p in sorted((BASE / "processed").glob("*.json"))}
    print("wrote", customer_steps.start(FOLDER, customer_input, processed).relative_to(ROOT))
    with tempfile.TemporaryDirectory() as tmp:
        for label, name, title, lines, facts in UPLOADS:
            path = Path(tmp) / name
            make_pdf(path, title, lines, floor_plan=label == "floor_plan")
            facts = {k: {"value": v, "confidence": c, "evidence": e, "source_file": name} for k, (v, c, e) in facts.items()}
            print("wrote", customer_steps.add_upload(FOLDER, label, [path], facts).relative_to(ROOT))
    print((FOLDER / "timeline.md").read_text())


if __name__ == "__main__":
    main()
