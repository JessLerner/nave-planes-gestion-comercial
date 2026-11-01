import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPeugeotReviewCardsFromPages } from './peugeotCircular';

const words = (rows: Array<Array<[string, number]>>) => rows.flatMap((row, rowIndex) => row.map(([text, x0]) => ({ text, x0, x1: x0 + text.length * 10, y0: rowIndex * 40, y1: rowIndex * 40 + 20 })));

test('Peugeot only creates a review card from a single product-detail page', () => {
  const cards = extractPeugeotReviewCardsFromPages([
    { pageNumber: 3, text: '1- DETALLE PLANES PLAN RAPID CUOTA DE SUSCRIPCIÓN NRO 1 $ 123,456 MODELO VEHÍCULO PRUEBA 01 PRECIO MODELO $ 12,345,000 TIPO PLAN 80/20 CANTIDAD DE CUOTAS 84 ADJUDICACIÓN PACTADA CTA 2, 4 y 6' },
    { pageNumber: 5, text: 'PLAN EASY 120 Cuotas 70/30 MODELO DE TABLA TOTAL CUOTA $ 197,012' },
    { pageNumber: 2, text: 'DETALLE PLANES MODELO PRUEBA A MODELO PRUEBA B MODELO PRUEBA C' },
    { pageNumber: 12, text: '3- SELLADOS PLAN / MODELO MODELO DE PRUEBA BUENOS AIRES 1.17%' },
  ]);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], { sourceKey: 'peugeot-page-3-column-1', pageNumber: 3, plan: 'PLAN RAPID', model: 'VEHÍCULO PRUEBA 01', basicValue: 12345000, planType: '80/20', totalInstallments: 84, subscriptionValue: 123456, deliveryTerms: 'CTA 2, 4 Y 6', deferral: null, recovery: null, requiredFieldsMissing: [], sourceText: '1- DETALLE PLANES PLAN RAPID CUOTA DE SUSCRIPCIÓN NRO 1 $ 123,456 MODELO VEHÍCULO PRUEBA 01 PRECIO MODELO $ 12,345,000 TIPO PLAN 80/20 CANTIDAD DE CUOTAS 84 ADJUDICACIÓN PACTADA CTA 2, 4 y 6' });
});

test('Peugeot assigns each grid column to its own product', () => {
  const cards = extractPeugeotReviewCardsFromPages([{
    pageNumber: 2,
    text: 'DETALLE PLANES',
    words: words([
      [['DETALLE', 10], ['PLANES', 90], ['PLAN', 200], ['EASY', 250], ['PLAN', 420], ['PLUS', 470]],
      [['CUOTA', 10], ['DE', 70], ['SUSCRIPCION', 100], ['100,000', 200], ['200,000', 420]],
      [['MODELO', 10], ['AUTO', 200], ['A', 250], ['AUTO', 420], ['B', 470]],
      [['PRECIO', 10], ['MODELO', 80], ['10,000,000', 200], ['20,000,000', 420]],
      [['TIPO', 10], ['PLAN', 60], ['70/30', 200], ['80/20', 420]],
      [['CANTIDAD', 10], ['DE', 95], ['CUOTAS', 125], ['120', 200], ['84', 420]],
      [['ADJUDICACION', 10], ['PACTADA', 130], ['CTA', 200], ['12', 240], ['CTA', 420], ['2', 460]],
      [['DIFERIMIENTO', 10], ['COMERCIAL', 120], ['CTA', 200], ['1', 240], ['CTA', 420], ['2', 460]],
      [['RECUPERO', 10], ['DIFERIMIENTO', 100], ['CTA', 200], ['19', 240], ['CTA', 420], ['25', 460]],
    ]),
  }]);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(card => [card.plan, card.model, card.basicValue, card.subscriptionValue, card.totalInstallments]), [['PLAN EASY', 'AUTO A', 10000000, 100000, 120], ['PLAN PLUS', 'AUTO B', 20000000, 200000, 84]]);
});
