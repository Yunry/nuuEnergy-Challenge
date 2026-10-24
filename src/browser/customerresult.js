// Customer result page: ONE page that updates in place (product design agreed with the product teammate).
// Plain language and money only; certainty dots; open items with their own action; plain technician list;
// buttons PDF · video call · technician (video first). Only the customer view uses this file: the developer view,
// the confirm page and the what-if page are unchanged and stay reachable from the developer side.
// Flow-only state lives in qc.res (outside the questionnaire answers, so the data contract is unchanged).

export const emptyRes = () => ({ outdoor: null, outdoorPhoto: null, meterPhoto: null, docs: 'pending', docsFields: null, booking: null, slot: null, contact: null, booked: {}, error: '' });
export const SLOTS = ['Tomorrow, 10:00', 'Tomorrow, 16:00', 'The day after, 11:00'];

const FUEL = { gas: 'natural gas', oil: 'heating oil', lpg: 'LPG', electric: 'electricity', district: 'district heating' };

// Which key details are confirmed. Four of them decide how sure we are; the meter cabinet only affects cost.
export function certaintyItems(answers, qc, evidence, sample) {
  const r = qc.res || emptyRes(), underfloor = answers.heat_distribution === 'underfloor';
  const ev = k => Boolean(evidence?.[k]);
  return {
    usage: qc.bill === 'confirmed' || ev('annual_consumption_kwh') || sample,
    radiator: underfloor || qc.rad === 'confirmed' || (ev('radiator_type') && ev('pipe_system')),
    outdoor: r.outdoor === 'yes',
    docs: r.docs === 'confirmed' || ev('floor_area_m2') || ev('construction_year'),
  };
}

function headline(d) {
  if (d.verdict === 'green') return { cls: 'green', label: 'Green · Looks ready', title: 'Your home looks ready for a heat pump.' };
  if (d.verdict === 'red') return { cls: 'red', label: 'Red · Changes needed first', title: 'Some changes are needed first.' };
  return { cls: 'yellow', label: 'Yellow · A few things to check', title: 'Your home could very likely get a heat pump, but a few things still need checking.' };
}

function whyText(o, answers, qc) {
  const d = o.decision, flow = o['02_radiator_check'].flow_temp_c, h = o['01_heat_load'].heating_load_kw;
  if (d.verdict_kind === 'ready') return flow.by_case?.underfloor ? 'Underfloor heating works with low water temperatures. That suits a heat pump very well.' : 'Your heating can work with low water temperatures. That suits a heat pump well.';
  if (d.verdict_kind === 'workable') return 'Your radiators would need hotter water. A heat pump still works, but it costs a bit more to run.';
  if (d.verdict_kind === 'obstacle' || d.verdict === 'red') return 'Your radiators are probably too small for a heat pump. Some of them would need to be replaced first.';
  if (d.reasons.some(r => r.source === 'pipe_system' && r.type === 'obstacle')) return 'Your radiators may be connected one after another. This kind of connection does not suit heat pumps well, so we need to check it.';
  const radiatorsOpen = answers.heat_distribution !== 'underfloor' && qc.rad !== 'confirmed' && answers.radiator_type === 'unknown';
  if (radiatorsOpen) return 'We could not see from the photo how your radiators are connected and how big they are. One kind of connection does not suit heat pumps well, so we need to check it.';
  if (h.consistent === false) return 'Your energy use and the size of your home do not quite match. We want to double-check these numbers.';
  return 'We need a few more details before we can be sure.';
}

function costBlock(p, o, money) {
  const cost = o['03_operating_cost'].cost_eur_per_year, hp = cost.heat_pump, today = cost.today;
  const fuel = FUEL[p['03_operating_cost'].fields.energy_carrier.value] || 'your current heating';
  const eur = r => (r[0] === r[1] ? money(r[0]) : `${money(r[0])}–${money(r[1])}`);
  if (!hp) return '<section class="cr-card"><h2>💶 Heating cost per year</h2><p>We can work this out once we know more about your radiators.</p></section>';
  const max = Math.max(today ?? 0, hp[1]), w = v => `${Math.max(4, v / max * 100).toFixed(0)}%`;
  const bar = (label, value, text, cls, extra = '') => `<div class="cr-bar-row"><span class="cr-bar-label">${label}</span><div class="cr-bar-track"><div class="cr-bar ${cls}" style="width:${w(value)}"></div>${extra}</div><strong>${text}</strong></div>`;
  return `<section class="cr-card"><h2>💶 Heating cost per year</h2>
    ${today !== null ? bar(`Today (${fuel})`, today, `about ${money(today)}`, 'today') : `<p class="cr-note">Today (${fuel}): there is no official price for ${fuel}, so we cannot compare it yet.</p>`}
    ${bar('With a heat pump', hp[1], `about ${eur(hp)}`, 'hp')}
    ${cost.saving && today !== null ? `<p class="cr-saving">You would save about <strong>${eur(cost.saving)}</strong> a year.</p>` : ''}
    <p class="cr-small">Energy costs only, with fixed example prices.</p></section>`;
}

