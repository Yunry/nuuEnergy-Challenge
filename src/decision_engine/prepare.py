"""Structured form answers (customer_input from the browser) -> processed step inputs.

This is the extraction + enrichment step for answers that are already structured: every answer becomes
{value, source, confidence, evidence}; reference data (official prices and factors) is attached per step.
Self-reported values carry confidence None (taken as given); "not sure" becomes None.

customer_input keys: dataset field names (building_id, construction_year, floor_area_m2, renovation_status,
heat_distribution, annual_consumption_kwh, energy_carrier, pipe_system, flow_temperature_c,
persons_in_household, hot_water_via_heating, building_notes) plus structured answers the dataset keeps in
free text: consumption_full_year, radiator_count, radiator_type, other_heat_source, solar_thermal.
"""

RADIATOR_TYPES = ["11", "22", "33"]

OFFICIAL = {
    "boiler_efficiency": {"value": 0.88, "source": "official", "confidence": "high", "evidence": "Technical Guardrails 1b: useful heat ~ consumption x 0.88"},
    "hot_water_kwh_per_person": {"value": 1000, "source": "official", "confidence": "high", "evidence": "Technical Guardrails 1b: subtract approx. 1,000 kWh per person per year for boiler-supplied hot water"},
    "full_load_hours": {"value": [1800, 2100], "source": "official", "confidence": "medium", "evidence": "Technical Guardrails 1b: approx. 2,000 full-load hours; 1,800-2,100 used as range (ours)"},
    "hp_electricity_price_eur_per_kwh": {"value": 0.26, "source": "official", "confidence": "high", "evidence": "Technical Guardrails 3: heat-pump electricity 26 ct/kWh"},
    "jaz": {"value": {"underfloor_35c": 4.0, "radiators_le_55c": 3.5, "radiators_55_60c": 2.8}, "source": "official", "confidence": "high", "evidence": "Technical Guardrails 3; no official JAZ above 60 C"},
    "radiator_rated_kw_each": {"value": {"11": 1.0, "22": 1.8, "33": 2.6}, "source": "own_table", "confidence": "low", "evidence": "PLACEHOLDER for 600x1000 mm at 75/65/20 C, to be verified from manufacturer catalogs"},
}
FUEL_PRICE = {
    "gas": {"value": 0.11, "source": "official", "confidence": "high", "evidence": "Technical Guardrails 3: natural gas 0.11 EUR/kWh"},
    "oil": {"value": 0.17, "source": "official", "confidence": "high", "evidence": "Technical Guardrails 3: heating oil 1.70 EUR/litre (~17 ct/kWh)"},
}
NO_PRICE = {"value": None, "source": "official", "confidence": None, "evidence": "no official price for this energy carrier"}

STEPS = {
    "01a_heat_load_by_area": (["construction_year", "floor_area_m2", "renovation_status", "unheated_area", "insulation"], []),
    "01b_heat_load_by_consumption": (["annual_consumption_kwh", "energy_carrier", "persons_in_household", "hot_water_via_heating", "other_heat_source", "solar_thermal"],
                                     ["boiler_efficiency", "hot_water_kwh_per_person", "full_load_hours"]),
    "02_radiator_check": (["heat_distribution", "pipe_system", "flow_temperature_c", "radiator_count", "radiator_type", "radiator_size_mm", "valves_to_replace"],
                          ["radiator_rated_kw_each"]),
    "03_operating_cost": (["annual_consumption_kwh", "energy_carrier", "hot_water_via_heating"],
                          ["fuel_price_eur_per_kwh", "hp_electricity_price_eur_per_kwh", "boiler_efficiency", "jaz"]),
}


def answer(ci, key):
    v = ci.get(key)
    return {"value": v, "source": f"homeowner.{key}", "confidence": None, "evidence": "self-reported" if v is not None else "not provided"}


def fields(ci):
    f = {k: answer(ci, k) for k in ("construction_year", "floor_area_m2", "renovation_status", "heat_distribution", "energy_carrier",
                                    "pipe_system", "flow_temperature_c", "persons_in_household", "hot_water_via_heating",
                                    "other_heat_source", "solar_thermal", "radiator_count")}
    f["annual_consumption_kwh"] = answer(ci, "annual_consumption_kwh")
    if ci.get("consumption_full_year") is False:
        f["annual_consumption_kwh"].update(confidence="low", evidence="bill does not cover a full year")
    elif ci.get("consumption_full_year") is None and ci.get("annual_consumption_kwh") is not None:
        f["annual_consumption_kwh"].update(confidence="medium", evidence="not sure whether the bill covers a full year")
    f["radiator_type"] = answer(ci, "radiator_type")
    if ci.get("radiator_type") is None:
        f["radiator_type"].update(confidence="low", alternatives=RADIATOR_TYPES)
    for k in ("unheated_area", "insulation", "radiator_size_mm", "valves_to_replace"):  # not asked in the form
        f[k] = {"value": None, "source": "homeowner", "confidence": None, "evidence": "not asked"}
    # Only keep provenance for values explicitly selected in the review UI and still unchanged.
    evidence = ci.get('extraction_evidence')
    if isinstance(evidence, dict):
        for key, item in evidence.items():
            if (key in f and isinstance(item, dict) and f[key]['value'] is not None
                    and type(item.get('value')) is type(f[key]['value'])
                    and item['value'] == f[key]['value']
                    and item.get('confidence') in ('high', 'medium', 'low')
                    and isinstance(item.get('source_file'), str)
                    and isinstance(item.get('evidence'), str)):
                current = f[key]['confidence']
                ranks = {'high': 0, None: 0, 'medium': 1, 'low': 2}
                confidence = max((current, item['confidence']), key=lambda c: ranks[c])
                f[key].update(source='confirmed_upload.' + item['source_file'][:200],
                              confidence=confidence, evidence=item['evidence'][:1500])
    return f


def run(customer_input):
    f = fields(customer_input)
    ref = {**OFFICIAL, "fuel_price_eur_per_kwh": FUEL_PRICE.get(customer_input.get("energy_carrier"), NO_PRICE)}
    raw = [{"id": "customer_input", "type": "json", "ref": "browser form"}]
    return {name: {"schema_version": "0.1", "building_id": customer_input.get("building_id") or "HOME", "step": name, "raw_inputs": raw,
                   "fields": {k: f[k] for k in keys}, "reference_data": {k: ref[k] for k in refs}}
            for name, (keys, refs) in STEPS.items()}
