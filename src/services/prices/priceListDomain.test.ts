import assert from 'node:assert/strict';
import test from 'node:test';
import {
  convertUsdToArs,
  groupInstallmentSegments,
  subscriptionValue,
  validateSurcharge,
} from './priceListDomain';

test('keeps installments 2 to 12 separate from later grouping', () => {
  const result = groupInstallmentSegments([
    { from: 2, to: 13, quotaValue: 100_000, stampValue: 5_000 },
    { from: 14, to: 20, quotaValue: 120_000, stampValue: 5_000 },
    { from: 21, to: 40, quotaValue: 128_000, stampValue: 5_000 },
  ]);

  assert.deepEqual(result.map(segment => [segment.from, segment.to, segment.displayValue]), [
    [2, 12, 105_000],
    [13, 40, 133_000],
  ]);
});

test('starts a new later column when the range exceeds the tolerance', () => {
  const result = groupInstallmentSegments([
    { from: 13, to: 20, quotaValue: 100_000 },
    { from: 21, to: 40, quotaValue: 131_000 },
  ]);

  assert.deepEqual(result.map(segment => [segment.from, segment.to]), [[13, 20], [21, 40]]);
});

test('does not allow a manager surcharge below the published base', () => {
  assert.equal(validateSurcharge(400_000, 400_000), true);
  assert.equal(validateSurcharge(600_000, 400_000), true);
  assert.equal(validateSurcharge(399_999, 400_000), false);
  assert.equal(validateSurcharge(0, 400_000), false);
});

test('calculates supervisor subscription and rounds MG conversion', () => {
  assert.equal(subscriptionValue(1_000_000, 600_000), 1_600_000);
  assert.equal(convertUsdToArs(227.15, 1_425.2), 323_734.18);
});
