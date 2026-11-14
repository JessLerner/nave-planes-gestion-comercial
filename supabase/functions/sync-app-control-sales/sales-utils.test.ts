import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSale, sourceKey } from './sales-utils.ts';

test('parses an ID Ventas row using its stable external identity', () => {
  const parsed = parseSale({
    'ID Venta': 'VEN-0021', Fecha: '14/11/2026', Cliente: 'Cliente de prueba', Marca: 'Peugeot', Modelo: '208',
    'Tipo de Plan': '70/30', 'Valor Cuota #1': '1.234,50', 'Monto Cobrado': '2000',
    'Equipo de Venta': 'Centro', Vendedor: 'Vendedora de prueba', '¿Entrega Usado?': 'Sí', 'Año Usado': '2020',
  });
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.sale?.sourceKey, sourceKey('VEN-0021'));
  assert.equal(parsed.sale?.operationDate, '2026-11-14');
  assert.equal(parsed.sale?.cuota1Value, 1234.5);
  assert.deepEqual(parsed.sale?.usedCarDetails, { year: 2020 });
});

test('rejects a row without a stable ID Venta before it can duplicate a sale', () => {
  const parsed = parseSale({ Fecha: '2026-11-14', Cliente: 'Cliente de prueba', Marca: 'Peugeot', 'Equipo de Venta': 'Centro', Vendedor: 'Vendedora' });
  assert.deepEqual(parsed.issue, { code: 'missing_external_sale_id', message: 'La fila no contiene un ID Venta estable.' });
});

test('rejects impossible dates and does not guess a roster association', () => {
  const parsed = parseSale({ 'ID Venta': 'a', Fecha: '31/02/2026', Cliente: 'Cliente de prueba', Marca: 'Peugeot', 'Equipo de Venta': 'Centro', Vendedor: 'Vendedora' });
  assert.equal(parsed.issue?.code, 'invalid_operation_date');
});
