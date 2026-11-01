import assert from 'node:assert/strict';
import test from 'node:test';
import { displayInstallmentSegments, installmentColumns } from './priceListPresentation';

test('splits a broad 120-installment range into three readable periods', () => {
  const result = displayInstallmentSegments([{ from: 19, to: 120, quotaValue: 309_823 }], 120);
  assert.deepEqual(result.map(segment => [segment.from, segment.to]), [[19, 52], [53, 86], [87, 120]]);
});

test('uses separate columns for each visible installment range', () => {
  const columns = installmentColumns([
    { totalInstallments: 84, segments: [{ from: 2, to: 12, quotaValue: 1 }, { from: 13, to: 18, quotaValue: 2 }, { from: 19, to: 84, quotaValue: 3 }] },
    { totalInstallments: 120, segments: [{ from: 2, to: 12, quotaValue: 1 }, { from: 13, to: 120, quotaValue: 2 }] },
  ]);
  assert.deepEqual(columns.map(column => column.label), ['Cuotas 2 a 12', 'Cuotas 13 a 48', 'Cuotas 49 a 84', 'Cuotas 85 a 120']);
});
