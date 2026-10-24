// Browser side of the decision engine. Form answers become a customer_input object with the dataset's
// field names; the Python engine (src/decision_engine, served by scripts/serve.py at /api/assess) prepares
// and assesses it.
// Development labels never leave this function: only the keys below are sent.
export const INPUT_KEYS = ['building_id', 'construction_year', 'floor_area_m2', 'renovation_status', 'heat_distribution',
  'annual_consumption_kwh', 'consumption_full_year', 'energy_carrier', 'persons_in_household', 'hot_water_via_heating',
  'flow_temperature_c', 'pipe_system', 'radiator_count', 'radiator_type', 'other_heat_source', 'solar_thermal', 'building_notes'];

export function toCustomerInput(values) {
  const known = v => (v === undefined || v === '' || v === 'unknown' || Number.isNaN(v) ? null : v);
  return Object.fromEntries(INPUT_KEYS.map(key => [key, known(values[key])]));
}

export async function assess(customerInput, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(customerInput), signal: controller.signal });
    if (!response.ok) throw new Error(`Engine responded ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
