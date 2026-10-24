"""Step 3: annual operating energy cost, today vs heat pump. Does not decide the colour.

Reads  processed/03_operating_cost.json, output/02_radiator_check.json
Writes output/03_operating_cost.json with keys:
  jaz:               [min, max]
  cost_eur_per_year: {today (scalar), heat_pump: [min, max], saving: [min, max], note}
  assumptions:       non-official choices made for this building

The heat pump supplies the same useful heat the boiler supplies today (consumption x boiler
efficiency), so both sides keep the same service boundary, hot water included if the boiler makes it.
"""
from heat_load import FOSSIL_BOILERS, as_range


def jaz_for(flow_c, jaz):
    """Official JAZ values reachable within a flow temperature range; above 60 C there is none."""
    lo, hi = flow_c
    values = []
    if lo <= 55:
        values.append(jaz["radiators_le_55c"])
    if lo <= 60 and hi > 55:
        values.append(jaz["radiators_55_60c"])
    return values, hi > 60


def run(step_input, radiator_check):
    f, ref = step_input["fields"], step_input["reference_data"]
    assumptions = []
    jaz_table = ref["jaz"]["value"]

    values, note = [], None
    by_case = radiator_check["flow_temp_c"]["by_case"] or {}
    for case, flow_c in by_case.items():
        if case == "underfloor":
            values.append(jaz_table["underfloor_35c"])
            continue
        v, above_60 = jaz_for(flow_c, jaz_table)
        values += v
        if above_60:
            note = "only combinations up to 60 C; above 60 C there is no official JAZ"
    jaz = [min(values), max(values)] if values else None

    # cost follows the bill as stated: today and heat pump share the same consumption, so an
    # uncertain consumption shifts both sides together and is not widened here
    consumption = f["annual_consumption_kwh"]["value"] if as_range(f["annual_consumption_kwh"]) else None
    price = ref["fuel_price_eur_per_kwh"]["value"]
    today = None if consumption is None or price is None else consumption * price

    heat_pump = None
    if consumption is not None and jaz is not None and f["energy_carrier"]["value"] in FOSSIL_BOILERS:
        heat = consumption * ref["boiler_efficiency"]["value"]
        hp_price = ref["hp_electricity_price_eur_per_kwh"]["value"]
        heat_pump = [heat / jaz[1] * hp_price, heat / jaz[0] * hp_price]
        if f["hot_water_via_heating"]["value"] is True:
            assumptions.append("Heat pump also covers hot water, at the same JAZ as space heating")

    saving = None if today is None or heat_pump is None else [today - heat_pump[1], today - heat_pump[0]]

    def eur(r):
        return None if r is None else [round(x) for x in r]

    return {
        "jaz": jaz,
        "cost_eur_per_year": {
            "today": None if today is None else round(today),
            "heat_pump": eur(heat_pump),
            "saving": eur(saving),
            "note": note,
        },
        "assumptions": assumptions,
    }
