# Browser flow

Run from the repository root with Node.js 20 or newer:

```sh
npm run dev
```

Open http://127.0.0.1:4173. No dependency installation, build, API key or account is required. Use `PORT=4174 npm run dev` if the default port is occupied. Run `npm test` for the assessment adapter's regression checks.

## Scope

English homeowner flow: welcome → home → heating → energy use → review → assessment. Optional fields and explicit unknown answers; five real sample homes; larger text; back/edit; tab-local session saving; summary download; printing; confirmation before clearing answers. No bill/photo upload or AI extraction is implemented yet. No hosting or deployment is required to run it locally.

The UI uses the real challenge JSON files, strips development labels and never uses them to produce a verdict. Sample notes are preserved, and explicit wood-stove/solar-thermal mentions in these fixtures populate the related inputs; arbitrary homeowner text is not automatically interpreted.

## Engine integration

`src/browser/app.js` collects the input and renders the result. `src/browser/assessment.js` contains `toEngineInput(values)` and `assessBuilding(input)`. The input wraps fields in `{ value, source, confidence, evidence }` and uses `schema_version: "0.1"`, following the team's draft contract. Self-reported values have `confidence: null`; we do not claim they are verified measurements. `amount` and `unit` are normalized to `annual_consumption_kwh` before calling the adapter.

The preview output uses `verdict`, `verdict_kind`, `summary`, `heating_load_kw`, `cost_eur_per_year`, `reasons`, `homeowner_can_provide`, `technician_checks` and `assumptions`. `missing_information` and `engine_version` are additive fields. Replace the pure `assessBuilding` function with the agreed engine when ready; keep `null` values and the array range convention. An asynchronous service will also need a visible loading state, timeout, error message and retry path in the UI.

### Important modelling limitations

This is a provisional rule-based browser preview, not the team's final model. It uses the supplied rough boiler and age formulas, does not enumerate radiator sizes, does not invent radiator capacities, and does not use the illustrative output fixture as ground truth. No numeric confidence probabilities or final equipment sizing are displayed. Green is limited to a promising underfloor-heating signal with some usable demand information and no confirmed single-pipe/high-temperature blocker; otherwise it asks for checks. Consequently it does **not** match every development reference (notably B-01). Do not present this as validated model accuracy.

The draft modelling document has assumptions still to resolve. The browser does not adopt its placeholder radiator ratings or an age-based radiator prior. It uses the organizer's approximate 2,000 full-load hours, not the example fixture's 1,800–2,100 interval labelled official. Solar contributions and unknown hot-water provision retain uncertainty. Costs are conditional energy scenarios, not savings promises. The UI does not claim that a single photo can settle room-by-room radiator suitability.

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

The development server serves only the browser assets and the two dataset files; it does not expose repository metadata or arbitrary files.
