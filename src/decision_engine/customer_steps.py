"""A customer folder that grows step by step: every upload adds documents and the facts read from them, the
engine and the what-if analysis run again, and the step is saved, so the change from upload to upload can be shown.

data/customers/<id>/
  raw/customer_input.json          first form answers
  raw/documents/, raw/photos/      every file the customer sent, unchanged
  steps/NN_<label>/
    added.json                     files and facts added in this step
    processed/*.json               engine input after this step
    output/*.json                  engine output after this step
    what_if.json                   inputs still open: assumed value, rule, possible values
    report.md                      technician report after this step
  timeline.json, timeline.md       one row per step: verdict, load, water temperature, saving, open inputs

    start(folder, customer_input, processed)        step 00: the first input
    add_upload(folder, label, files, facts, notes)  next step: files plus facts {key: {value, confidence, evidence, source_file}}
"""
import json
import shutil
from pathlib import Path

import engine
import prepare
import scenarios

PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def step_dirs(folder):
    return sorted(d for d in (folder / "steps").glob("[0-9][0-9]_*") if d.is_dir())


def latest_processed(folder):
    last = step_dirs(folder)[-1]
    return {p.stem: json.loads(p.read_text()) for p in sorted((last / "processed").glob("*.json"))}


def apply_facts(steps, facts):
    """Facts read from an upload replace the matching field in every step input that uses it."""
    for key, f in facts.items():
        for step in steps.values():
            if key in step["fields"]:
                step["fields"][key] = {"value": f["value"], "source": f"upload:{f['source_file']}", "confidence": f["confidence"], "evidence": f["evidence"]}
    if "energy_carrier" in facts:  # the fuel price follows the fuel read from the upload
        for step in steps.values():
            if "fuel_price_eur_per_kwh" in step["reference_data"]:
                step["reference_data"]["fuel_price_eur_per_kwh"] = prepare.FUEL_PRICE.get(facts["energy_carrier"]["value"], prepare.NO_PRICE)
    return steps


def span(r, unit):
    return "—" if not r else (f"{r[0]:,}" if r[0] == r[1] else f"{r[0]:,}–{r[1]:,}") + unit


def report(customer_id, n, label, added, outputs, what):
    d, h = outputs["decision"], outputs["01_heat_load"]["heating_load_kw"]
    flow, cost = outputs["02_radiator_check"]["flow_temp_c"]["required"], outputs["03_operating_cost"]["cost_eur_per_year"]
    lines = [f"# Technician report · {customer_id} · step {n} ({label})", "",
             f"**Verdict: {d['verdict'].upper()} ({d['verdict_kind']})** — {d['summary']}", "",
             "| Heat load | Water temperature needed | Heat pump cost | Saving |", "|---|---|---|---|",
             f"| {span(h['used'], ' kW')} | {span(flow, ' °C')} | {span(cost['heat_pump'], ' €/a')} | {span(cost['saving'], ' €/a')} |", "",
             "## Added in this step", ""]
    lines += [f"- file `{f}`" for f in added["files"]] or ["- first customer input (form answers)"]
    lines += [f"- {k} = {v['value']} ({v['confidence']}): “{v['evidence']}” — {v['source_file']}" for k, v in added["facts"].items()]
    lines += ["", "## Still uncertain: check on site", ""]
    lines += [f"- **{p['label']}**: assumed {p['labels'][p['values'].index(p['assumed'])]} — {p['rule']}" for p in what["params"]] or ["- nothing open"]
    lines += ["", "## Reasons", ""] + [f"- {r['type']}: {r['text']}" for r in d["reasons"]]
    lines += ["", "## Technician checks", ""] + [f"{i}. {t}" for i, t in enumerate(d["technician_checks"], 1)]
    lines += ["", "## Homeowner can still provide", ""] + ([f"- {t}" for t in d["homeowner_can_provide"]] or ["- nothing"])
    lines += ["", "## Assumptions", ""] + [f"- {a}" for a in d["assumptions"]]
    return "\n".join(lines) + "\n"


def record(folder, label, steps, files, facts, notes=()):
    customer_id = folder.name
    n = len(step_dirs(folder))
    out = folder / "steps" / f"{n:02d}_{label}"
    saved = []
    for src in map(Path, files):
        dest = folder / "raw" / ("photos" if src.suffix.lower() in PHOTO_SUFFIXES else "documents") / src.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)
        saved.append(str(dest.relative_to(folder)))
    for step in steps.values():
        step["building_id"] = customer_id
    outputs = engine.run(customer_id, steps)
    what = scenarios.run(steps)
    added = {"step": n, "label": label, "files": saved, "facts": facts, "notes": list(notes)}
    write(out / "added.json", added)
    for name, obj in steps.items():
        write(out / "processed" / f"{name}.json", obj)
    for name, obj in outputs.items():
        write(out / "output" / f"{name}.json", obj)
    write(out / "what_if.json", {"params": what["params"], "result_with_assumptions": what["result"]})
    (out / "report.md").write_text(report(customer_id, n, label, added, outputs, what))
    update_timeline(folder)
    return out


def update_timeline(folder):
    rows = []
    for d in step_dirs(folder):
        added = json.loads((d / "added.json").read_text())
        out = {p.stem: json.loads(p.read_text()) for p in (d / "output").glob("*.json")}
        what = json.loads((d / "what_if.json").read_text())
        rows.append({"step": added["step"], "label": added["label"], "files": added["files"], "facts": sorted(added["facts"]),
                     "verdict": out["decision"]["verdict"], "verdict_kind": out["decision"]["verdict_kind"],
                     "load_kw": out["01_heat_load"]["heating_load_kw"]["used"], "flow_c": out["02_radiator_check"]["flow_temp_c"]["required"],
                     "saving_eur": out["03_operating_cost"]["cost_eur_per_year"]["saving"],
                     "open_inputs": [p["label"] for p in what["params"]], "technician_checks": len(out["decision"]["technician_checks"])})
    write(folder / "timeline.json", rows)
    md = [f"# {folder.name}: how the result changes with each upload", "",
          "| Step | Added | Verdict | Heat load | Water temp. | Saving / year | Open inputs |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        added = ", ".join(Path(f).name for f in r["files"]) or "first form input"
        md.append(f"| {r['step']} {r['label']} | {added} | {r['verdict']} ({r['verdict_kind']}) | {span(r['load_kw'], ' kW')} | {span(r['flow_c'], ' °C')} "
                  f"| {span(r['saving_eur'], ' €')} | {len(r['open_inputs'])}: {', '.join(r['open_inputs']) or '—'} |")
    md += ["", "Each step folder holds the engine input (`processed/`), output (`output/`), the inputs still open (`what_if.json`) "
               "and a technician report (`report.md`)."]
    (folder / "timeline.md").write_text("\n".join(md) + "\n")


def start(folder, customer_input, processed, label="initial"):
    if folder.exists():
        shutil.rmtree(folder)
    write(folder / "raw" / "customer_input.json", customer_input)
    return record(folder, label, processed, [], {})


def add_upload(folder, label, files, facts, notes=()):
    return record(folder, label, apply_facts(latest_processed(folder), facts), files, facts, notes)
