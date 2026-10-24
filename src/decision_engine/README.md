# Decision engine: calculation and judgement (Python, stdlib only)

```
src/decision_engine/      one module per engine step, each with run(...) -> dict
  heat_load.py            step 1a + 1b: heat load by area / by consumption, cross-check
  radiator_check.py       step 2: required flow temperature per radiator case
  operating_cost.py       step 3: annual energy cost today vs heat pump
  decision.py             verdict, reasons, boundaries, next steps
  engine.py               runs the four steps in order: processed inputs -> outputs
  prepare.py              browser form answers (customer_input) -> processed inputs + reference data
scripts/serve.py          browser app + engine API (/api/assess, /api/samples, /api/evaluation)
scripts/run_engine.py     reads data/demo/<id>/processed/, writes data/demo/<id>/output/
scripts/evaluate.py       internal: engine on all demo customers vs. organizer labels
scripts/plot_engine_schematic.py   docs/decision_engine_schematic.pdf
tests/test_engine.py      python3 -m unittest discover -s tests -v
```

Run one customer from the repository root:

```sh
python3 scripts/run_engine.py B-03
```

Data layout and file contents: [../../data/demo/README.md](../../data/demo/README.md).
Field format and decisions: [../../data/01_pipeline_and_interface.md](../../data/01_pipeline_and_interface.md).
Schematic of each step (inputs, calculation, outputs) and results for all customers:
[../../docs/decision_engine_schematic.pdf](../../docs/decision_engine_schematic.pdf), regenerated with
`python3 scripts/plot_engine_schematic.py` (needs matplotlib).
