// Internal competition evaluation (not part of the product). Shows, per demo customer, the processed inputs,
// the engine outputs and the organizers' labels. Data: /api/evaluation (scripts/evaluate.py), fresh on every load.
const root = document.querySelector('#eval');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rng = r => (!r ? '—' : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
const val = v => esc(v === null || v === undefined ? 'null' : typeof v === 'object' ? JSON.stringify(v) : v);
const mark = ok => (ok === undefined ? '—' : `<span class="${ok ? 'eval-ok' : 'eval-miss'}">${ok ? 'yes' : 'no'}</span>`);

function summary(rows) {
  const labelled = rows.filter(r => r.dev_check);
  const count = key => labelled.filter(r => r.dev_check[key]).length;
  return `<ul class="eval-summary">
    <li><strong>${count('verdict_match')} / ${labelled.length}</strong> verdicts match the expected label</li>
    <li><strong>${count('reference_in_range')} / ${labelled.length}</strong> reference heat loads inside the engine's “used” range</li>
    <li><strong>${rows.length - labelled.length}</strong> evaluation customers without labels (engine result only)</li></ul>`;
}

function table(rows) {
  const head = ['Customer', 'Labels', 'Expected', 'Engine', 'Match', 'Ref. load kW', 'Used kW', 'In range', 'By area kW', 'By bill kW', 'Consistent', 'Flow °C by type', 'Today → heat pump €/a'];
  const body = rows.map(r => {
    const { decision: d, '01_heat_load': h, '02_radiator_check': rc, '03_operating_cost': c } = r.outputs, dev = r.dev_check || {}, load = h.heating_load_kw;
    const flow = Object.entries(rc.flow_temp_c.by_case || {}).map(([t, x]) => `${esc(t)}: ${rng(x)}`).join('<br>') || '—';
    return `<tr><th scope="row"><a href="#${esc(r.building_id)}">${esc(r.building_id)}</a></th><td>${r.dev_check ? 'dev' : 'eval'}</td>
      <td>${esc(dev.expected_verdict ?? '—')}</td><td><span class="eval-verdict ${esc(d.verdict)}">${esc(d.verdict)}</span> ${esc(d.verdict_kind)}</td>
      <td>${mark(dev.verdict_match)}</td><td>${esc(dev.reference_heating_load_kw ?? '—')}</td><td>${rng(load.used)}</td><td>${mark(dev.reference_in_range)}</td>
      <td>${rng(load.by_area)}</td><td>${rng(load.by_consumption)}</td><td>${esc(load.consistent ?? '—')}</td><td>${flow}</td>
      <td>${esc(c.cost_eur_per_year.today ?? '—')} → ${rng(c.cost_eur_per_year.heat_pump)}</td></tr>`;
  }).join('');
  return `<div class="eval-scroll"><table class="eval-table"><thead><tr>${head.map(x => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function stepTable(name, step) {
  const fields = Object.entries(step.fields).map(([k, f]) => `<tr><td>${esc(k)}</td><td>${val(f.value)}</td><td>${esc(f.confidence ?? 'null')}</td><td>${esc(f.source)}</td><td>${esc(f.evidence)}</td></tr>`).join('');
  const refs = Object.entries(step.reference_data).map(([k, f]) => `<tr class="eval-ref"><td>${esc(k)}</td><td>${val(f.value)}</td><td>${esc(f.confidence ?? 'null')}</td><td>${esc(f.source)}</td><td>${esc(f.evidence)}</td></tr>`).join('');
  return `<h4>processed/${esc(name)}.json</h4><div class="eval-scroll"><table class="eval-table"><thead><tr><th>field</th><th>value</th><th>confidence</th><th>source</th><th>evidence</th></tr></thead><tbody>${fields}${refs}</tbody></table></div>`;
}

function customer(r) {
  const d = r.outputs.decision;
  return `<details class="eval-customer" id="${esc(r.building_id)}"><summary>${esc(r.building_id)} · ${esc(d.verdict)} / ${esc(d.verdict_kind)}${r.dev_check ? ` · expected ${esc(r.dev_check.expected_verdict)}` : ''}</summary>
    <h3>Engine decision</h3><p>${esc(d.summary)}</p>
    <ul>${d.reasons.map(x => `<li><strong>${esc(x.type)}</strong> (${esc(x.source)}): ${esc(x.text)}</li>`).join('')}</ul>
    <h3>Assumptions</h3><ul>${d.assumptions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Processed inputs</h3><p class="small">Grey rows are reference data. These files are the extraction step's result for this customer.</p>
    ${Object.entries(r.processed).map(([name, step]) => stepTable(name, step)).join('')}
    <h3>Raw customer input</h3><pre>${esc(JSON.stringify(r.customer_input, null, 2))}</pre>
    <h3>Engine outputs</h3>${Object.entries(r.outputs).map(([name, o]) => `<h4>output/${esc(name)}.json</h4><pre>${esc(JSON.stringify(o, null, 2))}</pre>`).join('')}
  </details>`;
}

async function main() {
  try {
    const response = await fetch('/api/evaluation');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    root.innerHTML = summary(rows) + table(rows) + '<h2>Per customer</h2>' + rows.map(customer).join('');
  } catch (error) {
    root.innerHTML = `<p class="eval-miss">Could not run the evaluation: ${esc(error.message)}. Start the server with <code>python3 scripts/serve.py</code>.</p>`;
  }
}
main();
