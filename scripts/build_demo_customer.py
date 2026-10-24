"""Build the demo customer data/customers/D-B03: B-03's input (yellow, uncertain), then ONE upload, an installer's
heating check report, that settles the open questions (green over every remaining option). Both steps are saved, so
the change in result and technician report can be shown.

The document is ILLUSTRATIVE (made up for the demo, not real customer data); their facts are what the
document extraction would return. Rebuild from scratch:  python3 scripts/build_demo_customer.py
"""
import json
import sys
import tempfile
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "decision_engine"))

import customer_steps  # noqa: E402

FOLDER = ROOT / "data" / "customers" / "D-B03"
BASE = ROOT / "data" / "demo" / "B-03"

UPLOADS = [
    ("heating_check_report", "heating_check_report.pdf", "Heating check report (installer visit)", [
        "Top floor added in the 1990s: 45 m², not heated and not lived in.",
        "Radiators: 15 panel radiators, all type 22 (two panels), 600 × 1400 mm.",
        "Heating system: two-pipe (Zweirohrsystem).",
        "Hydraulic balancing done 03/2023: all 15 thermostatic valves replaced and preset.",
        "Heating curve: 55 °C flow at -12 °C outside.",
    ], {"unheated_area": (45, "high", "Top floor added in the 1990s: 45 m², not heated and not lived in"),
        "radiator_type": ("22", "high", "15 panel radiators, all type 22 (two panels)"),
        "radiator_size_mm": ([600, 1400], "high", "All radiators 600 × 1400 mm"),
        "pipe_system": ("two-pipe", "high", "Heating system: two-pipe (Zweirohrsystem)"),
        "valves_to_replace": (0, "high", "Hydraulic balancing done 03/2023: all 15 thermostatic valves replaced and preset"),
        "flow_temperature_c": (55, "medium", "Heating curve: 55 °C flow at -12 °C outside")}),
]


def make_pdf(path, title, lines):
    fig = plt.figure(figsize=(8.27, 11.69))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.axis("off")
    ax.text(0.08, 0.95, "ILLUSTRATIVE DEMO DOCUMENT · not real customer data", color="#a33f1e", fontsize=9, weight="bold")
    ax.text(0.08, 0.91, title, fontsize=16, weight="bold")
    ax.text(0.08, 0.885, "Customer D-B03 · Hamburg area (21xxx)", fontsize=9, color="#555555")
    for i, line in enumerate(lines):
        ax.text(0.08, 0.84 - i * 0.03, line, fontsize=11)
    fig.savefig(path)
    plt.close(fig)


def main():
    customer_input = {**json.loads((BASE / "raw" / "customer_input.json").read_text()), "building_id": FOLDER.name}
    processed = {p.stem: json.loads(p.read_text()) for p in sorted((BASE / "processed").glob("*.json"))}
    print("wrote", customer_steps.start(FOLDER, customer_input, processed).relative_to(ROOT))
    with tempfile.TemporaryDirectory() as tmp:
        for label, name, title, lines, facts in UPLOADS:
            path = Path(tmp) / name
            make_pdf(path, title, lines)
            facts = {k: {"value": v, "confidence": c, "evidence": e, "source_file": name} for k, (v, c, e) in facts.items()}
            print("wrote", customer_steps.add_upload(FOLDER, label, [path], facts).relative_to(ROOT))
    print((FOLDER / "timeline.md").read_text())


if __name__ == "__main__":
    main()
