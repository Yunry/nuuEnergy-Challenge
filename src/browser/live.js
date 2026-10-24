// Live demo (live.html): a customer workspace, data/demo/B-Live, that grows by one saved step per upload. It starts
// with B-05's stored questionnaire and no documents; each upload shows the JSON read from the file, the new result,
// what to do next, and the timeline of all steps. /live.html?fresh=1 empties it and starts again.
import { filePayload, validateFiles } from './extraction.js';

const root = document.querySelector('#live');
let state = null, busy = false, message = '', demoFiles = [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n);
const span = (r, unit) => (!r ? '—' : (r[0] === r[1] ? num(r[0]) : `${num(r[0])}–${num(r[1])}`) + unit);
const announce = text => { document.querySelector('#announcement').textContent = text; };
// The demo story's files, in order. The server keeps them (data/customer/demo), so a phone can use them without having them.
const STORY = [['07_unklar_bad-multiblock.jpeg', '1 · Unclear photo'], ['05_zweirohr-vermutet_kompakt.jpeg', '2 · Clear radiator photo']];

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
  announce(message || (last ? `Step ${last.step} saved: ${last.verdict}.` : 'The workspace is empty.'));
}

const VERDICT = {
  green: ['Approved', 'A heat pump fits this home with the radiators it has.'],
  yellow: ['Possible, not yet certain', 'A heat pump can very likely heat this home, but one thing is still open.'],
  red: ['Changes needed first', 'With the current radiators the water would need more than 60 °C.'],
};
function nextStep(d) {
  if (d.verdict === 'green') return `<h3>Next step</h3><p>Book an installer visit for a quote. On site they check the exact heat load room by room, the meter cabinet and a place for the outdoor unit.</p>`;
  if (d.verdict === 'red') return `<h3>What to change</h3><p>Larger radiators (or more panels) in the coldest rooms, then check again.</p>`;
  const asks = d.homeowner_can_provide.length ? d.homeowner_can_provide : ['A photo of a typical radiator, side and front'];
  return `<h3>To settle it, upload</h3><ul>${asks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}
function latest(l) {
  const d = l.decision, open = l.what_if.params, [title, line] = VERDICT[d.verdict];
  const facts = l.added.facts, upload = l.added.files.length;
  return `<section class="live-latest"><div class="rp-top"><div class="rp-card rp-verdict ${esc(d.verdict)}"><p class="eyebrow">Step ${l.added.step} · ${esc(d.verdict)}</p>
      <h2>${title}</h2><p>${esc(line)}</p><p class="small">Saved in <code>${esc(l.folder)}/</code></p></div>
    <div class="rp-card"><dl class="wi-numbers"><div><dt>Heat load</dt><dd>${span(l.heat_load.used, ' kW')}</dd></div><div><dt>Water temperature</dt><dd>${span(l.flow.required, ' °C')}</dd></div>
      <div><dt>Heat pump cost</dt><dd>${span(l.cost.heat_pump, ' €')}</dd></div><div><dt>Saving / year</dt><dd class="wi-saving">${span(l.cost.saving, ' €')}</dd></div></dl></div></div>
    <div class="live-grid">
      <div class="rp-card"><h3>${upload ? 'Extracted from the upload' : 'Starting point'}</h3>
        ${upload ? `<ul>${l.added.files.map(f => `<li><code>${esc(f)}</code></li>`).join('')}</ul>${(l.added.notes || []).map(n => `<p class="small">${esc(n)}</p>`).join('')}
          <pre class="live-json">${esc(JSON.stringify(facts, null, 2))}</pre>` : '<p>The customer’s questionnaire (home B-05), stored as JSON. No documents yet.</p>'}</div>
      <div class="rp-card live-next ${esc(d.verdict)}">${nextStep(d)}
        ${d.verdict_kind === 'unknown' && l.what_if.result_with_assumptions ? `<p class="live-assumed">With the standard assumptions: <span class="eval-verdict ${esc(l.what_if.result_with_assumptions.verdict)}">${esc(l.what_if.result_with_assumptions.verdict)}</span> · ${span(l.what_if.result_with_assumptions.flow_c, ' °C')}</p>` : ''}
        <h4>Still open (${open.length})</h4>${open.length && d.verdict_kind !== 'unknown' ? '<p class="small"><strong>Certain:</strong> none of these can change the verdict.</p>' : ''}
        <ul>${open.map(p => `<li>${esc(p.label)}: assumed ${esc(p.labels[p.values.indexOf(p.assumed)])}</li>`).join('')}</ul></div>
      <div class="rp-card"><h3>Technician report</h3><ol>${d.technician_checks.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        ${d.reasons.length ? `<h4>Reasons</h4><ul>${d.reasons.map(r => `<li><strong>${esc(r.type)}</strong>: ${esc(r.text)}</li>`).join('')}</ul>` : ''}</div>
    </div>
    <p><a class="button secondary" href="/?demo=B-Live">Open the full result and what-if for this step →</a></p></section>`;
}

function timeline(rows) {
  return `<h2>Timeline · one row per saved step</h2><div class="eval-scroll"><table class="eval-table"><thead><tr><th>Step</th><th>Added</th><th>Facts read</th><th>Verdict</th><th>Heat load</th><th>Water temp.</th><th>Saving / year</th><th>Open inputs</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.step} ${esc(r.label)}</td><td>${r.files.map(f => esc(f.split('/').at(-1))).join('<br>') || 'questionnaire JSON'}</td><td>${r.facts.map(esc).join('<br>') || '—'}</td>
      <td><span class="eval-verdict ${esc(r.verdict)}">${esc(r.verdict)}</span> ${esc(r.verdict_kind)}</td><td>${span(r.load_kw, ' kW')}</td><td>${span(r.flow_c, ' °C')}</td><td>${span(r.saving_eur, ' €')}</td>
      <td>${r.open_inputs.length}</td></tr>`).join('')}</tbody></table></div>`;
}

