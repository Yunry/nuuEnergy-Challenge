"""Judgement: green / yellow / red verdict from the step outputs, plus hard rules.

Reads  processed/02_radiator_check.json (facts about the heating system),
       output/01_heat_load.json, output/02_radiator_check.json, output/03_operating_cost.json
Writes output/decision.json with keys:
  verdict, verdict_kind, summary, boundaries, reasons,
  homeowner_can_provide, technician_checks, assumptions
(dev_check is added by scripts/run_engine.py, so the engine never sees the dev labels.)

Verdict (D6): every radiator case can land in <= 55 C (good), 55-60 C (workable) or > 60 C (fail).
  only good -> green; only workable -> yellow/workable; only fail -> red/obstacle;
  more than one possible -> yellow/unknown, with the inputs that would decide it as boundaries.
Hard rule: confirmed single-pipe -> at most yellow. Operating cost never decides the colour (D8).
"""
from radiator_check import rated_needed

GOOD_C, WORKABLE_C = 55, 60
W_PER_M2_HINT = 75  # official: above this, windows or insulation may be worth investigating


def outcomes(flow_c):
    """Possible outcomes for one case with required flow temperature range [lo, hi]."""
    lo, hi = flow_c
    found = set()
    if lo <= GOOD_C:
        found.add("good")
    if lo <= WORKABLE_C and hi > GOOD_C:
        found.add("workable")
    if hi > WORKABLE_C:
        found.add("fail")
    return found


def span(r, unit=""):
    return f"{r[0]}{unit}" if r[0] == r[1] else f"{r[0]}-{r[1]}{unit}"


def radiator_boundary(load_kw, count):
    """Total rated radiator output that decides the colour, for the highest load and fewest radiators."""
    good, workable = round(rated_needed(load_kw, GOOD_C), 1), round(rated_needed(load_kw, WORKABLE_C), 1)
    per = lambda total: round(total / count, 2)
    return {
        "input": "radiator_rated_output_total_kw",
        "flips_verdict": True,
        "thresholds": [
            {"range": f">= {good}", "per_radiator": f">= {per(good)}", "result": f"green: runs at <= {GOOD_C} C"},
            {"range": f"{workable}-{good}", "per_radiator": f"{per(workable)}-{per(good)}", "result": f"yellow: needs {GOOD_C}-{WORKABLE_C} C, higher running cost"},
            {"range": f"< {workable}", "per_radiator": f"< {per(workable)}", "result": f"needs > {WORKABLE_C} C: some radiators should be upgraded"},
        ],
        "resolve_by": "homeowner",
        "how": "Side photo of a typical radiator plus its height and width",
    }


def run(system, heat_load, radiator_check, operating_cost):
    f = {k: v["value"] for k, v in system["fields"].items()}
    load = heat_load["heating_load_kw"]
    by_case = radiator_check["flow_temp_c"]["by_case"]
    radiators = f["heat_distribution"] in ("radiators", "mixed")
    reasons, boundaries, homeowner = [], [], []
    technician = ["Exact heat load (DIN EN 12831)"]

    def reason(kind, text, source):
        reasons.append({"type": kind, "text": text, "source": source})

    # verdict from the enumerated cases
    possible = set().union(*(outcomes(r) for r in by_case.values())) if by_case else set()
    if possible == {"good"}:
        verdict, kind = "green", "ready"
    elif possible == {"workable"}:
        verdict, kind = "yellow", "workable"
    elif possible == {"fail"}:
        verdict, kind = "red", "obstacle"
    else:
        verdict, kind = "yellow", "unknown"

    # facts about the heating system
    if f["pipe_system"] == "two-pipe":
        reason("positive", "Two-pipe system: all radiators get water at the same temperature.", "pipe_system")
    elif f["pipe_system"] == "single-pipe":
        reason("obstacle", "Single-pipe system: radiators further along the loop get cooler water, so the last ones may need a higher flow temperature.", "pipe_system")
        technician.append("Single-pipe loop: hydraulics and flow temperature at the last radiator")
        if verdict == "green":
            verdict, kind = "yellow", "unknown"
    elif radiators:
        technician.append("Pipe system (single- or two-pipe)")
    if f["heat_distribution"] == "underfloor":
        reason("positive", "Underfloor heating works at low flow temperatures (around 35 C).", "heat_distribution")

    if radiators and by_case and len(by_case) > 1:
        cases = ", ".join(f"with Type {t} at about {span(r)} C" for t, r in sorted(by_case.items(), reverse=True))
        reason("unknown", f"Radiator type unknown: the house runs {cases}.", "radiator_type")
    if load["consistent"] is False:
        reason("unknown", f"The two heat-load estimates disagree (by area {span(load['by_area'])} kW, by bill {span(load['by_consumption'])} kW).", "heating_load_kw")
        homeowner.append("Does the bill cover a full year and all heated rooms, and is any other heat source used?")
    if f["valves_to_replace"]:
        reason("action", f"{f['valves_to_replace']} radiator valves need replacement anyway; a good moment for hydraulic balancing.", "valves_to_replace")
    if load["w_per_m2"] and load["w_per_m2"][0] > W_PER_M2_HINT:
        reason("hint", f"{span(load['w_per_m2'])} W/m2 is above {W_PER_M2_HINT} W/m2: better windows or insulation may be worth it.", "heating_load_kw")

    # what would decide an open verdict
    if radiators and kind == "unknown" and load["used"] and f["radiator_count"]:
        boundaries.append(radiator_boundary(load["used"][1], f["radiator_count"]))
        homeowner.insert(0, "Side photo of one typical radiator, plus its height and width")
    if radiators and f["flow_temperature_c"] is None:
        homeowner.append("Current flow temperature setting of the boiler, if known")
    # missing basics that block a step
    if f["heat_distribution"] is None:
        homeowner.append("Whether the heat reaches the rooms through radiators, underfloor heating or both")
    if radiators and not f["radiator_count"]:
        homeowner.append("Number of radiators in the rooms you heat")
    if load["by_area"] is None:
        homeowner.append("Heated floor area of the home")
    if load["by_consumption"] is None:
        homeowner.append("Energy used in one full year, from a recent heating bill")
    if radiators:
        technician.append("Room-by-room radiator sizing")
    technician += ["Electrical capacity and meter cabinet", "Outdoor unit placement, sound and permits"]

    summary = {
        "ready": "A heat pump can very likely heat this house with the existing heating system at <= 55 C.",
        "workable": "A heat pump can heat this house, but the existing radiators need 55-60 C, which raises running costs.",
        "obstacle": "With the existing radiators this house needs more than 60 C: some radiators should be upgraded first.",
        "unknown": "A heat pump can very likely heat this house, but whether the existing radiators are big enough is still open.",
    }[kind]
    if not by_case:
        summary = "There is not enough information yet to judge whether the existing heating system can run with a heat pump."
    elif load["consistent"] is False:
        summary += " The bill and the house size point to different heat loads, so the bill should be checked first."
    elif boundaries:
        summary += " One side photo of a radiator would settle most of it."
    if f["pipe_system"] == "single-pipe":
        summary += " The single-pipe system must be checked by a technician."

    return {
        "verdict": verdict,
        "verdict_kind": kind,
        "summary": summary,
        "boundaries": boundaries,
        "reasons": reasons,
        "homeowner_can_provide": homeowner,
        "technician_checks": technician,
        "assumptions": heat_load["assumptions"] + radiator_check["assumptions"] + operating_cost["assumptions"],
    }
