# Browser flow

Run from the repository root with Python 3.9 or newer (standard library only):

```sh
python3 scripts/serve.py
```

`npm run dev` runs the same command. Open http://127.0.0.1:4173. No dependency installation, build, API key or account is required. Use `PORT=4174 python3 scripts/serve.py` if the default port is occupied. Run `python3 -m unittest discover -s tests -v` (or `npm test`) for the engine regression checks.

The internal competition evaluation is at http://127.0.0.1:4173/evaluation.html (see below).

## Scope

English homeowner flow: welcome → home → heating → energy use → review → assessment. Optional fields and explicit unknown answers; five real sample homes; larger text; back/edit; tab-local session saving; summary download; printing; confirmation before clearing answers. Optional PDF/photo extraction is available on the home step, followed by source evidence review and explicit selection before answers are populated. No hosting or deployment is required to run it locally.

Sample homes are the demo customers' raw input (`data/demo/<id>/raw/customer_input.json`, served at `/api/samples`), which carries no development labels. Sample notes are preserved, and explicit wood-stove/solar-thermal mentions in these fixtures populate the related inputs; arbitrary homeowner text is not automatically interpreted.

The same list also includes completed saved examples under `data/customers/D-B*/`. For example,
`/?demo=D-B05` opens the latest saved B-05 photo assessment, including its original evidence and photos.
This is separate from the original `/?demo=B-05` questionnaire-only case. Saved examples remain read-only;
editing an answer or adding a file creates a new customer as usual. The saved photo readings include
illustrative assumptions and do not represent a fresh AI extraction.

## Engine integration

`src/browser/app.js` collects the answers and renders the result. `src/browser/assessment.js` turns them into a `customer_input` object with the dataset's field names (`toCustomerInput`) plus the structured answers the dataset keeps in free text (`consumption_full_year`, `radiator_count`, `radiator_type`, `other_heat_source`, `solar_thermal`). Only the listed keys are sent, so development labels cannot leak. "Not sure" becomes `null`; `amount` and `unit` are normalized to `annual_consumption_kwh`.

`scripts/serve.py` answers `POST /api/assess` with the Python decision engine (`src/decision_engine`): `prepare.py` turns `customer_input` into the four processed step inputs (`{value, source, confidence, evidence}`; self-reported values have `confidence: null`, a bill that is not a full year has `low`), and `engine.py` runs heat load → radiator check → operating cost → decision. The response is `{processed, outputs}` with the same files as `data/demo/<id>/output/`. The result page is a three-layer diagram, key data only: the decision and the energy cost saving (with a today vs. heat-pump bar) on top; the four engine steps in the middle, each as one sentence and one equation with the customer's numbers; and the inputs each step used, with their evidence, at the bottom. An unchanged example home is assessed from its hand-extracted `data/demo/<id>/processed/` files (`GET /api/demo/<id>`), so its evidence is shown; `/?demo=B-03` opens that result directly for presenting. Loading, error and retry states are shown while the request runs.

### View modes (header switch)

Next to **Larger text** a switch picks the view: **Clean** (customer view), **Clean + Tech** (default while developing) or
**Full tech details** (developer view); the choice is kept in the tab. So far it changes the result page: the customer view shows only the
judgement (colour, yearly saving, one plain-language paragraph) and three or four suggestions that fit the colour:
next steps when green, what to change when red, which information would settle it when yellow. The developer view
is the detailed page (four steps with equations, inputs with evidence, what-if sliders, checks). The customer view also has a chart
of the yearly heating cost: today's cost against the heat pump, whose lighter band is the min–max range over what
is still open, with the saving marked between them. When yellow it offers two option cards (add a suggested file,
or request a video call; the prototype books nothing); when red the changes appear as keyword cards. Clean + Tech
shows both side by side (stacked on narrow screens). The review step ("Check your answers") has the same modes: its developer view shows the input space (every raw input of the customer folder as a file tile: questionnaire JSON, PDFs, photos, AI extraction), the extracted uniform data the engine will use (field, value, confidence, source, evidence), and the four decision steps with their equations computed from that data. Other pages are the same in every mode for now.

### Confirm and what-if (after the first result)

