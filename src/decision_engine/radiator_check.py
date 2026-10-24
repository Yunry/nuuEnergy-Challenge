"""Step 2: can the existing heat distribution deliver the heat load at <= 55 C (55-60 C)?

Reads  processed/02_radiator_check.json, output/01_heat_load.json
Writes output/02_radiator_check.json with keys:
  inputs_as_ranges: {radiator_type: [...]}
  flow_temp_c:      {required: [min, max], by_case: {<radiator_type>: [min, max]}}
  assumptions:      non-official choices made for this building

Radiator output vs flow temperature (EN 442): Q = Q_rated * (dT / dT_rated)^n, with
dT = mean water temperature - room temperature. Rated at 75/65/20 C -> dT_rated = 50 K.
Assuming a 10 K spread, a flow temperature T gives dT = T - 5 - 20; at 55 C that is ~half the
rated output, matching the official rule of thumb.
"""
from heat_load import as_range

N = 1.3  # EN 442 radiator exponent
DT_RATED = 50.0  # K, at 75/65/20 C
SPREAD = 10.0  # K, flow - return
ROOM = 20.0  # C
RATED_SIZE_MM = (600, 1000)  # height x width the rating table is for
UNDERFLOOR_FLOW_C = 35  # official: underfloor heating around 35 C


def flow_temp_for(load_kw, rated_kw):
    """Flow temperature at which radiators with total rated output rated_kw deliver load_kw."""
    dt = DT_RATED * (load_kw / rated_kw) ** (1 / N)
    return dt + SPREAD / 2 + ROOM


def rated_needed(load_kw, flow_c):
    """Total rated radiator output needed to deliver load_kw at flow temperature flow_c (inverse of flow_temp_for)."""
    return load_kw / ((flow_c - SPREAD / 2 - ROOM) / DT_RATED) ** N


def radiator_types(field, all_types):
    """Categorical confidence rule: high -> {value}, medium -> value + alternatives, low/unknown -> all."""
    v, c = field["value"], field["confidence"]
    if v is not None and c in ("high", None):
        return [v]
    if v is not None and c == "medium":
        return [v] + [a for a in field.get("alternatives", []) if a != v]
    return list(all_types)


def run(step_input, heat_load):
    f, ref = step_input["fields"], step_input["reference_data"]
    assumptions = []
    load = heat_load["heating_load_kw"]["used"]
    distribution = f["heat_distribution"]["value"]
    ratings = ref["radiator_rated_kw_each"]["value"]
    types = radiator_types(f["radiator_type"], ratings)

    if distribution == "underfloor":
        assumptions.append(f"Underfloor heating: flow temperature around {UNDERFLOOR_FLOW_C} C (official)")
        by_case = {"underfloor": [UNDERFLOOR_FLOW_C, UNDERFLOOR_FLOW_C]}
        return {"inputs_as_ranges": {"radiator_type": []}, "flow_temp_c": {"required": by_case["underfloor"], "by_case": by_case}, "assumptions": assumptions}

    count = as_range(f["radiator_count"])
    if load is None or count is None or distribution not in ("radiators", "mixed"):
        return {"inputs_as_ranges": {"radiator_type": types}, "flow_temp_c": {"required": None, "by_case": None}, "assumptions": assumptions}

    if distribution == "mixed":
        assumptions.append("Mixed system, heat share per circuit unknown: radiators assumed to carry the full load (conservative)")

    size = f["radiator_size_mm"]["value"]
    if size is None:
        scale = 1.0
        assumptions.append(f"Radiator size unknown: assumed {RATED_SIZE_MM[0]} x {RATED_SIZE_MM[1]} mm")
    else:
        scale = size[0] * size[1] / (RATED_SIZE_MM[0] * RATED_SIZE_MM[1])
        assumptions.append(f"Radiator rating scaled by face area from {RATED_SIZE_MM[0]} x {RATED_SIZE_MM[1]} mm (rough)")
    assumptions.append(f"Radiator output vs temperature: EN 442, n = {N}, {SPREAD:.0f} K spread")

    by_case = {}
    for t in types:
        each = ratings[t] * scale
        # lowest temperature: smallest load on most radiators; highest: largest load on fewest
        lo = flow_temp_for(load[0], count[1] * each)
        hi = flow_temp_for(load[1], count[0] * each)
        by_case[t] = [round(lo), round(hi)]

    required = [min(r[0] for r in by_case.values()), max(r[1] for r in by_case.values())]
    return {"inputs_as_ranges": {"radiator_type": types}, "flow_temp_c": {"required": required, "by_case": by_case}, "assumptions": assumptions}
