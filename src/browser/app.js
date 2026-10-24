import { resolveReview, clearUnknownAnswers } from './evidence.js';
import { assess, demo, scenarios, toCustomerInput } from './assessment.js';
import { extractFiles, applyFields, fieldLabels, uploadFiles, validateFiles } from './extraction.js';
import { emptyQc, questionHtml, progressBar, nextId, prevId, visible, answerText, TITLES, CONSUMPTION_RANGES, RADIATOR_RANGES, RENOVATION } from './quickcheck.js';

const app = document.querySelector('#app');
const storageKey = 'nuu-home-check-v1';
const empty = () => ({ construction_year: '', floor_area_m2: '', renovation_status: 'unknown', energy_carrier: 'unknown', heat_distribution: 'unknown', amount: '', unit: 'kwh', consumption_full_year: 'unknown', persons_in_household: '', hot_water_via_heating: 'unknown', flow_temperature_c: '', pipe_system: 'unknown', radiator_count: '', radiator_type: 'unknown', other_heat_source: 'unknown', solar_thermal: 'unknown', building_notes: '', building_id: 'HOME' });
let state = { step: 0, answers: empty(), larger: false, sample: false, evidence: {}, evidenceReviews: {}, evidenceLedger: null, confirm: {}, mode: 'both', q: 'heating', qc: emptyQc(), qcReturn: false };
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (saved?.answers && Number.isInteger(saved.step) && saved.step >= 0 && saved.step <= 7) state = { ...state, ...saved, answers: { ...empty(), ...saved.answers }, qc: { ...emptyQc(), ...(saved.qc || {}), photos: { valve: null, side: null } } };
  if (['reading'].includes(state.qc.bill)) state.qc.bill = 'pending';
  if (['reading'].includes(state.qc.rad)) state.qc.rad = 'pending';
} catch { /* Storage is optional; the flow still works in memory. */ }
let errors = {}, returnToReview = false, editSnapshot = null, samples = [], sampleError = '';
let extraction = { status: 'idle', result: null, error: '' }, aiAvailable = null, uploadGeneration = 0;
let chosenFiles = [], homeDetailsOpen = false, addedCount = 0, uploadSave = null, uploadPromise = Promise.resolve();
const steps = ['Quick check', 'Quick check', 'Quick check', 'Check your answers'];
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
  if (push) history.pushState({ step }, '', step ? `#${{ 5: 'result', 6: 'confirm', 7: 'what-if' }[step] || 'step-' + step}` : location.pathname);
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
  const items = [['Quick check', state.step > 1], ['Check your answers', state.step > 4]];
  return `<nav class="progress" aria-label="Your progress"><ol>${items.map(([name, done], i) => `<li ${(i === 0 && state.step < 4) || (i === 1 && state.step === 4) ? 'aria-current="step"' : ''} class="${done ? 'complete' : ''}"><span class="step-number">${done ? tick : i + 1}</span><span>${name}</span></li>`).join('')}</ol></nav>`;
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
function periodText(billing) {
  if (!billing) return '';
  const dates = [billing.start_date, billing.end_date].filter(Boolean).join(' → ');
  const amount = billing.consumption_amount == null ? '' : `${formatNumber(billing.consumption_amount)} ${{ kwh: 'kWh', litres: 'litres', m3: 'm³' }[billing.consumption_unit] || ''}`;
  return [dates, amount, billing.days ? `${billing.days} days` : ''].filter(Boolean).join(' · ');
}
function conflictsPanel(result) {
  if (!result?.conflicts?.length) return '';
  return `<section class="evidence-conflicts" aria-labelledby="conflicts-title"><h3 id="conflicts-title">Let’s settle ${result.conflicts.length === 1 ? 'one difference' : 'these differences'} first.</h3><p>Your earlier answers and files are kept. Choose what applies to this home; we won’t combine different years of bills.</p>${result.conflicts.map(c => `<fieldset class="conflict-field"><legend>${escape(c.question)}</legend>${c.candidates.map(f => `<label class="conflict-choice"><input type="radio" name="conflict:${escape(c.field)}" value="${escape(f.id)}"><span><strong>${escape(displayFact(c.field, f.value))}</strong><small>${escape(f.source_file)}${f.page ? ` · page ${f.page}` : ''}</small>${periodText(f.billing) ? `<small>${escape(periodText(f.billing))}</small>` : ''}<span>${escape(f.evidence)}</span></span></label>`).join('')}${c.current_value !== null ? `<label class="conflict-choice"><input type="radio" name="conflict:${escape(c.field)}" value="answer"><span>Keep my answer: ${escape(displayFact(c.field, c.current_value))}</span></label>` : ''}<label class="conflict-choice"><input type="radio" name="conflict:${escape(c.field)}" value="unknown"><span>Leave this unknown for a professional to check</span></label></fieldset>`).join('')}<p class="field-error" id="conflict-error" role="alert"></p></section>`;
}
function historyPanel() {
  const ledger = state.evidenceLedger;
  if (!ledger?.documents?.length) return '';
  return `<details class="evidence-history"><summary>Your evidence history · ${ledger.documents.length} ${ledger.documents.length === 1 ? 'file' : 'files'}</summary><p class="small">These are observations from files. Only details you choose are used in the assessment.</p>${ledger.documents.map(d => `<article><strong>${escape(d.name)}</strong>${periodText(d.billing) ? `<p>${escape(periodText(d.billing))}</p>` : ''}<ul>${(ledger.observations || []).filter(o => o.file_id === d.id).map(o => `<li>${escape(fieldLabels[o.field] || o.field)}: ${escape(displayFact(o.field, o.value))}<br><small>${escape(o.evidence)}</small></li>`).join('') || '<li>No usable assessment details found.</li>'}</ul></article>`).join('')}</details>`;
}
function followUpPanel() {
  const question = assessment.data?.follow_up;
  if (!question) return '';
  if (state.skippedQuestion === `${assessment.key}:${question.id}`) return '<p class="review-reassurance">We’ll keep that detail open for a heating professional to check. Your current assessment still uses the available evidence.</p>';
  return `<section class="next-question focused-question"><p class="eyebrow">Your next useful question</p><h2>${escape(question.title)}</h2><p>${escape(question.reason)}</p><p class="small">${escape(question.upload_hint)}</p><div class="next-step-actions"><button class="button primary" data-add-evidence>Add supporting evidence ${sparkle}</button><button class="back-button" data-answer-followup>Answer this myself →</button><button class="back-button" data-skip-followup>I don’t know</button></div></section>`;
}
function uploadPanel() {
  const result = extraction.result, busy = extraction.status === 'loading';
  const facts = Object.entries(result?.fields || {}).filter(([, f]) => f.value !== null);
  return `<section class="upload-panel" aria-labelledby="upload-title">
    <div class="assistant-heading"><span class="assistant-icon">${sparkle}</span><div><p class="assistant-kicker">Your home check helper</p><h2 id="upload-title">Let’s find the details for you.</h2></div><span class="ai-label">AI assisted</span></div>
    <p class="assistant-intro">A bill or photo is a good place to start. You’ll check anything we find before it’s used.</p>
    <ol class="assistant-steps" aria-label="How the helper works"><li class="${!result && (!addedCount || chosenFiles.length) ? 'active' : ''}"><span>1</span> Add files</li><li class="${result ? 'active' : ''}"><span>2</span> Check details</li><li class="${!result && addedCount && !chosenFiles.length ? 'active' : ''}"><span>3</span> Fill the gaps</li></ol>
    ${addedCount ? `<div class="upload-success" id="upload-confirmed" tabindex="-1"><strong>✓ ${addedCount} ${addedCount === 1 ? 'detail added' : 'details added'} to your answers</strong><p>We’ll carry these through the check. You can change them at any time.</p><button type="submit" class="button primary">${returnToReview ? 'Back to my answers' : 'Continue to my heating'} ${chevron}</button></div>` : ''}
    ${aiAvailable === false ? '<p class="upload-unavailable" role="status">The AI helper is unavailable on this server. You can use the questions below.</p>' : ''}
    ${!result ? `${addedCount ? `<details class="add-more-files" ${chosenFiles.length || busy ? 'open' : ''}><summary>Add another bill or photo</summary>` : ''}<div class="drop-zone" id="upload-drop-zone">
      <input class="sr-only" id="evidence-files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple aria-describedby="upload-formats" ${busy ? 'disabled' : ''}>
      <label for="evidence-files"><span class="upload-arrow" aria-hidden="true">↑</span><strong>${chosenFiles.length ? 'Add or replace files' : 'Choose a bill or photo'}</strong><span>or drag files here</span></label>
      <p id="upload-formats">PDF, JPG, PNG or WebP · 3 files max · 10 MB total</p></div>
      ${chosenFiles.length ? `<ul class="chosen-files" aria-label="Selected files">${chosenFiles.map((f, i) => `<li><span class="file-kind" aria-hidden="true">${f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? 'PDF' : 'IMG'}</span><span><strong>${escape(f.name)}</strong><small>${formatNumber(f.size / 1024)} KB</small></span><button type="button" class="file-remove" data-remove-file="${i}" aria-label="Remove ${escape(f.name)}" ${busy ? 'disabled' : ''}>×</button></li>`).join('')}</ul>` : '<div class="upload-examples"><span>Useful files</span><p>Heating bill <b>·</b> Radiator photo <b>·</b> Property document</p></div>'}
      ${uploadSave ? `<p class="upload-saved ${uploadSave.status}" role="status">${uploadSave.status === 'saving' ? 'Saving to your customer folder…' : uploadSave.status === 'saved' ? `✓ ${uploadSave.paths.length} ${uploadSave.paths.length === 1 ? 'file saved' : 'files saved'} with your home details${uploadSave.duplicates ? ` · ${uploadSave.duplicates} already saved, no duplicate copy needed` : ''}` : `Could not save the files: ${escape(uploadSave.error)}`}</p>` : ''}
      <button type="button" class="button primary extract-button" data-extract ${busy || !chosenFiles.length || aiAvailable === false ? 'disabled' : ''}>${busy ? '<span class="reading-dot" aria-hidden="true"></span> Reading your files…' : `Find my home details ${sparkle}`}</button>
      ${busy ? '<p class="reading-status" role="status">Checking your files for heating and home details. This may take up to 90 seconds.</p><button type="button" class="back-button" data-cancel-extraction>Continue without waiting</button>' : ''}
      <div class="upload-privacy"><p>Your files are saved to your customer folder on this server. They are sent to OpenAI only when you choose “Find my home details”.</p><details class="privacy-details"><summary>Before you upload</summary><p>Cover personal details such as your name, address and account number. A clear photo or the relevant pages of your bill are enough.</p></details></div>${addedCount ? '</details>' : ''}` : ''}
    ${extraction.error ? `<div role="alert" class="upload-error"><strong>Let’s try another way.</strong><p>${escape(extraction.error)}</p><button type="button" class="back-button" data-manual-details>Enter my details instead →</button></div>` : ''}
    ${result ? `<div class="extraction-review" id="extraction-review" tabindex="-1">${conflictsPanel(result)}<div class="review-heading"><h3>${facts.length ? `We have ${facts.length} ${facts.length === 1 ? 'detail' : 'details'}. Take a quick look.` : 'We couldn’t read enough details.'}</h3><p>${facts.length ? 'Tick the details you want to use. We’ve left uncertain readings and changes to your existing answers for you to check.' : 'Try a clearer image, or continue with the questions below.'}</p></div>
      ${facts.map(([key, f]) => {
        const current = key === 'annual_consumption_kwh' ? state.answers.amount : state.answers[key];
        const checked = f.confidence === 'high' && (!current || current === 'unknown');
        const checkLabel = f.confidence === 'high' ? 'Ready to check' : 'Needs a closer look';
        return `<article class="fact-card ${f.confidence !== 'high' ? 'needs-check' : ''}"><label class="fact-choice"><input type="checkbox" data-extracted-key="${escape(key)}" ${checked ? 'checked' : ''}><span><span class="fact-title">${escape(fieldLabels[key] || key)}</span><strong>${escape(displayFact(key, f.value))}</strong></span><span class="fact-status">${checkLabel}</span></label>
          ${current && current !== 'unknown' ? `<p class="existing-answer">Your answer: ${escape(key === 'annual_consumption_kwh' ? (Number.isFinite(parseNumber(current)) ? formatNumber(parseNumber(current)) : current) + ' ' + ({kwh: 'kWh', litres: 'litres', m3: 'm³'}[state.answers.unit] || '') : displayFact(key, current))}. Select this detail to replace it.</p>` : ''}
          ${key === 'consumption_full_year' ? '<p class="existing-answer">Applies only with the energy use from this bill.</p>' : ''}
          <details class="fact-evidence"><summary>See where this came from</summary><p>${escape(f.source_file)}${f.page ? ` · page ${f.page}` : ''}</p>${periodText(f.billing) ? `<p>${escape(periodText(f.billing))}</p>` : ''}<blockquote>${escape(f.evidence)}</blockquote></details></article>`;
      }).join('')}
      ${result.warnings.length ? `<details class="review-warnings"><summary>A few things we couldn’t confirm (${result.warnings.length})</summary><ul>${result.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></details>` : ''}
      <div class="extraction-actions">${facts.length || result.conflicts?.length ? '<button type="button" class="button primary" data-apply-extraction>Use reviewed details</button>' : ''}<button type="button" class="back-button" data-new-files>Try different files</button></div></div>` : ''}
    ${result?.metrics ? `<p class="extraction-metrics" role="status">${result.metrics.total_documents} ${result.metrics.total_documents === 1 ? 'file' : 'files'} in your evidence history · ${result.metrics.files_read} newly read · ${result.metrics.cached_files} reused${result.metrics.api_calls === 0 ? ' · No new AI request needed' : ''}</p>${result.metrics.remaining_files ? '<button type="button" class="button secondary" data-read-remaining>Read remaining files</button>' : ''}` : ''}
    ${historyPanel()}</section>`;
}
function helperPrompt() {
  const count = reviewedEvidence().length;
  const prompt = state.step === 2 ? (state.answers.heat_distribution !== 'unknown' ? 'Your heating details are below. Check what’s here and add anything you know.' : 'Do you heat your rooms with radiators, underfloor heating, or both?') : state.step === 3 ? (state.answers.amount ? 'Your energy use is filled in. Check the period, then tell us how many people live at home.' : 'A full year of heating energy helps us estimate what your home needs.') : 'Check the answers below. You can change anything before the assessment.';
  return `<div class="helper-prompt"><span class="assistant-icon">${sparkle}</span><div><strong>${count ? `${count} ${count === 1 ? 'detail carried' : 'details carried'} over from your files` : 'A little help along the way'}</strong><p>${prompt}</p></div></div>`;
}
function evidencePayload() { return { ...Object.fromEntries(reviewedEvidence()), _reviews: state.evidenceReviews || {} }; }
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
  const a = state.answers, qc = state.qc;
  const rows = visible(a, qc).map(q => `<div><dt>${TITLES[q.id]}</dt><dd>${escape(answerText(q.id, a, qc))}</dd><dd class="qc-review-edit"><button type="button" class="edit-button" data-qc-edit="${q.id}" aria-label="Change ${TITLES[q.id].toLowerCase()}">Change ${chevron}</button></dd></div>`).join('');
  return `${evidenceSummary()}${historyPanel()}${state.sample ? `<div class="sample-notice">Example home ${escape(a.building_id)}. These are anonymised project details. You can change any answer.</div>` : ''}<section class="review-group qc-review"><dl>${rows}</dl></section><p class="review-reassurance">An unanswered question is okay. We’ll explain where more information would help.</p>`;
}
// Quick check (step 1): one question per screen, see quickcheck.js.
function quickCheckPage() {
  if (!visible(state.answers, state.qc).some(q => q.id === state.q)) state.q = 'heating';
  const html = questionHtml(state.q, state.answers, state.qc, { escape, money, aiAvailable });
  return `<main id="main" class="flow-main qc-main">${progressBar(state.q, state.answers, state.qc)}<section class="form-panel qc-panel">${html}</section></main>`;
}
function formPage() {
  if (state.step < 4) return quickCheckPage();
  const titles = ['Your home check starts here.', 'How do you keep your home warm?', 'A little about your energy use.', 'Does everything look right?'];
  const intros = ['Let AI help with the paperwork, or tell us what you know.', 'Choose what you know. You can always come back and change an answer.', 'These details help us give a more useful estimate. Nothing here needs to be exact.', 'You’re in control. Check your answers before we put your first assessment together.'];
  const content = [homeForm, heatingForm, energyForm, review][state.step - 1]();
  const panel = `<section class="form-panel"><p class="eyebrow">Step 2 of 2</p><h1 id="page-title" tabindex="-1">${titles[state.step - 1]}</h1><p class="intro">${intros[state.step - 1]}</p>${errorSummary()}${state.step > 1 ? helperPrompt() : ''}<form id="home-form" novalidate>${content}<div class="form-actions"><button type="button" class="back-button" data-go="${returnToReview ? 4 : state.step - 1}"><span aria-hidden="true">←</span> ${returnToReview ? 'Cancel changes' : 'Back'}</button><button type="submit" class="button primary">${state.step === 4 ? 'See my assessment' : returnToReview ? 'Save changes' : state.step === 1 ? 'Continue to my heating' : 'Continue'} ${chevron}</button></div></form></section>`;
  if (state.step === 4 && state.mode === 'developer') return `<main id="main" class="result-main rp">${progress()}<h1 id="page-title" tabindex="-1">Inputs and how they are used</h1>${devInputPanel()}
    <div class="form-actions"><button type="button" class="back-button" data-go="3">← Back</button><button type="button" class="button primary" data-go="5">See my assessment ${chevron}</button></div></main>`;
  if (state.step === 4 && state.mode === 'both') return `<main id="main" class="result-main split">${progress()}<div class="split-panes">
    <section class="pane pane-customer" aria-label="Customer view"><p class="pane-label">Customer view</p>${panel}</section>
    <section class="pane pane-dev rp" aria-label="Developer view"><p class="pane-label">Developer view</p>${devInputPanel()}</section></div></main>`;
  return `<main id="main" class="flow-main">${progress()}<div class="flow-layout">${panel}<aside class="flow-aside"><div class="encouragement"><span class="aside-kicker">A little reassurance</span><h2>You don’t need to be an expert.</h2><p>“I’m not sure” is a useful answer, too. We’ll tell you which details a heating professional can help with.</p><hr><p class="small">Your answers stay in this tab. You can go back without losing them.</p></div><p class="prototype-note">This is an initial indication, not a final design or an installation quote.</p></aside></div></main>`;
}
// Developer view of the inputs (review step): upper = every raw input as a file tile, middle = the extracted, uniform
// data the engine will use, lower = the four decision steps computed from that data.
let rawFiles = { id: null, files: [] };
function loadRawFiles(id) {
  rawFiles = { id, files: [] };
  fetch(`/api/customer/${encodeURIComponent(id)}/files`).then(r => (r.ok ? r.json() : [])).then(files => {
    if (rawFiles.id === id) { rawFiles.files = files; refreshDevInput(); }
  }).catch(() => {});
}
function refreshDevInput() { const el = document.querySelector('#dev-input'); if (el) el.innerHTML = devInputBody(); }
const FILE_ROLE = { 'questionnaire.json': 'questionnaire', 'customer_input.json': 'questionnaire (dataset)', 'extraction.json': 'AI extraction' };
function fileTile(id, f) {
  const role = FILE_ROLE[f.name] || (f.path.startsWith('photos/') ? 'photo' : 'document');
  return `<a class="di-tile" href="/api/customer/${encodeURIComponent(id)}/raw/${f.path.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">
    <span class="di-icon ${escape(f.kind)}" aria-hidden="true">${escape(f.kind.toUpperCase())}</span><span class="di-name">${escape(f.name)}</span><span class="di-meta">${role} · ${formatNumber(f.size / 1024)} KB</span></a>`;
}
function sourceKind(key, f) {
  const src = String(f.source || '');
  if (src.startsWith('confirmed_upload.') || src.startsWith('upload:')) return ['file', `from ${src.split(/[.:]/).slice(1).join('.')}`];
  if (src.startsWith('homeowner') || src === 'scenario') return ['questionnaire', 'questionnaire'];
  if (src.startsWith('customer_input.') && src.slice(15) !== key) return ['file', `extracted from ${src.slice(15)}`];
  return ['questionnaire', src.replace('customer_input.', 'questionnaire · ')];
}
function devInputPanel() { return `<div id="dev-input">${devInputBody()}</div>`; }
function devInputBody() {
  if (!ensureAssessment()) return `<p class="wi-status">${assessment.status === 'error' ? 'The inputs could not be processed.' : 'Preparing the uniform data…'}</p>`;
  const { processed: p, outputs: o } = assessment.data, id = p['02_radiator_check'].building_id;
  if (rawFiles.id !== id) loadRawFiles(id);
  const saved = rawFiles.files.some(f => FILE_ROLE[f.name]?.startsWith('questionnaire'));
  const current = saved ? '' : `<details class="di-tile di-inline"><summary><span class="di-icon json" aria-hidden="true">JSON</span><span class="di-name">questionnaire.json</span><span class="di-meta">current answers · not saved yet</span></summary><pre>${escape(JSON.stringify(toCustomerInput(values()), null, 2))}</pre></details>`;
  const fields = new Map();
  for (const step of Object.values(p)) for (const [k, f] of Object.entries(step.fields)) if (!fields.has(k) && f.evidence !== 'not asked') fields.set(k, f);
  const value = v => (v === null || v === undefined ? '—' : Array.isArray(v) ? v.join(typeof v[0] === 'number' ? ' × ' : ', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
  const rows = [...fields].map(([k, f]) => {
    const [kind, label] = sourceKind(k, f);
    return `<tr><th scope="row">${escape(k)}</th><td>${escape(value(f.value))}</td><td><span class="di-conf ${escape(f.confidence ?? 'given')}">${escape(f.confidence ?? 'as given')}</span></td><td><span class="di-src ${kind}">${escape(label)}</span></td><td>${escape(f.evidence ?? '')}</td></tr>`;
  }).join('');
  return `<section class="rp-layer" aria-label="Input space"><p class="rp-layer-label">Input space · data/demo/${escape(id)}/raw/</p>
      <div class="di-files">${current}${rawFiles.files.map(f => fileTile(id, f)).join('') || (current ? '' : '<p class="small">Loading files…</p>')}</div></section>
    <div class="rp-link" aria-hidden="true">↓</div>
    <section class="rp-layer" aria-label="Extracted information"><p class="rp-layer-label">Extracted information · uniform data the engine uses</p>
      <div class="eval-scroll"><table class="eval-table di-table"><thead><tr><th>Field</th><th>Value</th><th>Confidence</th><th>Source</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <div class="rp-link" aria-hidden="true">↓</div>
    <section class="rp-layer" aria-label="Decision steps"><p class="rp-layer-label">4 decision steps · computed from the table above</p>
      <ol class="rp-steps">${stepCards(p, o).map((x, i) => `<li class="rp-card rp-step"><p class="rp-num">Step ${i + 1}</p><h2>${x.title}</h2><p>${escape(x.sentence)}</p><code class="rp-eq">${escape(x.equation)}</code><p class="rp-result">${escape(x.result)}</p></li>`).join('')}</ol></section>`;
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
  if (state.step === 4 && assessment.key === key) { refreshDevInput(); return; }
  if (state.step >= 5 && assessment.key === key) {
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
    ['01b_heat_load_by_consumption', 'annual_consumption_kwh', false, 'Energy used', v => `${formatNumber(v)} kWh`], ['01b_heat_load_by_consumption', 'energy_carrier', false, 'Fuel', v => labels.energy_carrier[v] || v],
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

// Starts the assessment for the current answers if needed; true once its result is ready.
function ensureAssessment() {
  if (!sampleUnchanged()) customerId();
  const input = { ...toCustomerInput(values()), extraction_evidence: evidencePayload() }, key = sampleUnchanged() ? `demo:${state.answers.building_id}` : JSON.stringify(input);
  if (assessment.key !== key) {
    if (state.confirmKey !== key) { state.confirm = {}; state.confirmKey = key; whatIf = { processed: null }; save(); }
    runAssessment(key, input);
  }
  return assessment.status === 'done';
}
function resultPage() {
  ensureAssessment();
  const top = '<div class="result-topline"><button class="back-button" data-go="4">← Review my answers</button><span>YOUR FIRST ASSESSMENT</span></div>';
  if (assessment.status === 'loading') return `<main id="main" class="result-main">${top}<section class="verdict-panel" aria-busy="true"><div><h1 id="page-title" tabindex="-1">Checking your answers…</h1><p class="lead">This usually takes a moment.</p></div></section></main>`;
  if (assessment.status === 'error') return `<main id="main" class="result-main">${top}<section class="verdict-panel yellow"><div><h1 id="page-title" tabindex="-1">We couldn’t complete the check.</h1><p class="lead">The calculation did not respond. Your answers are still saved in this tab.</p><div class="result-actions"><button class="button primary" data-retry-assess>Try again</button></div></div></section></main>`;

  const { processed: p, outputs: o } = assessment.data;
  if (state.mode === 'customer') return `<main id="main" class="result-main cv-main">${top}${customerView(p, o)}</main>`;
  if (state.mode === 'developer') return `<main id="main" class="result-main rp">${top}${developerView(p, o, true)}</main>`;
  return `<main id="main" class="result-main split">${top}<div class="split-panes">
    <section class="pane pane-customer" aria-label="Customer view"><p class="pane-label">Customer view</p>${customerView(p, o)}</section>
    <section class="pane pane-dev rp" aria-label="Developer view"><p class="pane-label">Developer view</p>${developerView(p, o, false)}</section></div></main>`;
}
// Developer view: the detailed result (decision, four steps, inputs with evidence, what-if, checks).
function developerView(p, o, mainHeading) {
  const d = o.decision, cost = o['03_operating_cost'].cost_eur_per_year;
  const v = verdictMeta(d, Boolean(o['02_radiator_check'].flow_temp_c.by_case));
  const fuel = labels.energy_carrier[p['03_operating_cost'].fields.energy_carrier.value] || 'current fuel';
  return `    <section class="rp-layer" aria-label="Result"><p class="rp-layer-label">Result · ${escape(d.building_id)}</p><div class="rp-top">
      <div class="rp-card rp-verdict ${v.cls}"><p class="eyebrow">${v.eyebrow}</p>${mainHeading ? `<h1 id="page-title" tabindex="-1">${v.title}</h1>` : `<h2>${v.title}</h2>`}<p>${escape(firstSentence(d.summary))}</p></div>
      <div class="rp-card rp-saving"><p class="eyebrow">Energy cost saving</p><p class="rp-big">${cost.saving ? `${euros(cost.saving)}<span> / year</span>` : '—'}</p>${costBars(cost, fuel)}<p class="small">Fixed challenge prices, energy only.</p></div>
    </div></section>
    <div class="rp-link" aria-hidden="true">↑</div>
    <section class="rp-layer" aria-label="How it was calculated"><p class="rp-layer-label">4 steps</p><ol class="rp-steps">${stepCards(p, o).map((x, i) => `<li class="rp-card rp-step"><p class="rp-num">Step ${i + 1}</p><h2>${x.title}</h2><p>${escape(x.sentence)}</p><code class="rp-eq">${escape(x.equation)}</code><p class="rp-result">${escape(x.result)}</p></li>`).join('')}</ol></section>
    <div class="rp-links" aria-hidden="true"><span>↑</span><span>↑</span><span>↑</span><span>↑</span></div>
    <section class="rp-layer" aria-label="Inputs and evidence"><p class="rp-layer-label">Inputs & evidence</p><div class="rp-inputs">${INPUTS.map(col => `<ul class="rp-card">${col.map(x => inputItem(p, x)).join('')}</ul>`).join('')}</div></section>
    <section class="rp-layer wi" aria-labelledby="wi-title"><p class="rp-layer-label" id="wi-title">What if · move a slider to see what would change</p><div id="wi-section">${(ensureWhatIf('result'), whatIfBody())}</div></section>
    ${d.homeowner_can_provide.length ? `<section class="next-question"><p class="eyebrow">Your next useful step</p><h2>A little more information can help.</h2><ul>${d.homeowner_can_provide.map(x => `<li>${escape(x)}</li>`).join('')}</ul><div class="next-step-actions"><button class="button primary" data-add-evidence>Add a bill or photo ${sparkle}</button><button class="back-button" data-go="4">Update my answers →</button></div><p class="small">Our AI helper can look for missing details. You’ll review them before your result changes.</p></section>` : ''}
    <details class="assumptions"><summary>What a professional needs to check</summary><ul>${d.technician_checks.map(x => `<li>${escape(x)}</li>`).join('')}</ul></details>
    <div class="result-actions"><button class="button primary" data-go="6">Check and complete my details ${chevron}</button><button class="button secondary" data-download>Save my summary ↓</button><button class="button secondary" data-print>Print this assessment</button><button class="reset-button" data-reset>Start a new check</button></div>`;
}
// Customer view: the judgement only (colour, saving, one paragraph) and a few suggestions that fit the colour.
function customerParagraph(p, o) {
  const h = o['01_heat_load'].heating_load_kw, flow = o['02_radiator_check'].flow_temp_c, cost = o['03_operating_cost'].cost_eur_per_year;
  const fuel = (labels.energy_carrier[p['03_operating_cost'].fields.energy_carrier.value] || 'your current heating').toLowerCase();
  const d = o.decision, [lo, hi] = flow.required || [];
  const parts = [{
    ready: 'A heat pump can very likely heat your home with the heating system you already have.',
    workable: 'A heat pump can heat your home, but the heating water would need 55–60 °C, which costs more to run.',
    obstacle: 'With your current radiators the heating water would need more than 60 °C, so some radiators should be upgraded first.',
  }[d.verdict_kind] || (flow.by_case ? 'A heat pump can very likely heat your home, but we can’t yet tell whether your radiators are big enough.' : 'We need a few more details before we can judge your home.')];
  if (h.used) parts.push(`On the coldest days your home needs about ${span(h.used, ' kW')} of heat.`);
  if (flow.by_case?.underfloor) parts.push('Your underfloor heating runs at a low water temperature, which suits a heat pump well.');
  else if (flow.required && d.verdict_kind !== 'obstacle') parts.push(`With your radiators the heating water would need ${lo > 60 ? 'more than 60 °C' : hi > 90 ? `${lo} °C to well over 90 °C` : span(flow.required, ' °C')}; a heat pump works most efficiently up to 55 °C.`);
  if (cost.heat_pump) parts.push(`Running a heat pump would cost about ${euros(cost.heat_pump)} a year${cost.today !== null ? `, compared with ${money(cost.today)} for ${fuel} today` : ''}.`);
  return parts.join(' ');
}
// Suggestions that fit the colour: green -> next steps (list); red -> keyword cards of what to change;
// yellow -> two options: add the suggested file, or book a video call.
function customerSuggestions(o) {
  const d = o.decision, h = o['01_heat_load'].heating_load_kw;
  const singlePipe = d.reasons.some(r => r.source === 'pipe_system' && r.type === 'obstacle');
  if (d.verdict === 'green') return { title: 'Your next steps', items: [
    'Ask two or three heating installers for an on-site visit and a quote.',
    'Have the heat load of each room calculated (DIN EN 12831), so the heat pump is sized right.',
    'Check that the meter cabinet has room for a heat-pump circuit, and find a place for the outdoor unit.'] };
  if (d.verdict === 'red') return { title: 'What to change first', cards: [
    ['Bigger radiators', 'Replace the smallest radiators with larger ones, or add panels, so the heating water can stay at or below 55 °C.'],
    singlePipe ? ['Pipe check', 'Have the single-pipe heating loop checked; it may need to be converted.'] : null,
    h.w_per_m2 && h.w_per_m2[0] > 75 ? ['Insulation', 'Better windows or roof and wall insulation lower the heat your home needs.'] : null,
    ['Check again', 'Run this check again with the new details.']].filter(Boolean) };
  return { title: 'Two ways to settle it', options: true };
}
let videoCallRequested = false;
function yellowOptions(o) {
  const d = o.decision, b = d.boundaries[0];
  const files = d.homeowner_can_provide.slice(0, 3);
  return `<div class="cv-options">
    <article class="cv-option"><p class="cv-option-kicker">Option 1</p><h3>Add a suggested file</h3>
      <ul>${files.map(x => `<li>${escape(x)}</li>`).join('')}</ul>
      ${b ? `<p class="small">It turns green if your radiators together deliver at least ${escape(b.thresholds[0].range.replace('>= ', ''))} kW (rated output).</p>` : ''}
      <button class="button primary" data-add-evidence>Add a bill or photo</button></article>
    <article class="cv-option"><p class="cv-option-kicker">Option 2</p><h3>Book a video call</h3>
      <p>A heating expert looks at your radiators and boiler with you in a 15-minute video call and fills in the open details.</p>
      ${videoCallRequested ? '<p class="cv-note" role="status">✓ Request noted. This prototype does not book a real appointment.</p>' : '<button class="button secondary" data-video-call>Request a video call</button>'}</article></div>`;
}
// Yearly cost today against the heat pump, with the heat pump's min-max band (open options) and the saving.
function savingChart(o, fuel) {
  const cost = o['03_operating_cost'].cost_eur_per_year, jaz = o['03_operating_cost'].jaz, hp = cost.heat_pump, today = cost.today;
  if (!hp) return '<p class="cv-chart-empty">The running cost is estimated once the heating water can stay at or below 60 °C.</p>';
  const max = Math.max(today ?? 0, hp[1]), step = max > 5000 ? 2000 : max > 2000 ? 1000 : 500, top = Math.ceil(max * 1.05 / step) * step;
  const L = 150, R = 590, x = v => L + (v / top) * (R - L), barH = 22, y1 = 26, y2 = 86;
  const bar = (x0, x1, y, cls) => `<path class="${cls}" d="M${x0},${y}H${x1 - 4}a4,4 0 0 1 4,4V${y + barH - 4}a4,4 0 0 1 -4,4H${x0}Z"/>`;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const k = v => (v >= 1000 ? `€${v / 1000}K` : `€${v}`);
  const saving = cost.saving && today !== null ? cost.saving : null, axisY = saving ? 186 : 136, ys = y2 + 44;
  return `<figure class="cv-chart"><figcaption>Heating cost per year</figcaption>
    <svg viewBox="0 0 600 ${axisY + 12}" role="img" aria-labelledby="cv-chart-desc"><desc id="cv-chart-desc">${today !== null ? `Today ${money(today)} a year` : 'Today: no official price for this fuel'}; with a heat pump ${euros(hp)} a year${saving ? `; saving ${euros(saving)}` : ''}.</desc>
      ${ticks.map(t => `<line class="cv-grid" x1="${x(t)}" x2="${x(t)}" y1="14" y2="${axisY - 14}"/><text class="cv-tick" x="${x(t)}" y="${axisY}">${k(t)}</text>`).join('')}
      <text class="cv-row" x="0" y="${y1 + 16}">Today · ${escape(fuel)}</text>
      ${today !== null ? `<g><title>Today: ${money(today)} a year</title>${bar(L, x(today), y1, 'cv-today')}</g><text class="cv-value" x="${x(today) + 6}" y="${y1 + 16}">${money(today)}</text>`
        : `<text class="cv-value" x="${L}" y="${y1 + 16}">no official price for this fuel</text>`}
      <text class="cv-row" x="0" y="${y2 + 16}">With a heat pump</text>
      <g><title>Heat pump: ${euros(hp)} a year (efficiency ${span(jaz, '')})</title>
        ${hp[1] > hp[0] ? `${bar(L, x(hp[1]), y2, 'cv-band')}<rect class="cv-hp" x="${L}" y="${y2}" width="${x(hp[0]) - L}" height="${barH}"/>` : bar(L, x(hp[0]), y2, 'cv-hp')}</g>
      <text class="cv-value" x="${x(hp[1]) + 6}" y="${y2 + 16}">${euros(hp)}</text>
      ${saving ? `<g class="cv-saving-mark"><title>Saving: ${euros(saving)} a year</title>
        <line x1="${x(hp[1])}" x2="${x(today)}" y1="${ys}" y2="${ys}"/><line class="cv-saving-extra" x1="${x(hp[0])}" x2="${x(hp[1])}" y1="${ys}" y2="${ys}"/>
        <line x1="${x(today)}" x2="${x(today)}" y1="${ys - 6}" y2="${ys + 6}"/><line x1="${x(hp[0])}" x2="${x(hp[0])}" y1="${ys - 6}" y2="${ys + 6}"/>
        <text class="cv-value" x="${(x(hp[0]) + x(today)) / 2}" y="${ys + 22}" text-anchor="middle">You save ${euros(saving)} a year</text></g>` : ''}
    </svg>
    <p class="small">${hp[1] > hp[0] ? `The lighter band is the range over what is still open (heat pump efficiency ${span(jaz, '')}). ` : ''}Fixed challenge prices, energy only.</p>
    <table class="sr-only"><caption>Heating cost per year</caption><tr><th>Today</th><td>${today !== null ? money(today) : 'not priced'}</td></tr><tr><th>With a heat pump</th><td>${euros(hp)}</td></tr>${cost.saving ? `<tr><th>Saving</th><td>${euros(saving)}</td></tr>` : ''}</table></figure>`;
}
function customerView(p, o) {
  const d = o.decision, cost = o['03_operating_cost'].cost_eur_per_year, v = verdictMeta(d, Boolean(o['02_radiator_check'].flow_temp_c.by_case));
  const fuel = labels.energy_carrier[p['03_operating_cost'].fields.energy_carrier.value] || 'current heating';
  const s = customerSuggestions(o);
  const body = s.options ? yellowOptions(o)
    : s.cards ? `<div class="cv-cards">${s.cards.map(([key, text]) => `<article class="cv-card"><h3>${escape(key)}</h3><p>${escape(text)}</p></article>`).join('')}</div>`
    : `<ul>${s.items.map(x => `<li>${escape(x)}</li>`).join('')}</ul>`;
  return `<div class="cv"><div class="cv-verdict ${v.cls}"><p class="eyebrow">${v.eyebrow}</p><h1 id="page-title" tabindex="-1">${v.title}</h1>
      <p class="cv-saving">${cost.saving ? `<strong>${euros(cost.saving)}</strong> saved per year` : d.verdict === 'red' ? 'Saving: estimated once the heating water can stay at or below 60 °C' : 'Saving: more information needed'}</p></div>
    <p class="cv-text">${escape(customerParagraph(p, o))}</p>
    ${savingChart(o, fuel)}
    ${followUpPanel()}
    <section class="cv-suggestions ${v.cls}"><h2>${s.title}</h2>${body}</section>
    <div class="result-actions"><button class="button ${s.options ? 'secondary' : 'primary'}" data-go="6">Check and complete my details ${chevron}</button></div></div>`;
}
// Confirm page: the customer approves, corrects or fills in every input the engine used.
const CONFIRM = [
  ['Your home', [['floor_area_m2', 'Floor area', 'number', 'm²'], ['construction_year', 'Year built', 'number', ''], ['renovation_status', 'Insulation improvements', 'select', labels.renovation_status],
    ['unheated_area', 'Unheated area (0 if none)', 'number', 'm²']]],
  ['Your energy use', [['annual_consumption_kwh', 'Energy used in a full year', 'number', 'kWh'], ['energy_carrier', 'Energy source', 'select', labels.energy_carrier],
    ['persons_in_household', 'People at home', 'number', ''], ['hot_water_via_heating', 'Boiler also heats tap water', 'yesno'], ['solar_thermal', 'Solar hot-water panels', 'yesno'],
    ['other_heat_source', 'Another heat source, e.g. a stove', 'yesno']]],
  ['Your heating', [['heat_distribution', 'Room heating', 'select', labels.heat_distribution], ['radiator_count', 'Number of radiators', 'number', ''],
    ['radiator_type', 'Radiator type', 'select', labels.radiator_type], ['radiator_size_mm', 'Typical radiator size (height × width)', 'size', 'mm'],
    ['pipe_system', 'Pipe layout', 'select', labels.pipe_system]]],
];
const findField = (p, key) => Object.values(p).map(step => step.fields[key]).find(Boolean);
function initialValue(f, type) {
  const v = f?.value ?? null;
  if (type === 'yesno') return v === true ? 'yes' : v === false ? 'no' : 'unknown';
  if (type === 'select') return v === null ? 'unknown' : String(v);
  if (type === 'size') return v ? v.map(String) : ['', ''];
  return typeof v === 'number' ? String(v) : '';
}
function parseConfirmed(type, raw) { // undefined = left blank (keep the current value)
  if (type === 'yesno') return { yes: true, no: false, unknown: null }[raw];
  if (type === 'select') return raw === 'unknown' ? null : raw;
  if (type === 'size') { const [h, w] = raw.map(parseNumber); return h > 0 && w > 0 ? [h, w] : undefined; }
  const n = parseNumber(raw);
  return n === null || !Number.isFinite(n) ? undefined : n;
}
function confirmControl(key, type, unitOrOptions, value) {
  const id = `cf-${key}`;
  if (type === 'number') return `<div class="input-wrap"><input id="${id}" name="cf:${key}" type="text" inputmode="decimal" autocomplete="off" value="${escape(value)}" placeholder="unknown">${unitOrOptions ? `<span class="input-unit">${unitOrOptions}</span>` : ''}</div>`;
  if (type === 'size') return `<div class="cf-size"><input id="${id}" name="cf:${key}:0" type="text" inputmode="numeric" value="${escape(value[0])}" placeholder="height" aria-label="Height in mm"><span>×</span><input name="cf:${key}:1" type="text" inputmode="numeric" value="${escape(value[1])}" placeholder="width" aria-label="Width in mm"><span>mm</span></div>`;
  const options = type === 'yesno' ? { yes: 'Yes', no: 'No', unknown: 'Not sure' } : unitOrOptions;
  return `<select id="${id}" name="cf:${key}">${Object.entries(options).map(([v, label]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}
function confirmPage() {
  if (!ensureAssessment()) return resultPage();
  const p = assessment.data.processed;
  const groups = CONFIRM.map(([title, rows]) => `<section class="cf-group"><h2>${title}</h2>${rows.map(([key, label, type, extra]) => {
    const f = findField(p, key);
    if (!f) return '';
    const entry = state.confirm[key], value = entry ? entry.value : initialValue(f, type);
    const missing = f.value === null || (key === 'unheated_area' && typeof f.value === 'string');
    const nonAnnual = key === 'annual_consumption_kwh' && state.answers.consumption_full_year !== 'yes';
    const evidence = f.evidence && !['self-reported', 'not asked', 'not provided', String(f.value)].includes(f.evidence) ? `<p class="rp-evidence">“${escape(f.evidence)}”</p>` : '';
    return `<div class="cf-row ${missing ? 'missing' : ''}"><div class="cf-label"><label for="cf-${key}">${label}</label>${evidence}${nonAnnual ? '<p class="cf-missing">This bill is not confirmed as a full year. Update the billing period in your energy-use answers before confirming annual demand.</p>' : ''}${missing ? '<p class="cf-missing">Open — add it if you know it</p>' : ''}</div>`
      + `<div class="cf-control">${confirmControl(key, type, extra, value)}</div><label class="cf-ok"><input type="checkbox" name="ok:${key}" ${nonAnnual ? 'disabled' : entry?.ok ? 'checked' : ''}> Correct</label></div>`;
  }).join('')}</section>`).join('');
  return `<main id="main" class="flow-main cf"><div class="result-topline"><button class="back-button" data-go="5">← Back to my result</button><span>CONFIRM YOUR DETAILS</span></div>
    <h1 id="page-title" tabindex="-1">Check and complete your details.</h1><p class="intro">Tick what is right, correct what isn’t, and add what you know. Anything still open is explored with sliders on the next page.</p>
    <button type="button" class="button secondary" data-approve-all>Mark all shown values as correct</button>${groups}
    <div class="form-actions"><button type="button" class="back-button" data-go="5">← Back</button><button type="button" class="button primary" data-finalize>Finalise my check ${chevron}</button></div></main>`;
}
// The engine input after the customer's confirmations: confirmed values become high confidence.
function confirmedProcessed() {
  const p = structuredClone(assessment.data.processed);
  for (const [, rows] of CONFIRM) for (const [key, , type] of rows) {
    const entry = state.confirm[key];
    if (!entry?.ok) continue;
    const v = parseConfirmed(type, entry.value);
    for (const step of Object.values(p)) {
      const f = step.fields[key];
      if (!f) continue;
      if (key === 'annual_consumption_kwh' && state.answers.consumption_full_year !== 'yes') continue;
      if (v === undefined) { if (f.value !== null) step.fields[key] = { ...f, confidence: 'high', source: 'homeowner.confirmed' }; }
      else step.fields[key] = { value: v, source: 'homeowner.confirmed', confidence: v === null ? 'low' : 'high', evidence: 'confirmed by the homeowner', ...(key === 'radiator_type' && v === null ? { alternatives: ['11', '22', '33'] } : {}) };
    }
  }
  return p;
}

// What-if: every input still open gets a fixed-rule assumption and a slider; the slider track is coloured by the
// verdict the engine gives at each position (others held at their current values). Shown on the result page with
// the data as assessed ("result"), and on the final page with the customer's confirmed data ("final").
let whatIf = { processed: null };
const WHAT_IF_STEP = { result: 5, final: 7 };
const VERDICT_COLOR = { green: '#8fb07f', yellow: '#e6c75f', red: '#d9826a' };
function trackGradient(sweep) {
  const n = sweep.length;
  return `linear-gradient(to right, ${sweep.map((r, i) => `${VERDICT_COLOR[r.verdict]} ${Math.max(0, (i - 0.5) / (n - 1) * 100).toFixed(1)}% ${Math.min(100, (i + 0.5) / (n - 1) * 100).toFixed(1)}%`).join(', ')})`;
}
function ensureWhatIf(kind) {
  if (whatIf.kind === kind && whatIf.processed) return;
  whatIf = { kind, processed: kind === 'final' ? confirmedProcessed() : assessment.data.processed, status: 'loading' };
  runScenarios(null);
}
async function runScenarios(values) {
  const req = whatIf.req = (whatIf.req || 0) + 1;
  try {
    const data = await scenarios(whatIf.processed, values);
    if (req !== whatIf.req) return;
    const first = whatIf.status !== 'done';
    whatIf = { ...whatIf, status: 'done', data, values: { ...data.values } };
    if (state.step !== WHAT_IF_STEP[whatIf.kind]) return;
    if (!first) updateWhatIf();
    else if (whatIf.kind === 'final') { render(); document.querySelector('#page-title')?.focus(); announce('Your final check is ready.'); }
    else document.querySelector('#wi-section').innerHTML = whatIfBody();
  } catch {
    if (req !== whatIf.req) return;
    whatIf.status = 'error';
    const section = state.step === WHAT_IF_STEP[whatIf.kind] && document.querySelector('#wi-section');
    if (section) section.innerHTML = whatIfBody();
  }
}
function whatIfResult(data) {
  const r = data.result, full = data.full.summary, v = verdictMeta(r, true);
  const heading = whatIf.kind === 'final' ? `<h1 id="page-title" tabindex="-1">${v.title}</h1>` : `<h2>${v.title}</h2>`;
  return `<div class="rp-top"><div class="rp-card rp-verdict ${v.cls}"><p class="eyebrow">${v.eyebrow}</p>${heading}
      <p>All open options together: <strong>${escape(full.verdict)}</strong>${full.saving_eur ? `, saving ${euros(full.saving_eur)} a year` : ''}.</p></div>
    <div class="rp-card"><dl class="wi-numbers"><div><dt>Heat load</dt><dd>${span(r.load_kw, ' kW')}</dd></div><div><dt>Water temperature</dt><dd>${span(r.flow_c, ' °C')}</dd></div>
      <div><dt>Heat pump cost</dt><dd>${euros(r.heat_pump_eur)}<span> / year</span></dd></div><div><dt>Saving</dt><dd class="wi-saving">${euros(r.saving_eur)}<span> / year</span></dd></div></dl></div></div>`;
}
function updateWhatIf() {
  const { data, values } = whatIf;
  document.querySelector('#wi-result').innerHTML = whatIfResult(data);
  for (const p of data.params) {
    document.querySelector(`#wi-${p.key}`)?.style.setProperty('--track', trackGradient(data.sweeps[p.key]));
    const note = document.querySelector(`#wi-log-${p.key}`);
    if (note) note.textContent = values[p.key] === p.assumed ? 'in use' : `you chose ${p.labels[p.values.indexOf(values[p.key])]}`;
  }
}
// Result with the slider values, the sliders, and the assumption log. Lives in #wi-section on either page.
function whatIfBody() {
  if (whatIf.status === 'loading') return '<p class="wi-status" aria-busy="true">Working out every option…</p>';
  if (whatIf.status === 'error') return '<p class="wi-status">The what-if options could not be calculated.</p>';
  const { data, values } = whatIf;
  const sliders = data.params.map(p => {
    const i = p.values.indexOf(values[p.key]);
    return `<div class="wi-param"><div class="wi-head"><label for="wi-${p.key}">${escape(p.label)}</label><output id="wi-out-${p.key}" for="wi-${p.key}">${escape(p.labels[i])}</output></div>
      <input type="range" class="wi-range" id="wi-${p.key}" name="wi:${p.key}" min="0" max="${p.values.length - 1}" step="1" value="${i}" aria-valuetext="${escape(p.labels[i])}" style="--track: ${trackGradient(data.sweeps[p.key])}">
      <div class="wi-scale"><span>${escape(p.labels[0])}</span><span>${escape(p.labels[p.labels.length - 1])}</span></div></div>`;
  }).join('');
  const log = data.params.map(p => `<li><strong>${escape(p.label)}: ${escape(p.labels[p.values.indexOf(p.assumed)])}</strong> — ${escape(p.rule)} <span class="wi-log-state" id="wi-log-${p.key}">${values[p.key] === p.assumed ? 'in use' : `you chose ${escape(p.labels[p.values.indexOf(values[p.key])])}`}</span></li>`).join('');
  if (!data.params.length) return `<div id="wi-result">${whatIfResult(data)}</div><p>Nothing is open any more: this is the final result.</p>`;
  return `<div id="wi-result">${whatIfResult(data)}</div>
    <p class="wi-legend"><span class="green"></span>green: ≤ 55 °C <span class="yellow"></span>yellow: 55–60 °C <span class="red"></span>red: &gt; 60 °C, at each slider position</p>
    <div class="wi-params">${sliders}</div><button type="button" class="button secondary" data-wi-reset>Back to the assumptions</button>
    <p class="rp-layer-label wi-log-label">Assumption log · fixed rules</p><ol class="wi-log">${log}</ol>`;
}
function whatIfPage() {
  if (!ensureAssessment()) return resultPage();
  ensureWhatIf('final');
  const top = '<div class="result-topline"><button class="back-button" data-go="6">← Back to my details</button><span>WHAT IF</span></div>';
  if (whatIf.status === 'loading') return `<main id="main" class="result-main">${top}<section class="verdict-panel" aria-busy="true"><div><h1 id="page-title" tabindex="-1">Working out every option…</h1></div></section></main>`;
  if (whatIf.status === 'error') return `<main id="main" class="result-main">${top}<section class="verdict-panel yellow"><div><h1 id="page-title" tabindex="-1">We couldn’t finish the check.</h1><div class="result-actions"><button class="button primary" data-go="6">Back to my details</button></div></div></section></main>`;
  return `<main id="main" class="result-main rp wi">${top}
    <section class="rp-layer"><p class="rp-layer-label">Final result · ${escape(whatIf.processed['02_radiator_check'].building_id)} · with your confirmed details and the values set below</p><div id="wi-section">${whatIfBody()}</div></section>
    <div class="result-actions"><button class="reset-button" data-reset>Start a new check</button></div></main>`;
}
let whatIfTimer;

function render() {
  document.documentElement.classList.toggle('larger-text', state.larger);
  document.querySelector('#text-size').setAttribute('aria-pressed', String(state.larger));
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  app.innerHTML = (state.step === 0 ? welcome() : state.step === 5 ? resultPage() : state.step === 6 ? confirmPage() : state.step === 7 ? whatIfPage() : formPage()) + `<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Start a new home check?</h2><p>This clears the answers in this tab. Save your summary first if you want to keep it.</p><div class="dialog-actions"><button class="button secondary" data-cancel-reset autofocus>Keep my answers</button><button class="button primary" data-confirm-reset>Start a new check</button></div></dialog>`;
  document.title = `${state.step === 0 ? 'Heat pump home check' : ({ 5: 'Your first assessment', 6: 'Confirm your details', 7: 'What if' })[state.step] || steps[state.step - 1]} · nuuEnergy`;
}

// ---------- quick check: navigation and answers ----------
let radFiles = { valve: null, side: null };
const AUTO_ADVANCE = new Set(['heat_distribution', 'persons_in_household', 'energy_carrier', 'consumption', 'radiator_count', 'construction_year', 'video', 'area', 'renovation']);
function qcShow(id) { state.q = id; state.qc.error = ''; save(); render(); document.querySelector('#page-title')?.focus(); window.scrollTo(0, 0); }
function qcNext() {
  if (state.qcReturn) { state.qcReturn = false; setStep(4); return; }
  if (state.q === 'renovation') { qcAfterRenovation(); return; }
  if (state.q === 'unusual') { qcFinish(); return; }
  const next = nextId(state.q, state.answers, state.qc);
  if (next) qcShow(next); else qcFinish();
}
function qcBack() {
  if (state.qcReturn) { state.qcReturn = false; setStep(4); return; }
  const prev = prevId(state.q, state.answers, state.qc);
  if (prev) qcShow(prev); else setStep(0);
}
// Ranges, the video slot and B15 reasons are noted for the technician in building_notes (a contract key).
function qcSyncNotes() {
  const a = state.answers, qc = state.qc, lines = [];
  const pick = (list, v) => (list.find(x => x[0] === v) || [])[1];
  if (qc.consumptionRange && qc.consumptionRange !== 'unknown') lines.push(`Yearly use given as a range: ${pick([...CONSUMPTION_RANGES.oil.options, ...CONSUMPTION_RANGES.kwh.options], qc.consumptionRange)} (middle value used).`);
  if (qc.radiatorRange && qc.radiatorRange !== 'unknown') lines.push(`Radiators given as a range: ${pick(RADIATOR_RANGES, qc.radiatorRange)} (middle value used).`);
  if (qc.rad === 'unclear' || qc.rad === 'skipped') lines.push(qc.video && qc.video !== 'no' ? `Radiator connection unclear: video check requested (${qc.video}).` : 'Radiator connection unclear: technician must check.');
  if (qc.b15.includes('unheated')) lines.push('Homeowner: some rooms are not heated.');
  if (qc.b15.includes('area')) lines.push('Homeowner: the living area given may be wrong.');
  if (qc.carrierOther) lines.push('Heating fuel: something other than gas, oil or LPG.');
  if (qc.hotWaterAssumed) lines.push('Hot water assumed to come from the boiler (not asked).');
  const marker = '[Quick check]';
  const own = (a.building_notes || '').split('\n').filter(l => !l.startsWith(marker)).join('\n').trim();
  a.building_notes = [own, ...lines.map(l => `${marker} ${l}`)].filter(Boolean).join('\n').slice(0, 3000);
}
async function qcAfterRenovation() {
  if (state.answers.hot_water_via_heating === 'unknown' && !state.sample) { state.answers.hot_water_via_heating = 'yes'; state.qc.hotWaterAssumed = true; }
  qcSyncNotes();
  const q = state.qc;
  if (!q.b15Shown) {
    try {
      const data = await assess(toCustomerInput(values()));
      if (data.outputs['01_heat_load'].heating_load_kw.consistent === false) { q.b15Shown = true; save(); qcShow('unusual'); return; }
    } catch { /* the result page shows its own error */ }
  }
  qcFinish();
}
function qcFinish() {
  const a = state.answers, qc = state.qc;
  if (a.hot_water_via_heating === 'unknown' && !state.sample) { a.hot_water_via_heating = 'yes'; qc.hotWaterAssumed = true; }
  if (qc.b15.includes('stove')) a.other_heat_source = 'yes';
  if (qc.b15.includes('renovated') && ['unknown', 'unrenovated'].includes(a.renovation_status)) a.renovation_status = 'partially';
  qcSyncNotes(); state.sample = state.sample && state.sampleAnswers === JSON.stringify(a); save(); setStep(5);
}
function qcPick(name, value) {
  const a = state.answers, qc = state.qc;
  if (name === 'heat_distribution') { a.heat_distribution = value; qc.heatingAnswered = true; }
  if (name === 'persons_in_household') a.persons_in_household = value;
  if (name === 'energy_carrier') {
    qc.carrierOther = value === 'other';
    const next = value === 'other' ? 'unknown' : value;
    if (next !== a.energy_carrier) { qc.consumptionRange = null; a.amount = ''; }
    a.energy_carrier = next;
  }
  if (name === 'consumption') {
    qc.consumptionRange = value;
    const set = a.energy_carrier === 'oil' ? CONSUMPTION_RANGES.oil : CONSUMPTION_RANGES.kwh, opt = set.options.find(o => o[0] === value);
    a.amount = opt ? String(opt[2]) : ''; a.unit = opt ? set.unit : 'kwh'; a.consumption_full_year = opt ? 'yes' : 'unknown';
  }
  if (name === 'radiator_count') { qc.radiatorRange = value; a.radiator_count = String((RADIATOR_RANGES.find(o => o[0] === value) || [])[2] || ''); }
  if (name === 'construction_year') { qc.yearUnknown = value === 'unknown'; a.construction_year = value === 'unknown' ? '' : value; }
  if (name === 'video') qc.video = value === 'unknown' ? 'no' : value;
  if (name === 'area') { qc.areaUnknown = true; qc.areaTouched = false; a.floor_area_m2 = ''; }
  if (name === 'renovation') { qc.renovationUnknown = true; qc.renovationTouched = false; a.renovation_status = 'unknown'; }
  if (name === 'unusual') qc.b15 = value === 'unknown' ? ['unknown'] : qc.b15.includes(value) ? qc.b15.filter(v => v !== value) : [...qc.b15.filter(v => v !== 'unknown'), value];
  save();
  if (AUTO_ADVANCE.has(name) && !(name === 'video' && value === 'unknown')) qcNext(); else { render(); document.querySelector(`[data-qc-pick="${name}"][data-value="${value}"]`)?.focus(); }
}
function qcRange(kind, raw) {
  const a = state.answers, qc = state.qc;
  if (kind === 'area') { a.floor_area_m2 = String(raw); qc.areaTouched = true; qc.areaUnknown = false; }
  if (kind === 'renovation') { a.renovation_status = RENOVATION[Number(raw)][0]; qc.renovationTouched = true; qc.renovationUnknown = false; }
  save();
  const el = document.querySelector(`#qc-${kind}`), label = kind === 'area' ? `${Number(raw) >= 300 ? '300+' : raw} m²` : RENOVATION[Number(raw)][1];
  el?.classList.remove('untouched'); el?.setAttribute('aria-valuetext', label);
  document.querySelector('.qc-slider-value').textContent = label;
  document.querySelector('[data-qc-next]')?.removeAttribute('disabled');
  document.querySelector(`[data-qc-pick="${kind}"]`)?.classList.remove('selected');
}
// Phones often call every photo image.jpg; give each upload its own name so sources stay apart.
function qcRename(file, base) {
  const ext = (/\.[a-z0-9]+$/i.exec(file.name) || [''])[0] || ({ 'application/pdf': '.pdf', 'image/png': '.png', 'image/webp': '.webp' }[file.type] || '.jpg');
  return new File([file], base + ext.toLowerCase(), { type: file.type });
}
const carrierText = v => ({ gas: 'natural gas', oil: 'heating oil', lpg: 'LPG', electric: 'electricity', district: 'district heating' }[v] || 'your fuel');
const typeText = v => ({ 11: 'one-panel radiator (type 11)', 22: 'two-panel radiator (type 22)', 33: 'three-panel radiator (type 33)' }[v]);
async function qcReadBill(file) {
  const qc = state.qc;
  try { validateFiles([file]); } catch (error) { qc.error = error.message; render(); return; }
  qc.bill = 'reading'; qc.error = ''; render(); saveFiles([file]);
  try {
    const result = await extractFiles([file], { customer_id: customerId(), questionnaire: toCustomerInput(values()) });
    const f = result.fields || {}, kwh = f.annual_consumption_kwh?.value;
    if (!kwh) throw new Error('We could not find the yearly energy use on this page. Try a clearer photo, or skip.');
    const carrier = f.energy_carrier?.value || state.answers.energy_carrier;
    qc.billFields = { fields: f, amountText: `${formatNumber(kwh)} kWh`, carrierText: carrierText(carrier) };
    qc.bill = 'review';
  } catch (error) { qc.bill = 'pending'; qc.error = error.message || 'The bill could not be read. You can skip this step.'; }
  save(); if (state.step === 1 && state.q === 'bill') render();
}
async function qcReadRadiator() {
  const qc = state.qc, files = [radFiles.valve, radFiles.side].filter(Boolean);
  if (!files.length) return;
  qc.rad = 'reading'; qc.error = ''; render(); saveFiles(files);
  try {
    const result = await extractFiles(files, { customer_id: customerId(), questionnaire: toCustomerInput(values()) });
    const f = result.fields || {}, type = f.radiator_type?.value;
    if (!type) { qc.rad = 'unclear'; qc.radFields = { fields: f }; save(); qcNext(); return; }
    qc.radFields = { fields: f, typeText: typeText(type), pipeText: f.pipe_system?.value ? (f.pipe_system.value === 'single-pipe' ? 'single-pipe connection' : 'two-pipe connection') : '' };
    qc.rad = 'review';
  } catch (error) { qc.rad = 'pending'; qc.error = error.message || 'The photos could not be read. You can skip this step.'; }
  save(); if (state.step === 1 && state.q === 'radiator_photos') render();
}
function qcKeepEvidence(fields, keys) {
  state.answers = applyFields(state.answers, fields, keys);
  const normalized = values(); state.evidence ||= {};
  for (const key of keys) if (fields[key]?.value !== null && fields[key]?.value !== undefined) state.evidence[key] = { ...fields[key], value: normalized[key] };
  state.sample = false;
}
function qcConfirm(yes) {
  const qc = state.qc;
  if (state.q === 'bill') {
    if (yes) {
      const f = qc.billFields.fields, keys = ['annual_consumption_kwh', 'energy_carrier', 'consumption_full_year', 'hot_water_via_heating'].filter(k => f[k]?.value !== null && f[k]?.value !== undefined);
      qcKeepEvidence(f, keys); qc.bill = 'confirmed'; qc.consumptionRange = null; qc.carrierOther = false;
    } else qc.bill = 'rejected';
  }
  if (state.q === 'radiator_photos') {
    if (yes) { qcKeepEvidence(qc.radFields.fields, ['radiator_type', 'pipe_system'].filter(k => qc.radFields.fields[k]?.value)); qc.rad = 'confirmed'; }
    else qc.rad = 'unclear';
  }
  save(); qcNext();
}
app.addEventListener('input', event => {
  const el = event.target;
  if (el.dataset?.qcRange) { qcRange(el.dataset.qcRange, el.value); return; }
  if (el.name && Object.hasOwn(state.answers, el.name)) { state.answers[el.name] = el.value; document.querySelectorAll(`[data-evidence-for="${el.name}"]`).forEach(b => b.remove()); save(); }
  if (el.name?.startsWith('wi:')) {
    const key = el.name.slice(3), p = whatIf.data.params.find(x => x.key === key), label = p.labels[Number(el.value)];
    whatIf.values[key] = p.values[Number(el.value)];
    el.setAttribute('aria-valuetext', label); document.querySelector(`#wi-out-${key}`).textContent = label;
    clearTimeout(whatIfTimer); whatIfTimer = setTimeout(() => runScenarios(whatIf.values), 120);
  }
});
app.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'evidence-files') { chooseFiles([...el.files]); return; }
  if (el.dataset?.qcFile) {
    const file = el.files[0]; if (!file) return;
    if (el.dataset.qcFile === 'bill') { qcReadBill(qcRename(file, 'heating-bill')); return; }
    radFiles[el.dataset.qcFile] = qcRename(file, `radiator-${el.dataset.qcFile}`); state.qc.photos[el.dataset.qcFile] = file.name; state.qc.error = ''; render(); return;
  }
  if (el.name && Object.hasOwn(state.answers, el.name)) {
    state.answers[el.name] = el.value;
    if (el.name === 'energy_carrier') { state.answers.unit = 'kwh'; state.answers.amount = ''; }
    save();
    if (el.name === 'heat_distribution') { render(); document.querySelector(`[name="heat_distribution"][value="${el.value}"]`)?.focus(); }
  }
  if (el.name?.startsWith('cf:') || el.name?.startsWith('ok:')) {
    const [kind, key, part] = el.name.split(':'), row = CONFIRM.flatMap(([, rows]) => rows).find(r => r[0] === key);
    const entry = state.confirm[key] ||= { value: initialValue(findField(assessment.data.processed, key), row[2]), ok: false };
    if (kind === 'ok') entry.ok = el.checked;
    else {
      if (part === undefined) entry.value = el.value; else { entry.value = [...entry.value]; entry.value[Number(part)] = el.value; }
      entry.ok = true; document.querySelector(`[name="ok:${key}"]`).checked = true;
    }
    whatIf = { processed: null }; save();
  }
});
// Intake rule (docs/data-contract.md): every case the homeowner changes is its own customer folder,
// data/demo/C-<date>-<hex>/. An untouched example home is read from the demo dataset; once its answers change or a
// file is added it becomes a new customer, so the demo dataset (B-*) is never written.
function customerId() {
  if (!/^C-\d{8}-[0-9a-f]{4}$/.test(state.answers.building_id)) {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    state.answers.building_id = `C-${day}-${Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')}`;
    save();
  }
  return state.answers.building_id;
}
async function saveFiles(files) {
  const id = customerId();
  uploadSave = { status: 'saving', customerId: id };
  try { const saved = await uploadFiles(id, files); uploadSave = { status: 'saved', customerId: id, paths: saved.saved, duplicates: saved.duplicates || 0 }; }
  catch (error) { uploadSave = { status: 'error', customerId: id, error: error.message }; }
  if (state.step === 1) render();
  announce(uploadSave.status === 'saved' ? `Files saved to customer folder ${id}.` : `The files could not be saved. ${uploadSave.error}`);
}
function chooseFiles(files) {
  if (extraction.status === 'loading') return;
  try { validateFiles(files); chosenFiles = files; extraction = { status: 'idle', result: null, error: '' }; uploadPromise = saveFiles(files); }
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
  if (button.dataset.qcPick) { qcPick(button.dataset.qcPick, button.dataset.value); return; }
  if (button.hasAttribute('data-qc-next')) { qcNext(); return; }
  if (button.hasAttribute('data-qc-back')) { qcBack(); return; }
  if (button.dataset.qcSkip) { state.qc[button.dataset.qcSkip] = 'skipped'; save(); qcNext(); return; }
  if (button.dataset.qcConfirm) { qcConfirm(button.dataset.qcConfirm === 'yes'); return; }
  if (button.hasAttribute('data-qc-read-radiator')) { qcReadRadiator(); return; }
  if (button.dataset.qcEdit) { state.qcReturn = true; state.q = button.dataset.qcEdit; setStep(1); return; }
  if (button.dataset.qcStep) {
    const el = document.querySelector('#qc-area'), v = Math.min(300, Math.max(50, (state.qc.areaTouched ? Number(el.value) : 150) + Number(button.dataset.delta)));
    el.value = v; qcRange('area', v); return;
  }
  if (button.hasAttribute('data-start-ai') || button.hasAttribute('data-start-manual')) { returnToReview = false; editSnapshot = null; state.qcReturn = false; state.q = 'heating'; setStep(1); }
  if (button.hasAttribute('data-add-evidence')) { returnToReview = false; editSnapshot = null; state.qcReturn = false; state.qc.bill = 'pending'; state.q = 'bill'; setStep(1); }
  if (button.hasAttribute('data-answer-followup')) {
    // Follow-up questions now open the matching quick-check screen; conflicts between files open the review page.
    const question = assessment.data?.follow_up;
    if (question) {
      const QC_FOR = { floor_area_m2: 'area', construction_year: 'year', renovation_status: 'renovation', heat_distribution: 'heating', energy_carrier: 'carrier', amount: 'consumption', annual_consumption_kwh: 'consumption', consumption_full_year: 'consumption', persons_in_household: 'persons', radiator_count: 'radiator_count', radiator_type: 'radiator_photos', pipe_system: 'radiator_photos' };
      const target = QC_FOR[question.target];
      if (target && !question.id.startsWith('conflict:')) { state.qcReturn = true; state.q = visible(state.answers, state.qc).some(q => q.id === target) ? target : 'heating'; setStep(1); }
      else setStep(4);
    }
  }
  if (button.hasAttribute('data-skip-followup')) { state.skippedQuestion = `${assessment.key}:${assessment.data.follow_up.id}`; save(); render(); announce('This detail stays open for a professional to check.'); }
  if (button.hasAttribute('data-manual-details')) {
    homeDetailsOpen = true; const details = document.querySelector('#manual-home-details');
    if (details) { details.open = true; details.scrollIntoView({ block: 'start' }); document.querySelector('#floor_area_m2')?.focus(); }
  }
  if (button.hasAttribute('data-new-files')) { extraction = { status: 'idle', result: null, error: '' }; render(); document.querySelector('#evidence-files')?.focus(); }
  if (button.hasAttribute('data-remove-file')) {
    chosenFiles.splice(Number(button.dataset.removeFile), 1); extraction.error = ''; render(); document.querySelector('#evidence-files')?.focus();
  }
  if (button.hasAttribute('data-cancel-extraction')) { uploadGeneration++; extraction = { status: 'idle', result: null, error: '' }; homeDetailsOpen = true; render(); announce('You can continue with the questions.'); }
  if (button.hasAttribute('data-extract') || button.hasAttribute('data-read-remaining')) {
    const files = button.hasAttribute('data-read-remaining') ? [] : [...chosenFiles];
    const generation = ++uploadGeneration;
    extraction = { status: 'loading', result: null, error: '' }; render();
    try {
      await uploadPromise;
      if (generation !== uploadGeneration) return;
      if (uploadSave?.status === 'error') throw new Error(uploadSave.error);
      const result = await extractFiles(files, { customer_id: customerId(), questionnaire: { ...toCustomerInput(values()), extraction_evidence: evidencePayload() } });
      if (generation !== uploadGeneration) return;
      extraction = { status: 'done', result, error: '' };
      state.evidenceLedger = result; save();
    } catch (error) {
      if (generation !== uploadGeneration) return;
      extraction = { status: 'error', result: null, error: error.message || 'Extraction unavailable. Enter your answers manually.' };
    }
    if (state.step === 1) { render(); document.querySelector('#extraction-review')?.focus(); }
    announce(extraction.status === 'done' ? 'Extraction ready. Review the facts before using them.' : extraction.error);
  }
  if (button.hasAttribute('data-apply-extraction')) {
    const checked = [...document.querySelectorAll('[data-extracted-key]:checked')].map(el => el.dataset.extractedKey);
    const selections = Object.fromEntries([...document.querySelectorAll('[name^="conflict:"]:checked')].map(el => [el.name.slice(9), el.value]));
    let reviewed;
    try { reviewed = resolveReview(extraction.result, selections, toCustomerInput(values()), checked); }
    catch (error) { const el = document.querySelector('#conflict-error'); if (el) el.textContent = error.message; announce(error.message); return; }
    const { fields, selected, reviews } = reviewed;
    if (!selected.length && !Object.keys(reviews).length) { announce('Select a detail to use, or continue with the questions.'); return; }
    state.answers = clearUnknownAnswers(applyFields(state.answers, fields, selected), reviews);
    const normalized = values();
    state.evidence ||= {}; state.evidenceReviews ||= {};
    for (const [key, review] of Object.entries(reviews)) {
      state.evidenceReviews[key] = { ...review, value: normalized[key] ?? null };
      if (['answer', 'unknown'].includes(review.selected_id)) delete state.evidence[key];
    }
    for (const key of selected) {
      if (key === 'consumption_full_year' && !selected.includes('annual_consumption_kwh')) continue;
      state.evidence[key] = { ...fields[key], value: normalized[key] };
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
  if (button.hasAttribute('data-video-call')) { videoCallRequested = true; render(); announce('Video call request noted. This prototype does not book a real appointment.'); }
  if (button.hasAttribute('data-retry-assess')) { assessment = { key: null, status: 'idle', data: null }; render(); }
  if (button.hasAttribute('data-approve-all')) {
    for (const [, rows] of CONFIRM) for (const [key, , type] of rows) {
      if (key === 'annual_consumption_kwh' && state.answers.consumption_full_year !== 'yes') continue;
      const f = findField(assessment.data.processed, key);
      if (f && f.value !== null) (state.confirm[key] ||= { value: initialValue(f, type), ok: false }).ok = true;
    }
    whatIf = { processed: null }; save(); render(); announce('All shown values are marked as correct.');
  }
  if (button.hasAttribute('data-finalize')) { whatIf = { processed: null }; setStep(7); }
  if (button.hasAttribute('data-wi-reset')) {
    whatIf.values = Object.fromEntries(whatIf.data.params.map(p => [p.key, p.assumed]));
    for (const p of whatIf.data.params) {
      const i = p.values.indexOf(p.assumed), el = document.querySelector(`#wi-${p.key}`);
      el.value = i; el.setAttribute('aria-valuetext', p.labels[i]); document.querySelector(`#wi-out-${p.key}`).textContent = p.labels[i];
    }
    runScenarios(whatIf.values);
  }
  if (button.hasAttribute('data-reset')) document.querySelector('#reset-dialog').showModal();
  if (button.hasAttribute('data-cancel-reset')) document.querySelector('#reset-dialog').close();
  if (button.hasAttribute('data-confirm-reset')) { state.qc = emptyQc(); state.q = 'heating'; state.qcReturn = false; radFiles = { valve: null, side: null }; state.answers = empty(); state.sample = false; state.sampleAnswers = null; state.evidence = {}; state.evidenceReviews = {}; state.evidenceLedger = null; chosenFiles = []; uploadSave = null; addedCount = 0; homeDetailsOpen = false; uploadGeneration++; extraction = { status: 'idle', result: null, error: '' }; returnToReview = false; setStep(0); announce('Your answers have been cleared.'); }
  if (button.hasAttribute('data-print')) window.print();
  if (button.hasAttribute('data-download')) downloadSummary();
});
// View switch: customer view, developer view, or both side by side (result page for now).
document.querySelector('.view-switch').addEventListener('click', event => {
  const b = event.target.closest('[data-mode]');
  if (!b || b.dataset.mode === state.mode) return;
  state.mode = b.dataset.mode; save(); render();
  announce({ customer: 'Customer view.', developer: 'Developer view.', both: 'Customer and developer views side by side.' }[state.mode]);
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
  state.qc = emptyQc(); state.q = 'heating'; state.qcReturn = false;
  state.answers = a; state.sample = true; state.sampleAnswers = JSON.stringify(a); state.evidence = {}; state.evidenceReviews = {}; state.evidenceLedger = null; chosenFiles = []; uploadSave = null; addedCount = 0; homeDetailsOpen = false; uploadGeneration++; extraction = { status: 'idle', result: null, error: '' }; setStep(4); announce(`Example home ${id} loaded. Review the answers before continuing.`);
}
async function loadSamples() {
  try {
    const response = await fetch('/api/samples');
    if (!response.ok) throw new Error('Unavailable');
    samples = await response.json(); sampleError = '';
  } catch { sampleError = 'Example homes could not be loaded. You can still check your own home.'; }
  if (state.step === 0) render();
}
const caseNames = { 33: 'Three-panel radiators (type 33)', 22: 'Two-panel radiators (type 22)', 11: 'One-panel radiators (type 11)', underfloor: 'Underfloor heating' };
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
// ?demo=B-03 opens that example home's result directly (for presenting).
function openDemo() {
  const id = new URLSearchParams(location.search).get('demo');
  if (id && samples.some(b => b.building_id === id)) { loadSample(id); setStep(5); }
}
addedCount = reviewedEvidence().length;
// A ?demo= link loads its example fresh: don't assess (and save) answers left over in this tab first.
if (new URLSearchParams(location.search).get('demo')) state.step = 0;
render(); loadSamples().then(openDemo);
fetch('/api/ai-status').then(r => r.json()).then(status => { aiAvailable = status.available; if (state.step === 1 && extraction.status === 'idle' && !chosenFiles.length) render(); }).catch(() => {});
