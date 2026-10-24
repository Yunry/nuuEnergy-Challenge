import { assess, toCustomerInput } from './assessment.js';
import { extractFiles, applyFields, fieldLabels, validateFiles } from './extraction.js';

const app = document.querySelector('#app');
const storageKey = 'nuu-home-check-v1';
const empty = () => ({ construction_year: '', floor_area_m2: '', renovation_status: 'unknown', energy_carrier: 'unknown', heat_distribution: 'unknown', amount: '', unit: 'kwh', consumption_full_year: 'unknown', persons_in_household: '', hot_water_via_heating: 'unknown', flow_temperature_c: '', pipe_system: 'unknown', radiator_count: '', radiator_type: 'unknown', other_heat_source: 'unknown', solar_thermal: 'unknown', building_notes: '', building_id: 'HOME' });
let state = { step: 0, answers: empty(), larger: false, sample: false, evidence: {} };
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (saved?.answers && Number.isInteger(saved.step) && saved.step >= 0 && saved.step <= 5) state = { ...state, ...saved, answers: { ...empty(), ...saved.answers } };
} catch { /* Storage is optional; the flow still works in memory. */ }
let errors = {}, returnToReview = false, editSnapshot = null, samples = [], sampleError = '';
let extraction = { status: 'idle', result: null, error: '' }, aiAvailable = null, uploadGeneration = 0;
let chosenFiles = [], homeDetailsOpen = false, addedCount = 0;
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
  return `<div class="field"><label for="${key}">${title} ${filledBadge(key)} <span class="optional">Optional</span></label><p class="field-hint" id="${key}-hint">${hint}</p><div class="input-wrap"><input id="${key}" name="${key}" type="text" inputmode="${mode}" autocomplete="off" value="${escape(state.answers[key])}" placeholder="${placeholder}" aria-describedby="${key}-hint${errors[key] ? ' ' + key + '-error' : ''}" ${errors[key] ? 'aria-invalid="true"' : ''}>${unit ? `<span class="input-unit">${unit}</span>` : ''}</div>${errors[key] ? `<p class="field-error" id="${key}-error">${escape(errors[key])}</p>` : ''}</div>`;
}
function choices(key, title, options, hint = '', compact = false) {
  return `<fieldset class="field"><legend>${title} ${filledBadge(key)}</legend>${hint ? `<p class="field-hint" id="${key}-hint">${hint}</p>` : ''}<div class="choices ${compact ? 'compact' : ''}">${options.map(([value, label, desc]) => `<label class="choice"><input type="radio" name="${key}" value="${value}" ${state.answers[key] === value ? 'checked' : ''}><span><span class="choice-label">${label}</span>${desc ? `<span class="choice-description">${desc}</span>` : ''}</span></label>`).join('')}</div></fieldset>`;
}
function select(key, title, options, hint = '') {
  return `<div class="field"><label for="${key}">${title} ${filledBadge(key)}</label>${hint ? `<p class="field-hint" id="${key}-hint">${hint}</p>` : ''}<select id="${key}" name="${key}" ${hint ? `aria-describedby="${key}-hint"` : ''}>${options.map(([v, label]) => `<option value="${v}" ${state.answers[key] === v ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
}
function errorSummary() {
  const entries = Object.entries(errors);
  return entries.length ? `<div class="error-summary" id="error-summary" tabindex="-1"><h2>Let’s check ${entries.length === 1 ? 'one answer' : 'these answers'}</h2><ul>${entries.map(([key, text]) => `<li><a href="#${key}">${escape(text)}</a></li>`).join('')}</ul></div>` : '';
}
function progress() {
  return `<nav class="progress" aria-label="Your progress"><ol>${steps.map((name, i) => `<li ${state.step === i + 1 ? 'aria-current="step"' : ''} class="${state.step > i + 1 ? 'complete' : ''}"><span class="step-number">${state.step > i + 1 ? tick : i + 1}</span><span>${name}</span></li>`).join('')}</ol></nav>`;
}
function welcome() {
  return `<main id="main" class="welcome"><div class="welcome-copy"><p class="eyebrow"><span class="small-line"></span> A clearer next step for your home</p><h1 id="page-title" tabindex="-1">Could a heat pump work for <span>your home?</span></h1><p class="lead">Start with a heating bill or photo. Our AI helper finds the details, you check them, and we help you see what’s possible.</p><ul class="welcome-benefits"><li>${tick}No technical knowledge needed</li><li>${tick}It’s fine if you don’t know every answer</li><li>${tick}Go at your own pace. Come back a step anytime.</li></ul><button class="button primary start-button" data-start-ai>Help me check my home ${chevron}</button><button class="back-button manual-start" data-start-manual>I’d rather answer the questions myself →</button><p class="quiet">About 3 minutes · No sign-up · You’re in control</p></div><aside class="welcome-aside"><div class="illustration-card"><span class="illustration-label">A warmer home. A clearer picture.</span>${homeArt}<div class="illustration-caption"><span class="leaf-mark" aria-hidden="true">↗</span><p>A first step towards<br><strong>heating with less fossil fuel.</strong></p></div></div><p class="aside-note">An initial check, with the final details confirmed by a heating professional.</p></aside><section class="sample-section" aria-labelledby="sample-heading"><div><h2 id="sample-heading">Just having a look?</h2><p>Explore a real, anonymised example home.</p></div><details class="sample-details"><summary>Try an example home</summary><div class="sample-list">${sampleError ? `<p role="status">${escape(sampleError)}</p><button class="button secondary" data-retry>Try loading examples again</button>` : samples.length ? samples.map(b => `<button class="sample-button" data-sample="${escape(b.building_id)}"><strong>${escape(b.building_id)} · ${b.construction_year} home</strong><span>${b.floor_area_m2} m² · ${escape(labels.heat_distribution[b.heat_distribution])}${b.pipe_system === 'single-pipe' ? ' · single-pipe' : ''}</span>${chevron}</button>`).join('') : '<p>Loading example homes…</p>'}</div></details></section></main>`;
}
const sparkle = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/></svg>';
function filledBadge(key) {
  const evidenceKey = key === 'amount' ? 'annual_consumption_kwh' : key;
  return reviewedEvidence().some(([k]) => k === evidenceKey) ? `<span class="filled-badge" data-evidence-for="${key}">✓ From your file</span>` : '';
}
function displayFact(key, value) {
  if (labels[key]?.[value]) return labels[key][value];
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (['yes', 'no', 'unknown'].includes(value)) return { yes: 'Yes', no: 'No', unknown: 'Not sure' }[value];
  const units = { annual_consumption_kwh: ' kWh', floor_area_m2: ' m²', flow_temperature_c: ' °C' };
  return (typeof value === 'number' ? formatNumber(value) : String(value)) + (units[key] || '');
}
function uploadPanel() {
  const result = extraction.result, busy = extraction.status === 'loading';
  const facts = Object.entries(result?.fields || {}).filter(([, f]) => f.value !== null);
  return `<section class="upload-panel" aria-labelledby="upload-title">
    <div class="assistant-heading"><span class="assistant-icon">${sparkle}</span><div><p class="assistant-kicker">Your home check helper</p><h2 id="upload-title">Let’s find the details for you.</h2></div><span class="ai-label">AI assisted</span></div>
    <p class="assistant-intro">A bill or photo is a good place to start. You’ll check anything we find before it’s used.</p>
    <ol class="assistant-steps" aria-label="How the helper works"><li class="${!result && !addedCount ? 'active' : ''}"><span>1</span> Add files</li><li class="${result ? 'active' : ''}"><span>2</span> Check details</li><li class="${!result && addedCount ? 'active' : ''}"><span>3</span> Fill the gaps</li></ol>
    ${addedCount ? `<div class="upload-success" id="upload-confirmed" tabindex="-1"><strong>✓ ${addedCount} ${addedCount === 1 ? 'detail added' : 'details added'} to your answers</strong><p>We’ll carry these through the check. You can change them at any time.</p><button type="submit" class="button primary">${returnToReview ? 'Back to my answers' : 'Continue to my heating'} ${chevron}</button></div>` : ''}
    ${aiAvailable === false ? '<p class="upload-unavailable" role="status">The AI helper is unavailable on this server. You can use the questions below.</p>' : ''}
    ${!result ? `${addedCount ? '<details class="add-more-files"><summary>Add another bill or photo</summary>' : ''}<div class="drop-zone" id="upload-drop-zone">
      <input class="sr-only" id="evidence-files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple aria-describedby="upload-formats" ${busy || aiAvailable === false ? 'disabled' : ''}>
      <label for="evidence-files"><span class="upload-arrow" aria-hidden="true">↑</span><strong>${chosenFiles.length ? 'Add or replace files' : 'Choose a bill or photo'}</strong><span>or drag files here</span></label>
      <p id="upload-formats">PDF, JPG, PNG or WebP · 3 files max · 10 MB total</p></div>
      ${chosenFiles.length ? `<ul class="chosen-files" aria-label="Selected files">${chosenFiles.map((f, i) => `<li><span class="file-kind" aria-hidden="true">${f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? 'PDF' : 'IMG'}</span><span><strong>${escape(f.name)}</strong><small>${formatNumber(f.size / 1024)} KB</small></span><button type="button" class="file-remove" data-remove-file="${i}" aria-label="Remove ${escape(f.name)}" ${busy ? 'disabled' : ''}>×</button></li>`).join('')}</ul>` : '<div class="upload-examples"><span>Useful files</span><p>Heating bill <b>·</b> Radiator photo <b>·</b> Property document</p></div>'}
      <button type="button" class="button primary extract-button" data-extract ${busy || !chosenFiles.length || aiAvailable === false ? 'disabled' : ''}>${busy ? '<span class="reading-dot" aria-hidden="true"></span> Reading your files…' : `Find my home details ${sparkle}`}</button>
      ${busy ? '<p class="reading-status" role="status">Checking your files for heating and home details. This may take up to 90 seconds.</p><button type="button" class="back-button" data-cancel-extraction>Continue without waiting</button>' : ''}
      <div class="upload-privacy"><p>Files are sent to OpenAI when you choose “Find my home details”. This app doesn’t save the originals.</p><details class="privacy-details"><summary>Before you upload</summary><p>Cover personal details such as your name, address and account number. A clear photo or the relevant pages of your bill are enough.</p></details></div>${addedCount ? '</details>' : ''}` : ''}
    ${extraction.error ? `<div role="alert" class="upload-error"><strong>Let’s try another way.</strong><p>${escape(extraction.error)}</p><button type="button" class="back-button" data-manual-details>Enter my details instead →</button></div>` : ''}
    ${result ? `<div class="extraction-review" id="extraction-review" tabindex="-1"><div class="review-heading"><h3>${facts.length ? `We found ${facts.length} ${facts.length === 1 ? 'detail' : 'details'}. Take a quick look.` : 'We couldn’t read enough details.'}</h3><p>${facts.length ? 'Tick the details you want to use. We’ve left uncertain readings and changes to your existing answers for you to check.' : 'Try a clearer image, or continue with the questions below.'}</p></div>
      ${facts.map(([key, f]) => {
        const current = key === 'annual_consumption_kwh' ? state.answers.amount : state.answers[key];
        const checked = f.confidence === 'high' && (!current || current === 'unknown');
        const checkLabel = f.confidence === 'high' ? 'Ready to check' : 'Needs a closer look';
        return `<article class="fact-card ${f.confidence !== 'high' ? 'needs-check' : ''}"><label class="fact-choice"><input type="checkbox" data-extracted-key="${escape(key)}" ${checked ? 'checked' : ''}><span><span class="fact-title">${escape(fieldLabels[key] || key)}</span><strong>${escape(displayFact(key, f.value))}</strong></span><span class="fact-status">${checkLabel}</span></label>
          ${current && current !== 'unknown' ? `<p class="existing-answer">Your answer: ${escape(key === 'annual_consumption_kwh' ? (Number.isFinite(parseNumber(current)) ? formatNumber(parseNumber(current)) : current) + ' ' + ({kwh: 'kWh', litres: 'litres', m3: 'm³'}[state.answers.unit] || '') : displayFact(key, current))}. Select this detail to replace it.</p>` : ''}
          ${key === 'consumption_full_year' ? '<p class="existing-answer">Applies only with the energy use from this bill.</p>' : ''}
          <details class="fact-evidence"><summary>See where this came from</summary><p>${escape(f.source_file)}</p><blockquote>${escape(f.evidence)}</blockquote></details></article>`;
      }).join('')}
      ${result.warnings.length ? `<details class="review-warnings"><summary>A few things we couldn’t confirm (${result.warnings.length})</summary><ul>${result.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></details>` : ''}
      <div class="extraction-actions">${facts.length ? '<button type="button" class="button primary" data-apply-extraction>Use selected details</button>' : ''}<button type="button" class="back-button" data-new-files>Try different files</button></div></div>` : ''}
    </section>`;
}
function helperPrompt() {
  const count = reviewedEvidence().length;
  const prompt = state.step === 2 ? (state.answers.heat_distribution !== 'unknown' ? 'Your heating details are below. Check what’s here and add anything you know.' : 'Do you heat your rooms with radiators, underfloor heating, or both?') : state.step === 3 ? (state.answers.amount ? 'Your energy use is filled in. Check the period, then tell us how many people live at home.' : 'A full year of heating energy helps us estimate what your home needs.') : 'Check the answers below. You can change anything before the assessment.';
  return `<div class="helper-prompt"><span class="assistant-icon">${sparkle}</span><div><strong>${count ? `${count} ${count === 1 ? 'detail carried' : 'details carried'} over from your files` : 'A little help along the way'}</strong><p>${prompt}</p></div></div>`;
}
function reviewedEvidence() {
  return Object.entries(state.evidence || {}).filter(([key, f]) => values()[key] === f.value);
}
function evidenceSummary() {
  const facts = reviewedEvidence();
  return facts.length ? `<details class="extra-details"><summary>Details confirmed from your files (${facts.length})</summary><ul>${facts.map(([key, f]) => `<li><strong>${escape(fieldLabels[key])}</strong>: ${escape(f.value)}<br>${escape(f.source_file)} · ${escape(f.confidence)} confidence<br>${escape(f.evidence)}</li>`).join('')}</ul></details>` : '';
}
function homeForm() {
  return `${uploadPanel()}<details id="manual-home-details" class="manual-home-details" ${homeDetailsOpen || Object.keys(errors).length ? 'open' : ''}><summary>${addedCount ? 'Check or add your home details' : 'Or, tell us about your home yourself'}<span>No files needed. Estimates are welcome.</span></summary><div class="manual-home-content">${field('floor_area_m2', 'How much space do you heat?', 'Use the floor area of the rooms you heat. A rough figure is fine.', { unit: 'm²', placeholder: 'For example, 150', mode: 'decimal' })}${field('construction_year', 'When was your home built?', 'You may find the year in your property documents.', { placeholder: 'For example, 1985' })}${choices('renovation_status', 'Has the insulation been improved?', [['unrenovated', 'No major improvements'], ['partially', 'Some improvements', 'For example, new windows or roof insulation'], ['fully', 'Comprehensive renovation', 'Major insulation improvements across the home'], ['unknown', 'I’m not sure']], 'Choose the answer that fits best.')}</div></details>`;
}
function heatingForm() {
  return `${select('energy_carrier', 'What do you use to heat your home?', Object.entries(labels.energy_carrier), 'You can usually find this on your heating bill.')}${choices('heat_distribution', 'How does the heat reach your rooms?', [['radiators', 'Radiators', 'Heaters attached to the walls'], ['underfloor', 'Underfloor heating', 'Warm water runs through pipes beneath the floor'], ['mixed', 'Both', 'Some rooms have radiators, others have floor heating'], ['unknown', 'I’m not sure']])}<div class="help-note"><span aria-hidden="true">i</span><p><strong>Radiators can work with heat pumps, too.</strong><br>Their size and the water temperature they need matter more than simply having them.</p></div>${state.answers.heat_distribution !== 'underfloor' ? `${field('radiator_count', 'How many radiators do you have?', 'Count the radiators in the rooms you heat. Skip this if you only have underfloor heating.', { placeholder: 'For example, 12' })}${choices('radiator_type', 'What do most of your radiators look like?', [['33', 'Three panels', 'Thick, with three flat panels one behind the other'], ['22', 'Two panels', 'Two flat panels with fins between them'], ['11', 'One panel', 'A single thin flat panel'], ['unknown', 'I’m not sure']], 'Look at a radiator from the side. Bigger radiators work better with a heat pump.')}` : '<p class="small">You can skip radiator details because you have underfloor heating.</p>'}`;
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
  return `${evidenceSummary()}${state.sample ? `<div class="sample-notice">Example home ${escape(a.building_id)}. These are anonymised project details. You can change any answer.</div>` : ''}${reviewGroup('Your home', 1, [['Heated area', answer('floor_area_m2', ' m²')], ['Year built', answer('construction_year')], ['Insulation improvements', answer('renovation_status')]])}${reviewGroup('Your heating', 2, [['Energy source', answer('energy_carrier')], ['Room heating', answer('heat_distribution')], ['Radiators', answer('radiator_count')], ['Radiator type', answer('radiator_type')]])}${reviewGroup('Your energy use', 3, [['Energy used', answer('amount', ' ' + ({ kwh: 'kWh', litres: 'litres', m3: 'm³' }[a.unit]))], ['Covers a full year', answer('consumption_full_year')], ['People at home', answer('persons_in_household')], ['Hot water from heating', answer('hot_water_via_heating')], ['Water temperature', answer('flow_temperature_c', ' °C')], ['Pipe layout', answer('pipe_system')], ['Another heat source', answer('other_heat_source')], ['Solar hot water', answer('solar_thermal')], ...(a.building_notes ? [['Your notes', escape(a.building_notes)]] : [])])}<p class="review-reassurance">An unanswered question is okay. We’ll explain where more information would help.</p>`;
}
function formPage() {
  const titles = ['Your home check starts here.', 'How do you keep your home warm?', 'A little about your energy use.', 'Does everything look right?'];
  const intros = ['Let AI help with the paperwork, or tell us what you know.', 'Choose what you know. You can always come back and change an answer.', 'These details help us give a more useful estimate. Nothing here needs to be exact.', 'You’re in control. Check your answers before we put your first assessment together.'];
  const content = [homeForm, heatingForm, energyForm, review][state.step - 1]();
  return `<main id="main" class="flow-main">${progress()}<div class="flow-layout"><section class="form-panel"><p class="eyebrow">Step ${state.step} of 4</p><h1 id="page-title" tabindex="-1">${titles[state.step - 1]}</h1><p class="intro">${intros[state.step - 1]}</p>${errorSummary()}${state.step > 1 ? helperPrompt() : ''}<form id="home-form" novalidate>${content}<div class="form-actions"><button type="button" class="back-button" data-go="${returnToReview ? 4 : state.step - 1}"><span aria-hidden="true">←</span> ${returnToReview ? 'Cancel changes' : 'Back'}</button><button type="submit" class="button primary">${state.step === 4 ? 'See my assessment' : returnToReview ? 'Save changes' : state.step === 1 ? 'Continue to my heating' : 'Continue'} ${chevron}</button></div></form></section><aside class="flow-aside"><div class="encouragement"><span class="aside-kicker">A little reassurance</span><h2>You don’t need to be an expert.</h2><p>“I’m not sure” is a useful answer, too. We’ll tell you which details a heating professional can help with.</p><hr><p class="small">Your answers stay in this tab. You can go back without losing them.</p></div><p class="prototype-note">This is an initial indication, not a final design or an installation quote.</p></aside></div></main>`;
}
let assessment = { key: null, status: 'idle', data: null };
async function runAssessment(key, input) {
  assessment = { key, status: 'loading', data: null };
  try {
    const data = await assess(input);
    if (assessment.key === key) assessment = { key, status: 'done', data };
  } catch { if (assessment.key === key) assessment = { key, status: 'error', data: null }; }
  if (state.step === 5 && assessment.key === key) {
    render(); document.querySelector('#page-title')?.focus();
    announce(assessment.status === 'done' ? 'Your first assessment is ready.' : 'The assessment could not be completed.');
  }
}
function verdictMeta(d, hasCases) {
  if (d.verdict === 'green') return { cls: 'green', symbol: tick, eyebrow: 'Green · Likely suitable', title: 'A promising starting point.' };
  if (d.verdict === 'red') return { cls: 'red', symbol: '!', eyebrow: 'Red · Changes needed first', title: 'Some changes are needed first.' };
  if (d.verdict_kind === 'workable') return { cls: 'yellow', symbol: '~', eyebrow: 'Yellow · Works at a higher water temperature', title: 'Possible, with higher running costs.' };
  return { cls: 'yellow', symbol: '?', eyebrow: 'Yellow · More checks needed', title: hasCases ? 'Possible, with a few checks.' : 'Let’s fill in a few gaps.' };
}
const markers = { positive: '✓', obstacle: '!', unknown: '?', action: '→', hint: 'i' };
const caseNames = { 33: 'Three-panel radiators (type 33)', 22: 'Two-panel radiators (type 22)', 11: 'One-panel radiators (type 11)', underfloor: 'Underfloor heating' };
function resultPage() {
  const input = { ...toCustomerInput(values()), extraction_evidence: Object.fromEntries(reviewedEvidence()) }, key = JSON.stringify(input);
  if (assessment.key !== key) runAssessment(key, input);
  const top = '<div class="result-topline"><button class="back-button" data-go="4">← Review my answers</button><span>YOUR FIRST ASSESSMENT</span></div>';
  if (assessment.status === 'loading') return `<main id="main" class="result-main">${top}<section class="verdict-panel" aria-busy="true"><div><h1 id="page-title" tabindex="-1">Checking your answers…</h1><p class="lead">This usually takes a moment.</p></div></section></main>`;
  if (assessment.status === 'error') return `<main id="main" class="result-main">${top}<section class="verdict-panel yellow"><div><h1 id="page-title" tabindex="-1">We couldn’t complete the check.</h1><p class="lead">The calculation did not respond. Your answers are still saved in this tab.</p><div class="result-actions"><button class="button primary" data-retry-assess>Try again</button></div></div></section></main>`;
  const { decision: d, '01_heat_load': h, '02_radiator_check': r, '03_operating_cost': c } = assessment.data.outputs;
  const load = h.heating_load_kw, cases = r.flow_temp_c.by_case, cost = c.cost_eur_per_year, v = verdictMeta(d, Boolean(cases));
  const temps = ([lo, hi]) => (lo === hi ? `${lo} °C` : `${lo}–${hi} °C`);
  const boundaries = d.boundaries.map(b => `<div class="boundary"><h3>What would settle it</h3><p>The combined rated output of your radiators decides the result:</p><ul>${b.thresholds.map(t => `<li><strong>${escape(t.range)} kW</strong> in total (${escape(t.per_radiator)} kW per radiator): ${escape(t.result)}</li>`).join('')}</ul><p class="small">${escape(b.how)}.</p></div>`).join('');
  return `<main id="main" class="result-main">${top}<section class="verdict-panel ${v.cls}"><div class="verdict-symbol" aria-hidden="true">${v.symbol}</div><div><p class="eyebrow">${v.eyebrow}</p><h1 id="page-title" tabindex="-1">${v.title}</h1><p class="lead">${escape(d.summary)}</p></div></section>`
    + '<p class="result-context">This prototype gives a rough first indication. Your heating professional will confirm whether it works for your home.</p><div class="result-layout"><div>'
    + `<section class="result-section"><h2>What this means for your home</h2>${d.reasons.length ? `<ul class="reason-list">${d.reasons.map(x => `<li><span class="reason-marker ${escape(x.type)}" aria-hidden="true">${markers[x.type] || 'i'}</span><p>${escape(x.text)}</p></li>`).join('')}</ul>` : '<p>We don’t yet have enough information about your home or heating. Add the details you know, and we’ll help you see what remains to be checked.</p>'}</section>`
    + (d.homeowner_can_provide.length || boundaries ? `<section class="next-question"><span class="eyebrow">Your next useful step</span><h2>A little more information can help.</h2>${d.homeowner_can_provide.length ? `<ul>${d.homeowner_can_provide.map(x => `<li>${escape(x)}</li>`).join('')}</ul>` : ''}${boundaries}<div class="next-step-actions"><button class="button primary" data-add-evidence>Add a bill or photo ${sparkle}</button><button class="back-button" data-go="4">Update my answers →</button></div><p class="small">Our AI helper can look for the missing details. You’ll review them before your result changes.</p></section>` : '')
    + `<section class="result-section"><h2>Keep the next conversation simple.</h2><p>A heating professional will need to:</p><ol class="checklist">${d.technician_checks.map(x => `<li>${escape(x)}</li>`).join('')}</ol></section></div>`
    + `<aside class="estimates"><h2>Your estimates, explained</h2><p>Two ways to estimate the heating power your home needs.</p><div class="estimate"><span>From your home’s size and age</span><strong>${range(load.by_area)}</strong></div><div class="estimate"><span>From your energy use</span><strong>${range(load.by_consumption)}</strong></div>`
    + (load.consistent === false ? '<p class="estimate-warning"><strong>These estimates disagree.</strong> Both are kept in the check; a professional should review why before sizing a heat pump.</p>' : '')
    + `<div class="estimate"><span>Used for this check</span><strong>${range(load.used)}</strong></div><p class="small">kW describes heating power. These rough estimates are not the size of heat pump you should buy.</p>`
    + (cases ? `<div class="estimate"><span>Water temperature your heating would need</span><dl class="flow-list">${Object.entries(cases).map(([t, x]) => `<div><dt>${escape(caseNames[t] || t)}</dt><dd>${temps(x)}</dd></div>`).join('')}</dl><p class="small">Up to 55 °C works efficiently. 55–60 °C works with higher running costs. Above 60 °C some radiators should be upgraded.</p></div>` : '')
    + `<details class="cost-details"><summary>What about running costs?</summary><p>Illustrative annual energy costs using fixed challenge prices.</p><dl class="cost-list"><div><dt>Current heating</dt><dd>${cost.today === null ? 'More information needed' : money(cost.today)}</dd></div><div><dt>Heat pump scenarios</dt><dd>${cost.heat_pump ? cost.heat_pump.map(money).filter((x, i, a) => a.indexOf(x) === i).join('–') : 'More information needed'}</dd></div>${cost.saving ? `<div><dt>Possible saving per year</dt><dd>${cost.saving.map(money).filter((x, i, a) => a.indexOf(x) === i).join('–')}</dd></div>` : ''}</dl>${cost.note ? `<p class="small">Note: ${escape(cost.note)}.</p>` : ''}</details></aside></div>`
    + `<details class="assumptions"><summary>See the assumptions behind this check</summary><div><h2>Assumptions behind this first check</h2><ul>${d.assumptions.map(x => `<li>${escape(x)}</li>`).join('')}<li>Radiator ratings are placeholder values until checked against manufacturer data. No final equipment sizing is provided.</li></ul></div></details>`
    + '<div class="result-actions"><button class="button primary" data-download>Save my summary <span aria-hidden="true">↓</span></button><button class="button secondary" data-print>Print this assessment</button><button class="reset-button" data-reset>Start a new check</button></div><p class="quiet">Your summary includes the details and questions to discuss with a heating professional.</p></main>';
}
function render() {
  document.documentElement.classList.toggle('larger-text', state.larger);
  document.querySelector('#text-size').setAttribute('aria-pressed', String(state.larger));
  app.innerHTML = (state.step === 0 ? welcome() : state.step === 5 ? resultPage() : formPage()) + `<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Start a new home check?</h2><p>This clears the answers in this tab. Save your summary first if you want to keep it.</p><div class="dialog-actions"><button class="button secondary" data-cancel-reset autofocus>Keep my answers</button><button class="button primary" data-confirm-reset>Start a new check</button></div></dialog>`;
  document.title = `${state.step === 0 ? 'Heat pump home check' : state.step === 5 ? 'Your first assessment' : steps[state.step - 1]} · nuuEnergy`;
}
app.addEventListener('input', event => {
  const el = event.target;
  if (el.name && Object.hasOwn(state.answers, el.name)) { state.answers[el.name] = el.value; document.querySelectorAll(`[data-evidence-for="${el.name}"]`).forEach(b => b.remove()); save(); }
});
app.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'evidence-files') { chooseFiles([...el.files]); return; }
  if (el.name && Object.hasOwn(state.answers, el.name)) {
    state.answers[el.name] = el.value;
    if (el.name === 'energy_carrier') { state.answers.unit = 'kwh'; state.answers.amount = ''; }
    save();
    if (el.name === 'heat_distribution') { render(); document.querySelector(`[name="heat_distribution"][value="${el.value}"]`)?.focus(); }
  }
});
function chooseFiles(files) {
  if (extraction.status === 'loading' || aiAvailable === false) return;
  try { validateFiles(files); chosenFiles = files; extraction = { status: 'idle', result: null, error: '' }; }
  catch (error) { extraction = { status: 'error', result: null, error: error.message }; }
  render(); document.querySelector(extraction.error ? '#evidence-files' : '[data-extract]')?.focus();
  announce(extraction.error || `${chosenFiles.length} ${chosenFiles.length === 1 ? 'file ready' : 'files ready'}. Choose Find my home details to continue.`);
}
app.addEventListener('dragover', event => {
  const zone = event.target.closest('#upload-drop-zone');
  if (zone) { event.preventDefault(); zone.classList.add('drag-over'); }
});
app.addEventListener('dragleave', event => event.target.closest('#upload-drop-zone')?.classList.remove('drag-over'));
app.addEventListener('drop', event => {
  if (event.target.closest('#upload-drop-zone')) { event.preventDefault(); chooseFiles([...event.dataTransfer.files]); }
});
app.addEventListener('toggle', event => {
  if (event.target.id === 'manual-home-details') homeDetailsOpen = event.target.open;
}, true);
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
  if (button.hasAttribute('data-start-ai') || button.hasAttribute('data-add-evidence')) {
    homeDetailsOpen = false; returnToReview = false; editSnapshot = null; setStep(1);
  }
  if (button.hasAttribute('data-start-manual')) { homeDetailsOpen = true; setStep(1); document.querySelector('#manual-home-details')?.scrollIntoView({ block: 'start' }); }
  if (button.hasAttribute('data-manual-details')) {
    homeDetailsOpen = true; const details = document.querySelector('#manual-home-details');
    if (details) { details.open = true; details.scrollIntoView({ block: 'start' }); document.querySelector('#floor_area_m2')?.focus(); }
  }
  if (button.hasAttribute('data-new-files')) { extraction = { status: 'idle', result: null, error: '' }; render(); document.querySelector('#evidence-files')?.focus(); }
  if (button.hasAttribute('data-remove-file')) {
    chosenFiles.splice(Number(button.dataset.removeFile), 1); extraction.error = ''; render(); document.querySelector('#evidence-files')?.focus();
  }
  if (button.hasAttribute('data-cancel-extraction')) { uploadGeneration++; extraction = { status: 'idle', result: null, error: '' }; homeDetailsOpen = true; render(); announce('You can continue with the questions.'); }
  if (button.hasAttribute('data-extract')) {
    const files = [...chosenFiles];
    const generation = ++uploadGeneration;
    extraction = { status: 'loading', result: null, error: '' }; render();
    try {
      const result = await extractFiles(files);
      if (generation !== uploadGeneration) return;
      extraction = { status: 'done', result, error: '' };
    } catch (error) {
      if (generation !== uploadGeneration) return;
      extraction = { status: 'error', result: null, error: error.message || 'Extraction unavailable. Enter your answers manually.' };
    }
    if (state.step === 1) { render(); document.querySelector('#extraction-review')?.focus(); }
    announce(extraction.status === 'done' ? 'Extraction ready. Review the facts before using them.' : extraction.error);
  }
  if (button.hasAttribute('data-apply-extraction')) {
    const selected = [...document.querySelectorAll('[data-extracted-key]:checked')].map(el => el.dataset.extractedKey);
    if (!selected.length) { announce('Select at least one detail to use, or continue with the questions below.'); return; }
    state.answers = applyFields(state.answers, extraction.result.fields, selected);
    const normalized = values();
    state.evidence ||= {};
    for (const key of selected) {
      if (key === 'consumption_full_year' && !selected.includes('annual_consumption_kwh')) continue;
      state.evidence[key] = { ...extraction.result.fields[key], value: normalized[key] };
    }
    addedCount = selected.filter(k => k !== 'consumption_full_year' || selected.includes('annual_consumption_kwh')).length; chosenFiles = [];
    extraction = { status: 'idle', result: null, error: '' };
    state.sample = false; save(); render(); document.querySelector('#upload-confirmed')?.focus(); announce('Selected details added. You can edit every answer before your assessment.');
  }
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
  if (button.hasAttribute('data-confirm-reset')) { state.answers = empty(); state.sample = false; state.evidence = {}; chosenFiles = []; addedCount = 0; homeDetailsOpen = false; uploadGeneration++; extraction = { status: 'idle', result: null, error: '' }; returnToReview = false; setStep(0); announce('Your answers have been cleared.'); }
  if (button.hasAttribute('data-print')) window.print();
  if (button.hasAttribute('data-download')) downloadSummary();
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
  state.answers = a; state.sample = true; state.evidence = {}; chosenFiles = []; addedCount = 0; homeDetailsOpen = false; uploadGeneration++; extraction = { status: 'idle', result: null, error: '' }; setStep(4); announce(`Example home ${id} loaded. Review the answers before continuing.`);
}
async function loadSamples() {
  try {
    const response = await fetch('/api/samples');
    if (!response.ok) throw new Error('Unavailable');
    samples = await response.json(); sampleError = '';
  } catch { sampleError = 'Example homes could not be loaded. You can still check your own home.'; }
  if (state.step === 0) render();
}
function downloadSummary() {
  if (assessment.status !== 'done') return;
  const { decision: d, '01_heat_load': h, '02_radiator_check': r, '03_operating_cost': c } = assessment.data.outputs;
  const cost = c.cost_eur_per_year, money2 = x => (x ? x.map(money).join('–') : 'More information needed');
  const lines = ['nuuEnergy — Your first heat pump assessment', 'Prototype indication; a heating professional must verify the details.', '', `Result: ${d.verdict.toUpperCase()}`, d.summary, '',
    'CONFIRMED DOCUMENT EVIDENCE', ...reviewedEvidence().map(([key, f]) => `- ${fieldLabels[key]}: ${f.value} (${f.confidence}; ${f.source_file}) — ${f.evidence}`), '',
    'WHAT WE KNOW', ...d.reasons.map(x => '- ' + x.text), '',
    'HEATING POWER ESTIMATES', `Size/age: ${range(h.heating_load_kw.by_area)}`, `Consumption: ${range(h.heating_load_kw.by_consumption)}`, `Used for this check: ${range(h.heating_load_kw.used)}`, '',
    'WATER TEMPERATURE NEEDED', ...Object.entries(r.flow_temp_c.by_case || {}).map(([t, [lo, hi]]) => `- ${caseNames[t] || t}: ${lo}–${hi} °C`), '',
    'TECHNICIAN CHECKS', ...d.technician_checks.map(x => '- ' + x), '',
    'OPEN QUESTIONS', ...d.homeowner_can_provide.map(x => '- ' + x), '',
    'ASSUMPTIONS', ...d.assumptions.map(x => '- ' + x), '',
    'ILLUSTRATIVE ANNUAL ENERGY COSTS', `Current heating: ${cost.today === null ? 'More information needed' : money(cost.today)}`, `Heat pump scenarios: ${money2(cost.heat_pump)}`, ...(cost.note ? [`Note: ${cost.note}`] : [])];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'my-heat-pump-home-check.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000); announce('Your summary has been prepared for download.');
}
addedCount = reviewedEvidence().length;
render(); loadSamples();
fetch('/api/ai-status').then(r => r.json()).then(status => { aiAvailable = status.available; if (state.step === 1 && extraction.status === 'idle' && !chosenFiles.length) render(); }).catch(() => {});
