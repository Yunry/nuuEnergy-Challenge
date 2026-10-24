// Quick check: the questionnaire as one question per screen (product flow agreed with the product teammate).
// It only collects answers. Every answer is written into the existing form answers (keys of `empty()` in app.js),
// so the data contract (docs/data-contract.md) and the decision engine stay unchanged. Flow-only state
// (photo status, chosen ranges, video slot) lives in `qc`, outside the answers.

export const emptyQc = () => ({
  bill: 'pending',       // pending | reading | review | confirmed | rejected | skipped
  billFields: null,      // AI-read fields shown for confirmation
  rad: 'pending',        // pending | reading | review | confirmed | unclear | skipped
  radFields: null,
  photos: { valve: null, side: null }, // chosen file names (files themselves are kept in memory only)
  video: null,           // null | slot label | 'no'
  consumptionRange: null,
  radiatorRange: null,
  areaTouched: false,
  renovationTouched: false,
  b15: [],
  b15Shown: false,
  error: '',
});

// Order of the screens. `show(a, qc)` decides whether a screen appears.
const underfloorOnly = a => a.heat_distribution === 'underfloor';
export const QUESTIONS = [
  { id: 'heating', code: 'B7', show: () => true },
  { id: 'persons', code: 'B12', show: () => true },
  { id: 'bill', code: 'Photo', show: () => true },
  { id: 'carrier', code: 'B10', show: (a, qc) => qc.bill !== 'confirmed' },
  { id: 'consumption', code: 'B11', show: (a, qc) => qc.bill !== 'confirmed' },
  { id: 'radiator_photos', code: 'Photo', show: a => !underfloorOnly(a) },
  { id: 'video', code: 'Video', show: (a, qc) => !underfloorOnly(a) && ['unclear', 'skipped'].includes(qc.rad) },
  { id: 'radiator_count', code: 'B16', show: a => !underfloorOnly(a) },
  { id: 'area', code: 'B1', show: () => true },
  { id: 'year', code: 'B2', show: () => true },
  { id: 'renovation', code: 'B3', show: () => true },
  { id: 'unusual', code: 'B15', show: (a, qc) => qc.b15Shown },
];
export const visible = (a, qc) => QUESTIONS.filter(q => q.show(a, qc));
export function nextId(id, a, qc) {
  const list = visible(a, qc), i = list.findIndex(q => q.id === id);
  return i >= 0 && i < list.length - 1 ? list[i + 1].id : null;
}
export function prevId(id, a, qc) {
  const list = visible(a, qc), i = list.findIndex(q => q.id === id);
  return i > 0 ? list[i - 1].id : null;
}

// Ranges: the middle of the range goes to the engine; the range itself is noted for the technician.
export const CONSUMPTION_RANGES = {
  oil: { unit: 'litres', options: [['lt1500', 'Less than 1,500 litres', 1000], ['1500', '1,500–2,499 litres', 2000], ['2500', '2,500–3,499 litres', 3000], ['gt3500', '3,500 litres or more', 4000]] },
  kwh: { unit: 'kwh', options: [['lt10k', 'Less than 10,000 kWh', 7500], ['10k', '10,000–19,999 kWh', 15000], ['20k', '20,000–29,999 kWh', 25000], ['gt30k', '30,000 kWh or more', 35000]] },
};
export const RADIATOR_RANGES = [['1-5', '1–5', 3], ['6-10', '6–10', 8], ['11-15', '11–15', 13], ['16-20', '16–20', 18], ['20+', 'More than 20', 22]];
// The engine reads the year as a band (before 1979 / 1980s–90s / 2002 and later); one representative year per answer.
export const YEAR_BANDS = [['1970', 'Before 1979'], ['1990', '1980–2001'], ['2010', '2002 or later']];
export const RENOVATION = [['unrenovated', 'No'], ['partially', 'Some of it'], ['fully', 'All of it']];
export const UNUSUAL = [
  ['unheated', 'Some rooms are not heated'],
  ['stove', 'We often use a wood stove or fireplace'],
  ['renovated', 'We have renovated'],
  ['area', 'The size I gave may be wrong'],
  ['unknown', 'I don’t know'],
];

