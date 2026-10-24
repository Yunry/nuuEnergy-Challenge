// Uploads are saved unchanged to the customer's folder (data/demo/<id>/raw/) as soon as they are chosen;
// they go to the AI only on request. Reviewed facts join the normal editable form.
export const fieldLabels = {
  construction_year: 'Year built', floor_area_m2: 'Heated floor area (m²)',
  annual_consumption_kwh: 'Heating fuel used (kWh)', persons_in_household: 'People at home',
  flow_temperature_c: 'Cold-day flow temperature (°C)', radiator_count: 'Radiators in the home',
  renovation_status: 'Insulation improvements', energy_carrier: 'Heating energy source',
  heat_distribution: 'Room heating', pipe_system: 'Pipe layout', radiator_type: 'Radiator type',
  consumption_full_year: 'Consumption covers a full year', hot_water_via_heating: 'Hot water from heating',
  other_heat_source: 'Another heat source', solar_thermal: 'Solar hot water', building_notes: 'Documented observations',
};
const payloadCache = new WeakMap();
// Some file pickers/drop sources omit MIME types, including the supplied .jpeg photos.
export function fileType(file) {
  return file.type || ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[file.name.split('.').pop().toLowerCase()] || '');
}
export function filePayload(file) {
  if (!payloadCache.has(file)) payloadCache.set(file, readPayload(file));
  return payloadCache.get(file);
}
function readPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read. Please choose it again.'));
    reader.onload = () => resolve({ name: file.name, type: fileType(file), data: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  });
}
export function validateFiles(files) {
  if (!files.length || files.length > 3) throw new Error('Choose between 1 and 3 PDF or image files.');
  if (files.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024) throw new Error('Files must total no more than 10 MB.');
  if (files.some(f => !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(fileType(f)))) throw new Error('Use PDF, JPG, PNG or WebP files. For a HEIC photo, export it as JPG first.');
  if (new Set(files.map(f => f.name)).size !== files.length) throw new Error('These files have the same name. Rename one so you can tell their sources apart.');
}
// context {customer_id, questionnaire}: the server sends the questionnaire and the customer's saved files to the LLM
// and keeps the result in the customer folder (intake rule, docs/data-contract.md).
export async function extractFiles(files, context = {}) {
  if (files.length || !context.customer_id) validateFiles(files);
  const payload = await Promise.all(files.map(filePayload));
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 100000);
  try {
    const response = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...context, files: payload }), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'AI extraction could not be completed. Enter answers manually or try again.');
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Extraction took too long. Try fewer pages or enter answers manually.');
    throw error;
  } finally { clearTimeout(timer); }
}
export function applyFields(answers, fields, selected) {
  const next = { ...answers };
  for (const key of selected) {
    const value = fields[key]?.value;
    if (!Object.hasOwn(fieldLabels, key) || value === null || value === undefined) continue;
    if (key === 'consumption_full_year' && !selected.includes('annual_consumption_kwh')) continue;
    if (key === 'annual_consumption_kwh') {
      next.amount = String(value); next.unit = 'kwh';
      // Consumption and its period must travel together, never retain a previous annual flag.
      next.consumption_full_year = 'unknown';
    } else if (key === 'building_notes') {
      next.building_notes = [...new Set([...(next.building_notes || '').split('\n\n'), ...String(value).split('\n\n')].filter(Boolean))].join('\n\n').slice(0, 3000);
    } else {
      next[key] = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
    }
  }
  // Apply the new period last, regardless of selection order.
  if (selected.includes('annual_consumption_kwh') && selected.includes('consumption_full_year') && typeof fields.consumption_full_year?.value === 'boolean') {
    next.consumption_full_year = fields.consumption_full_year.value ? 'yes' : 'no';
  }
  if (selected.includes('energy_carrier') && !selected.includes('annual_consumption_kwh') && next.energy_carrier !== answers.energy_carrier) {
    next.amount = ''; next.unit = 'kwh'; next.consumption_full_year = 'unknown';
  }
  return next;
}

// Save the chosen files to the customer's raw folder on this server. Returns {customer_id, saved: [paths]}.
export async function uploadFiles(customerId, files) {
  validateFiles(files);
  const payload = await Promise.all(files.map(filePayload));
  const response = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: customerId, files: payload }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The files could not be saved.');
  return result;
}
