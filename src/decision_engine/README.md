# Decision engine: calculation and judgement (Python, stdlib only)

```
src/decision_engine/      one module per engine step, each with run(...) -> dict
  heat_load.py            step 1a + 1b: heat load by area / by consumption, cross-check
  radiator_check.py       step 2: required flow temperature per radiator case
  operating_cost.py       step 3: annual energy cost today vs heat pump
  decision.py             verdict, reasons, boundaries, next steps
scripts/run_engine.py     reads data/demo/<id>/processed/, writes data/demo/<id>/output/
```

Run one customer from the repository root:

```sh
python3 scripts/run_engine.py B-03
```

Data layout and file contents: [../../data/demo/README.md](../../data/demo/README.md).
Field format and decisions: [../../data/01_pipeline_and_interface.md](../../data/01_pipeline_and_interface.md).
The expected output shape for each step is the hand-made B-03 example in `data/demo/B-03/output/`;
running the script overwrites it with real engine output.
