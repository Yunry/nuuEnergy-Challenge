import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFields, validateFiles } from '../src/browser/extraction.js';
const field = value => ({ value });
test('consumption clears the old period and uses kWh without another conversion', () => {
  const next = applyFields({ amount: '2000', unit: 'litres', consumption_full_year: 'yes' }, { annual_consumption_kwh: field(18000) }, ['annual_consumption_kwh']);
  assert.deepEqual(next, { amount: '18000', unit: 'kwh', consumption_full_year: 'unknown' });
});
test('a partial-year flag follows its consumption regardless of selection order', () => {
  const next = applyFields({}, { consumption_full_year: field(false), annual_consumption_kwh: field(18000) }, ['consumption_full_year', 'annual_consumption_kwh']);
  assert.equal(next.consumption_full_year, 'no');
});
test('switching heating fuel clears consumption belonging to the old fuel', () => {
  const next = applyFields({ energy_carrier: 'oil', amount: '2000', unit: 'litres' }, { energy_carrier: field('gas') }, ['energy_carrier']);
  assert.equal(next.amount, '');
});
test('only selected fields change; no reference labels can be imported', () => {
  const next = applyFields({ floor_area_m2: '150' }, { floor_area_m2: field(200), expected_verdict: field('green') }, ['expected_verdict']);
  assert.deepEqual(next, { floor_area_m2: '150' });
});
test('a period from a different bill cannot mark existing consumption as annual', () => {
  const next = applyFields({ amount: '10000', consumption_full_year: 'no' }, { consumption_full_year: field(true) }, ['consumption_full_year']);
  assert.equal(next.consumption_full_year, 'no');
});

test('invalid uploads are caught before sending a request', () => {
  const pdf = { name: 'bill.pdf', type: 'application/pdf', size: 1024 };
  assert.doesNotThrow(() => validateFiles([pdf]));
  assert.throws(() => validateFiles([]), /Choose between/);
  assert.throws(() => validateFiles([pdf, pdf]), /same name/);
  assert.throws(() => validateFiles([{ ...pdf, size: 11 * 1024 * 1024 }]), /10 MB/);
  assert.throws(() => validateFiles([{ name: 'photo.heic', type: 'image/heic', size: 1024 }]), /export it as JPG/);
});
