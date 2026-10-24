import { assess, demo, toCustomerInput } from './assessment.js';

const app = document.querySelector('#app');
const storageKey = 'nuu-home-check-v1';
const empty = () => ({ construction_year: '', floor_area_m2: '', renovation_status: 'unknown', energy_carrier: 'unknown', heat_distribution: 'unknown', amount: '', unit: 'kwh', consumption_full_year: 'unknown', persons_in_household: '', hot_water_via_heating: 'unknown', flow_temperature_c: '', pipe_system: 'unknown', radiator_count: '', radiator_type: 'unknown', other_heat_source: 'unknown', solar_thermal: 'unknown', building_notes: '', building_id: 'HOME' });
let state = { step: 0, answers: empty(), larger: false, sample: false };
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (saved?.answers && Number.isInteger(saved.step) && saved.step >= 0 && saved.step <= 5) state = { ...state, ...saved, answers: { ...empty(), ...saved.answers } };
} catch { /* Storage is optional; the flow still works in memory. */ }
let errors = {}, returnToReview = false, editSnapshot = null, samples = [], sampleError = '';
const steps = ['Your home', 'Your heating', 'Your energy use', 'Check your answers'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chevron = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const tick = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const homeArt = `<svg class="home-art" viewBox="0 0 480 340" fill="none" aria-hidden="true"><circle cx="370" cy="67" r="39" fill="#eacdb7"/><path d="M32 283h416" stroke="#476354" stroke-width="3"/><path d="M102 156 240 51l138 105" stroke="#254637" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M125 151v130h230V151L240 65 125 151Z" fill="#fffcf5" stroke="#254637" stroke-width="3"/><path d="M221 279v-94h46v94" fill="#d9e4d8" stroke="#254637" stroke-width="3"/><path d="M153 166h43v49h-43zM290 166h38v49h-38z" fill="#f4c49f" stroke="#254637" stroke-width="3"/><path d="M175 166v49M153 190h43M309 166v49M290 190h38" stroke="#254637" stroke-width="3"/><path d="M299 91V60h25v51" fill="#fffcf5" stroke="#254637" stroke-width="3"/><rect x="316" y="229" width="91" height="57" rx="7" fill="#e1e9e0" stroke="#254637" stroke-width="3"/><circle cx="349" cy="257" r="18" stroke="#254637" stroke-width="2"/><path d="m349 239 6 17-6 19-6-19 6-17ZM331 257l17-6 19 6-19 6-17-6Z" stroke="#254637" stroke-width="1.5"/><path d="M380 244h13m-13 9h13m-13 9h13" stroke="#254637" stroke-width="3"/><path d="M61 280v-60m0 25c-27-3-30-20-28-34 20 3 29 16 28 34Zm0-12c25-4 29-22 27-33-19 4-28 15-27 33Z" fill="#c8d9bf" stroke="#476354" stroke-width="3"/><path d="M398 181c16-8 16-17 0-25m16 42c25-14 25-32 0-46" stroke="#9a4824" stroke-width="3" stroke-linecap="round"/></svg>`;
const labels = {
  renovation_status: { unknown: 'Not sure', unrenovated: 'No major improvements', partially: 'Some improvements', fully: 'Comprehensive renovation' },
  energy_carrier: { unknown: 'Not sure', gas: 'Natural gas', oil: 'Heating oil', lpg: 'LPG / bottled or tank gas', electric: 'Electric heating', district: 'District heating' },
  heat_distribution: { unknown: 'Not sure', radiators: 'Radiators', underfloor: 'Underfloor heating', mixed: 'Both' },
  pipe_system: { unknown: 'Not sure', 'two-pipe': 'Two-pipe system', 'single-pipe': 'Single-pipe system' },
  radiator_type: { unknown: 'Not sure', 33: 'Three panels (type 33)', 22: 'Two panels (type 22)', 11: 'One panel (type 11)' },
};
function save() { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch {} }
function announce(text) { document.querySelector('#announcement').textContent = text; }
function setStep(step, push = true) {
  state.step = step; errors = {}; save();
  if (push) history.pushState({ step }, '', step ? `#${step === 5 ? 'result' : 'step-' + step}` : location.pathname);
  render(); document.querySelector('#page-title')?.focus(); window.scrollTo(0, 0);
}
window.addEventListener('popstate', event => setStep(Number.isInteger(event.state?.step) ? event.state.step : 0, false));
history.replaceState({ step: state.step }, '');
function formatNumber(n) { return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n); }
function range(value, unit = 'kW') { return value ? `${formatNumber(value[0])}${value[0] !== value[1] ? '–' + formatNumber(value[1]) : ''} ${unit}` : 'More information needed'; }
function money(n) { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n); }
function parseNumber(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)) return NaN;
  return Number(s.replaceAll(',', ''));
}
function values() {
  const a = state.answers, out = { ...a };
  for (const key of ['construction_year', 'floor_area_m2', 'persons_in_household', 'flow_temperature_c', 'radiator_count']) out[key] = parseNumber(a[key]);
  for (const key of ['consumption_full_year', 'hot_water_via_heating', 'other_heat_source', 'solar_thermal']) out[key] = a[key] === 'yes' ? true : a[key] === 'no' ? false : null;
  out.annual_consumption_kwh = parseNumber(a.amount);
  if (out.annual_consumption_kwh !== null && ['litres', 'm3'].includes(a.unit)) out.annual_consumption_kwh *= 10;
  delete out.amount; delete out.unit;
  return out;
}
function validate(step) {
  const specs = step === 2 ? [['radiator_count', 1, 100, true, 'Enter a whole number from 1 to 100, or leave it blank.']] : step === 1 ? [['floor_area_m2', 1, 5000, false, 'Enter an area between 1 and 5,000 m², or leave it blank.'], ['construction_year', 1800, new Date().getFullYear(), true, 'Enter a four-digit year from 1800 to this year, or leave it blank.']] : step === 3 ? [['amount', 1, 10000000, false, 'Enter an amount greater than zero, such as 18000, or leave it blank.'], ['persons_in_household', 1, 30, true, 'Enter a whole number from 1 to 30, or leave it blank.'], ['flow_temperature_c', 20, 100, false, 'Enter a temperature from 20 to 100 °C, or leave it blank.']] : [];
  const found = {};
  for (const [key, min, max, integer, message] of specs) {
    const n = parseNumber(state.answers[key]);
    if (n !== null && (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))) found[key] = message;
  }
  return found;
}
function field(key, title, hint, { unit = '', placeholder = '', mode = 'numeric' } = {}) {
  return `<div class="field"><label for="${key}">${title} <span class="optional">Optional</span></label><p class="field-hint" id="${key}-hint">${hint}</p><div class="input-wrap"><input id="${key}" name="${key}" type="text" inputmode="${mode}" autocomplete="off" value="${escape(state.answers[key])}" placeholder="${placeholder}" aria-describedby="${key}-hint${errors[key] ? ' ' + key + '-error' : ''}" ${errors[key] ? 'aria-invalid="true"' : ''}>${unit ? `<span class="input-unit">${unit}</span>` : ''}</div>${errors[key] ? `<p class="field-error" id="${key}-error">${escape(errors[key])}</p>` : ''}</div>`;
}
function choices(key, title, options, hint = '', compact = false) {
  return `<fieldset class="field"><legend>${title}</legend>${hint ? `<p class="field-hint" id="${key}-hint">${hint}</p>` : ''}<div class="choices ${compact ? 'compact' : ''}">${options.map(([value, label, desc]) => `<label class="choice"><input type="radio" name="${key}" value="${value}" ${state.answers[key] === value ? 'checked' : ''}><span><span class="choice-label">${label}</span>${desc ? `<span class="choice-description">${desc}</span>` : ''}</span></label>`).join('')}</div></fieldset>`;
}
function select(key, title, options, hint = '') {
  return `<div class="field"><label for="${key}">${title}</label>${hint ? `<p class="field-hint" id="${key}-hint">${hint}</p>` : ''}<select id="${key}" name="${key}" ${hint ? `aria-describedby="${key}-hint"` : ''}>${options.map(([v, label]) => `<option value="${v}" ${state.answers[key] === v ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
}
function errorSummary() {
  const entries = Object.entries(errors);
  return entries.length ? `<div class="error-summary" id="error-summary" tabindex="-1"><h2>Let’s check ${entries.length === 1 ? 'one answer' : 'these answers'}</h2><ul>${entries.map(([key, text]) => `<li><a href="#${key}">${escape(text)}</a></li>`).join('')}</ul></div>` : '';
}
function progress() {
  return `<nav class="progress" aria-label="Your progress"><ol>${steps.map((name, i) => `<li ${state.step === i + 1 ? 'aria-current="step"' : ''} class="${state.step > i + 1 ? 'complete' : ''}"><span class="step-number">${state.step > i + 1 ? tick : i + 1}</span><span>${name}</span></li>`).join('')}</ol></nav>`;
}
function welcome() {
  return `<main id="main" class="welcome"><div class="welcome-copy"><p class="eyebrow"><span class="small-line"></span> A clearer next step for your home</p><h1 id="page-title" tabindex="-1">Could a heat pump work for <span>your home?</span></h1><p class="lead">Let’s find out together. Answer a few simple questions for a first indication of what’s possible—and what to check next.</p><ul class="welcome-benefits"><li>${tick}No technical knowledge needed</li><li>${tick}It’s fine if you don’t know every answer</li><li>${tick}Go at your own pace. Come back a step anytime.</li></ul><button class="button primary start-button" data-go="1">Check my home ${chevron}</button><p class="quiet">About 3 minutes · No sign-up · No contact details</p></div><aside class="welcome-aside"><div class="illustration-card"><span class="illustration-label">A warmer home. A clearer picture.</span>${homeArt}<div class="illustration-caption"><span class="leaf-mark" aria-hidden="true">↗</span><p>A first step towards<br><strong>heating with less fossil fuel.</strong></p></div></div><p class="aside-note">An initial check, with the final details confirmed by a heating professional.</p></aside><section class="sample-section" aria-labelledby="sample-heading"><div><h2 id="sample-heading">Just having a look?</h2><p>Explore a real, anonymised example home.</p></div><details class="sample-details"><summary>Try an example home</summary><div class="sample-list">${sampleError ? `<p role="status">${escape(sampleError)}</p><button class="button secondary" data-retry>Try loading examples again</button>` : samples.length ? samples.map(b => `<button class="sample-button" data-sample="${escape(b.building_id)}"><strong>${escape(b.building_id)} · ${b.construction_year} home</strong><span>${b.floor_area_m2} m² · ${escape(labels.heat_distribution[b.heat_distribution])}${b.pipe_system === 'single-pipe' ? ' · single-pipe' : ''}</span>${chevron}</button>`).join('') : '<p>Loading example homes…</p>'}</div></details></section></main>`;
}
function homeForm() {
  return `${field('floor_area_m2', 'How much space do you heat?', 'Use the floor area of the rooms you heat. A rough figure is fine.', { unit: 'm²', placeholder: 'For example, 150', mode: 'decimal' })}${field('construction_year', 'When was your home built?', 'You may find the year in your property documents.', { placeholder: 'For example, 1985' })}${choices('renovation_status', 'Has the insulation been improved?', [['unrenovated', 'No major improvements'], ['partially', 'Some improvements', 'For example, new windows or roof insulation'], ['fully', 'Comprehensive renovation', 'Major insulation improvements across the home'], ['unknown', 'I’m not sure']], 'Choose the answer that fits best.')}`;
}
function heatingForm() {
  return `${select('energy_carrier', 'What do you use to heat your home?', Object.entries(labels.energy_carrier), 'You can usually find this on your heating bill.')}${choices('heat_distribution', 'How does the heat reach your rooms?', [['radiators', 'Radiators', 'Heaters attached to the walls'], ['underfloor', 'Underfloor heating', 'Warm water runs through pipes beneath the floor'], ['mixed', 'Both', 'Some rooms have radiators, others have floor heating'], ['unknown', 'I’m not sure']])}<div class="help-note"><span aria-hidden="true">i</span><p><strong>Radiators can work with heat pumps, too.</strong><br>Their size and the water temperature they need matter more than simply having them.</p></div>${field('radiator_count', 'How many radiators do you have?', 'Count the radiators in the rooms you heat. Skip this if you only have underfloor heating.', { placeholder: 'For example, 12' })}${choices('radiator_type', 'What do most of your radiators look like?', [['33', 'Three panels', 'Thick, with three flat panels one behind the other'], ['22', 'Two panels', 'Two flat panels with fins between them'], ['11', 'One panel', 'A single thin flat panel'], ['unknown', 'I’m not sure']], 'Look at a radiator from the side. Bigger radiators work better with a heat pump.')}`;
}
function energyForm() {
  const units = [['kwh', 'kWh (kilowatt-hours)'], ...(state.answers.energy_carrier === 'oil' ? [['litres', 'Litres of heating oil']] : state.answers.energy_carrier === 'gas' ? [['m3', 'm³ of natural gas']] : [])];
  return `<div class="bill-note"><span class="document-icon" aria-hidden="true">${'<svg width="26" height="30" viewBox="0 0 26 30" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 2h11l6 6v20H5zM16 2v7h6M9 15h9M9 20h9"/></svg>'}</span><p><strong>A heating bill can help.</strong><br>Look for energy used, rather than the amount you paid. You can leave this blank if you don’t have it.</p></div><div class="energy-row">${field('amount', 'How much energy did you use?', 'Use the amount shown on your bill.', { placeholder: 'For example, 18000', mode: 'decimal' })}${select('unit', 'Unit on your bill', units)}</div>${choices('consumption_full_year', 'Does that amount cover a full year?', [['yes', 'Yes'], ['no', 'No'], ['unknown', 'I’m not sure']], '', true)}${field('persons_in_household', 'How many people live in your home?', 'This helps separate room heating from hot water.', { placeholder: 'For example, 2' })}${choices('hot_water_via_heating', 'Does your heating also provide hot tap water?', [['yes', 'Yes'], ['no', 'No'], ['unknown', 'I’m not sure']], '', true)}<details class="extra-details" ${errors.flow_temperature_c ? 'open' : ''}><summary>Know a little more about your heating? <span>Optional details</span></summary><div class="extra-content">${field('flow_temperature_c', 'Heating water temperature on a cold day', 'Also called “flow temperature”. Only enter it if you already know it. Do not change your boiler settings.', { unit: '°C', placeholder: 'For example, 55' })}${select('pipe_system', 'Your heating pipe layout', Object.entries(labels.pipe_system), 'If you have not been told, choose “Not sure”.')}${choices('other_heat_source', 'Do you also use another heat source?', [['yes', 'Yes'], ['no', 'No'], ['unknown', 'I’m not sure']], 'For example, a wood stove used to heat your rooms.', true)}${choices('solar_thermal', 'Does solar thermal help heat your water?', [['yes', 'Yes'], ['no', 'No'], ['unknown', 'I’m not sure']], 'This means solar hot-water panels, rather than solar electricity panels.', true)}<div class="field"><label for="building_notes">Anything else about your home? <span class="optional">Optional</span></label><p class="field-hint" id="building_notes-hint">For example, rooms you don’t heat or recent improvements. These notes will be included for a technician to review.</p><textarea id="building_notes" name="building_notes" rows="4" maxlength="3000" aria-describedby="building_notes-hint">${escape(state.answers.building_notes)}</textarea></div></div></details>`;
}
function answer(key, unit = '') {
  const value = state.answers[key];
  if (labels[key]) return labels[key][value] || 'Not sure';
  if (['yes', 'no', 'unknown'].includes(value)) return { yes: 'Yes', no: 'No', unknown: 'Not sure' }[value];
  return value ? escape(value) + unit : 'Not provided';
}
function reviewGroup(title, step, rows) {
  return `<section class="review-group"><div class="section-header"><h2>${title}</h2><button type="button" class="edit-button" data-edit="${step}" aria-label="Change ${title.toLowerCase()} answers">Change ${chevron}</button></div><dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></section>`;
}
function review() {
  const a = state.answers;
  return `${state.sample ? `<div class="sample-notice">Example home ${escape(a.building_id)}. These are anonymised project details. You can change any answer.</div>` : ''}${reviewGroup('Your home', 1, [['Heated area', answer('floor_area_m2', ' m²')], ['Year built', answer('construction_year')], ['Insulation improvements', answer('renovation_status')]])}${reviewGroup('Your heating', 2, [['Energy source', answer('energy_carrier')], ['Room heating', answer('heat_distribution')], ['Radiators', answer('radiator_count')], ['Radiator type', answer('radiator_type')]])}${reviewGroup('Your energy use', 3, [['Energy used', answer('amount', ' ' + ({ kwh: 'kWh', litres: 'litres', m3: 'm³' }[a.unit]))], ['Covers a full year', answer('consumption_full_year')], ['People at home', answer('persons_in_household')], ['Hot water from heating', answer('hot_water_via_heating')], ['Water temperature', answer('flow_temperature_c', ' °C')], ['Pipe layout', answer('pipe_system')], ['Another heat source', answer('other_heat_source')], ['Solar hot water', answer('solar_thermal')], ...(a.building_notes ? [['Your notes', escape(a.building_notes)]] : [])])}<p class="review-reassurance">An unanswered question is okay. We’ll explain where more information would help.</p>`;
}
function formPage() {
  const titles = ['Tell us a little about your home.', 'How do you keep your home warm?', 'A little about your energy use.', 'Does everything look right?'];
  const intros = ['A few basic details help us understand your home. Estimates are welcome.', 'Choose what you know. You can always come back and change an answer.', 'These details help us give a more useful estimate. Nothing here needs to be exact.', 'You’re in control. Check your answers before we put your first assessment together.'];
  const content = [homeForm, heatingForm, energyForm, review][state.step - 1]();
  return `<main id="main" class="flow-main">${progress()}<div class="flow-layout"><section class="form-panel"><p class="eyebrow">Step ${state.step} of 4</p><h1 id="page-title" tabindex="-1">${titles[state.step - 1]}</h1><p class="intro">${intros[state.step - 1]}</p>${errorSummary()}<form id="home-form" novalidate>${content}<div class="form-actions"><button type="button" class="back-button" data-go="${returnToReview ? 4 : state.step - 1}"><span aria-hidden="true">←</span> ${returnToReview ? 'Cancel changes' : 'Back'}</button><button type="submit" class="button primary">${state.step === 4 ? 'See my assessment' : returnToReview ? 'Save changes' : 'Continue'} ${chevron}</button></div></form></section><aside class="flow-aside"><div class="encouragement"><span class="aside-kicker">A little reassurance</span><h2>You don’t need to be an expert.</h2><p>“I’m not sure” is a useful answer, too. We’ll tell you which details a heating professional can help with.</p><hr><p class="small">Your answers stay in this tab. You can go back without losing them.</p></div><p class="prototype-note">This is an initial indication, not a final design or an installation quote.</p></aside></div></main>`;
}
let assessment = { key: null, status: 'idle', data: null };
// An unchanged example home is assessed from its hand-extracted files (with real evidence); anything else from the form.
const sampleUnchanged = () => state.sample && state.sampleAnswers === JSON.stringify(state.answers);
async function runAssessment(key, input) {
  assessment = { key, status: 'loading', data: null };
  try {
    const data = await (key.startsWith('demo:') ? demo(key.slice(5)) : assess(input));
    if (assessment.key === key) assessment = { key, status: 'done', data };
  } catch { if (assessment.key === key) assessment = { key, status: 'error', data: null }; }
  if (state.step === 5 && assessment.key === key) {
    render(); document.querySelector('#page-title')?.focus();
    announce(assessment.status === 'done' ? 'Your first assessment is ready.' : 'The assessment could not be completed.');
  }
}
function verdictMeta(d, hasCases) {
  if (d.verdict === 'green') return { cls: 'green', eyebrow: 'Green · Likely suitable', title: 'A promising starting point.' };
  if (d.verdict === 'red') return { cls: 'red', eyebrow: 'Red · Changes needed first', title: 'Some changes are needed first.' };
  if (d.verdict_kind === 'workable') return { cls: 'yellow', eyebrow: 'Yellow · Works at a higher water temperature', title: 'Possible, with higher running costs.' };
  return { cls: 'yellow', eyebrow: 'Yellow · More checks needed', title: hasCases ? 'Possible, with a few checks.' : 'Let’s fill in a few gaps.' };
}

// Result page: three layers. Top: decision and saving. Middle: the four engine steps, one sentence and one
// equation each. Bottom: the inputs each step used, with their evidence.
const span = (r, unit = '') => (!r ? '—' : (r[0] === r[1] ? formatNumber(r[0]) : `${formatNumber(r[0])}–${formatNumber(r[1])}`) + unit);
const euros = r => (!r ? '—' : r[0] === r[1] ? money(r[0]) : `${money(r[0])}–${money(r[1])}`);
const firstSentence = text => text.split(/(?<=\.)\s/)[0];

function stepCards(p, o) {
  const load = o['01_heat_load'], h = load.heating_load_kw, f1 = p['01b_heat_load_by_consumption'].fields;
  const flow = o['02_radiator_check'].flow_temp_c, cases = flow.by_case, f2 = p['02_radiator_check'].fields;
  const c = o['03_operating_cost'], cost = c.cost_eur_per_year, d = o.decision;

  let eq1 = '—';
  if (h.by_consumption) {
    const n = f1.persons_in_household.value, hw = f1.hot_water_via_heating.value;
    const water = hw === false ? '' : hw === true && f1.solar_thermal.value !== true && n ? ` − ${n} × 1,000 kWh` : ` − 0…${n || 5} × 1,000 kWh`;
    eq1 = `P = (${formatNumber(f1.annual_consumption_kwh.value)} kWh × 0.88${water}) / ${span(load.inputs_as_ranges.full_load_hours)} h = ${span(h.by_consumption, ' kW')}`;
  } else if (h.by_area) {
    const a = load.inputs_as_ranges.heated_area_m2;
    eq1 = `P = ${span(a)} m² × ${span([Math.round(h.by_area[0] * 1000 / a[0]), Math.round(h.by_area[1] * 1000 / a[1])])} W/m² = ${span(h.by_area, ' kW')}`;
  }
  const s1 = !h.used ? 'Not enough data yet to estimate the heat load.'
    : h.consistent === false ? `Bill (${span(h.by_consumption, ' kW')}) and house size (${span(h.by_area, ' kW')}) disagree, so both are kept.`
    : h.consistent ? `Bill and house size agree: the house needs about ${span(h.used, ' kW')} on the coldest day.`
    : `The house needs about ${span(h.used, ' kW')} on the coldest day.`;

  let s2 = 'Not enough data yet: the heating type or number of radiators is missing.', eq2 = '—';
  if (cases?.underfloor) { s2 = 'Underfloor heating works at a low water temperature.'; eq2 = 'T_flow ≈ 35 °C'; }
  else if (cases) {
    const types = Object.keys(cases).sort().reverse(), best = types[0];
    const rating = p['02_radiator_check'].reference_data.radiator_rated_kw_each.value[best];
    s2 = types.length > 1 ? `Radiator type unknown: the water would need ${types.map(t => `${span(cases[t])} °C (type ${t})`).join(', ')}.` : `Type ${best} radiators need ${span(cases[best])} °C water.`;
    eq2 = `T = 25 + 50 × (${formatNumber(h.used[1])} kW / (${f2.radiator_count.value} × ${rating} kW))^(1/1.3) = ${cases[best][1]} °C`;
  }

  let s3 = 'Running costs need a full-year bill and a usable water temperature.', eq3 = '—';
  if (cost.heat_pump) {
    s3 = `A heat pump would cost ${euros(cost.heat_pump)} a year${cost.today !== null ? ` instead of ${money(cost.today)} today` : ''}.`;
    eq3 = `${formatNumber(p['03_operating_cost'].fields.annual_consumption_kwh.value)} kWh × 0.88 / JAZ ${span(c.jaz)} × €0.26 = ${euros(cost.heat_pump)}`;
  }

  const b = d.boundaries[0];
  const s4 = { ready: 'Every case stays at or below 55 °C, so the existing heating works efficiently.', workable: 'Every case needs 55–60 °C: it works, with higher running costs.', obstacle: 'Every case needs more than 60 °C: some radiators should be upgraded first.' }[d.verdict_kind]
    || (cases ? 'Some cases stay at or below 55 °C and others need more, so the radiator output decides.' : 'Key inputs are missing, so the result stays open.');
  const eq4 = b ? `Q_needed = ${formatNumber(h.used[1])} kW / ((55 − 25) / 50)^1.3 = ${b.thresholds[0].range.replace('>= ', '')} kW (${b.thresholds[0].per_radiator.replace('>= ', '')} kW per radiator)`
    : '≤ 55 °C green · 55–60 °C yellow · > 60 °C red';

  return [
    { title: 'Heat load', sentence: s1, equation: eq1, result: span(h.used, ' kW') },
    { title: 'Radiator check', sentence: s2, equation: eq2, result: span(flow.required, ' °C') },
    { title: 'Operating cost', sentence: s3, equation: eq3, result: cost.saving ? `${euros(cost.saving)} / year saved` : '—' },
    { title: 'Decision', sentence: s4, equation: eq4, result: `${d.verdict} · ${d.verdict_kind}` },
  ];
}

const yesNo = v => (v ? 'yes' : 'no');
const INPUTS = [ // [processed step, field, from reference_data, label, format], one column per engine step
  [['01a_heat_load_by_area', 'floor_area_m2', false, 'Floor area', v => `${formatNumber(v)} m²`], ['01a_heat_load_by_area', 'construction_year', false, 'Built', String],
    ['01a_heat_load_by_area', 'renovation_status', false, 'Renovation', String], ['01a_heat_load_by_area', 'unheated_area', false, 'Unheated area', String],
    ['01b_heat_load_by_consumption', 'annual_consumption_kwh', false, 'Energy used', v => `${formatNumber(v)} kWh/year`], ['01b_heat_load_by_consumption', 'energy_carrier', false, 'Fuel', v => labels.energy_carrier[v] || v],
    ['01b_heat_load_by_consumption', 'persons_in_household', false, 'People', String], ['01b_heat_load_by_consumption', 'hot_water_via_heating', false, 'Hot water from boiler', yesNo]],
  [['02_radiator_check', 'heat_distribution', false, 'Heating', v => labels.heat_distribution[v] || v], ['02_radiator_check', 'radiator_count', false, 'Radiators', String],
    ['02_radiator_check', 'radiator_type', false, 'Radiator type', v => `type ${v}`, '11, 22 and 33 all tried'], ['02_radiator_check', 'radiator_size_mm', false, 'Radiator size', v => v.join(' × ') + ' mm', '600 × 1000 mm assumed']],
  [['03_operating_cost', 'fuel_price_eur_per_kwh', true, 'Fuel price', v => `€${v}/kWh`, 'today’s cost not computed'], ['03_operating_cost', 'hp_electricity_price_eur_per_kwh', true, 'Heat-pump electricity', v => `€${v}/kWh`]],
  [['02_radiator_check', 'pipe_system', false, 'Pipes', v => labels.pipe_system[v] || v], ['02_radiator_check', 'valves_to_replace', false, 'Valves to replace', String]],
];
function inputItem(p, [step, key, isRef, label, format, fallback]) {
  const f = (isRef ? p[step].reference_data : p[step].fields)[key];
  if (!f || (f.value === null && ['not asked', 'not provided'].includes(f.evidence))) return '';
  const value = f.value === null ? 'unknown' : format(f.value);
  const note = f.value === null && fallback ? `<p class="rp-note">→ ${fallback}</p>` : '';
  const evidence = f.evidence && f.evidence !== String(f.value) && f.evidence !== 'self-reported' ? `<p class="rp-evidence">“${escape(f.evidence)}”</p>` : '';
  const source = String(f.source).replace('customer_input.', '').replace('homeowner.', 'your answer: ');
  return `<li><div class="rp-in"><span>${label}</span><strong>${escape(value)}</strong></div>${note}${evidence}<p class="rp-source">${escape(source)} · ${escape(f.confidence ?? (f.value === null ? 'no value' : 'as given'))}</p></li>`;
}

function costBars(cost, fuel) {
  const max = Math.max(cost.today ?? 0, cost.heat_pump?.[1] ?? 0);
  if (!max || !cost.heat_pump) return '';
  const w = v => `${(v / max * 100).toFixed(1)}%`, [lo, hi] = cost.heat_pump;
  return `<div class="rp-bars" aria-hidden="true">${cost.today !== null ? `<div class="rp-bar"><span>Today · ${escape(fuel)}</span><div class="rp-track"><div class="rp-fill today" style="width:${w(cost.today)}"></div></div><strong>${money(cost.today)}</strong></div>` : ''}`
    + `<div class="rp-bar"><span>Heat pump</span><div class="rp-track"><div class="rp-fill hp" style="width:${w(lo)}"></div><div class="rp-fill hp-range" style="left:${w(lo)};width:${w(hi - lo)}"></div></div><strong>${euros(cost.heat_pump)}</strong></div></div>`;
}

function resultPage() {
  const input = toCustomerInput(values()), key = sampleUnchanged() ? `demo:${state.answers.building_id}` : JSON.stringify(input);
  if (assessment.key !== key) runAssessment(key, input);
  const top = '<div class="result-topline"><button class="back-button" data-go="4">← Review my answers</button><span>YOUR FIRST ASSESSMENT</span></div>';
  if (assessment.status === 'loading') return `<main id="main" class="result-main">${top}<section class="verdict-panel" aria-busy="true"><div><h1 id="page-title" tabindex="-1">Checking your answers…</h1><p class="lead">This usually takes a moment.</p></div></section></main>`;
  if (assessment.status === 'error') return `<main id="main" class="result-main">${top}<section class="verdict-panel yellow"><div><h1 id="page-title" tabindex="-1">We couldn’t complete the check.</h1><p class="lead">The calculation did not respond. Your answers are still saved in this tab.</p><div class="result-actions"><button class="button primary" data-retry-assess>Try again</button></div></div></section></main>`;

  const { processed: p, outputs: o } = assessment.data, d = o.decision, cost = o['03_operating_cost'].cost_eur_per_year;
  const v = verdictMeta(d, Boolean(o['02_radiator_check'].flow_temp_c.by_case));
  const fuel = labels.energy_carrier[p['03_operating_cost'].fields.energy_carrier.value] || 'current fuel';
  return `<main id="main" class="result-main rp">${top}
    <section class="rp-layer" aria-labelledby="page-title"><p class="rp-layer-label">Result · ${escape(d.building_id)}</p><div class="rp-top">
      <div class="rp-card rp-verdict ${v.cls}"><p class="eyebrow">${v.eyebrow}</p><h1 id="page-title" tabindex="-1">${v.title}</h1><p>${escape(firstSentence(d.summary))}</p></div>
      <div class="rp-card rp-saving"><p class="eyebrow">Energy cost saving</p><p class="rp-big">${cost.saving ? `${euros(cost.saving)}<span> / year</span>` : '—'}</p>${costBars(cost, fuel)}<p class="small">Fixed challenge prices, energy only.</p></div>
    </div></section>
    <div class="rp-link" aria-hidden="true">↑</div>
    <section class="rp-layer" aria-label="How it was calculated"><p class="rp-layer-label">4 steps</p><ol class="rp-steps">${stepCards(p, o).map((x, i) => `<li class="rp-card rp-step"><p class="rp-num">Step ${i + 1}</p><h2>${x.title}</h2><p>${escape(x.sentence)}</p><code class="rp-eq">${escape(x.equation)}</code><p class="rp-result">${escape(x.result)}</p></li>`).join('')}</ol></section>
    <div class="rp-links" aria-hidden="true"><span>↑</span><span>↑</span><span>↑</span><span>↑</span></div>
    <section class="rp-layer" aria-label="Inputs and evidence"><p class="rp-layer-label">Inputs & evidence</p><div class="rp-inputs">${INPUTS.map(col => `<ul class="rp-card">${col.map(x => inputItem(p, x)).join('')}</ul>`).join('')}</div></section>
    <div class="result-actions"><button class="reset-button" data-reset>Start a new check</button></div></main>`;
}
function render() {
  document.documentElement.classList.toggle('larger-text', state.larger);
  document.querySelector('#text-size').setAttribute('aria-pressed', String(state.larger));
  app.innerHTML = (state.step === 0 ? welcome() : state.step === 5 ? resultPage() : formPage()) + `<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Start a new home check?</h2><p>This clears the answers in this tab. Save your summary first if you want to keep it.</p><div class="dialog-actions"><button class="button secondary" data-cancel-reset autofocus>Keep my answers</button><button class="button primary" data-confirm-reset>Start a new check</button></div></dialog>`;
  document.title = `${state.step === 0 ? 'Heat pump home check' : state.step === 5 ? 'Your first assessment' : steps[state.step - 1]} · nuuEnergy`;
}
app.addEventListener('input', event => {
  const el = event.target;
  if (el.name && Object.hasOwn(state.answers, el.name)) { state.answers[el.name] = el.value; save(); }
});
app.addEventListener('change', event => {
  const el = event.target;
  if (el.name && Object.hasOwn(state.answers, el.name)) {
    state.answers[el.name] = el.value;
    if (el.name === 'energy_carrier') { state.answers.unit = 'kwh'; state.answers.amount = ''; }
    save();
  }
});
app.addEventListener('submit', event => {
  if (event.target.id !== 'home-form') return;
  event.preventDefault(); errors = validate(state.step);
  if (Object.keys(errors).length) {
    render(); document.querySelector('#error-summary').focus();
    announce('Please check the highlighted answers.'); return;
  }
  const next = returnToReview ? 4 : state.step + 1;
  returnToReview = false; editSnapshot = null; setStep(next);
  announce(next === 5 ? 'Preparing your first assessment.' : `Step ${next} of 4: ${steps[next - 1]}.`);
});
app.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-go')) {
    if (returnToReview && editSnapshot) state.answers = { ...editSnapshot };
    returnToReview = false; editSnapshot = null; setStep(Number(button.dataset.go));
  }
  if (button.hasAttribute('data-edit')) { editSnapshot = { ...state.answers }; returnToReview = true; setStep(Number(button.dataset.edit)); }
  if (button.hasAttribute('data-sample')) loadSample(button.dataset.sample);
  if (button.hasAttribute('data-retry')) await loadSamples();
  if (button.hasAttribute('data-retry-assess')) { assessment = { key: null, status: 'idle', data: null }; render(); }
  if (button.hasAttribute('data-reset')) document.querySelector('#reset-dialog').showModal();
  if (button.hasAttribute('data-cancel-reset')) document.querySelector('#reset-dialog').close();
  if (button.hasAttribute('data-confirm-reset')) { state.answers = empty(); state.sample = false; state.sampleAnswers = null; returnToReview = false; setStep(0); announce('Your answers have been cleared.'); }
});
document.querySelector('#text-size').addEventListener('click', () => {
  state.larger = !state.larger; document.documentElement.classList.toggle('larger-text', state.larger);
  document.querySelector('#text-size').setAttribute('aria-pressed', String(state.larger)); save(); announce(state.larger ? 'Larger text enabled.' : 'Standard text enabled.');
});
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); returnToReview = false; editSnapshot = null; setStep(0); });
let printDetails = [];
window.addEventListener('beforeprint', () => { printDetails = [...document.querySelectorAll('main details')].filter(d => !d.open); printDetails.forEach(d => { d.open = true; }); });
window.addEventListener('afterprint', () => { printDetails.forEach(d => { d.open = false; }); printDetails = []; });
function loadSample(id) {
  const sample = samples.find(b => b.building_id === id); if (!sample) return;
  // Samples are the demo customers' raw input (data/demo/<id>/raw), which carries no development labels.
  const a = empty();
  for (const key of Object.keys(a)) if (sample[key] !== undefined && sample[key] !== null) a[key] = String(sample[key]);
  if (/LPG/i.test(sample.energy_carrier_detail || '')) a.energy_carrier = 'lpg';
  a.amount = String(sample.annual_consumption_kwh); a.unit = 'kwh'; a.consumption_full_year = 'yes';
  a.hot_water_via_heating = sample.hot_water_via_heating === true ? 'yes' : sample.hot_water_via_heating === false ? 'no' : 'unknown';
  a.radiator_count = (/(\d+)\s+radiators?/i.exec(sample.radiator_info || '') || [])[1] || '';
  a.other_heat_source = /wood stove/i.test(sample.building_notes) ? 'yes' : 'unknown';
  a.solar_thermal = /solar thermal/i.test(sample.building_notes) ? 'yes' : 'unknown';
  a.building_notes = [sample.building_notes, sample.radiator_info].filter(Boolean).join('\n\n');
  state.answers = a; state.sample = true; state.sampleAnswers = JSON.stringify(a); setStep(4); announce(`Example home ${id} loaded. Review the answers before continuing.`);
}
async function loadSamples() {
  try {
    const response = await fetch('/api/samples');
    if (!response.ok) throw new Error('Unavailable');
    samples = await response.json(); sampleError = '';
  } catch { sampleError = 'Example homes could not be loaded. You can still check your own home.'; }
  if (state.step === 0) render();
}
// ?demo=B-03 opens that example home's result directly (for presenting).
function openDemo() {
  const id = new URLSearchParams(location.search).get('demo');
  if (id && samples.some(b => b.building_id === id)) { loadSample(id); setStep(5); }
}
render(); loadSamples().then(openDemo);
