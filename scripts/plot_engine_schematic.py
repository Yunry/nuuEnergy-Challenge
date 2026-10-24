"""Schematic of the decision engine: overview, one page per step (inputs -> calculation -> outputs,
filled with a customer's real files), and a results page for all demo customers.

usage: python3 scripts/plot_engine_schematic.py [B-03]   -> docs/decision_engine_schematic.pdf
"""
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "data" / "demo"
OUT = ROOT / "docs" / "decision_engine_schematic.pdf"

IN, REF, CALC, OUTC, NOTE = "#dbe9f6", "#e8e8e8", "#fff2cc", "#d9ead3", "#f4cccc"
A4 = (11.69, 8.27)


def box(ax, x, y, text, color, size=8, mono=True, **kw):
    return ax.text(x, y, text, fontsize=size, family="monospace" if mono else "sans-serif", va="top", ha="left",
                   bbox=dict(boxstyle="round,pad=0.6", fc=color, ec="#555555"), **kw)


def arrow(ax, a, b, label="", rad=0.0):
    ax.annotate("", xy=(0, 0.5), xycoords=b, xytext=(1, 0.5), textcoords=a,
                arrowprops=dict(arrowstyle="-|>", color="#333333", connectionstyle=f"arc3,rad={rad}"))
    if label:
        ax.annotate(label, xy=(0, 0.5), xycoords=b, xytext=(-8, 6), textcoords="offset points",
                    ha="right", fontsize=7, color="#333333")


def page(pdf, title, subtitle=""):
    fig = plt.figure(figsize=A4)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.axis("off")
    ax.text(0.02, 0.97, title, fontsize=15, weight="bold", va="top")
    if subtitle:
        ax.text(0.02, 0.925, subtitle, fontsize=9, va="top", color="#444444")
    return fig, ax


def short(v, n=34):
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    return s if len(s) <= n else s[: n - 1] + "…"


def field_lines(fields, used):
    lines = []
    for k, f in fields.items():
        mark = " " if k in used else "-"  # '-' = carried in the file, used by a later step or not yet
        lines.append(f"{mark} {k:<24} {short(f['value'])}  [{f['confidence']}]")
    return "\n".join(lines)


def ref_lines(ref):
    return "\n".join(f"  {k:<32} {short(r['value'], 46)}" for k, r in ref.items())


def overview(pdf):
    fig, ax = page(pdf, "Decision engine: data flow",
                   "data/demo/<customer>/raw -> processed -> output.  Python, stdlib only.  Run: python3 scripts/run_engine.py <customer>")
    raw = box(ax, 0.02, 0.62, "raw/\n customer_input.json\n photos/\n (bill, free text)", IN)
    rows = [
        ("processed/\n 01a_heat_load_by_area.json\n 01b_heat_load_by_consumption.json", "heat_load.py\n step 1a + 1b", "output/01_heat_load.json\n heating_load_kw: by_area, by_consumption,\n consistent, used, w_per_m2"),
        ("processed/\n 02_radiator_check.json", "radiator_check.py\n step 2", "output/02_radiator_check.json\n flow_temp_c: by_case, required"),
        ("processed/\n 03_operating_cost.json", "operating_cost.py\n step 3", "output/03_operating_cost.json\n jaz, cost_eur_per_year"),
        ("processed/\n 02_radiator_check.json\n (heating-system facts)", "decision.py\n verdict", "output/decision.json\n verdict, reasons, boundaries,\n homeowner / technician lists"),
    ]
    outs, steps, procs = [], [], []
    for i, (p, s, o) in enumerate(rows):
        y = 0.86 - i * 0.2
        procs.append(box(ax, 0.24, y, p, IN))
        steps.append(box(ax, 0.52, y, s, CALC, size=9))
        outs.append(box(ax, 0.72, y, o, OUTC))
        arrow(ax, procs[-1], steps[-1])
        arrow(ax, steps[-1], outs[-1])
    arrow(ax, raw, procs[1], "extraction + enrichment\n(LLM later; by hand now)")
    # upstream outputs feeding later steps
    for src, dst in ((0, 1), (1, 2), (0, 3), (1, 3), (2, 3)):
        ax.annotate("", xy=(0.5, 1.0), xycoords=steps[dst], xytext=(0.0, 0.0), textcoords=outs[src],
                    arrowprops=dict(arrowstyle="-|>", color="#888888", ls="--", connectionstyle="arc3,rad=0.15"))
    labels = box(ax, 0.72, 0.1, "data/raw/buildings/buildings_dev.json\n reference_heating_load_kw, expected_verdict", NOTE)
    ax.text(0.72, 0.035, "run_engine.py adds dev_check to decision.json;\nthe engine itself never sees the labels.", fontsize=7.5, va="top")
    ax.annotate("", xy=(0.5, 0.0), xycoords=outs[3], xytext=(0.5, 1.0), textcoords=labels,
                arrowprops=dict(arrowstyle="-|>", color="#aa3333", ls="--"))
    ax.text(0.02, 0.14, "Legend\n blue   input files\n yellow engine step (src/decision_engine/)\n green  output files\n"
                       " dashed grey: output read by a later step\n\nConventions: ranges [min, max], unknown = null,\n"
                       "every field {value, source, confidence, evidence}", fontsize=8, va="top", family="monospace")
    pdf.savefig(fig)
    plt.close(fig)


