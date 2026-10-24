# Data contract: questionnaire → customer folder → uniform data → decision

Every customer case goes through the same five steps, whatever the questionnaire looks like. The questionnaire
may change (new questions, new order, AI help, new wording); this flow and the formats below do not.

```
1 questionnaire   browser answers as ONE JSON object, keys = QUESTIONNAIRE_KEYS
                  └─▶ data/demo/<customer>/raw/questionnaire.json
2 files           uploaded bills, plans, photos, unchanged
                  └─▶ raw/documents/  raw/photos/
3 extraction      questionnaire.json + the customer's files ─▶ LLM (scripts/ai_extract.py)
                  └─▶ raw/extraction.json   facts {value, confidence, evidence, source_file}
                      the homeowner reviews them; kept facts travel as `extraction_evidence`
4 prepare         questionnaire + reviewed facts ─▶ uniform processed data (src/decision_engine/prepare.py)
                  └─▶ processed/01a…, 01b…, 02…, 03….json   every field {value, source, confidence, evidence}
5 decision        processed/ ─▶ engine (unchanged) ─▶ output/*.json
```

Code: `src/decision_engine/intake.py` (steps 1, 4, 5 and the checks), `scripts/serve.py` (`/api/upload` step 2,
`/api/extract` step 3, `/api/assess` steps 1+4+5).

## Rules for questionnaire changes

1. **One key per answer.** Every question's answer is sent under a key in `QUESTIONNAIRE_KEYS`
   (`src/decision_engine/intake.py`). Use the dataset field names (`data/raw/buildings/*.json`) where one exists.
2. **Same list in the browser.** `INPUT_KEYS` in `src/browser/assessment.js` is identical to `QUESTIONNAIRE_KEYS`.
3. **Every key reaches the processed data.** `prepare.py` turns each key into a uniform field (or the key is
   identity/free text: `building_id`, `building_notes`). A new question = new key in both lists + a line in `prepare.py`.
4. **Unknown is `null`**, never `0` or `"unknown"`; numbers in the units of the field name (`_kwh`, `_m2`, `_c`).
5. **AI never writes processed data directly.** The LLM returns facts with evidence; only facts the homeowner
   reviewed are used, and `prepare.py` puts them into the uniform format.
6. **The decision part does not change for a questionnaire change.** If a new question needs new engine logic, that
   is a separate engine change with its own tests.
7. **Customer folders.** Browser cases live in `data/demo/C-<yyyymmdd>-<hex>/` (git-ignored, personal data). An
   untouched example home is read from the demo dataset; once changed it becomes a new `C-` customer, so `data/demo/B-*`
   is never written by the app.

`tests/test_intake.py` enforces rules 1–3 and 5–7: it fails if the form has a question without a contract key, if the
browser and backend lists differ, if a key never reaches the processed data, if unknown keys are sent, or if
processed data is not uniform. Run `python3 -m unittest discover -s tests -v` before pushing.


## Evidence workflow (no new questionnaire questions)

`scripts/evidence_store.py` keeps original files and per-file extraction results under the customer’s
ignored `raw/` folder. File-content hashes deduplicate uploads even when renamed. A per-customer cache
keys reusable results by content plus model, instructions and schema version; separate customers never
share cache data. Independent new files are extracted concurrently, at most three per request. Earlier
observations remain available beyond the three-file upload limit. `raw/extraction.json` contains the
cumulative review, not just the latest batch; `raw/extraction_cache.json` preserves individual readings.
A failed new extraction keeps earlier evidence and remains eligible for retry. The reviewed values
still pass through `prepare.py` and the unchanged decision engine.

Each observation has a stable ID, file ID, source filename, optional page, value, confidence and evidence.
Disagreements preserve all candidates; matching values do not automatically increase confidence.
Different/unknown billing periods remain separate even when their kWh totals match. The user can select
a source, keep a manual answer or explicitly leave the answer unknown. No bills are automatically summed.

The existing `extraction_evidence` envelope additionally accepts `_reviews` metadata: per field,
`considered_ids`, `selected_id` and the reviewed `value`. This is review provenance, not a new question or
an engine input. `prepare.py` ignores the metadata key; selected facts retain their normal uniform format.
A review is valid only for the exact set of observations and the current answer. New competing evidence
or an edited answer reopens the disagreement. The browser stores the observation ledger and review
choices in tab-local session storage; original file bytes stay in the server’s customer folder.

Billing metadata stays outside the questionnaire schema: dates, original amount/unit, fuel, reading
method, source page and evidence. Python validates ISO dates and inclusive day counts (365/366 days for
full-year coverage). Incomplete/invalid dates leave coverage unknown. Supported challenge approximations
are oil litres × 10 and natural-gas m³ × 10, explicitly marked medium confidence. No automatic
annualization occurs; household electricity cannot become heating consumption without documented
space heating. Selecting a consumption reading binds its fuel/period to that bill. The confirmation
screen cannot promote a partial/unknown-period amount into a confirmed annual calculation.

`/api/assess` adds `follow_up` and `evidence_conflicts` alongside `{processed, outputs}`. These are UI
metadata. Priority is unresolved contradictions, annual consumption coverage, disagreement between demand
estimates, then missing heating/radiator/pipe evidence. The homeowner can upload, answer manually or
leave the question open for a professional. No extra AI call is needed to pick this question.
