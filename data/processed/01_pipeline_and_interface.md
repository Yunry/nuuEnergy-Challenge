# Pipeline and interface: first decision (draft v0.1)

Status: **starting point for team discussion**, 2026-10-24. Nothing here is final.
Official material is summarised in the [repository README](../../README.md); everything below marked *ours* is our own proposal, not official.

Example files:

- [example_input_B-03.json](example_input_B-03.json): engine input (after extraction and enrichment)
- [example_output_B-03.json](example_output_B-03.json): engine output

All numbers in the examples are illustrative. Radiator ratings are placeholders until verified.

---

## 1. Pipeline

```
raw inputs (dataset JSON, photos, bill, free text)
  → LLM extraction: value + confidence + evidence (evidence verified against source)
  → enrichment: official table → own table → online (cached) → null
  → engine: confidence → range / set (fixed rules)
  → enumerate combinations → heat load, flow temp, JAZ, cost ranges
  → verdict: all pass / mixed / all fail  (+ hard rules)
  → verdict-flipping inputs → "homeowner can provide" / "technician must check"
  → (optional) LLM rewrites the result in plain language
```

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **LLM extracts and explains; rules compute and judge.** | Every number traceable; jury wants AI "used meaningfully, not as a gimmick"; no confident wrong numbers. |
| D2 | **One unified field format:** `value`, `source`, `confidence`, `evidence`. Official field names are reused; extra fields are added, never renamed. `null` = unknown, never 0. | Dataset rows map 1:1; works for any new building in the same format (scalability). |
| D3 | **Engine, not LLM, turns confidence into a range / set** with fixed rules (see §4). Categorical inputs (radiator type, pipe system) become sets of possible values. | LLM confidence is poorly calibrated and not reproducible. |
| D4 | **Enrichment step** for reference data (prices, conversion factors, radiator ratings): official table → own pre-researched table → online lookup (cached, marked as assumption) → `null`. **Official prices are never overridden.** | Handles unknown cases (LPG, district heating, pellets) without breaking comparability. |
| D5 | **Enumerate combinations** (min/max of ranges × every value of sets), not Monte Carlo. | No basis for probability distributions; exact bounds; a few hundred combinations run in milliseconds. |
| D6 | **Verdict from the enumeration:** all pass → 🟢; mixed → 🟡 (*unknown*); all fail even in the best case → *obstacle* (🔴, or 🟡 if a cheap fix exists). Hard rules applied afterwards (e.g. confirmed single-pipe → at most 🟡). | Directly implements the official requirement to separate "there is an obstacle" from "we can't tell yet". |
| D7 | **Boundaries = only the inputs that flip the verdict**, with quantified thresholds, split into *homeowner can provide now* vs *technician must check*. | Turns uncertainty into concrete next steps; homeowner input narrows the range live (demo moment). |
| D8 | **Cost = annual operating energy cost only**, official fixed prices, heat pump also covers hot water. Cost does **not** decide the colour. | Official rule 3; with official prices the heat pump is always cheaper, so cost tells "how much is it worth", not "does it work". |
| D9 | **Plain-language rewrite by LLM is optional** and only rephrases engine output. | Never lets the LLM introduce numbers. |

## 3. Engine steps and where they come from

From the [technical rules supplied by the organizers](../../README.md#5-technical-rules-supplied-by-the-organizers):

| Step | Official source | Question | Decides colour? |
| --- | --- | --- | --- |
| 1a Heat load by area | Rule 1a | How much heat does the house need (kW)? | No, input to step 2 |
| 1b Heat load by consumption | Rule 1b | Same, second method for cross-check | No |
| 2 Radiator check | Rule 2 | Can the existing system deliver that heat at ≤ 55 °C (55–60 °C)? Pipe system? | **Yes, the only judgment** |
| 3 Operating cost | Rule 3 | What does it cost per year vs today? | No |
| 4 Technician checklist | Rule 4 | What must be checked on site? | No, always attached |

Inputs the algorithm needs (data availability aside): floor area, construction year, renovation status, annual consumption, energy carrier, persons, hot water via heating, heat distribution, **total rated radiator output** (count × type × size), pipe system, current flow temperature (if known). Correction signals: other heat sources, solar thermal, unheated area, insulation.
Location is not used by the official rules.

## 4. Proposals to agree on (ours)

**Confidence → range (D3):**

| Confidence | Numeric | Categorical |
| --- | --- | --- |
| `high` | as given | `{value}` |
| `medium` | ±20 % | `{value}` + listed `alternatives` |
| `low` / `null` | full plausible range (e.g. 1–5 persons) | all allowed values |

**Assumptions used in the example (not official):**

- "Partially renovated, before 1979" → 80–120 W/m² (no official row for *partially*)
- Unheated area of unknown size → heated area 70–100 % of floor area
- Radiator size unknown → 600 × 1000 mm
- Radiator output vs temperature: EN 442, exponent n = 1.3, 10 K spread (reproduces the official "half output at 55 °C")
- Radiator ratings Type 11 / 22 / 33 ≈ 1.0 / 1.8 / 2.6 kW at 75/65/20 °C: **placeholder**, to be verified from manufacturer catalogs
- When methods 1a and 1b overlap → use the intersection; when they don't → flag as contradiction, don't merge silently

**Interface conventions:**

1. Units in field names: `_kw`, `_c`, `_m2`, `_eur`.
2. Ranges are always `[min, max]`; exact values are `[x, x]`.
3. Unknown is `null`.
4. Keys in English snake_case; user-facing text in the agreed UI language.
5. `reasons.type`: `positive` / `obstacle` / `unknown` / `action` / `hint`.
6. `dev_check` only for dev buildings (automatic test against `reference_heating_load_kw` and `expected_verdict`).

**Non-official enrichment example (B-01, LPG):**

```json
"fuel_price_eur_per_kwh": {
  "value": null,
  "source": "own_table.lpg",
  "confidence": "medium",
  "evidence": "PLACEHOLDER: value + source URL to be filled; replaced by organizer price if given",
  "retrieved_at": "2026-10-24",
  "official": false
}
```

## 5. Known issues found while building the example

- **B-03 heat load overshoots the reference:** our used range 15.8–18.4 kW vs reference 14.5 kW. The verdict still matches (yellow). Full-load hours or the 0.88 boiler efficiency may need calibrating.
- **B-01 would come out yellow, expected green:** radiator type unknown → enumeration includes Type 11 → mixed. Proposed fix: prior by construction year (e.g. built after ~1995 → radiators likely {22, 33}), in line with the official hint "large or newer panel radiators → usually fine at ≤ 55 °C". Check this first once the engine runs.
- **Construction-year table has gaps** (1979–1980, 2000–2001) and no row for *partially renovated*: we need our own rule.
- **No official JAZ above 60 °C:** cost is not computable for those combinations.

## 6. Open questions

**For the organizers:**

1. 2 or 3 evaluation buildings? (Deliverables page says 3; overview, one-pager and data say 2.)
2. Which price for LPG (B-01)? Also district heating and electric, which the data format allows.
3. May the prototype call a cloud LLM API ("runs locally in a standard browser")?
4. How was the reference heating load computed (DIN EN 12831 or nuuEnergy's own tool)?

**For the team:**

1. Tech stack: Python backend + one HTML page, Streamlit, or pure browser?
2. UI language: German or English?
3. Confidence → range mapping (§4): agree or change?
4. Final verdict rules, especially "obstacle" → red vs yellow.
5. Radiator prior by construction year (B-01 issue).
