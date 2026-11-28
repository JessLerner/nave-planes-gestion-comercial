import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { parseAssistedWorkbook } from './assistedWorkbook';

test('reads exact administrative values and official installment ranges', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Modelo', 'Tipo plan', 'Cuotas', 'Valor básico', 'Cuota pura', 'Cuota 0 sellado', 'Cuota 1', 'Tramos', 'Entregas pactadas'],
    ['Dakota', '70/30', 84, 30_000_000, 250_000, 0, 300_000, '2-12: 305000; 13-84: 325000', 'Cuota 12'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Lista');
  const items = parseAssistedWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));

  assert.deepEqual(items[0], {
    sourceKey: 'Dakota-70/30-2', model: 'Dakota', planType: '70/30', totalInstallments: 84,
    basicValue: 30_000_000, pureInstallment: 250_000, upfrontStampValue: 0, cuota1Value: 300_000,
    deliveryTerms: 'Cuota 12', segments: [{ from: 2, to: 12, quotaValue: 305_000 }, { from: 13, to: 84, quotaValue: 325_000 }],
  });
});

test('rejects an incomplete assisted mapping instead of fabricating a value', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['Modelo', 'Tipo plan', 'Cuotas', 'Valor básico', 'Cuota pura', 'Cuota 1', 'Tramos'], ['Dakota', '70/30', 84, 30_000_000, 250_000, 300_000, '2-12: 305000']]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Lista');
  assert.throws(() => parseAssistedWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), /fuera de las cuotas|no contiene|no cubren/);
});

test('rejects a blank required amount rather than treating it as zero', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['Modelo', 'Tipo plan', 'Cuotas', 'Valor básico', 'Cuota pura', 'Cuota 1', 'Tramos'], ['Modelo', '100%', 84, null, 250000, 300000, '2-84: 305000']]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Lista');
  assert.throws(() => parseAssistedWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), /valores oficiales obligatorios/);
});
