import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessBuilding, toEngineInput } from '../src/browser/assessment.js';

const assess = data => assessBuilding(toEngineInput(data));
const base = { construction_year: 2005, floor_area_m2: 180, heat_distribution: 'underfloor', annual_consumption_kwh: 15500, energy_carrier: 'gas', persons_in_household: 3, hot_water_via_heating: true, solar_thermal: false, consumption_full_year: true };
test('official arithmetic keeps hot water in annual costs but removes it from space-heating load', () => {
  const r = assess(base);
  assert.deepEqual(r.heating_load_kw.by_consumption, [5.32, 5.32]);
  assert.deepEqual(r.heating_load_kw.by_area, [7.2, 10.8]);
  assert.equal(r.cost_eur_per_year.today, 1705);
  assert.equal(r.cost_eur_per_year.heat_pump[0], 886.6);
});
test('does not leak development labels into the engine input', () => {
  const input = toEngineInput({ ...base, expected_verdict: 'red', reference_heating_load_kw: 999, dev_check: {} });
  for (const field of ['expected_verdict', 'reference_heating_load_kw', 'dev_check']) assert.equal(field in input.fields, false);
});
test('missing information does not become zero or an unsuitable verdict', () => {
  const r = assess({});
  assert.equal(r.verdict, 'yellow');
  assert.equal(r.heating_load_kw.by_consumption, null);
  assert.equal(r.cost_eur_per_year.heat_pump, null);
  assert.ok(r.missing_information.length);
});
test('partial-year bills are excluded from annual arithmetic', () => {
  const r = assess({ ...base, consumption_full_year: false });
  assert.equal(r.heating_load_kw.by_consumption, null);
  assert.equal(r.cost_eur_per_year.today, null);
});
test('LPG is not priced as natural gas', () => {
  const r = assess({ ...base, energy_carrier: 'lpg' });
  assert.equal(r.cost_eur_per_year.today, null);
  assert.ok(r.missing_information.some(x => x.includes('LPG')));
});
test('single-pipe prevents green and produces a concrete check', () => {
  const r = assess({ ...base, pipe_system: 'single-pipe' });
  assert.equal(r.verdict, 'yellow');
  assert.ok(r.reasons.some(x => x.source === 'pipe_system' && x.type === 'action'));
});
test('solar hot water keeps the space-heating subtraction uncertain', () => {
  const r = assess({ ...base, solar_thermal: true });
  assert.deepEqual(r.heating_load_kw.by_consumption, [5.32, 6.82]);
});
test('unknown renovation is not automatically unrenovated', () => {
  const r = assess({ ...base, construction_year: 1970, renovation_status: null });
  assert.equal(r.heating_load_kw.by_area, null);
});
test('invalid hot water subtraction cannot yield a negative heating load', () => {
  const r = assess({ ...base, annual_consumption_kwh: 1000 });
  assert.equal(r.heating_load_kw.by_consumption, null);
  assert.ok(r.reasons.some(x => x.text.includes('larger than')));
});
test('higher-temperature scenarios cost more; above 60 °C remains unsupported', () => {
  const low = assess({ ...base, heat_distribution: 'radiators', flow_temperature_c: 50 });
  const high = assess({ ...base, heat_distribution: 'radiators', flow_temperature_c: 60 });
  assert.ok(high.cost_eur_per_year.heat_pump[0] > low.cost_eur_per_year.heat_pump[0]);
  assert.equal(assess({ ...base, flow_temperature_c: 70 }).cost_eur_per_year.heat_pump, null);
});
test('all five real cases produce finite estimates without requiring reference answers', async () => {
  for (const set of ['dev', 'eval']) {
    const data = JSON.parse(await readFile(new URL(`../data/raw/buildings/buildings_${set}.json`, import.meta.url), 'utf8'));
    for (const row of data) {
      const r = assess({ ...row, consumption_full_year: true });
      for (const key of ['by_area', 'by_consumption']) if (r.heating_load_kw[key]) assert.ok(r.heating_load_kw[key].every(n => Number.isFinite(n) && n >= 0));
      assert.ok(r.technician_checks.length);
    }
  }
});
