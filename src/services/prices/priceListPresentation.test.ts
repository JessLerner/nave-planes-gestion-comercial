import assert from 'node:assert/strict';
import test from 'node:test';
import { installmentBucketValues, installmentColumns } from './priceListPresentation';

test('uses a stable maximum of four installment columns', () => {
  const columns = installmentColumns([{ totalInstallments: 84, segments: [] }, { totalInstallments: 120, segments: [] }]);
  assert.deepEqual(columns.map(column => column.label), ['Cuotas 2 a 12', 'Cuotas 13 a 44', 'Cuotas 45 a 84', 'Cuotas 85 a 120']);
});

test('uses the highest source value that overlaps each commercial bucket', () => {
  const values = installmentBucketValues([
    { from: 2, to: 12, quotaValue: 300_000 }, { from: 13, to: 19, quotaValue: 429_614 },
    { from: 20, to: 59, quotaValue: 481_752 }, { from: 60, to: 84, quotaValue: 429_614 },
    { from: 85, to: 120, quotaValue: 440_000 },
  ], 120);
  assert.deepEqual([...values.entries()], [['2-12', 300_000], ['13-44', 481_752], ['45-84', 481_752], ['85-120', 440_000]]);
});
