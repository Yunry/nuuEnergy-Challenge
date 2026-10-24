# Technician report · D-B05 · step 2 (clear_photo)

**Verdict: YELLOW (unknown)** — A heat pump can very likely heat this house, but whether the existing radiators are big enough is still open. The bill and the house size point to different heat loads, so the bill should be checked first.

| Heat load | Water temperature needed | Heat pump cost | Saving |
|---|---|---|---|
| 5.0–13.2 kW | 42–61 °C | 1,765–2,206 €/a | 764–1,205 €/a |

## Added in this step

- file `raw/photos/05_zweirohr-vermutet_kompakt.jpeg`
- radiator_type = 22 (medium): “Profiled front panel with a convector grille on top: two-panel radiator (type 22)” — 05_zweirohr-vermutet_kompakt.jpeg
- pipe_system = two-pipe (medium): “Separate flow and return pipes rise from the floor to the valve and the lower connection” — 05_zweirohr-vermutet_kompakt.jpeg
- radiator_size_mm = [600, 1400] (low): “No scale in the photo: about 600 mm high, panel continues beyond the frame; 1,400 mm wide assumed (illustrative, confirm on site)” — 05_zweirohr-vermutet_kompakt.jpeg

## Still uncertain: check on site

- **Heat load taken from**: assumed house size — Bill and house size disagree: use the house size, since a bill can miss other heat sources or part of the year.
- **Heat demand per m² (W/m²)**: assumed 50 W/m² — Middle of the 40-60 W/m² band for this building age and renovation.
- **Full-load hours per year**: assumed 2,000 h — Official approximation: about 2,000 full-load hours.
- **Hot water made by the boiler**: assumed 40% — Solar thermal typically covers about 60 % of hot water, so the boiler makes about 40 %.

## Reasons

- positive: Two-pipe system: all radiators get water at the same temperature.
- unknown: The two heat-load estimates disagree (by area 5.0-7.5 kW, by bill 9.9-13.2 kW).

## Technician checks

1. Exact heat load (DIN EN 12831)
2. Room-by-room radiator sizing
3. Electrical capacity and meter cabinet
4. Outdoor unit placement, sound and permits

## Homeowner can still provide

- Does the bill cover a full year and all heated rooms, and is any other heat source used?
- Current flow temperature setting of the boiler, if known

## Assumptions

- Full-load hours 1800-2100 h (official approx. 2,000; range ours)
- Hot-water share of the bill uncertain (unknown or solar thermal): subtract 0 to full per-person amount
- Mixed system, heat share per circuit unknown: radiators assumed to carry the full load (conservative)
- Radiator rating scaled by face area from 600 x 1000 mm (rough)
- Radiator output vs temperature: EN 442, n = 1.3, 10 K spread
- Heat pump also covers hot water, at the same JAZ as space heating
