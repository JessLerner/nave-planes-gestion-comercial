import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { parseRenaultWorkbook, RENAULT_BA_STAMP_RATE, RENAULT_QUOTA_ADJUSTMENT } from './renaultWorkbook';

test('adds the Renault commercial adjustment and keeps the stamp as cuota 0', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    [null, 'Kwid'],
    [null, null, null, null, null, '120 cuotas', 'modalidad 100%'],
    [null, null, null, null, null, null, 'N° cuota', 1, '2 a 12'],
    [null, null, null, null, null, null, 'Precio público', 28_300_000],
    [null, null, null, null, null, null, 'Cuota Pura', 235_833],
    [null, null, null, null, null, null, 'cuota total', 262_720, 264_201],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'LISTA RED');
  const imported = parseRenaultWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));

  assert.equal(imported[0].cuota1Value, 262_720 + RENAULT_QUOTA_ADJUSTMENT);
  assert.deepEqual(imported[0].segments, [
    { from: 1, to: 1, quotaValue: 262_720 + RENAULT_QUOTA_ADJUSTMENT },
    { from: 2, to: 12, quotaValue: 264_201 + RENAULT_QUOTA_ADJUSTMENT },
  ]);
  assert.equal(imported[0].upfrontStampValue, 28_300_000 * RENAULT_BA_STAMP_RATE);
});
