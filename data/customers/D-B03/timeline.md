# D-B03: how the result changes with each upload

| Step | Added | Verdict | Heat load | Water temp. | Saving / year | Open inputs |
|---|---|---|---|---|---|---|
| 0 initial | first form input | yellow (unknown) | 15.8–18.4 kW | 50–84 °C | 3,531–4,185 € | 6: Heat load taken from, Heat demand per m² (W/m²), Share of the floor area that is heated, Full-load hours per year, Radiator type, Typical radiator length (height 600 mm) |
| 1 floor_plan | floor_plan_top_floor.pdf | yellow (unknown) | 15.8–18.4 kW | 50–84 °C | 3,531–4,185 € | 5: Heat load taken from, Heat demand per m² (W/m²), Full-load hours per year, Radiator type, Typical radiator length (height 600 mm) |
| 2 radiator_measurement | radiator_measurement.pdf | green (ready) | 15.8–18.4 kW | 51–54 °C | 4,185 € | 3: Heat load taken from, Heat demand per m² (W/m²), Full-load hours per year |
| 3 hydraulic_balancing | hydraulic_balancing_protocol_2023.pdf | green (ready) | 15.8–18.4 kW | 51–54 °C | 4,185 € | 3: Heat load taken from, Heat demand per m² (W/m²), Full-load hours per year |

Each step folder holds the engine input (`processed/`), output (`output/`), the inputs still open (`what_if.json`) and a technician report (`report.md`).