function itemRow(status, title, body = '') {
  const icon = { done: '✅', open: '❓', planned: '📹', warn: '⚠️' }[status];
  return `<li class="cr-item ${status}"><span class="cr-item-icon" aria-hidden="true">${icon}</span><div><p class="cr-item-title">${title}</p>${body}</div></li>`;
}
const fileButton = (kind, label, accept = 'image/*') => `<label class="button secondary cr-file" for="cr-${kind}">${label}</label><input class="sr-only" id="cr-${kind}" type="file" accept="${accept}" capture="environment" data-cr-file="${kind}">`;

function openItems(answers, qc, c, ctx) {
  const r = qc.res, { escape, aiAvailable } = ctx, rows = [];
  // Yearly use
  rows.push(c.usage ? itemRow('done', 'Yearly energy use: from your bill')
    : itemRow('open', 'Yearly energy use: your estimate', `<div class="cr-actions-inline"><button type="button" class="button secondary" data-cr-goto="bill">📷 Photo of your heating bill</button></div>`));
  // Radiators
  if (answers.heat_distribution !== 'underfloor') {
    if (c.radiator) rows.push(itemRow('done', 'How your radiators are connected: checked'));
    else if (qc.video && qc.video !== 'no') rows.push(itemRow('planned', `How your radiators are connected: video call booked for ${escape(qc.video)}`));
    else rows.push(itemRow('open', 'How your radiators are connected', `<div class="cr-actions-inline"><button type="button" class="button secondary" data-cr-goto="radiator_photos">📷 Take the photos again</button><button type="button" class="button secondary" data-cr-book="video">📹 Book a video call</button></div>`));
  }
  // Outdoor unit
  if (r.outdoor === 'yes') rows.push(itemRow('done', 'Space outside for the outdoor unit: yes'));
  else if (r.outdoor === 'no') rows.push(itemRow('warn', 'No free space outside found yet', '<p class="cr-small">Our technician will look for options with you.</p>'));
  else rows.push(itemRow('open', 'Is there space outside for the outdoor unit?', `<p class="cr-q">Is there a free spot next to your house, about the size of a washing machine?</p>
      <div class="cr-choice">${[['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']].map(([v, l]) => `<button type="button" class="qc-option ${r.outdoor === v ? 'selected' : ''}" data-cr-outdoor="${v}">${l}</button>`).join('')}</div>
      ${r.outdoor === 'unsure' ? '<p class="cr-small">That’s fine. A photo helps, or our technician will check it.</p>' : ''}
      <div class="cr-actions-inline">${fileButton('outdoor', r.outdoorPhoto ? '✓ Photo added' : '📷 Photo of the side of your house')}</div>`));
  // Size and year
  if (c.docs) rows.push(itemRow('done', 'Size and year of your home: from your documents'));
  else if (r.docs === 'reading') rows.push(itemRow('open', 'Size and year of your home', '<p class="qc-reading" role="status"><span class="reading-dot" aria-hidden="true"></span> Reading your document…</p>'));
  else if (r.docs === 'review' && r.docsFields) rows.push(itemRow('open', 'Size and year of your home', `<div class="qc-confirm"><p>We read ${r.docsFields.text}. Is that right?</p><div class="qc-confirm-actions"><button type="button" class="button primary" data-cr-docs="yes">Yes, that’s right</button><button type="button" class="button secondary" data-cr-docs="no">No</button></div></div>`));
  else rows.push(itemRow('open', 'Size and year of your home: your estimate', `${aiAvailable === false ? '<p class="cr-small">Reading documents is switched off on this server.</p>' : `<div class="cr-actions-inline">${fileButton('docs', '📷 Energy certificate or floor plan', 'image/*,application/pdf')}</div>`}${r.error ? `<p class="qc-error" role="alert">${escape(r.error)}</p>` : ''}`));
  // Meter cabinet (cost only)
  rows.push(r.meterPhoto ? itemRow('done', 'Meter cabinet: photo received, our technician will look at it')
    : itemRow('open', 'Does your meter cabinet need an upgrade? This affects the cost.', `<div class="cr-actions-inline">${fileButton('meter', '📷 Photo of the meter cabinet')}</div>`));
  return rows.join('');
}

