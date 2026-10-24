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

## Demo: D-B05 (saved version of the live demo)

Starts from B-05's questionnaire (2006, underfloor heating plus 8 radiators, gas) and adds the radiator photos from
`data/customer/demo/`, read via `data/customer/demo/extraction_register.json` (stands in for AI extraction, so the demo
is repeatable). See [D-B05/timeline.md](D-B05/timeline.md):

| Step | Upload | Result |
|---|---|---|
| 0 | questionnaire (B-05) | **yellow**: a decision is possible but not certain; 42–98 °C, the radiators are unknown |
| 1 | `07_unklar_bad-multiblock.jpeg`: towel radiator on a valve multi-block | unchanged: nothing can be read |
| 2 | `05_zweirohr-vermutet_kompakt.jpeg`: clear photo, type 22, two-pipe, size estimated (no scale, illustrative) | **possible**: 42–61 °C, green with the standard assumptions; still yellow overall because the bill (9.9–13.2 kW) and the house size (5.0–7.5 kW) disagree, and at the bill's top value the water needs 61 °C |

Rebuild: `python3 scripts/build_demo_customer.py`

## Live demo: data/demo/B-Live

Welcome page → **Just have a look** → **Live demo** opens http://127.0.0.1:4173/live.html?fresh=1: an empty workspace
(`data/demo/B-Live/`, git-ignored) with B-05's stored questionnaire and no documents. Upload photo 07 (unchanged), then
photo 05 (narrowed to possible). Each upload becomes a step in `data/demo/B-Live/steps/` with the file, the JSON read
from it, the new result and a technician report. Demo files are recognised by content via the register; any other file
goes to the real AI extraction when `OPENAI_API_KEY` is set (`.env`). `/?demo=B-Live` opens the full result and
what-if for the latest step.
