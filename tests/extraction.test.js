import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReview, clearUnknownAnswers } from '../src/browser/evidence.js';
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

const reading = (id, field, value, file_id) => ({ id, field, value, file_id, source_file: file_id + '.pdf', confidence: 'high', evidence: 'Documented' });
test('a competing reading needs a deliberate decision and keeps its provenance', () => {
  const candidates = [reading('a:area', 'floor_area_m2', 150, 'a'), reading('b:area', 'floor_area_m2', 180, 'b')];
  const result = { fields: {}, conflicts: [{ field: 'floor_area_m2', candidates }], observations: candidates };
  assert.throws(() => resolveReview(result, {}, {}, []), /Choose an answer/);
  const reviewed = resolveReview(result, { floor_area_m2: 'b:area' }, {}, []);
  assert.equal(reviewed.fields.floor_area_m2.source_file, 'b.pdf');
  assert.deepEqual(reviewed.reviews.floor_area_m2.considered_ids, ['a:area', 'b:area']);
  assert.equal(result.observations.length, 2);
});
test('choosing a bill binds its period and fuel to that document', () => {
  const bill = reading('a:kwh', 'annual_consumption_kwh', 18000, 'a');
  const period = reading('a:period', 'consumption_full_year', false, 'a');
  const fuel = reading('a:fuel', 'energy_carrier', 'gas', 'a');
  const result = { fields: {}, conflicts: [{ field: 'annual_consumption_kwh', candidates: [bill] }], observations: [bill, period, fuel] };
  const review = resolveReview(result, { annual_consumption_kwh: 'a:kwh' }, {}, []);
  const answers = applyFields({ amount: '10000', consumption_full_year: 'yes' }, review.fields, review.selected);
  assert.equal(answers.amount, '18000');
  assert.equal(answers.consumption_full_year, 'no');
  assert.equal(answers.energy_carrier, 'gas');
});
test('different bills cannot supply the chosen consumption and its dates', () => {
  const bill = reading('a:kwh', 'annual_consumption_kwh', 18000, 'a');
  const period = reading('a:period', 'consumption_full_year', false, 'a');
  const wrong = reading('b:period', 'consumption_full_year', true, 'b');
  const result = { fields: {}, conflicts: [{ field: 'annual_consumption_kwh', candidates: [bill] }, { field: 'consumption_full_year', candidates: [period, wrong] }], observations: [bill, period, wrong] };
  assert.throws(() => resolveReview(result, { annual_consumption_kwh: bill.id, consumption_full_year: wrong.id }, {}, []), /same bill/);
});
test('leaving a disputed value unknown clears that answer without erasing its observations', () => {
  const answers = clearUnknownAnswers({ amount: '18000', consumption_full_year: 'yes', floor_area_m2: '150' }, {
    annual_consumption_kwh: { selected_id: 'unknown' }, floor_area_m2: { selected_id: 'unknown' },
  });
  assert.equal(answers.amount, '');
  assert.equal(answers.floor_area_m2, '');
  assert.equal(answers.consumption_full_year, 'unknown');
});
test('keeping old consumption does not import the period from a new bill', () => {
  const result = { fields: { consumption_full_year: { value: true } }, conflicts: [{ field: 'annual_consumption_kwh', candidates: [reading('a:kwh', 'annual_consumption_kwh', 20000, 'a')] }], observations: [] };
  const review = resolveReview(result, { annual_consumption_kwh: 'answer' }, { annual_consumption_kwh: 18000 }, ['consumption_full_year']);
  assert.equal(review.selected.includes('consumption_full_year'), false);
});

test('a newly selected bill cannot be combined with a conflicting manual fuel', () => {
  const bill = reading('a:kwh', 'annual_consumption_kwh', 18000, 'a');
  const fuel = reading('a:fuel', 'energy_carrier', 'oil', 'a');
  const result = { fields: { annual_consumption_kwh: bill }, conflicts: [{ field: 'energy_carrier', candidates: [fuel] }], observations: [bill, fuel] };
  assert.throws(() => resolveReview(result, { energy_carrier: 'answer' }, { energy_carrier: 'gas' }, ['annual_consumption_kwh']), /different fuel or period/);
});