**Check and complete my details** opens a confirm page listing every input the engine used, with its evidence. The customer ticks what is right, corrects what isn't and fills in open values; confirmed values become `confidence: "high"` (`source: "homeowner.confirmed"`), so their uncertainty disappears. The same what-if section (sliders and assumption log) already appears at the bottom of the first result, using the data as assessed. **Finalise my check** sends the confirmed inputs to `POST /api/scenarios` (`src/decision_engine/scenarios.py`): every input that is still uncertain gets a fixed-rule assumption (shown in the assumption log, e.g. radiator type unknown → type 22, the most common panel radiator) and a slider over its possible values. The engine runs with every uncertain input pinned to one value, so the result is a single point; each slider track is coloured by the verdict at every position (others held), and moving a slider recalculates the result live.

### Important modelling limitations

Radiator ratings per type are placeholders until checked against manufacturer data, and the form does not ask for radiator size, so a 600 × 1000 mm radiator is assumed. The form does not capture unheated areas or valves, which the hand-extracted demo files do, so an edited sample home assessed from the form can differ slightly from its row on the evaluation page. Unchanged samples use the same processed evidence as the evaluation page. Costs are conditional energy scenarios, not savings promises. Do not present the result as validated model accuracy: on the three labelled homes the engine matches two verdicts (B-01 comes out yellow, expected green).

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
- Answers and confirmed extraction evidence are stored in sessionStorage for this tab; assessment answers are sent to the local Python server. Files the customer adds are saved unchanged to their customer folder on this server as soon as they are chosen (see below); they are sent through the local server to OpenAI only when Extract is clicked. If storage is unavailable the in-memory flow still works. No third-party fonts, analytics or scripts.

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

### Supplied-file API checks

`python3 scripts/check_data_uploads.py` checks every distinct PDF/JPEG/PNG/WebP in `data/raw/`,
`data/customer/` and saved customer examples through the HTTP upload route and loads every example result.
It uses temporary customer folders and leaves the original data unchanged.

`python3 scripts/check_data_uploads.py --live --output /tmp/nuu-data-upload-check.json` additionally sends
each distinct file to the configured OpenAI API, passes reviewed facts through the assessment API,
and verifies a repeated extraction reuses the cache. This uses API credits and transmits the supplied
files, so run it only with permission to send those files. The report records status/counts rather
than document text. A successful run verifies transport, response validation and pipeline compatibility,
not the accuracy of every extracted fact. Ambiguous photos and documents without heating information
may correctly produce no usable facts. The separately labelled `evaluate_extraction.py --live` checks
known expected values for the combined utility bill and ambiguous pipe photo.

Files with missing browser MIME types use the supported filename extension; the server still verifies
the actual PDF/image signature. Uploads remain limited to three files and 10 MB per request, with
additional batches retained in the customer's evidence history.

The development server serves only the two HTML pages, the browser assets and the three JSON endpoints; it does not expose repository metadata or arbitrary files.


## AI extraction

The server loads `.env` automatically, preserving existing process environment variables. Set
`OPENAI_API_KEY` in `.env`; optionally set `OPENAI_MODEL` (default `gpt-4.1-mini`). Restart the
server after changing either value. No Python package installation is needed. Never use a
browser-exposed key. `/api/ai-status` exposes only whether a key is configured, not its value
or whether the upstream account has credits.

On **Your home**, choose up to three PDF/JPEG/PNG/WebP files (10 MB combined) and click
**Extract details**. PDF text/page images and photos go to OpenAI Responses, with a strict
JSON schema matching the assessment fields. The request sets `store: false`; OpenAI's own
API data-handling policies still apply. The UI explicitly discloses both destinations before upload.

**Saving uploads to the customer folder.** As soon as files are chosen (with or without AI), the browser
sends them to `POST /api/upload`, which applies the same format, size and content checks as extraction and
writes them unchanged to `data/demo/<customer>/raw/documents/` (PDF) or `raw/photos/` (images), named
`<timestamp>_<original name>`. An example home uses its own folder (e.g. `B-03`); a new home gets a customer
ID on its first upload (`C-<yyyymmdd>-<4 hex>`, shown on screen and used as `building_id`), and its folder is
created with `raw/`, `processed/` and `output/`. Uploads are git-ignored (`data/demo/C-*/`,
`raw/documents/`, `raw/photos/*`) because bills and photos are personal documents.