function render() {
  if (!state) { root.innerHTML = `<p class="eval-miss">${esc(message || 'Loading…')}</p>`; return; }
  const controls = `<div class="live-controls live-drop" data-live-drop>
      <label class="button primary live-upload ${!state.started || busy ? 'disabled' : ''}">Upload a document or photo<input type="file" class="sr-only" id="live-file" accept="application/pdf,image/jpeg,image/png,image/webp" ${!state.started || busy ? 'disabled' : ''}></label>
      <button type="button" class="button secondary" data-start ${busy ? 'disabled' : ''}>${state.started ? 'Start again (empty workspace)' : 'Start the workspace'}</button>
      <span class="qc-drop-hint">${state.started ? 'or drag a file here' : ''}</span></div>
    ${demoPanel()}
    ${message ? `<p class="live-message" role="status">${esc(message)}</p>` : ''}`;
  root.innerHTML = controls + (state.started ? latest(state.latest) + timeline(state.timeline) : '<p>The workspace <code>data/demo/B-Live/</code> is empty.</p>');
}

function demoPanel() {
  const files = STORY.map(([name, label]) => [demoFiles.find(f => f.name === name), label]).filter(([f]) => f);
  if (!files.length) return '';
  const used = new Set((state?.timeline || []).flatMap(r => r.files.map(f => f.split('/').at(-1))));
  return `<section class="live-demo-files" aria-label="Demo files on this server"><h2>Demo files on this server</h2>
    <p class="small">No need to have them on this device: the server adds its own copy. Or upload your own file above.</p>
    <div class="live-demo-grid">${files.map(([f, label]) => `<article class="rp-card live-demo-file">
      ${f.kind === 'pdf' ? '<span class="di-icon pdf" aria-hidden="true">PDF</span>' : `<img src="${esc(f.url)}" alt="${esc(label)}: ${esc(f.name)}" loading="lazy">`}
      <p class="live-demo-label">${esc(label)}</p><p class="small">${esc(f.note)}</p>
      <button type="button" class="button ${used.has(f.name) ? 'secondary' : 'primary'}" data-demo-file="${esc(f.name)}" ${!state?.started || busy ? 'disabled' : ''}>${used.has(f.name) ? '✓ Used · use again' : 'Use this file'}</button></article>`).join('')}</div></section>`;
}
root.addEventListener('click', event => {
  const b = event.target.closest('button');
  if (!b || busy) return;
  if (b.dataset.demoFile) act(`Adding ${b.dataset.demoFile}`, () => call('/api/live/use-demo', { name: b.dataset.demoFile }));
  if (b.hasAttribute('data-start')) act('Starting an empty workspace', async () => { await call('/api/live/reset', {}); return call('/api/live/start', {}); });
});
function upload(files) {
  if (!files.length || busy || !state?.started) return;
  act(`Reading ${files.map(f => f.name).join(', ')}`, async () => {
    validateFiles(files);
    return call('/api/live/upload', { files: await Promise.all(files.map(filePayload)) });
  });
}
root.addEventListener('change', event => { if (event.target.id === 'live-file') upload([...event.target.files]); });
// Drag and drop onto the upload area; anywhere else a dropped file must not open in the tab.
root.addEventListener('dragover', event => {
  const zone = event.target.closest('[data-live-drop]');
  if (zone && state?.started) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; zone.classList.add('drag-over'); }
});
root.addEventListener('dragleave', event => {
  const zone = event.target.closest('[data-live-drop]');
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
});
root.addEventListener('drop', event => {
  const zone = event.target.closest('[data-live-drop]');
  if (!zone) return;
  event.preventDefault(); zone.classList.remove('drag-over');
  upload([...event.dataTransfer.files]);
});
window.addEventListener('dragover', event => { if (!event.target.closest?.('[data-live-drop]')) { event.preventDefault(); event.dataTransfer.dropEffect = 'none'; } });
window.addEventListener('drop', event => { if (!event.target.closest?.('[data-live-drop]')) event.preventDefault(); });

// Opened from the welcome page (?fresh=1): always start from an empty workspace with the questionnaire.
call('/api/live/demo-files').then(files => { demoFiles = files; if (state) render(); }).catch(() => {});
if (new URLSearchParams(location.search).has('fresh')) {
  history.replaceState(null, '', location.pathname);
  act('Starting an empty workspace', async () => { await call('/api/live/reset', {}); return call('/api/live/start', {}); });
} else {
  call('/api/live').then(s => { state = s; render(); }).catch(error => { message = `Could not load the live demo: ${error.message}. Start the server with python3 scripts/serve.py.`; render(); });
}
