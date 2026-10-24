# Browser flow

Run from the repository root with Python 3.9 or newer (standard library only):

```sh
python3 scripts/serve.py
```

`npm run dev` runs the same command. Open http://127.0.0.1:4173. No dependency installation, build, API key or account is required. Use `PORT=4174 python3 scripts/serve.py` if the default port is occupied. Run `python3 -m unittest discover -s tests -v` (or `npm test`) for the engine regression checks.

The internal competition evaluation is at http://127.0.0.1:4173/evaluation.html (see below).

## Scope

English homeowner flow: welcome → home → heating → energy use → review → assessment. Optional fields and explicit unknown answers; five real sample homes; larger text; back/edit; tab-local session saving; summary download; printing; confirmation before clearing answers. No bill/photo upload or AI extraction is implemented yet. No hosting or deployment is required to run it locally.

Sample homes are the demo customers' raw input (`data/demo/<id>/raw/customer_input.json`, served at `/api/samples`), which carries no development labels. Sample notes are preserved, and explicit wood-stove/solar-thermal mentions in these fixtures populate the related inputs; arbitrary homeowner text is not automatically interpreted.

## Engine integration

`src/browser/app.js` collects the answers and renders the result. `src/browser/assessment.js` turns them into a `customer_input` object with the dataset's field names (`toCustomerInput`) plus the structured answers the dataset keeps in free text (`consumption_full_year`, `radiator_count`, `radiator_type`, `other_heat_source`, `solar_thermal`). Only the listed keys are sent, so development labels cannot leak. "Not sure" becomes `null`; `amount` and `unit` are normalized to `annual_consumption_kwh`.

`scripts/serve.py` answers `POST /api/assess` with the Python decision engine (`src/decision_engine`): `prepare.py` turns `customer_input` into the four processed step inputs (`{value, source, confidence, evidence}`; self-reported values have `confidence: null`, a bill that is not a full year has `low`), and `engine.py` runs heat load → radiator check → operating cost → decision. The response is `{processed, outputs}` with the same files as `data/demo/<id>/output/`. The result page renders `outputs.decision` (verdict, summary, reasons, homeowner questions, boundaries, technician checks, assumptions) and the step outputs (heat-load estimates, required water temperature per radiator type, costs). Loading, error and retry states are shown while the request runs.

### Important modelling limitations

Radiator ratings per type are placeholders until checked against manufacturer data, and the form does not ask for radiator size, so a 600 × 1000 mm radiator is assumed. The form does not capture unheated areas or valves, which the hand-extracted demo files do, so a sample home in the browser can differ slightly from its row on the evaluation page. Costs are conditional energy scenarios, not savings promises. Do not present the result as validated model accuracy: on the three labelled homes the engine matches two verdicts (B-01 comes out yellow, expected green).

## Internal evaluation page (not part of the product)

`/evaluation.html` runs the engine fresh on every `data/demo/<id>/processed/` (via `GET /api/evaluation`, `scripts/evaluate.py`) and compares it with the organizers' labels in `data/raw/buildings/buildings_dev.json`: verdict match, reference heat load inside the used range, both heat-load estimates, flow temperature per radiator type, costs, and per customer the processed inputs with confidence and evidence plus all outputs. It is for the team's competition evaluation only; the homeowner flow never links to it or loads the labels.

## Accessibility decisions

- Native forms, visible labels, fieldsets and legends; radio controls remain keyboard-operable.
- 18px base text and a 22px larger-text mode; responsive reflow without fixed content heights.
- Most controls have at least 48px height; primary actions and form fields are at least 56px.
- Visible focus rings, a skip link, focus moved to each new page heading, a focusable linked error summary and polite step announcements.
- Verdicts use explicit words and explanations alongside colours.
- All questions can be left unknown; no countdown or timeout; corrections and back navigation preserve answers.
- No animation-dependent interaction; respects reduced-motion preferences.
- Confirmation dialog before clearing; no unnecessary collection of names, addresses or contact details.
- Answers are stored only in sessionStorage for this tab, without remote submission. If storage is unavailable the in-memory flow still works. No third-party fonts, analytics or scripts.

W3C guidance used: https://www.w3.org/WAI/older-users/ and https://www.w3.org/WAI/tutorials/forms/ . These are design choices, not a claim of audited WCAG conformance. A real screen-reader pass and sessions with target users are still needed, including a measured completion time.

## Manual acceptance checks

1. Tab through the welcome page and start the flow. Use arrow keys to change radio choices.
2. Submit an invalid year/area; verify linked errors and focus. Correct it and continue.
3. Go back and check values persist; edit from review, then cancel and check the old answers are restored.
4. Finish with unknown answers: no crash, no fabricated numbers and no unsuitable verdict.
5. Load B-04: single-pipe check is explicit. Load B-05: both demand estimates and their conflict remain visible.
6. Enable larger text and test at 320px width and browser zoom; controls must remain usable.
7. Reload midway, verify tab-local answers; download and print the result; cancel then confirm reset.
8. Run without external internet: manual input and locally served fixtures still work.

The development server serves only the two HTML pages, the browser assets and the three JSON endpoints; it does not expose repository metadata or arbitrary files.