Each non-null field shows its source filename, evidence and confidence. Only high-confidence fields without an existing answer start selected. Medium/low-confidence
fields and fields that would overwrite existing answers start unchecked. Choose facts to use, then
continue through the editable form and final review. AI extracts evidence; the existing Python
engine retains calculation/verdict ownership. Missing facts remain unknown. Short-period
consumption is never silently annualized or used as annual demand; combined utility bills
must use heating-fuel consumption rather than household electricity.

Confirmed evidence follows unchanged values into the processed engine inputs and downloaded
summary. The engine retains low confidence for partial-year consumption even if AI labels its
reading high confidence. Editing a value removes its association with the previous evidence.
Observations outside structured fields are retained as notes for technician review; they do
not become extra calculation rules.

Invalid formats, oversize uploads, missing keys, rate limits, refusals, interrupted responses
and network failures return actionable errors while manual assessment remains available.
`scripts/ai_extract.py` implements the API boundary independently of the offline research
extractor in `scripts/extract_energy_bills.py`; its filename-based fixtures are not used for
live uploads. This is a localhost demo server, not a production authenticated upload service.

Run `npm test` for engine, extraction and HTTP integration tests, and
`node --test tests/extraction.test.js` for browser field-application checks. Tests mock OpenAI
and do not spend API credits. HTTP integration tests require permission to bind localhost.


### Guided assistance in the homeowner flow

The welcome page offers an AI-assisted start and a manual alternative. The home step has a
keyboard-accessible upload area with drag-and-drop, selected filenames and remove controls.
File count, total size, duplicate names and supported formats are checked before sending.
Files stay in memory across step changes; they are never persisted in sessionStorage.

Reading feedback explains the wait; **Continue without waiting** lets the user proceed with
manual entry and ignores the eventual response (the upstream request may still finish).
Review cards show the fact first, with source evidence behind **See where this came from**.
Existing answers and uncertain readings require deliberate selection. Warnings are expandable.
After confirmation, a success message and **From your file** badges connect extracted facts
to editable answers. A helper note carries that context through later steps. The result page
has a direct **Add a bill or photo** action to resolve missing information without resetting
existing answers. The manual home questions remain available in an expandable section.


## Incremental extraction and verification

New uploads are saved before extraction starts. The helper compares all previously extracted file
observations, shows competing readings together, and keeps a source history. “Use reviewed details”
requires an explicit choice for each disagreement, including “Leave this unknown”. Only selected facts
change the editable answers. An answered conflict reopens if new competing evidence arrives.

Duplicate file bytes are saved once and reuse their extraction. The helper reports newly read and reused
files; if more than three files await extraction, “Read remaining files” continues without discarding
older results. Page evidence and original billing periods/units are expandable. Partial-year bills
remain unusable as annual demand. A targeted next question offers upload, manual entry and “I don’t know”.

`python3 scripts/evaluate_extraction.py` lists the small, manually checked public regression set.
Add `--live` to make one paid OpenAI request per case, optionally `--case <id>` or `--model <model>`.
The CLI checks file hashes, compares expected fields, reports latency/token counts and exits nonzero on
a mismatch. Labels never enter the model prompt. The two cases cover combined electricity/gas bills,
current versus previous consumption and an ambiguous radiator connection. This is a regression set,
not a claim of broad model accuracy. Older filename/regex-derived bill labels are not used as truth.

The automated suite exercises cumulative uploads, duplicate bytes, cache hits, failures/retries,
contradictory values, different bill years, invalid dates, unit/fuel mismatches and explicit review
choices independently of engine verdict labels. Raw image compression and model upgrades are deferred
until a larger verified extraction set can measure loss of detail and field accuracy.

### Completed assessment history

Completed assessments are kept in this browser's local storage (up to 50), grouped by home on the homepage; example homes are labelled separately. Each entry reopens its answers, reviewed evidence, computed result, and completed what-if settings. Updating a check updates its existing history entry. This is browser-local history, not a shared list of server customers or a backup of uploaded file bytes. Checks completed before this feature was added do not appear automatically. If storage is unavailable, the homepage explains that history only lasts until reload.

Returning to the homepage clears the active questionnaire, customer ID, uploads, evidence, confirmation choices, cached results, and pending UI work. Completed history remains available. Preferences such as view mode and text size remain. A new check starts empty and receives its own customer ID.