// ---------- illustrations (simple inline SVG, readable in black and white) ----------
const svg = (w, h, body) => `<svg class="qc-art" viewBox="0 0 ${w} ${h}" fill="none" stroke="#254637" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ART = {
  underfloor: svg(120, 80, '<path d="M10 60h100"/><path d="M18 70c8-8 16 8 24 0s16 8 24 0 16 8 24 0 16 8 22 0" stroke="#9a4824"/><path d="M30 60V30l30-20 30 20v30"/>'),
  radiators: svg(120, 80, '<rect x="20" y="22" width="80" height="40" rx="4"/><path d="M34 22v40M48 22v40M62 22v40M76 22v40M90 22v40"/><path d="M28 62v10M92 62v10"/>'),
  mixed: svg(120, 80, '<rect x="14" y="16" width="44" height="30" rx="3"/><path d="M25 16v30M36 16v30M47 16v30"/><path d="M8 60h104"/><path d="M14 70c8-8 16 8 24 0s16 8 24 0 16 8 24 0 16 8 22 0" stroke="#9a4824"/>'),
  bill: svg(120, 90, '<path d="M30 8h44l16 16v58H30z"/><path d="M74 8v16h16"/><path d="M40 34h40M40 44h40"/><rect x="38" y="54" width="44" height="14" rx="2" stroke="#9a4824" stroke-width="3"/><text x="60" y="64" font-size="8" text-anchor="middle" fill="#9a4824" stroke="none" font-family="sans-serif">kWh / year</text>'),
  stove: svg(60, 60, '<rect x="14" y="16" width="32" height="34" rx="3"/><path d="M22 8v8M38 8v8"/><path d="M24 40c0-8 6-10 6-16 0 6 6 8 6 16" stroke="#9a4824"/>'),
  valveGood: svg(120, 100, '<rect x="10" y="10" width="100" height="80" rx="6" stroke-dasharray="4 4"/><rect x="18" y="16" width="56" height="28" rx="3"/><path d="M30 44v10h28V44"/><circle cx="44" cy="58" r="8" stroke="#9a4824"/><path d="M36 66v20M52 66v20"/>'),
  valveFar: svg(120, 100, '<rect x="10" y="10" width="100" height="80" rx="6" stroke-dasharray="4 4"/><rect x="40" y="38" width="40" height="16" rx="2"/><path d="M46 54v6M74 54v6"/>'),
  valveNear: svg(120, 100, '<rect x="10" y="10" width="100" height="80" rx="6" stroke-dasharray="4 4"/><path d="M50 10v80"/><path d="M70 10v80"/>'),
  sideGood: svg(120, 100, '<rect x="10" y="10" width="100" height="80" rx="6" stroke-dasharray="4 4"/><path d="M50 18v52M60 18v52M70 18v52" stroke-width="5"/><path d="M50 70v12M70 70v12"/><path d="M20 84h80"/>'),
  sideBad: svg(120, 100, '<rect x="10" y="10" width="100" height="80" rx="6" stroke-dasharray="4 4"/><rect x="24" y="24" width="72" height="40" rx="3"/><path d="M36 24v40M48 24v40M60 24v40M72 24v40M84 24v40"/>'),
};

// ---------- rendering ----------
export function progressBar(id, a, qc) {
  const list = visible(a, qc), i = Math.max(0, list.findIndex(q => q.id === id));
  return `<div class="qc-progress" aria-label="Question ${i + 1} of ${list.length}"><div class="qc-progress-track"><div style="width:${((i + 1) / list.length * 100).toFixed(0)}%"></div></div><span>Question ${i + 1} of ${list.length} · about 3 minutes</span></div>`;
}
const option = (name, value, label, selected, art = '', hint = '') =>
  `<button type="button" class="qc-option ${selected ? 'selected' : ''}" data-qc-pick="${name}" data-value="${value}" aria-pressed="${selected}">${art}<span class="qc-option-label">${label}</span>${hint ? `<span class="qc-option-hint">${hint}</span>` : ''}</button>`;
const notSure = (name, selected, label = 'I don’t know') => `<button type="button" class="qc-notsure ${selected ? 'selected' : ''}" data-qc-pick="${name}" data-value="unknown" aria-pressed="${selected}">${label}</button>`;
const nav = (canContinue, label = 'Continue') => `<div class="qc-nav"><button type="button" class="back-button" data-qc-back>← Back</button><button type="button" class="button primary" data-qc-next ${canContinue ? '' : 'disabled'}>${label}</button></div>`;
const confirmBox = (text, yes = 'Yes, that’s right', no = 'No, that’s wrong') => `<div class="qc-confirm" role="status"><p>${text}</p><div class="qc-confirm-actions"><button type="button" class="button primary" data-qc-confirm="yes">${yes}</button><button type="button" class="button secondary" data-qc-confirm="no">${no}</button></div></div>`;
const privacy = '<p class="qc-privacy">We only read the numbers. Cover your name and account number if you like.</p>';

export function questionHtml(id, a, qc, ctx) {
  const { escape, money, aiAvailable } = ctx;
  const head = (code, title, hint = '') => `<p class="qc-code">${code}</p><h1 id="page-title" tabindex="-1">${title}</h1>${hint ? `<p class="qc-hint">${hint}</p>` : ''}`;
  switch (id) {
    case 'heating':
      return head('B7', 'How do you heat your rooms?') + `<div class="qc-options three">${[['underfloor', 'Underfloor heating'], ['radiators', 'Radiators'], ['mixed', 'Both']].map(([v, l]) => option('heat_distribution', v, l, a.heat_distribution === v, ART[v])).join('')}</div>${notSure('heat_distribution', a.heat_distribution === 'unknown' && qc.heatingAnswered)}${nav(a.heat_distribution !== 'unknown' || qc.heatingAnswered)}`;
    case 'persons':
      return head('B12', 'How many people live in your home?', 'This helps us separate room heating from hot water.') + `<div class="qc-options numbers">${['1', '2', '3', '4', '5'].map(n => option('persons_in_household', n, n === '5' ? '5+' : n, a.persons_in_household === n)).join('')}</div>${nav(Boolean(a.persons_in_household))}`;
    case 'bill': {
      const f = qc.billFields;
      let body;
      if (qc.bill === 'reading') body = '<p class="qc-reading" role="status"><span class="reading-dot" aria-hidden="true"></span> Reading your bill… this can take up to a minute.</p>';
      else if (qc.bill === 'review' && f) body = confirmBox(`We read <strong>${escape(f.amountText)}</strong> of <strong>${escape(f.carrierText)}</strong> a year. Is that right?`);
      else if (qc.bill === 'confirmed') body = `<p class="qc-done">✓ Bill confirmed: ${escape(f?.amountText || '')} of ${escape(f?.carrierText || '')} a year.</p>${nav(true)}`;
      else body = `<figure class="qc-example">${ART.bill}<figcaption>Lay the page flat. All four corners in the picture, good light, no glare.</figcaption></figure>
        ${aiAvailable === false ? '<p class="qc-note">Reading photos is switched off on this server. You can answer two short questions instead.</p>' : `<label class="button primary qc-photo-button" for="qc-bill-file">📷 Take or choose a photo</label><input class="sr-only" id="qc-bill-file" type="file" accept="image/*,application/pdf" capture="environment" data-qc-file="bill">`}
        ${privacy}${qc.error ? `<p class="qc-error" role="alert">${escape(qc.error)}</p>` : ''}
        <div class="qc-nav"><button type="button" class="back-button" data-qc-back>← Back</button><button type="button" class="button secondary" data-qc-skip="bill">I don’t have it — skip</button></div>`;
      return head('Photo', 'Take a photo of page 1 of your heating bill') + body;
    }
    case 'carrier':
      return head('B10', 'What do you heat with today?') + `<div class="qc-options">${[['gas', 'Natural gas'], ['oil', 'Heating oil'], ['lpg', 'LPG (tank gas)'], ['other', 'Something else']].map(([v, l]) => option('energy_carrier', v, l, v === 'other' ? qc.carrierOther : a.energy_carrier === v)).join('')}</div>${nav(a.energy_carrier !== 'unknown' || qc.carrierOther)}`;
    case 'consumption': {
      const set = a.energy_carrier === 'oil' ? CONSUMPTION_RANGES.oil : CONSUMPTION_RANGES.kwh;
      return head('B11', 'About how much do you use in a year?', a.energy_carrier === 'oil' ? 'Heating oil, in litres. Add up your deliveries for one year.' : 'In kilowatt-hours (kWh), as on your bill.') + `<div class="qc-options">${set.options.map(([v, l]) => option('consumption', v, l, qc.consumptionRange === v)).join('')}</div>${notSure('consumption', qc.consumptionRange === 'unknown')}${nav(Boolean(qc.consumptionRange))}`;
    }
    case 'radiator_photos': {
      let body;
      if (qc.rad === 'reading') body = '<p class="qc-reading" role="status"><span class="reading-dot" aria-hidden="true"></span> Looking at your radiator…</p>';
      else if (qc.rad === 'review' && qc.radFields) body = confirmBox(`This looks like a <strong>${escape(qc.radFields.typeText)}</strong>${qc.radFields.pipeText ? `, with a <strong>${escape(qc.radFields.pipeText)}</strong>` : ''}. Is that right?`);
      else if (qc.rad === 'confirmed') body = `<p class="qc-done">✓ Radiator confirmed: ${escape(qc.radFields?.typeText || '')}.</p>${nav(true)}`;
      else body = `<div class="qc-photo-steps">
          <section class="qc-photo-step"><h2>1 · Close-up of the valve</h2><p>Get as close as your hand. The valve and both pipes must be in the picture.</p>
            <div class="qc-examples"><figure class="good">${ART.valveGood}<figcaption>✅ Like this</figcaption></figure><figure class="bad">${ART.valveFar}<figcaption>❌ Too far</figcaption></figure><figure class="bad">${ART.valveNear}<figcaption>❌ Too close</figcaption></figure></div>
            <label class="button secondary qc-photo-button" for="qc-valve-file">${qc.photos.valve ? '✓ ' + escape(qc.photos.valve) : '📷 Photo of the valve'}</label><input class="sr-only" id="qc-valve-file" type="file" accept="image/*" capture="environment" data-qc-file="valve"></section>
          <section class="qc-photo-step"><h2>2 · From the side</h2><p>Stand at the end of the radiator so we can count the panels. Include the pipes and the floor.</p>
            <div class="qc-examples"><figure class="good">${ART.sideGood}<figcaption>✅ From the side</figcaption></figure><figure class="bad">${ART.sideBad}<figcaption>❌ From the front</figcaption></figure></div>
            <label class="button secondary qc-photo-button" for="qc-side-file">${qc.photos.side ? '✓ ' + escape(qc.photos.side) : '📷 Photo from the side'}</label><input class="sr-only" id="qc-side-file" type="file" accept="image/*" capture="environment" data-qc-file="side"></section></div>
        ${aiAvailable === false ? '<p class="qc-note">Reading photos is switched off on this server. Skip this step and we can check it together by video.</p>' : ''}
        ${qc.error ? `<p class="qc-error" role="alert">${escape(qc.error)}</p>` : ''}
        <div class="qc-nav"><button type="button" class="back-button" data-qc-back>← Back</button><button type="button" class="button secondary" data-qc-skip="rad">Skip</button><button type="button" class="button primary" data-qc-read-radiator ${qc.photos.valve || qc.photos.side ? '' : 'disabled'} ${aiAvailable === false ? 'disabled' : ''}>Check my photos</button></div>`;
      return head('Photo', 'Two photos of one radiator') + body;
    }
    case 'video': {
      const slots = ['Tomorrow, 10:00', 'Tomorrow, 16:00', 'The day after, 11:00'];
      return head('Video', qc.rad === 'skipped' ? 'We could not see your radiator yet' : 'We could not see your radiator clearly', 'One kind of pipe connection does not suit heat pumps well. Shall one of our advisors check it with you in a short video call (about 15 minutes)?')
        + `<div class="qc-options">${slots.map(s => option('video', s, s, qc.video === s)).join('')}</div>${notSure('video', qc.video === 'no', 'No thanks')}${qc.video === 'no' ? '<p class="qc-note">That’s fine. A technician will check it at your home.</p>' : ''}${nav(Boolean(qc.video))}`;
    }
    case 'radiator_count':
      return head('B16', 'About how many radiators do you have?', 'Count the radiators in the rooms you heat. A rough number is fine.') + `<div class="qc-options numbers">${RADIATOR_RANGES.map(([v, l]) => option('radiator_count', v, l, qc.radiatorRange === v)).join('')}</div>${notSure('radiator_count', qc.radiatorRange === 'unknown')}${nav(Boolean(qc.radiatorRange))}`;
    case 'area': {
      const v = a.floor_area_m2 && qc.areaTouched ? Number(a.floor_area_m2) : null;
      return head('B1', 'How big is the home you live in?', 'Only the rooms you live in. Not the basement or the garage.')
        + `<div class="qc-slider-value" aria-live="polite">${v ? `${v >= 300 ? '300+' : v} m²` : 'Move the slider'}</div>
        <div class="qc-slider-row"><button type="button" class="qc-step" data-qc-step="area" data-delta="-10" aria-label="10 square metres less">−</button>
        <input type="range" class="qc-range ${v ? '' : 'untouched'}" id="qc-area" min="50" max="300" step="10" value="${v || 150}" aria-label="Living area in square metres" aria-valuetext="${v ? v + ' square metres' : 'not set'}" data-qc-range="area">
        <button type="button" class="qc-step" data-qc-step="area" data-delta="10" aria-label="10 square metres more">+</button></div>
        <div class="qc-scale"><span>50 m²</span><span>300+ m²</span></div>${notSure('area', qc.areaUnknown)}${nav(Boolean(v) || qc.areaUnknown)}`;
    }
    case 'year':
      return head('B2', 'When was your home built?') + `<div class="qc-options">${YEAR_BANDS.map(([v, l]) => option('construction_year', v, l, a.construction_year === v)).join('')}</div>${notSure('construction_year', qc.yearUnknown)}${nav(Boolean(a.construction_year) || qc.yearUnknown)}`;
    case 'renovation': {
      const i = RENOVATION.findIndex(([v]) => v === a.renovation_status), touched = qc.renovationTouched && i >= 0;
      return head('B3', 'Have you made energy improvements?', 'For example new windows, or insulation in the roof or walls.')
        + `<div class="qc-slider-value" aria-live="polite">${touched ? RENOVATION[i][1] : 'Move the slider'}</div>
        <input type="range" class="qc-range ${touched ? '' : 'untouched'}" id="qc-renovation" min="0" max="2" step="1" value="${touched ? i : 1}" aria-label="Energy improvements" aria-valuetext="${touched ? RENOVATION[i][1] : 'not set'}" data-qc-range="renovation">
        <div class="qc-scale three"><span>No</span><span>Some of it</span><span>All of it</span></div>${notSure('renovation', qc.renovationUnknown)}${nav(touched || qc.renovationUnknown, 'See my result')}`;
    }
    case 'unusual':
      return head('B15', 'Your energy use looks unusual for a home like yours', 'It is quite a bit lower or higher than we would expect. Could it be because of… (choose all that fit)')
        + `<div class="qc-options">${UNUSUAL.map(([v, l]) => option('unusual', v, l, qc.b15.includes(v), v === 'stove' ? ART.stove : '')).join('')}</div>${nav(qc.b15.length > 0, 'See my result')}`;
    default:
      return '';
  }
}

// Short answer text for the review page.
export function answerText(id, a, qc) {
  const pick = (list, v) => (list.find(x => x[0] === v) || [])[1];
  switch (id) {
    case 'heating': return { underfloor: 'Underfloor heating', radiators: 'Radiators', mixed: 'Both' }[a.heat_distribution] || 'Not sure';
    case 'persons': return a.persons_in_household ? (a.persons_in_household === '5' ? '5+' : a.persons_in_household) : 'Not given';
    case 'bill': return { confirmed: '✓ Read from your bill', skipped: 'Skipped', rejected: 'Not used (reading was wrong)' }[qc.bill] || 'Not added';
    case 'carrier': return qc.carrierOther ? 'Something else' : ({ gas: 'Natural gas', oil: 'Heating oil', lpg: 'LPG', electric: 'Electric', district: 'District heating' }[a.energy_carrier] || 'Not sure');
    case 'consumption': return qc.consumptionRange === 'unknown' ? 'Not sure' : pick([...CONSUMPTION_RANGES.oil.options, ...CONSUMPTION_RANGES.kwh.options], qc.consumptionRange) || (a.amount ? `${a.amount} ${a.unit === 'litres' ? 'litres' : 'kWh'}` : 'Not given');
    case 'radiator_photos': return { confirmed: '✓ Checked from your photos', unclear: 'Not clear from the photos', skipped: 'Skipped' }[qc.rad] || (a.radiator_type !== 'unknown' ? `Type ${a.radiator_type}` : 'Not added');
    case 'video': return qc.video === 'no' ? 'No thanks — technician checks it' : qc.video ? `Video call: ${qc.video}` : '—';
    case 'radiator_count': return qc.radiatorRange === 'unknown' ? 'Not sure' : pick(RADIATOR_RANGES, qc.radiatorRange) || (a.radiator_count || 'Not given');
    case 'area': return qc.areaUnknown ? 'Not sure' : a.floor_area_m2 ? `${a.floor_area_m2} m²` : 'Not given';
    case 'year': return qc.yearUnknown ? 'Not sure' : pick(YEAR_BANDS, a.construction_year) || (a.construction_year || 'Not given');
    case 'renovation': return pick(RENOVATION, a.renovation_status) || 'Not sure';
    case 'unusual': return qc.b15.map(v => pick(UNUSUAL, v)).join(', ') || '—';
    default: return '';
  }
}
export const TITLES = {
  heating: 'Room heating', persons: 'People at home', bill: 'Heating bill', carrier: 'Heating fuel', consumption: 'Use per year',
  radiator_photos: 'Radiator photos', video: 'Video check', radiator_count: 'Number of radiators', area: 'Living area', year: 'Year built',
  renovation: 'Energy improvements', unusual: 'Why use is unusual',
};