STEPS = [
    {
        "title": "Step 1: heat load (heat_load.py)",
        "inputs": ["01a_heat_load_by_area.json", "01b_heat_load_by_consumption.json"],
        "upstream": [],
        "used": {"construction_year", "floor_area_m2", "renovation_status", "unheated_area", "annual_consumption_kwh",
                 "energy_carrier", "persons_in_household", "hot_water_via_heating", "other_heat_source", "solar_thermal"},
        "calc": """1a  by area
    heated area A = floor x [0.7, 1.0]  if unheated area of unknown size
    q [W/m2] from construction year / renovation:
       < 1979 unrenovated 120-180 | partially 80-120 (ours)
       1980-1999           80-120 | >= 2002 or renovated 40-60
       gaps 1979, 2000-01: span of both rows (ours)
    P_area = A x q / 1000                              [kW]

1b  by consumption (gas / oil / LPG boilers only)
    Q_useful = consumption x 0.88
    Q_space  = Q_useful - persons x 1000 kWh  (hot water;
               0 ... full amount if solar thermal or unknown)
    P_bill   = Q_space / full-load hours (1800-2100 h)  [kW]

cross-check
    overlap        -> used = intersection, consistent = true
    no overlap     -> used = hull of both, consistent = false
    other heat src -> used = P_area (bill misses demand)
    w_per_m2 = used x 1000 / floor area""",
        "output": "01_heat_load.json",
    },
    {
        "title": "Step 2: radiator check (radiator_check.py)",
        "inputs": ["02_radiator_check.json"],
        "upstream": [("01_heat_load.json", lambda o: {"heating_load_kw.used": o["heating_load_kw"]["used"]})],
        "used": {"heat_distribution", "radiator_count", "radiator_type", "radiator_size_mm"},
        "calc": """radiator types T (confidence rule)
    high -> {value};  medium -> value + alternatives;
    low / unknown -> {11, 22, 33}

rated output (placeholder table, 600 x 1000 mm, 75/65/20 C)
    Q_rated(T) = count x rating[T] x size factor

EN 442, n = 1.3, 10 K spread, room 20 C
    Q(T_flow) = Q_rated x (dT / 50 K)^1.3,  dT = T_flow - 25
 -> T_flow   = 25 + 50 x (load / Q_rated)^(1/1.3)

per type: [lowest load on most radiators,
           highest load on fewest radiators]
underfloor -> 35 C (official)
mixed      -> radiators carry the full load (conservative)""",
        "output": "02_radiator_check.json",
    },
    {
        "title": "Step 3: operating cost (operating_cost.py)",
        "inputs": ["03_operating_cost.json"],
        "upstream": [("02_radiator_check.json", lambda o: {"flow_temp_c.by_case": o["flow_temp_c"]["by_case"]})],
        "used": {"annual_consumption_kwh", "energy_carrier", "hot_water_via_heating"},
        "calc": """JAZ per case from its flow temperature range (official)
    <= 55 C -> 3.5    55-60 C -> 2.8    underfloor -> 4.0
    > 60 C  -> no official JAZ, case left out (note)
    jaz = [min, max] over all cases

same service boundary on both sides
    (heat pump supplies what the boiler supplies today,
     hot water included if the boiler makes it)

    today     = consumption x fuel price
    heat pump = consumption x 0.88 / JAZ x 0.26 EUR/kWh
    saving    = today - heat pump

cost never decides the colour (D8)""",
        "output": "03_operating_cost.json",
    },
    {
        "title": "Step 4: decision (decision.py)",
        "inputs": ["02_radiator_check.json"],
        "upstream": [("01_heat_load.json", lambda o: {"used": o["heating_load_kw"]["used"], "consistent": o["heating_load_kw"]["consistent"], "w_per_m2": o["heating_load_kw"]["w_per_m2"]}),
                     ("02_radiator_check.json", lambda o: {"by_case": o["flow_temp_c"]["by_case"]}),
                     ("03_operating_cost.json", lambda o: {"assumptions": len(o["assumptions"])})],
        "used": {"heat_distribution", "pipe_system", "flow_temperature_c", "radiator_count", "valves_to_replace"},
        "calc": """outcome per case (flow temperature range)
    <= 55 C good | 55-60 C workable | > 60 C fail

verdict over all cases
    only good      -> green  / ready
    only workable  -> yellow / workable
    only fail      -> red    / obstacle
    more than one  -> yellow / unknown
hard rule: confirmed single-pipe -> at most yellow

boundary (when unknown): total rated radiator output
    needed = max load / ((T - 25) / 50)^1.3  at T = 55, 60 C

reasons: pipe system, underfloor, radiator type,
    heat-load contradiction, valves, > 75 W/m2 hint
lists: homeowner can provide / technician checks
assumptions: collected from steps 1-3""",
        "output": "decision.json",
    },
]


