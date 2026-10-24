// Live demo (live.html): the customer folder data/demo/B-Live grows by one saved step per upload, and the page shows
// the latest result, what was added, what is still open, the technician report and the timeline of all steps.
import { filePayload, validateFiles } from './extraction.js';

const root = document.querySelector('#live');
let state = null, busy = false, message = '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n);
const span = (r, unit) => (!r ? '—' : (r[0] === r[1] ? num(r[0]) : `${num(r[0])}–${num(r[1])}`) + unit);
const announce = text => { document.querySelector('#announcement').textContent = text; };

async function call(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Server responded ${response.status}`);
  return data;
}
async function act(label, fn) {
  busy = true; message = `${label}…`; render();
  try { state = await fn(); message = ''; } catch (error) { message = error.message; }
  busy = false; render();
  const last = state?.timeline?.at(-1);
  announce(message || (last ? `Step ${last.step} saved: ${last.verdict}.` : 'The live folder is empty.'));
}

function latest(l) {
  const d = l.decision, open = l.what_if.params;
  const facts = Object.entries(l.added.facts);
  return `<section class="live-latest"><div class="rp-top"><div class="rp-card rp-verdict ${esc(d.verdict)}"><p class="eyebrow">Step ${l.added.step} · ${esc(d.verdict)} · ${esc(d.verdict_kind)}</p>
      <h2>${esc(d.summary.split(/(?<=\.)\s/)[0])}</h2><p class="small">Saved in <code>${esc(l.folder)}/</code></p></div>
    <div class="rp-card"><dl class="wi-numbers"><div><dt>Heat load</dt><dd>${span(l.heat_load.used, ' kW')}</dd></div><div><dt>Water temperature</dt><dd>${span(l.flow.required, ' °C')}</dd></div>
      <div><dt>Heat pump cost</dt><dd>${span(l.cost.heat_pump, ' €')}</dd></div><div><dt>Saving / year</dt><dd class="wi-saving">${span(l.cost.saving, ' €')}</dd></div></dl></div></div>
    <div class="live-grid">
      <div class="rp-card"><h3>Added in this step</h3>${l.added.files.length ? `<ul>${l.added.files.map(f => `<li><code>${esc(f)}</code></li>`).join('')}</ul>` : '<p>First form input (B-03).</p>'}
        ${facts.length ? `<ul class="live-facts">${facts.map(([k, f]) => `<li><strong>${esc(k)} = ${esc(Array.isArray(f.value) ? f.value.join(' × ') : f.value)}</strong> <span class="small">(${esc(f.confidence)})</span><br><span class="rp-evidence">“${esc(f.evidence)}”</span></li>`).join('')}</ul>`
          : l.added.files.length ? '<p class="small">No facts found in this file: it is not one of the known demo documents (AI extraction is not used in the live demo).</p>' : ''}</div>
      <div class="rp-card"><h3>Still open (${open.length})</h3>${open.length && d.verdict_kind !== 'unknown' ? '<p class="small"><strong>Certain:</strong> none of these can change the verdict.</p>' : ''}${open.length ? `<ul>${open.map(p => `<li><strong>${esc(p.label)}</strong>: assumed ${esc(p.labels[p.values.indexOf(p.assumed)])}</li>`).join('')}</ul>` : '<p>Nothing open.</p>'}</div>
      <div class="rp-card"><h3>Technician report</h3><ol>${d.technician_checks.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        ${d.reasons.length ? `<h4>Reasons</h4><ul>${d.reasons.map(r => `<li><strong>${esc(r.type)}</strong>: ${esc(r.text)}</li>`).join('')}</ul>` : ''}
        ${d.homeowner_can_provide.length ? `<h4>Homeowner can still provide</h4><ul>${d.homeowner_can_provide.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>
    </div>
    <p><a class="button secondary" href="/?demo=B-Live">Open the full result and what-if for this step →</a></p></section>`;
}

function timeline(rows) {
  return `<h2>Timeline · one row per saved step</h2><div class="eval-scroll"><table class="eval-table"><thead><tr><th>Step</th><th>Added</th><th>Facts read</th><th>Verdict</th><th>Heat load</th><th>Water temp.</th><th>Saving / year</th><th>Open inputs</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.step} ${esc(r.label)}</td><td>${r.files.map(f => esc(f.split('/').at(-1))).join('<br>') || 'first form input'}</td><td>${r.facts.map(esc).join('<br>') || '—'}</td>
      <td><span class="eval-verdict ${esc(r.verdict)}">${esc(r.verdict)}</span> ${esc(r.verdict_kind)}</td><td>${span(r.load_kw, ' kW')}</td><td>${span(r.flow_c, ' °C')}</td><td>${span(r.saving_eur, ' €')}</td>
      <td>${r.open_inputs.length}${r.open_inputs.length ? `: ${r.open_inputs.map(esc).join(', ')}` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function render() {
  if (!state) { root.innerHTML = `<p class="eval-miss">${esc(message || 'Loading…')}</p>`; return; }
  const controls = `<div class="live-controls">
      <button type="button" class="button primary" data-start ${busy ? 'disabled' : ''}>${state.started ? 'Restart from B-03 input' : 'Start with B-03 input'}</button>
      <label class="button secondary live-upload ${!state.started || busy ? 'disabled' : ''}">Upload a document<input type="file" class="sr-only" id="live-file" accept="application/pdf,image/jpeg,image/png,image/webp" ${!state.started || busy ? 'disabled' : ''}></label>
      <button type="button" class="reset-button" data-reset ${busy || !state.started ? 'disabled' : ''}>Reset (empty the folder)</button></div>
    ${message ? `<p class="live-message" role="status">${esc(message)}</p>` : ''}`;
  root.innerHTML = controls + (state.started ? latest(state.latest) + timeline(state.timeline) : '<p>The folder <code>data/demo/B-Live/</code> is empty. Choose <strong>Start</strong>.</p>');
}

root.addEventListener('click', event => {
  const b = event.target.closest('button');
  if (!b || busy) return;
  if (b.hasAttribute('data-start')) act('Starting', () => call('/api/live/start', {}));
  if (b.hasAttribute('data-reset') && confirm('Empty data/demo/B-Live/? All saved steps are deleted.')) act('Resetting', () => call('/api/live/reset', {}));
});
root.addEventListener('change', event => {
  if (event.target.id !== 'live-file' || busy) return;
  const files = [...event.target.files];
  act(`Saving ${files.map(f => f.name).join(', ')} as the next step`, async () => {
    validateFiles(files);
    return call('/api/live/upload', { files: await Promise.all(files.map(filePayload)) });
  });
});

call('/api/live').then(s => { state = s; render(); }).catch(error => { message = `Could not load the live demo: ${error.message}. Start the server with python3 scripts/serve.py.`; render(); });
