# Demo customers

One folder per customer (building ID). Data flows `raw/` → `processed/` → `output/`.
Interface and field format: [../01_pipeline_and_interface.md](../01_pipeline_and_interface.md).

```
demo/<customer>/
  raw/                     everything the customer gives us, unchanged (from the frontend)
    customer_input.json    form answers, official dataset field names
    photos/                radiator / pipe / boiler photos
                           (bills, free text etc. also go in raw/)
  processed/               engine input after extraction + enrichment, one file per calculation step
    01a_heat_load_by_area.json
    01b_heat_load_by_consumption.json
    02_radiator_check.json
    03_operating_cost.json
  output/                  engine results
    01_heat_load.json      target values per step (1a + 1b cross-checked)
    02_radiator_check.json
    03_operating_cost.json
    decision.json          verdict, reasons, boundaries, next steps, technician checks
```

Each `processed/` file is self-contained: the `fields` and `reference_data` that step needs, in the
`value` / `source` / `confidence` / `evidence` format. `depends_on` names the earlier `output/` files
the step also reads (e.g. the radiator check needs the heat load).

Status:

- B-01 … B-05: `raw/customer_input.json` copied from [../raw/buildings](../raw/buildings) without the dev labels
  `reference_heating_load_kw` and `expected_verdict` (a customer would not know them; they stay in `raw/buildings`).
- `processed/`: B-03 split from the earlier example input; the others extracted by hand from `raw/` as a
  stand-in for the LLM extraction step (dataset values `high`, facts read from free text `medium`).
- `output/`: written by `python3 scripts/run_engine.py <customer>`. Radiator ratings are still placeholders.
- Schematic of every step with its inputs and outputs, and the results for all customers:
  [../../docs/decision_engine_schematic.pdf](../../docs/decision_engine_schematic.pdf)
  (`python3 scripts/plot_engine_schematic.py`).

`data/raw/` stays the master copy of everything we collected and is not changed.