def height(lines, size):
    """Approximate box height in figure units for a text of `lines` lines at font `size` (A4 landscape)."""
    return lines * size * 1.25 / 595 + 0.035


def step_page(pdf, step, customer):
    d = DEMO / customer
    fig, ax = page(pdf, step["title"], f"Values shown for {customer} (data/demo/{customer}). "
                                       "'-' in front of a field: carried in the file but not used by this step.")
    y, size = 0.88, 7.5
    blocks = []

    def add(text, color):
        nonlocal y
        blocks.append(box(ax, 0.02, y, text, color, size=size))
        y -= height(text.count("\n") + 1, size)

    for name in step["inputs"]:
        p = json.loads((d / "processed" / name).read_text())
        add(f"processed/{name}\n fields\n{field_lines(p['fields'], step['used'])}", IN)
        if p["reference_data"]:
            add(f" reference_data\n{ref_lines(p['reference_data'])}", REF)
    for name, pick in step["upstream"]:
        o = json.loads((d / "output" / name).read_text())
        add(f"output/{name} (earlier step)\n" + "\n".join(f"  {k}: {short(v, 60)}" for k, v in pick(o).items()), OUTC)

    calc = box(ax, 0.52, 0.88, step["calc"], CALC, size=8.5)
    out = json.loads((d / "output" / step["output"]).read_text())
    lines = []
    for k, v in out.items():
        if k in ("schema_version", "building_id", "step"):
            continue
        if isinstance(v, dict):
            lines.append(f" {k}")
            lines += [f"   {kk}: {short(vv, 58)}" for kk, vv in v.items()]
        elif isinstance(v, list) and v and isinstance(v[0], (dict, str)):
            lines.append(f" {k}: {len(v)} item(s)")
        else:
            lines.append(f" {k}: {short(v, 64)}")
    res = box(ax, 0.52, 0.88 - height(step["calc"].count("\n") + 1, 8.5) - 0.04,
              f"output/{step['output']}\n" + "\n".join(lines), OUTC, size=size)
    for b in blocks:
        arrow(ax, b, calc)
    ax.annotate("", xy=(0.1, 1.0), xycoords=res, xytext=(0.1, 0.0), textcoords=calc,
                arrowprops=dict(arrowstyle="-|>", color="#333333"))
    pdf.savefig(fig)
    plt.close(fig)


