# nuuEnergy: Heat Pump Ready? — team research and build brief

## Try the browser prototype

With Node.js 20 or newer, run `npm run dev` and open [http://127.0.0.1:4173](http://127.0.0.1:4173). No installation or API key is needed. The English flow supports manual entry, five sample homes, answer review, larger text and a downloadable assessment. The calculation engine is a provisional preview awaiting the team's final model; bill extraction is not yet included.

See [browser setup, integration and accessibility notes](docs/browser-flow.md). Run `npm test` for the assessment checks.

Research date: 24 October 2026. Build window supplied by the team: 11:00–18:00, Europe/Berlin. Team: software/architecture/data; mathematical modelling; product/management/presentation.

## Recommendation

Build an evidence-aware, three-minute heat-pump readiness check. It should turn a bill, a few homeowner answers and optional photos into a clear verdict, explain the evidence behind it, identify contradictions, and produce a specific technician handoff.

Use AI to extract facts from documents or free text, and optionally interpret visible photo features. Use explicit, testable code for calculations, assumptions and verdict rules. Give the modelling teammate ownership of uncertainty and contradictory evidence. Three labelled buildings are useful reference cases, but cannot establish predictive accuracy for a trained model.

The strongest differentiator is a useful next question: when the evidence conflicts, show why and ask the homeowner the one thing most likely to resolve it. This is a proposed product approach, not an organizer requirement.

## 1. What the challenge actually requires

The track is Buildings & Everyday Energy. The partner is nuuEnergy. The target user is a homeowner wondering whether a heat pump would work in their existing home. The challenge specifically pushes back against assumptions that underfloor heating or a complete renovation are always necessary.

The first assessment must take less than three minutes, using information the homeowner already has: an energy bill, building facts, address/location and smartphone photos. The main page also mentions building age and heating system. This is an initial assessment, not final equipment sizing or installation approval.

The result must include:

- A green, yellow or red verdict, with an understandable reason.
- What remains unknown and what a professional must check on site.
- An explicit distinction between a documented obstacle and insufficient information.

The mission defines green as likely suitable on the available information, yellow as potentially suitable with important checks remaining, and red as insufficient evidence for a positive assessment. Red is therefore not synonymous with “a heat pump cannot work.” Its boundary with yellow needs clarification from the mentors.

Deliverables: a working browser prototype, evaluation-building results in the pitch, and a live demo. The main page says it should run locally in a standard browser. The brief says live demo rather than slides. Optional bonuses are automatic bill extraction and detection of installation-space risks from photos.

Sources: [Main challenge](https://app.notion.com/p/nuuenergy/Heat-Pump-Ready-nuuEnergy-Challenge-3fe93c43cade81af8b18f8d2e3778642), [Mission](https://app.notion.com/p/nuuenergy/Your-Mission-3ff93c43cade810e8157e0e685cf5dc7), [Deliverables](https://app.notion.com/p/nuuenergy/Deliverables-Bonus-3ff93c43cade81a19351c892756a24b7).

## 2. Scoring and what it means for your priorities

- Technical execution and reliability: 25 points. Working prototype, plausible calculations, different building cases.
- Problem–solution fit and user value: 25. Understandable, useful and actionable for a homeowner.
- Explainability and handling uncertainty: 20. Transparent assumptions, missing information identified, misleading conclusions avoided.
- Innovation and smart use of technology: 15. Creative approach and meaningful AI use.
- Feasibility and scalability: 15. A credible product that can handle many homes without excessive manual work.

The first three categories account for 70/100 points. My recommendation is to finish a dependable assessment and clear result screen before spending time on elaborate photo analysis or model training. This is a prioritization inference from the published scoring, not a promise about the jury.

Prize: €1,000, a table-football table, and a Tech Day with the nuuEnergy product team, including exposure to its nuuOS installer system and real project workflows.

Sources: [Evaluation criteria](https://app.notion.com/p/nuuenergy/Evaluation-Criteria-3ff93c43cade81bb9440dc9634933d56), [Prize](https://app.notion.com/p/nuuenergy/Prize-3ff93c43cade81a7b23fd6b2e2368aa1).

## 3. Provided data and its limitations

Five anonymised real project buildings are provided in CSV and JSON: three development cases with reference heat load and verdict; two evaluation cases without the reference answers. Names and addresses are removed, postal codes are reduced to area level, and area/consumption are slightly rounded. Missing values reflect undocumented information. Contradictions are deliberate.

Both complete JSON attachments are embedded in the appendices of this file. CSV equivalents are linked on the data page but were not separately compared with the JSON.

Fields: building_id, construction_year, floor_area_m2, renovation_status, heat_distribution, annual_consumption_kwh, energy_carrier, energy_carrier_detail, radiator_info, pipe_system, flow_temperature_c, persons_in_household, hot_water_via_heating, rooms, building_notes and location. Development cases additionally contain reference_heating_load_kw and expected_verdict.

Important schema observations:

- Every provided building has unknown flow temperature. A rule requiring a known flow temperature for any green result would conflict with the two green development references.
- Unknown renovation status is not the same as unrenovated.
- Unknown pipe system is not confirmed single-pipe.
- All five cases have hot water supplied through the heating system, but solar thermal complicates two of them.
- B-01's carrier is gas, but its detail identifies LPG. The fixed natural-gas price is not explicitly an LPG price.
- B-02 is classified as underfloor heating but also has one radiator. B-05 is genuinely mixed, with two circuits.
- Free-text building and radiator notes carry essential evidence. Do not discard them during cleaning.
- The development set has two green cases and one yellow; it contains no labelled red example.

Source: [Data and download links](https://app.notion.com/p/nuuenergy/Data-Provided-3ff93c43cade81088723f8b78d847a80).

## 4. The five cases: facts, calculated baselines and likely lessons

All baseline heat loads below use the organizer formula: (annual fuel kWh × 0.88 − 1,000 × occupants) / 2,000. These are calculated heuristics, not ground truth. They assume the listed consumption is representative and the full hot-water allowance is supplied by the boiler. Solar thermal, wood heating and occupancy can invalidate those assumptions.

### B-01 — low bill, good envelope clues, radiator unknowns

Facts: 2001; 195 m²; 10,000 kWh LPG; four people; 14 radiators with already preset valves; pipe system and flow temperature unknown. Owner-reported U-values: windows 1.1, external wall 0.21, basement wall 0.35, roof approximately 0.24 and floor slab approximately 0.35 W/(m²K). No renovation documented.

Published reference: 9.6 kW, green. Consumption baseline: 2.40 kW, approximately 12.3 W/m². This is 75% below the reference.

Lesson: a low bill does not establish the design heating load. The age-band table does not explicitly cover 2001. The envelope evidence is useful, but U-values alone do not provide a complete heat-loss calculation without surface areas, ventilation and design temperature differences. Ask whether the bill covers a full year and whether the entire floor area is heated. The source does not establish why the consumption and reference differ; do not invent a cause. Green readiness can coexist with substantial sizing uncertainty.

### B-02 — apparently easy suitability, incomplete energy accounting

Facts: 2005; 180 m²; 15,500 kWh natural gas; three people; balanced underfloor heating with three manifolds plus one radiator. A wood stove is used throughout winter, and solar thermal provides hot water. Flow temperature and pipe system unknown.

Published reference: 9.7 kW, green. Consumption baseline: 5.32 kW. Age-based range for 2002+ buildings: 7.2–10.8 kW.

Lesson: the gas bill does not measure the wood stove's contribution. Subtracting the full hot-water allowance from gas-derived heat can also be wrong when solar thermal contributes. Ask whether the stove will remain in use and what heat the proposed pump is expected to replace. Underfloor heating supports likely suitability; it does not justify a precise total-demand estimate.

### B-03 — older building with partial improvements

Facts: 1970; 200 m²; 40,000 kWh heating oil, approximately 4,000 litres; two people; two-pipe radiators. Fifteen radiators, with 12 valves needing replacement. Cavity-wall and roof insulation; double glazing without low-e coating. A top floor added in the 1990s is currently unoccupied.

Published reference: 14.5 kW, yellow. Consumption baseline: 16.60 kW, approximately 83 W/m².

Lesson: the pre-1979 unrenovated range of 24–36 kW is not an appropriate unqualified estimate because this building is partly renovated. Do not equate partial renovation with a fully renovated building either. Flag valves, radiator capacity, required flow temperature and future heating of the unoccupied floor. Old construction is not an automatic rejection.

### B-04 — confirmed hydraulic concern

Facts: 1987; 160 m²; 25,000 kWh heating oil, approximately 2,500 litres; three people; 12 radiators with valve blocks; confirmed single-pipe; no renovation information; semi-detached.

Evaluation reference: hidden. Consumption baseline: 9.50 kW. Age-based range: 12.8–19.2 kW.

My provisional interpretation: yellow is defensible because a confirmed single-pipe system calls for a hydraulic and temperature check. That is not the hidden jury answer. Show the disagreement between estimates. Avoid both automatic green and an assertion that heat pumps cannot work with single-pipe heating.

### B-05 — conflicting age, consumption and mixed emitters

Facts: 2006; 125 m²; 27,000 kWh natural gas; three people; two circuits, underfloor heating plus eight radiators with presettable valves; 14 rooms; unknown pipe system and flow temperature. No additional facade/roof insulation, double low-e glazing and solar thermal.

Evaluation reference: hidden. Consumption baseline: 10.38 kW, approximately 83 W/m². Age-based range: 5.0–7.5 kW. The consumption estimate is about 38% above that upper bound.

My provisional interpretation: yellow with a prominent discrepancy explanation is defensible pending checks; this is not the hidden verdict. Check bill period, heated area, occupancy, hot-water demand and circuit temperatures. Absence of additional insulation does not prove that the original building envelope has no insulation. Mixed emitters must not automatically receive the all-underfloor efficiency assumption.

## 5. Technical rules supplied by the organizers

These are challenge assumptions, not current retail-price claims or a certified engineering method.

### Heat load

Area method: floor area in m² × a W/m² range / 1,000 = kW.

- Unrenovated, before 1979: 120–180 W/m².
- Built in the 1980s–1990s: 80–120 W/m².
- Renovated or built 2002+: 40–60 W/m².
- Low-energy house/new build: 15–40 W/m².

Consumption method:

1. If necessary, convert litres of heating oil or m³ of gas at approximately 10 kWh per unit.
2. Multiply annual fuel energy by 0.88 to approximate useful heat.
3. Subtract approximately 1,000 kWh per person per year for boiler-supplied hot water.
4. Divide space-heating energy by approximately 2,000 full-load hours.

Show both methods when available and explain differences. The brief suggests that above approximately 75 W/m², windows or insulation may be worth investigating. This is an improvement hint, not an automatic red threshold.

Recommended implementation safeguards: do not convert the already-kWh dataset a second time; subtract hot water only when relevant; treat a negative result as inconsistent input rather than a valid negative load; preserve nulls; and label undefined age/renovation categories explicitly. Ask the mentor how they want 2000–2001 and partial renovations treated.

### Radiators and flow temperature

The brief treats up to approximately 55 °C as a favourable efficiency range and 55–60 °C as workable with higher electricity consumption. It says radiator output at 55 °C is roughly half its rated output at the usual 75 °C reference. This is a rule of thumb; a detailed capacity calculation also depends on radiator specification, return temperature and room temperature.

Underfloor heating is a positive signal. Large/newer panel radiators are often compatible with lower flow temperatures. Small/old radiators and single-pipe systems require checking. Photos may help estimate radiator type and dimensions, but do not infer reliable dimensions without scale or claim whole-house capacity from one radiator.

### Annual energy-cost comparison

Fixed challenge values:

- Heat-pump electricity: €0.26/kWh.
- Natural gas: €0.11/kWh.
- Heating oil: €1.70/litre, approximately €0.17/kWh.
- JAZ 4.0: underfloor heating around 35 °C.
- JAZ 3.5: radiators up to 55 °C.
- JAZ 2.8: radiators at 55–60 °C.

Current annual fuel cost = annual fuel consumption × corresponding fuel price.

Heat-pump annual electricity cost = useful heat to be supplied by the pump / JAZ × €0.26.

Use space-heating-only energy for the heat-load estimate, but maintain the same service boundary on both sides of a cost comparison. If the pump also supplies hot water, include that heat again in annual demand. Do not compare current heating-plus-hot-water fuel cost with a heat-pump heating-only cost.

When temperature is unknown, show conditional cost scenarios, not a false point prediction. No organizer JAZ is given above 60 °C or for a mixed-circuit system. For mixed systems, if heat shares are known, electricity is the sum of heat supplied to each circuit divided by its appropriate efficiency; do not simply average efficiencies. If shares are unknown, keep separate labelled scenarios.

For B-04, the literal challenge baseline gives 22,000 kWh useful heat, €4,250/year oil energy cost, and approximately €1,634/year at JAZ 3.5 or €2,043/year at JAZ 2.8. These are conditional energy-only scenarios, not evidence that the single-pipe system can achieve either efficiency. Installation, maintenance, fixed charges and unmodelled auxiliary energy are outside this simple comparison.

Do not silently price B-01's LPG as natural gas. Ask the mentor, use a user-provided price, or explicitly label an agreed challenge proxy. Avoid introducing subsidies or payback estimates today; the required inputs and authoritative rules are outside the provided comparison.

### Checks always reserved for a technician

The brief explicitly reserves exact heat load, electrical capacity and outdoor-unit placement for a technician. Case-dependent handoff items should also identify radiator capacity, hydraulic layout/balancing, required winter flow temperature and integration of additional heat sources.

Source: [Technical guardrails](https://app.notion.com/p/nuuenergy/Technical-Guardrails-3ff93c43cade8120a85bf67fa59b584e).

## 6. Pipe-system resource and photos

A two-pipe system provides shared supply and separate return paths. In a single-pipe loop, water cools along the sequence of radiators, which can make lower-temperature operation and balancing harder. The challenge explicitly says single-pipe is not an absolute deal-breaker, but rarely deserves uncomplicated green without an on-site check.

The background resource includes five installer-labelled photo examples:

1. A classic single-pipe loop running along the wall.
2. A single-pipe valve block with a bypass adjustment port.
3. A classic two-pipe arrangement with top valve and separate bottom return.
4. A modern two-pipe valve block without the pictured bypass port.
5. A bathroom valve block that even the installer could not classify from the photo.

Use a supplied pipe-system value when present. If inferring from photos, expose the visible evidence and uncertainty. A new radiator does not change the building's underlying pipe system, and an H-block alone does not prove either layout. The ambiguous fifth photo is especially useful for demonstrating calibrated abstention. These are example images, not a labelled image-training corpus or confirmed photos for every building. This brief records the page's captions; it does not independently reclassify the images.

Source: [Pipe systems and photo examples](https://app.notion.com/p/nuuenergy/Background-Single-pipe-vs-two-pipe-heating-40093c43cade811fb9a3f89ffae41184).

## 7. Recommended product and implementation scope

### Main user journey

1. Enter basic home facts or load a supplied case. Allow “I don't know.”
2. Upload a bill or enter annual consumption. Show extracted values for confirmation, with period and unit.
3. Answer at most two or three targeted follow-ups selected from actual missing or conflicting evidence.
4. Receive verdict, short explanation, evidence quality, estimated load/ranges, conditional running costs and a technician checklist.
5. Offer a compact copy/download of the assessment for a professional.

A possible result for B-04: “Potentially suitable; hydraulic checks needed. Your single-pipe system may need changes to work efficiently at lower temperatures. The bill-based estimate is 9.5 kW, while the age-based estimate is 12.8–19.2 kW. A technician should check the loop, radiator output and winter flow temperature before sizing a unit.” This is proposed copy, not a verified installation assessment.

Keep readiness and evidence quality as separate dimensions. A likely suitable home can still have sizing uncertainty. Do not display a fabricated numerical probability such as “92% ready.” Use traceable reasons and explicitly named unknowns.

### AI's role

Best first use: extract structured facts from building notes and bills. Return each value with a source excerpt/page, unit, and uncertainty. Validate before using it. The supplied notes about a wood stove, solar thermal, partial renovation and an unoccupied floor are immediately valuable extraction targets.

AI can phrase a short explanation from an already computed assessment. It must not invent missing temperatures, radiator dimensions, prices, heat contributions or reference labels. A template explanation should remain available if the model call fails.

A question selector can be a small explicit priority list: missing consumption period; mismatch between heated and total floor area; unmeasured extra heat sources; uncertain flow temperature; confirmed single-pipe concerns. A sophisticated information-gain model is a stretch goal, not necessary today.

### Architecture

Use the stack you can ship fastest. Keep one browser UI and a small server endpoint only if needed for AI credentials or document handling. The decision engine should be a pure function over validated data, independently testable and usable without an AI response. Avoid introducing two production languages unless your team already has a working template.

Suggested flow: inputs → extraction/normalization → user confirmation → numerical estimates and evidence checks → verdict with reasons → homeowner result and technician handoff.

Suggested result fields: verdict; summary; evidence[] with source and status; heat_load_estimates[] with method and assumptions; conflicts[]; missing_information[]; cost_scenarios[]; technician_checks[]; next_question. Reference labels belong in evaluation fixtures, never in the inference input.

Keep API keys server-side. Use anonymised/synthetic examples for the demo and avoid retaining uploaded bills unnecessarily. No authentication, CRM integration or persistent account system is needed for the core demonstration.

### Priority order

Must finish: validated manual input and case loading; both calculation methods where applicable; transparent verdict logic; contradictory/missing data handling; all five cases run; result screen; evaluation results accessible in the demo.

Next: AI extraction of notes or a bill, editable confirmation, and one useful adaptive follow-up. If bill extraction is fragile, demonstrate the notes extraction honestly and retain manual entry.

Only after the core is stable: photo triage, evidence highlighting, printable handoff, small what-if interactions.

Cut: custom model training, elaborate chat UI, address-based enrichment, geospatial integrations, precise installation quotes, subsidy calculators, complete DIN-standard sizing, booking flows, accounts and CRM integrations. None are needed to demonstrate the requested initial assessment.

## 8. Three-person plan, 11:00–18:00

These are proposed working milestones, not the official event agenda. All times are Europe/Berlin on 24 October 2026.

- 11:00–11:20: all three agree the user journey, minimum scope and data/result contract. Product teammate asks mentors the unresolved questions below.
- 11:20–12:30: software builds input/case loader and result skeleton; modeller implements arithmetic, evidence rules and development-case explanations; product writes plain-language result copy, prepares demo inputs and checks requirements.
- 12:30–13:30: integrate a complete manual-input path. Run all five cases and display reasons and open checks. Milestone: useful end-to-end prototype without depending on OCR.
- 13:30–14:30: add one meaningful AI path—notes/bill extraction with review. Modeller adds conflict explanations and conditional cost scenarios. Product tests whether an unfamiliar person can finish in under three minutes.
- 14:30–15:30: add targeted follow-up questions and handoff. Consider one photo feature only if the integrated core remains stable.
- 15:30–16:30: challenge the rules, fix failures, check unknowns/units and prepare evaluation-building views. Product rehearses the story with the live app.
- 16:30: feature freeze. No new external integrations.
- 16:30–17:15: rehearse the live demo, verify fresh-start operation and AI failure fallback, finalize local launch instructions and a backup recording if allowed.
- 17:15–18:00: submission buffer and final practice. Confirm the organizer's actual submission and pitch cutoff.

Role ownership:

- You: application architecture, data contract, validation, UI and integration. Prevent reference-label leakage.
- Modelling teammate: assumptions, dual estimates, contradictions, verdict reasons, cost boundaries, validation cases. Spend mathematical effort on defensible uncertainty rather than fitting three examples.
- Product/presentation teammate: mentor decisions, homeowner language, timed usability runs, prioritization, live-demo narrative and submission requirements. This role starts at 11:00, not at pitch time.

## 9. Verification that matters today

- Run each development case without exposing its expected answer or reference load to the decision engine; compare afterwards.
- Explain discrepancies with the development references instead of silently tuning constants until all numbers match.
- Ensure missing flow temperature or pipe information does not universally force red or yellow; the green reference cases themselves contain unknowns.
- Ensure a confirmed single-pipe system creates an explicit professional check.
- Test unknown renovation, partial renovation, mixed heating, additional heat sources and solar hot water.
- Test kWh versus litres/m³, partial-year bills, missing occupants, zero area and inconsistent hot-water subtraction.
- Verify that higher-temperature scenarios increase electricity use for a fixed heat demand.
- Keep the current-system and heat-pump cost service boundaries consistent.
- Force AI/network failure and confirm manual assessment still works.
- Time real first-time users. Report observed completion times honestly, without claiming broad validation from a few participants.
- Show the two evaluation results without claiming their hidden answers are known. Do not hard-code outcomes by building ID.

Useful demo evidence: working cases, time to complete, specific extracted facts, identified contradictions, and visible professional-check lists. Three labelled examples cannot substantiate general accuracy or calibrated probabilities.

## 10. Questions for the nuuEnergy mentor

Highest priority:

1. The one-pager/data page say two evaluation cases, while Deliverables says three. Are there additional cases or is that a typo?
2. Where exactly should yellow end and red begin? Is red a data-quality abstention, a major technical obstacle, or both with different explanations?
3. How should LPG in B-01 be priced under the fixed challenge assumptions?
4. Are reference loads formal design loads, installer estimates, or another target? Does floor area mean currently heated area in every case?
5. How should 2000–2001 buildings and partial renovation map to the age-based heuristic?

Then confirm: API/network use and credits; pitch duration; exact submission format/cutoff; whether the provided photos may be embedded in the demo; and whether a third case or further attachments will be released on site.

If no answer arrives, document conservative assumptions and make the eval loader handle an arbitrary number of buildings. The brief does not justify inventing a third evaluation record.

## 11. Suggested live-demo narrative

Use a roughly three-minute narrative only if it fits the confirmed pitch allocation:

- 0:00–0:20: the homeowner's question and why a premature confident answer is unhelpful.
- 0:20–1:10: load or enter a case; show one AI-extracted fact and confirm it; obtain the result.
- 1:10–1:50: show B-04's single-pipe concern and B-05's conflicting demand estimates; open their evaluation results.
- 1:50–2:20: show the targeted next question and the professional handoff, with assumptions visible.
- 2:20–3:00: explain what is working, what remains uncertain and how this fits nuuEnergy's intake workflow.

Suggested positioning: “We help homeowners take the next step with a clear first assessment, and give technicians the evidence and unanswered questions they need.”

If photo analysis works, the ambiguous valve-block example is a strong demonstration: the app should explicitly request better evidence instead of guessing. Show observed behaviour; do not present a staged result as a live model output.

## 12. Business context and additional resources

nuuEnergy's public website describes a digital initial check followed by a personal technical discussion, a professional site visit and individual system design. Its partner page describes a digital operating system spanning planning, sizing, materials and documentation. My inference: your most credible product story is better initial evidence collection and preparation for the technical team. Any promised time savings or conversion increase would need later measurement.

Sources: [nuuEnergy process](https://www.nuuenergy.com/), [Partner operating-system context](https://www.nuuenergy.com/werde-partner).

Use the challenge-specific pipe guidance for hackathon implementation. Broader marketing wording on nuuEnergy's public cost page is more negative about single-pipe systems than the challenge background; do not silently substitute it for the explicit challenge instructions.

The technical page links an [SWM sample electricity/gas bill PDF](https://www.swm.de/dam/doc/kundenservice/rechnung/musterrechnung-erklaerung.pdf). It is a useful public document for an extraction demonstration, not a current tariff source. Because it combines electricity and gas, verify the fuel-specific consumption and period; do not extract the combined total or account balance as the heating cost.

The public [Munich Climate Week listing](https://www.munichclimateweek.de/event-calendar/event/watt-the-hack-energy-ai-hackathon-evt-ffoqkynos5glo34) lists WATT THE HACK on 24 October 2026, 09:00–19:00 at Audimax in Munich, in English. Your stated 11:00–18:00 development window is used for the team plan above; it is not inferred from that public agenda.

### Source coverage and limits

Read: main challenge, one-pager, mission, technical guardrails, data page, both JSON attachments, deliverables/bonus, evaluation criteria, prize, and the pipe-system background including the five example captions. Also inspected the linked SWM PDF text and relevant public nuuEnergy/event pages. The CSV duplicates were not independently checked, the photo captions were not independently verified against heating-system engineering, and no hidden evaluation references were accessed. Recommendations and provisional eval interpretations are explicitly distinguished from organizer facts.


## Appendix A — Complete development dataset

Source: the `buildings_dev.json` attachment on the linked Data Provided page, read on 24 October 2026. Contains all three records and their published reference values. The content is reproduced below with normalized JSON formatting.

```json
[
  {
    "building_id": "B-01",
    "construction_year": 2001,
    "floor_area_m2": 195,
    "renovation_status": null,
    "heat_distribution": "radiators",
    "annual_consumption_kwh": 10000,
    "energy_carrier": "gas",
    "energy_carrier_detail": "liquefied petroleum gas (LPG, Flüssiggas)",
    "radiator_info": "14 radiators, valves with presetting (already preset); type and age not documented",
    "pipe_system": "unknown",
    "flow_temperature_c": null,
    "persons_in_household": 4,
    "hot_water_via_heating": true,
    "rooms": null,
    "building_notes": "No renovation documented. U-values stated by the owner: windows 1.1, external wall 0.21, basement wall 0.35, roof approx. 0.24, floor slab approx. 0.35 W/(m²K).",
    "location": "Munich area (82xxx)",
    "reference_heating_load_kw": 9.6,
    "expected_verdict": "green"
  },
  {
    "building_id": "B-02",
    "construction_year": 2005,
    "floor_area_m2": 180,
    "renovation_status": null,
    "heat_distribution": "underfloor",
    "annual_consumption_kwh": 15500,
    "energy_carrier": "gas",
    "energy_carrier_detail": "natural gas",
    "radiator_info": "Underfloor heating with 3 manifolds (balanced), plus 1 radiator (type and age not documented)",
    "pipe_system": "unknown",
    "flow_temperature_c": null,
    "persons_in_household": 3,
    "hot_water_via_heating": true,
    "rooms": null,
    "building_notes": "A wood stove is used all winter. Solar thermal system for hot water present.",
    "location": "Munich area (82xxx)",
    "reference_heating_load_kw": 9.7,
    "expected_verdict": "green"
  },
  {
    "building_id": "B-03",
    "construction_year": 1970,
    "floor_area_m2": 200,
    "renovation_status": "partially",
    "heat_distribution": "radiators",
    "annual_consumption_kwh": 40000,
    "energy_carrier": "oil",
    "energy_carrier_detail": "heating oil, approx. 4,000 litres per year",
    "radiator_info": "15 radiators; some panel radiators with presettable valves, 12 valves would need replacement; type and age not documented",
    "pipe_system": "two-pipe",
    "flow_temperature_c": null,
    "persons_in_household": 2,
    "hot_water_via_heating": true,
    "rooms": 11,
    "building_notes": "Cavity wall insulation (blown-in) and insulated roof, year unknown. Double glazing without low-e coating. Top floor added in the 1990s, currently not lived in.",
    "location": "Hamburg area (21xxx)",
    "reference_heating_load_kw": 14.5,
    "expected_verdict": "yellow"
  }
]
```

## Appendix B — Complete evaluation dataset

Source: the `buildings_eval.json` attachment on the linked Data Provided page, read on 24 October 2026. Contains both evaluation records. Reference heat loads and verdicts are withheld by the organizers and are not included here.

```json
[
  {
    "building_id": "B-04",
    "construction_year": 1987,
    "floor_area_m2": 160,
    "renovation_status": null,
    "heat_distribution": "radiators",
    "annual_consumption_kwh": 25000,
    "energy_carrier": "oil",
    "energy_carrier_detail": "heating oil, approx. 2,500 litres per year",
    "radiator_info": "12 radiators with valve blocks; type and age not documented",
    "pipe_system": "single-pipe",
    "flow_temperature_c": null,
    "persons_in_household": 3,
    "hot_water_via_heating": true,
    "rooms": null,
    "building_notes": "Semi-detached house. No renovation information.",
    "location": "Munich area (85xxx)"
  },
  {
    "building_id": "B-05",
    "construction_year": 2006,
    "floor_area_m2": 125,
    "renovation_status": null,
    "heat_distribution": "mixed",
    "annual_consumption_kwh": 27000,
    "energy_carrier": "gas",
    "energy_carrier_detail": "natural gas",
    "radiator_info": "2 heating circuits: underfloor heating plus 8 radiators with presettable valves; type and age not documented",
    "pipe_system": "unknown",
    "flow_temperature_c": null,
    "persons_in_household": 3,
    "hot_water_via_heating": true,
    "rooms": 14,
    "building_notes": "No additional insulation on facade or roof. Double low-e glazing. Solar thermal system present.",
    "location": "Munich area (85xxx)"
  }
]
```

## Appendix C — Using this file

This is a standalone UTF-8 Markdown document. Open it in any text editor, Markdown viewer or document tool. The two JSON blocks can be copied into separate files for implementation. The research and datasets are included directly; external links are citations and optional further resources. The original radiator photographs and SWM sample-bill PDF are linked rather than embedded. No hidden jury answers are included.
