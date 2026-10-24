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

## Demo: D-B03

Starts from B-03's input and adds ONE **illustrative** document (made up for the demo, not real customer data),
an installer's heating check report. See [D-B03/timeline.md](D-B03/timeline.md):

| Step | Upload | Result |
|---|---|---|
| 0 | first form input (B-03) | **yellow**, uncertain: water temperature 50–84 °C depending on the unknown radiators; 6 open inputs |
| 1 | `heating_check_report.pdf`: top floor 45 m² unheated, 15 × type 22 radiators 600 × 1400 mm, two-pipe, valves replaced, 55 °C setting | **green** for every remaining option: 51–54 °C, saving €4,185 a year; 3 open model settings, none changes the verdict; nothing left to ask the homeowner |

Rebuild: `python3 scripts/build_demo_customer.py`

## Live demo: data/demo/B-Live

To show the steps live, open http://127.0.0.1:4173/live.html (server: `python3 scripts/serve.py`).
`data/demo/B-Live/` starts empty (git-ignored). **Start** saves B-03's input as step 0, then each document you upload
(for the demo: `D-B03/raw/documents/heating_check_report.pdf`) becomes the next step in `data/demo/B-Live/steps/`,
with the same files as above. The demo document is recognised by its content and its facts are applied
(a stand-in for AI extraction); any other file is saved and logged as a step without new facts.
`/?demo=B-Live` opens the full result page and what-if for the latest step. **Reset** empties the folder.
