"""What-if analysis over the inputs that are still uncertain after the customer confirmed their data.

For every uncertain input a fixed rule picks a reasonable assumption (logged with its reason). The engine is then
run with every uncertain input pinned to one value: once for the current values, and once per possible value of
each input with the others held (a sweep), so the browser can colour each slider by the verdict it would give.

    run(steps, values=None) -> {params, values, result, sweeps, full}
"""
import copy

import engine
from heat_load import FOSSIL_BOILERS, as_range, w_per_m2_band

A, B, R, C = "01a_heat_load_by_area", "01b_heat_load_by_consumption", "02_radiator_check", "03_operating_cost"


def param(key, label, values, labels, assumed, rule):
    return {"key": key, "label": label, "values": values, "labels": labels, "assumed": assumed, "rule": rule}


def nearest(values, x):
    return min(values, key=lambda v: abs(v - x))


def params(steps, full):
    """The uncertain inputs of this customer, each with its possible values and the assumed one (fixed rules)."""
    fa, fb, fr = steps[A]["fields"], steps[B]["fields"], steps[R]["fields"]
    load = full["01_heat_load"]["heating_load_kw"]
    radiators = fr["heat_distribution"]["value"] in ("radiators", "mixed")
    bill_used = as_range(fb["annual_consumption_kwh"]) is not None and fb["energy_carrier"]["value"] in FOSSIL_BOILERS
    out = []

    if load["by_area"] and load["by_consumption"] and fb["other_heat_source"]["value"] is not True:
        agree = bool(load["consistent"])
        out.append(param("load_basis", "Heat load taken from", ["area", "average", "bill"], ["house size", "average of both", "energy bill"],
                         "average" if agree else "area",
                         "Bill and house size agree: use their average." if agree else
                         "Bill and house size disagree: use the house size, since a bill can miss other heat sources or part of the year."))

    if as_range(fa["floor_area_m2"]):
        lo, hi = w_per_m2_band(fa["construction_year"]["value"], fa["renovation_status"]["value"], [])
        if lo != hi:
            values = list(range(lo, hi + 1, 5))
            out.append(param("q_w_per_m2", "Heat demand per m² (W/m²)", values, [f"{v} W/m²" for v in values], nearest(values, (lo + hi) / 2),
                             f"Middle of the {lo}-{hi} W/m² band for this building age and renovation."))

    unheated = fa.get("unheated_area", {}).get("value")
    if unheated is not None and not isinstance(unheated, (int, float)):
        values = [round(0.70 + 0.05 * i, 2) for i in range(7)]
        out.append(param("heated_share", "Share of the floor area that is heated", values, [f"{v:.0%}" for v in values], 0.85,
                         f"Unheated area of unknown size ({unheated}): middle of 70-100 % heated."))

    if bill_used:
        values = list(range(1800, 2101, 50))
        out.append(param("full_load_hours", "Full-load hours per year", values, [f"{v:,} h" for v in values], 2000,
                         "Official approximation: about 2,000 full-load hours."))
        if fb["annual_consumption_kwh"]["confidence"] == "medium":
            v0 = fb["annual_consumption_kwh"]["value"]
            values = [round(v0 * (0.8 + 0.05 * i)) for i in range(9)]
            out.append(param("annual_consumption_kwh", "Energy used per year (kWh)", values, [f"{v:,} kWh" for v in values], v0,
                             "Bill amount as stated; not sure it covers a full year (±20 %)."))
        if as_range(fb["persons_in_household"]) is None:
            values = [1, 2, 3, 4, 5, 6]
            out.append(param("persons_in_household", "People in the household", values, [str(v) for v in values], 2,
                             "Unknown: 2 people, about the average German household."))
        hot_water, solar = fb["hot_water_via_heating"]["value"], fb["solar_thermal"]["value"]
        if hot_water is None or (hot_water is not False and solar is True):
            values = [round(0.1 * i, 1) for i in range(11)]
            assumed, rule = (0.4, "Solar thermal typically covers about 60 % of hot water, so the boiler makes about 40 %.") if solar is True \
                else (1.0, "Unknown whether the boiler heats water: most gas and oil boilers do, so 100 %.")
            out.append(param("hot_water_share", "Hot water made by the boiler", values, [f"{v:.0%}" for v in values], assumed, rule))

    if radiators:
        rt = fr["radiator_type"]
        types = ["11", "22", "33"] if rt["value"] is None or rt["confidence"] == "low" else \
            [rt["value"]] + [a for a in rt.get("alternatives", []) if a != rt["value"]] if rt["confidence"] == "medium" else [rt["value"]]
        if len(types) > 1:
            out.append(param("radiator_type", "Radiator type", sorted(types), [f"type {t}" for t in sorted(types)], "22" if "22" in types else types[0],
                             "Unknown: type 22 (two panels), the most common panel radiator in German homes."))
        if fr["radiator_size_mm"]["value"] is None:
            values = list(range(400, 2001, 100))
            out.append(param("radiator_length_mm", "Typical radiator length (height 600 mm)", values, [f"{v:,} mm" for v in values], 1000,
                             "Unknown: standard 600 × 1000 mm panel."))
        if fr["radiator_count"]["value"] and fr["radiator_count"]["confidence"] == "medium":
            n = fr["radiator_count"]["value"]
            values = list(range(max(1, round(n * 0.8)), round(n * 1.2) + 1))
            out.append(param("radiator_count", "Number of radiators", values, [str(v) for v in values], n, "Count as stated (±20 %)."))
    return out


