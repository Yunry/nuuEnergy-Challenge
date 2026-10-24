# Technician report · D-B03 · step 1 (energy_certificate)

**Verdict: YELLOW (unknown)** — A heat pump can very likely heat this house, but whether the existing radiators are big enough is still open. One side photo of a radiator would settle most of it.

| Heat load | Water temperature needed | Heat pump cost | Saving |
|---|---|---|---|
| 15.8–18.4 kW | 50–84 °C | 2,615–3,269 €/a | 3,531–4,185 €/a |

## Added in this step

- file `raw/documents/energieausweis_b03_hamburg_1970_oel.pdf`
- energy_carrier = oil (high): “Wesentlicher Energieträger: Heizöl EL” — energieausweis_b03_hamburg_1970_oel.pdf
- annual_consumption_kwh = 40000 (high): “3-Jahres-Mittel 2021–2023: 40.000 kWh/a (~4.000 l Heizöl)” — energieausweis_b03_hamburg_1970_oel.pdf
- consumption_full_year = True (high): “Erfassungszeitraum 3 volle Jahre (2021–2023), Jahresmittel” — energieausweis_b03_hamburg_1970_oel.pdf
- construction_year = 1970 (high): “Baujahr Gebäude 1970” — energieausweis_b03_hamburg_1970_oel.pdf
- floor_area_m2 = 200 (high): “Wohnfläche 200,0 m²” — energieausweis_b03_hamburg_1970_oel.pdf

## Still uncertain: check on site

- **Heat load taken from**: assumed average of both — Bill and house size agree: use their average.
- **Heat demand per m² (W/m²)**: assumed 100 W/m² — Middle of the 80-120 W/m² band for this building age and renovation.
- **Share of the floor area that is heated**: assumed 85% — Unheated area of unknown size (top floor, size unknown): middle of 70-100 % heated.
- **Full-load hours per year**: assumed 2,000 h — Official approximation: about 2,000 full-load hours.
- **Radiator type**: assumed type 22 — Unknown: type 22 (two panels), the most common panel radiator in German homes.
- **Typical radiator length (height 600 mm)**: assumed 1,000 mm — Unknown: standard 600 × 1000 mm panel.

## Reasons

- positive: Two-pipe system: all radiators get water at the same temperature.
- unknown: Radiator type unknown: the house runs with Type 33 at about 50-53 C, with Type 22 at about 58-62 C, with Type 11 at about 77-84 C.
- action: 12 radiator valves need replacement anyway; a good moment for hydraulic balancing.
- hint: 79-92 W/m2 is above 75 W/m2: better windows or insulation may be worth it.

## Technician checks

1. Exact heat load (DIN EN 12831)
2. Room-by-room radiator sizing
3. Electrical capacity and meter cabinet
4. Outdoor unit placement, sound and permits

## Homeowner can still provide

- Side photo of one typical radiator, plus its height and width
- Current flow temperature setting of the boiler, if known

## Assumptions

- Unheated area of unknown size (top floor, size unknown): heated area 70-100 % of floor area
- Partially renovated, built before 1979: 80-120 W/m2 (no official row for 'partially')
- Full-load hours 1800-2100 h (official approx. 2,000; range ours)
- Radiator size unknown: assumed 600 x 1000 mm
- Radiator output vs temperature: EN 442, n = 1.3, 10 K spread
- Heat pump also covers hot water, at the same JAZ as space heating
