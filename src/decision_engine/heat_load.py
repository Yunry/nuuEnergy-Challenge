"""Steps 1a + 1b: heat load by area and by consumption, then cross-check.

Reads  processed/01a_heat_load_by_area.json, processed/01b_heat_load_by_consumption.json
Writes output/01_heat_load.json with keys:
  inputs_as_ranges: {heated_area_m2: [min, max], full_load_hours: [min, max]}
  heating_load_kw:  {by_area, by_consumption, consistent, used, w_per_m2}  (ranges as [min, max], unknown = None)
  assumptions:      non-official choices made for this building
"""

FOSSIL_BOILERS = ("gas", "oil", "lpg")
UNHEATED_SHARE = 0.7  # ours: unheated area of unknown size -> heated area 70-100 % of floor area
PERSONS_IF_UNKNOWN = [1, 5]  # ours: full plausible range


def as_range(field):
    """Field {value, confidence} -> [min, max] by the agreed confidence rules, or None if unknown.

    high -> exact, medium -> +-20 %, low -> unknown. A value without a confidence (homeowner
    self-report from the frontend) is taken as given.
    """
    v, c = field["value"], field["confidence"]
    if v is None or c == "low":
        return None
    if c == "medium":
        return [0.8 * v, 1.2 * v]
    return [v, v]


def w_per_m2_band(year, renovation, assumptions):
    """W/m2 range from the official construction-year table, with our rules for its gaps."""
    if renovation in ("fully", "renovated"):
        return [40, 60]
    if year is None:
        assumptions.append("Construction year unknown: full table range 40-180 W/m2")
        return [40, 180]
    if year >= 2002:
        return [40, 60]
    if year < 1979:
        if renovation == "unrenovated":
            return [120, 180]
        if renovation == "partially":
            assumptions.append("Partially renovated, built before 1979: 80-120 W/m2 (no official row for 'partially')")
            return [80, 120]
        assumptions.append("Built before 1979, renovation unknown: 80-180 W/m2 (unrenovated or partially renovated)")
        return [80, 180]
    if 1980 <= year <= 1999:
        return [80, 120]
    if year == 1979:
        assumptions.append("Built 1979 (gap in official table): 80-180 W/m2, spanning both neighbouring rows")
        return [80, 180]
    assumptions.append(f"Built {year} (gap in official table): 40-120 W/m2, spanning both neighbouring rows")
    return [40, 120]


def heated_area(fields, assumptions):
    floor = as_range(fields["floor_area_m2"])
    if floor is None:
        return None
    unheated = fields.get("unheated_area", {}).get("value")
    if unheated is None:
        return floor
    if isinstance(unheated, (int, float)):
        return [floor[0] - unheated, floor[1] - unheated]
    assumptions.append(f"Unheated area of unknown size ({unheated}): heated area {UNHEATED_SHARE * 100:.0f}-100 % of floor area")
    return [UNHEATED_SHARE * floor[0], floor[1]]


def by_area(step, assumptions):
    f = step["fields"]
    area = heated_area(f, assumptions)
    if area is None:
        return None, None
    band = w_per_m2_band(f["construction_year"]["value"], f["renovation_status"]["value"], assumptions)
    return area, [area[0] * band[0] / 1000, area[1] * band[1] / 1000]


def by_consumption(step, assumptions):
    f, ref = step["fields"], step["reference_data"]
    hours = ref["full_load_hours"]["value"]
    consumption = as_range(f["annual_consumption_kwh"])
    if consumption is None:
        return hours, None
    if f["energy_carrier"]["value"] not in FOSSIL_BOILERS:
        assumptions.append(f"Energy carrier '{f['energy_carrier']['value']}': no boiler efficiency rule, consumption method skipped")
        return hours, None

    if hours[0] != hours[1]:
        assumptions.append(f"Full-load hours {hours[0]}-{hours[1]} h (official approx. 2,000; range ours)")
    eff = ref["boiler_efficiency"]["value"]
    useful = [consumption[0] * eff, consumption[1] * eff]

    # hot water from the boiler: subtract per person; unknown or solar-assisted -> anywhere from 0 to the full amount
    persons = as_range(f["persons_in_household"]) or PERSONS_IF_UNKNOWN
    per_person = ref["hot_water_kwh_per_person"]["value"]
    water_max = persons[1] * per_person
    hot_water = f["hot_water_via_heating"]["value"]
    if hot_water is False:
        water = [0, 0]
    elif hot_water is None or f["solar_thermal"]["value"] is True:
        water = [0, water_max]
        assumptions.append("Hot-water share of the bill uncertain (unknown or solar thermal): subtract 0 to full per-person amount")
    else:
        water = [persons[0] * per_person, water_max]

    space = [useful[0] - water[1], useful[1] - water[0]]
    if space[1] <= 0:
        assumptions.append("Hot-water allowance exceeds useful heat: consumption input inconsistent, method skipped")
        return hours, None
    space[0] = max(space[0], 0)
    return hours, [space[0] / hours[1], space[1] / hours[0]]


def cross_check(area_kw, cons_kw, other_heat_source, assumptions):
    """-> (consistent, used). Overlap -> intersection; no overlap -> flagged, hull of both."""
    if other_heat_source is True and area_kw is not None:
        assumptions.append("Other heat source in use: the bill misses part of the demand, area method used alone")
        return None, area_kw
    if area_kw is None or cons_kw is None:
        return None, area_kw or cons_kw
    lo, hi = max(area_kw[0], cons_kw[0]), min(area_kw[1], cons_kw[1])
    if lo <= hi:
        return True, [lo, hi]
    return False, [min(area_kw[0], cons_kw[0]), max(area_kw[1], cons_kw[1])]


def rounded(r, digits):
    return None if r is None else [round(x, digits) if digits else round(x) for x in r]


def run(area_step, consumption_step):
    assumptions = []
    area, area_kw = by_area(area_step, assumptions)
    hours, cons_kw = by_consumption(consumption_step, assumptions)
    other = consumption_step["fields"]["other_heat_source"]["value"]
    consistent, used = cross_check(area_kw, cons_kw, other, assumptions)

    floor = as_range(area_step["fields"]["floor_area_m2"])
    w_per_m2 = None
    if used is not None and floor is not None:
        w_per_m2 = [used[0] * 1000 / floor[1], used[1] * 1000 / floor[0]]

    return {
        "inputs_as_ranges": {"heated_area_m2": rounded(area, 0), "full_load_hours": hours},
        "heating_load_kw": {
            "by_area": rounded(area_kw, 1),
            "by_consumption": rounded(cons_kw, 1),
            "consistent": consistent,
            "used": rounded(used, 1),
            "w_per_m2": rounded(w_per_m2, 0),
        },
        "assumptions": assumptions,
    }