def pin(steps, values):
    """Copy of the step inputs with every uncertain input fixed to the given value."""
    s = copy.deepcopy(steps)
    exact = lambda v: {"value": v, "source": "scenario", "confidence": "high", "evidence": "what-if value"}
    for key, v in values.items():
        if key in ("q_w_per_m2", "heated_share"):
            s[A].setdefault("pinned", {})[key] = v
        elif key in ("load_basis", "hot_water_share"):
            s[B].setdefault("pinned", {})[key] = v
        elif key == "full_load_hours":
            s[B]["reference_data"]["full_load_hours"] = exact([v, v])
        elif key == "persons_in_household":
            s[B]["fields"][key] = exact(v)
        elif key == "annual_consumption_kwh":
            s[B]["fields"][key] = s[C]["fields"][key] = exact(v)
        elif key in ("radiator_type", "radiator_count"):
            s[R]["fields"][key] = exact(v)
        elif key == "radiator_length_mm":
            s[R]["fields"]["radiator_size_mm"] = exact([600, v])
    return s


def summary(outputs):
    h, c, d = outputs["01_heat_load"]["heating_load_kw"], outputs["03_operating_cost"], outputs["decision"]
    return {"verdict": d["verdict"], "verdict_kind": d["verdict_kind"], "load_kw": h["used"],
            "flow_c": outputs["02_radiator_check"]["flow_temp_c"]["required"], "jaz": c["jaz"],
            "today_eur": c["cost_eur_per_year"]["today"], "heat_pump_eur": c["cost_eur_per_year"]["heat_pump"],
            "saving_eur": c["cost_eur_per_year"]["saving"]}


def run(steps, values=None):
    building_id = steps[A].get("building_id", "HOME")
    full = engine.run(building_id, steps)
    ps = params(steps, full)
    current = {p["key"]: p["assumed"] for p in ps}
    current.update({k: v for k, v in (values or {}).items() if any(p["key"] == k and v in p["values"] for p in ps)})
    point = lambda vals: summary(engine.run(building_id, pin(steps, vals)))
    return {
        "params": ps,
        "values": current,
        "result": point(current),
        "sweeps": {p["key"]: [point({**current, p["key"]: v}) for v in p["values"]] for p in ps},
        "full": {"summary": summary(full), "decision": full["decision"]},
    }
