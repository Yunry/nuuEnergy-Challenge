# Technician report · D-B03 · step 1 (heating_check_report)

**Verdict: GREEN (ready)** — A heat pump can very likely heat this house with the existing heating system at <= 55 C.

| Heat load | Water temperature needed | Heat pump cost | Saving |
|---|---|---|---|
| 15.8–18.4 kW | 51–54 °C | 2,615 €/a | 4,185 €/a |

## Added in this step

- file `raw/documents/heating_check_report.pdf`
- unheated_area = 45 (high): “Top floor added in the 1990s: 45 m², not heated and not lived in” — heating_check_report.pdf
- radiator_type = 22 (high): “15 panel radiators, all type 22 (two panels)” — heating_check_report.pdf
- radiator_size_mm = [600, 1400] (high): “All radiators 600 × 1400 mm” — heating_check_report.pdf
- pipe_system = two-pipe (high): “Heating system: two-pipe (Zweirohrsystem)” — heating_check_report.pdf
- valves_to_replace = 0 (high): “Hydraulic balancing done 03/2023: all 15 thermostatic valves replaced and preset” — heating_check_report.pdf
- flow_temperature_c = 55 (medium): “Heating curve: 55 °C flow at -12 °C outside” — heating_check_report.pdf

## Still uncertain: check on site

- **Heat load taken from**: assumed average of both — Bill and house size agree: use their average.
- **Heat demand per m² (W/m²)**: assumed 100 W/m² — Middle of the 80-120 W/m² band for this building age and renovation.
- **Full-load hours per year**: assumed 2,000 h — Official approximation: about 2,000 full-load hours.

## Reasons

- positive: Two-pipe system: all radiators get water at the same temperature.
- hint: 79-92 W/m2 is above 75 W/m2: better windows or insulation may be worth it.

## Technician checks

1. Exact heat load (DIN EN 12831)
2. Room-by-room radiator sizing
3. Electrical capacity and meter cabinet
4. Outdoor unit placement, sound and permits

## Homeowner can still provide

- nothing

## Assumptions

- Partially renovated, built before 1979: 80-120 W/m2 (no official row for 'partially')
- Full-load hours 1800-2100 h (official approx. 2,000; range ours)
- Radiator rating scaled by face area from 600 x 1000 mm (rough)
- Radiator output vs temperature: EN 442, n = 1.3, 10 K spread
- Heat pump also covers hot water, at the same JAZ as space heating
