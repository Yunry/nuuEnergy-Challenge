# Technician report · D-B03 · step 2 (radiator_measurement)

**Verdict: GREEN (ready)** — A heat pump can very likely heat this house with the existing heating system at <= 55 C.

| Heat load | Water temperature needed | Heat pump cost | Saving |
|---|---|---|---|
| 15.8–18.4 kW | 51–54 °C | 2,615 €/a | 4,185 €/a |

## Added in this step

- file `raw/documents/radiator_measurement.pdf`
- radiator_type = 22 (high): “Two panels with fins between them, photo and tape measure” — radiator_measurement.pdf
- radiator_size_mm = [600, 1400] (high): “Height 600 mm, width 1400 mm; all 15 radiators the same model” — radiator_measurement.pdf

## Still uncertain: check on site

- **Heat load taken from**: assumed average of both — Bill and house size agree: use their average.
- **Heat demand per m² (W/m²)**: assumed 100 W/m² — Middle of the 80-120 W/m² band for this building age and renovation.
- **Full-load hours per year**: assumed 2,000 h — Official approximation: about 2,000 full-load hours.

## Reasons

- positive: Two-pipe system: all radiators get water at the same temperature.
- action: 12 radiator valves need replacement anyway; a good moment for hydraulic balancing.
- hint: 79-92 W/m2 is above 75 W/m2: better windows or insulation may be worth it.

## Technician checks

1. Exact heat load (DIN EN 12831)
2. Room-by-room radiator sizing
3. Electrical capacity and meter cabinet
4. Outdoor unit placement, sound and permits

## Homeowner can still provide

- Current flow temperature setting of the boiler, if known

## Assumptions

- Partially renovated, built before 1979: 80-120 W/m2 (no official row for 'partially')
- Full-load hours 1800-2100 h (official approx. 2,000; range ours)
- Radiator rating scaled by face area from 600 x 1000 mm (rough)
- Radiator output vs temperature: EN 442, n = 1.3, 10 K spread
- Heat pump also covers hot water, at the same JAZ as space heating