function bookingPanel(qc, escape) {
  const r = qc.res;
  if (!r.booking) return '';
  const what = r.booking === 'video' ? 'video call' : 'technician visit';
  if (r.booked[r.booking]) return '';
  const slotStep = r.booking === 'video' && !r.slot;
  return `<section class="cr-card cr-booking" id="cr-booking" tabindex="-1"><h2>Book a ${what}</h2>
    ${slotStep ? `<p>Choose a time (about 15 minutes):</p><div class="cr-choice">${SLOTS.map(s => `<button type="button" class="qc-option" data-cr-slot="${escape(s)}">${escape(s)}</button>`).join('')}</div>`
      : `${r.slot ? `<p>Time: <strong>${escape(r.slot)}</strong></p>` : ''}<p>How can we reach you?</p>
      ${r.booking === 'tech' ? '<label class="cr-field">Address<input type="text" data-cr-contact="address" autocomplete="street-address"></label>' : ''}
      <label class="cr-field">Phone or email<input type="text" data-cr-contact="reach" autocomplete="tel"></label>
      <label class="cr-field">Best time to call<input type="text" data-cr-contact="time" placeholder="For example, mornings"></label>
      <div class="cr-actions-inline"><button type="button" class="button primary" data-cr-confirm-booking>Confirm</button><button type="button" class="back-button" data-cr-cancel-booking>Cancel</button></div>`}</section>`;
}

export function customerResult(p, o, ctx) {
  const { answers, qc, evidence, sample, escape, money } = ctx;
  qc.res ||= emptyRes();
  const d = o.decision, v = headline(d), c = certaintyItems(answers, qc, evidence, sample);
  const n = Object.values(c).filter(Boolean).length;
  const videoBooked = (qc.video && qc.video !== 'no') || qc.res.booked.video;
  const videoText = qc.res.booked.video ? `📹 Video call: ${escape(qc.res.slot || qc.video)}` : qc.video && qc.video !== 'no' ? `📹 Video call: ${escape(qc.video)}` : '';
  const techAllowed = d.verdict === 'green' || qc.res.booked.videoDone;
  return `<div class="cr">
    <div class="cr-verdict ${v.cls}"><p class="eyebrow">${v.label}</p><h1 id="page-title" tabindex="-1">${v.title}</h1></div>
    <section class="cr-card"><h2>Why ${v.cls}?</h2><p class="cr-why">${escape(whyText(o, answers, qc))}</p></section>
    ${costBlock(p, o, money)}
    <section class="cr-card"><h2>How sure are we?</h2><p class="cr-dots" aria-label="${n} of 4 key details confirmed">${'●'.repeat(n)}${'○'.repeat(4 - n)}</p><p>${n} of 4 key details confirmed.${n < 4 ? ' Each item below takes about a minute and makes the result more certain.' : ''}</p></section>
    <section class="cr-card"><h2>Make the result more certain</h2><ul class="cr-items">${openItems(answers, qc, c, ctx)}</ul></section>
    <section class="cr-card"><h2>Only a technician can check on site</h2><ul class="cr-tech">
      <li>How much heat your home needs, room by room – we can only estimate it</li>
      <li>Whether your electricity connection is strong enough – ${qc.res.meterPhoto ? 'your photo of the meter cabinet helps us prepare' : 'a photo of the meter cabinet helps us prepare'}</li>
      <li>The best spot for the outdoor unit, including noise for your neighbours – ${qc.res.outdoorPhoto ? 'your photo of the garden helps us prepare' : 'a photo of the garden helps us prepare'}</li></ul></section>
    ${bookingPanel(qc, escape)}
    <div class="cr-buttons">
      <button type="button" class="button secondary" data-print>📄 Download / print PDF</button>
      ${videoBooked ? `<p class="cr-booked">${videoText} ✓</p>` : `<button type="button" class="button primary" data-cr-book="video">📹 Book a video call</button>`}
      ${techAllowed ? (qc.res.booked.tech ? '<p class="cr-booked">🔧 Technician visit requested ✓</p>' : '<button type="button" class="button primary" data-cr-book="tech">🔧 Book a technician</button>') : '<p class="cr-small">You can book a technician after the video call.</p>'}
    </div>
    <p class="cr-small">This is a first assessment, not a quote. Bookings in this prototype are not real appointments.</p>
  </div>`;
}
