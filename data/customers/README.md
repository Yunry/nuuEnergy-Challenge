# Customer folders

One folder per customer that grows with every upload. `data/demo/` holds the fixed challenge buildings;
here the backend collects what a customer sends, step by step, and saves the result after each step
(`src/decision_engine/customer_steps.py`).

```
customers/<id>/
  raw/customer_input.json          first form answers
  raw/documents/, raw/photos/      every file the customer sent, unchanged
  steps/NN_<label>/
    added.json                     files and facts added in this step
    processed/*.json               engine input after this step
    output/*.json                  engine output after this step
    what_if.json                   inputs still open: assumed value, rule, possible values
    report.md                      technician report after this step
  timeline.json, timeline.md       one row per step: verdict, load, water temperature, saving, open inputs
```

## Demo: D-B03 (saved version of the live demo)

Starts from B-03's questionnaire and adds the demo files from `data/customer/demo/`, read via
`data/customer/demo/extraction_register.json` (stands in for AI extraction, so the demo is repeatable).
See [D-B03/timeline.md](D-B03/timeline.md):

| Step | Upload | Result |
|---|---|---|
| 0 | questionnaire (B-03 answers) | **yellow**, uncertain: 50–84 °C depending on the unknown radiators |
| 1 | `energieausweis_b03_hamburg_1970_oel.pdf`: oil, 40,000 kWh/a (3-year mean), 1970, 200 m² | still **yellow**: the certificate says nothing about the radiators; asks for a radiator photo |
| 2 | `05_zweirohr-vermutet_kompakt.jpeg`, a clear radiator photo: type 22, two-pipe, size estimated (no scale, illustrative) | **green, approved**: 51–54 °C, saving €4,185 a year; the 4 open inputs cannot change the verdict |

With the unclear photo `07_unklar_bad-multiblock.jpeg` (towel radiator on a valve multi-block) nothing can be read,
so the result stays yellow.

Rebuild: `python3 scripts/build_demo_customer.py`

## Live demo: data/demo/B-Live

Welcome page → **Just have a look** → **Live demo** opens http://127.0.0.1:4173/live.html?fresh=1: an empty workspace
(`data/demo/B-Live/`, git-ignored) with B-03's stored questionnaire and no documents. Upload the PDF, then photo 05
(approved) or 07 (stays uncertain). Each upload becomes a step in `data/demo/B-Live/steps/` with the file, the JSON read
from it, the new result and a technician report. Demo files are recognised by content via the register; any other file
goes to the real AI extraction when `OPENAI_API_KEY` is set (`.env`). `/?demo=B-Live` opens the full result and
what-if for the latest step.