def results(pdf):
    fig, ax = page(pdf, "Results: all demo customers", "Engine output per customer; dev labels from data/raw/buildings/buildings_dev.json (B-01 to B-03 only).")
    head = f"{'':5} {'verdict':<16} {'load used kW':<13} {'consistent':<10} {'flow C by radiator type':<28} {'today -> HP EUR/a':<20} {'expected':<10} {'ref kW':<6} in range"
    rows, loads, verdicts, in_range = [head, "-" * len(head)], [], [], []
    for d in sorted(p for p in DEMO.iterdir() if (p / "output" / "decision.json").exists()):
        o = lambda n: json.loads((d / "output" / n).read_text())
        h, r, c, dec = o("01_heat_load.json")["heating_load_kw"], o("02_radiator_check.json")["flow_temp_c"], o("03_operating_cost.json")["cost_eur_per_year"], o("decision.json")
        dev = dec.get("dev_check") or {}
        if dev:
            verdicts.append(dev["verdict_match"])
            in_range.append(dev["reference_in_range"])
        mark = "" if not dev else (" OK" if dev["verdict_match"] else " MISS")
        flow = " ".join(f"{t}:{v[0]}-{v[1]}" for t, v in (r["by_case"] or {}).items())
        cost = f"{c['today']} -> {short(c['heat_pump'], 12)}"
        rows.append(f"{d.name:<5} {dec['verdict'] + '/' + dec['verdict_kind']:<16} {short(h['used'], 13):<13} {str(h['consistent']):<10} {flow:<28} {cost:<20} "
                    f"{str(dev.get('expected_verdict', '-')) + mark:<10} {str(dev.get('reference_heating_load_kw', '-')):<6} {dev.get('reference_in_range', '-')}")
        loads.append((d.name, h, dev.get("reference_heating_load_kw")))
    rows += ["", f"Dev check: verdict {sum(verdicts)}/{len(verdicts)} match, reference heat load inside 'used' {sum(in_range)}/{len(in_range)}"]
    ax.text(0.02, 0.88, "\n".join(rows), fontsize=8.5, family="monospace", va="top")

    # heat-load ranges per customer
    ch = fig.add_axes([0.08, 0.08, 0.86, 0.42])
    for i, (name, h, ref) in enumerate(loads):
        for dy, key, color in ((-0.25, "by_area", "#6fa8dc"), (0.0, "by_consumption", "#f6b26b"), (0.25, "used", "#38761d")):
            if h[key]:
                ch.plot(h[key], [i + dy] * 2, color=color, lw=6, solid_capstyle="butt", label=key if i == 0 else None)
        if ref is not None:
            ch.plot([ref], [i], marker="D", color="black", ms=7, ls="none", label="reference" if i == 0 else None)
    ch.set_yticks(range(len(loads)))
    ch.set_yticklabels([n for n, _, _ in loads])
    ch.invert_yaxis()
    ch.set_xlabel("heat load [kW]")
    ch.set_title("Heat-load ranges (step 1) vs reference", fontsize=10, loc="left")
    ch.grid(axis="x", color="#dddddd")
    ch.legend(loc="lower right", fontsize=8, frameon=False)
    pdf.savefig(fig)
    plt.close(fig)


def main(customer):
    OUT.parent.mkdir(exist_ok=True)
    with PdfPages(OUT) as pdf:
        overview(pdf)
        for step in STEPS:
            step_page(pdf, step, customer)
        results(pdf)
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "B-03")
