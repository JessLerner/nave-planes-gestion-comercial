import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPeugeotReviewCardsFromPages } from './peugeotCircular';

test('Peugeot only creates a review card from a single product-detail page', () => {
  const cards = extractPeugeotReviewCardsFromPages([
    { pageNumber: 3, text: '1- DETALLE PLANES PLAN RAPID CUOTA DE SUSCRIPCIÓN NRO 1 $ 123,456 MODELO VEHÍCULO PRUEBA 01 PRECIO MODELO $ 12,345,000 TIPO PLAN 80/20 CANTIDAD DE CUOTAS 84 ADJUDICACIÓN PACTADA CTA 2, 4 y 6' },
    { pageNumber: 5, text: 'PLAN EASY 120 Cuotas 70/30 MODELO DE TABLA TOTAL CUOTA $ 197,012' },
    { pageNumber: 2, text: 'DETALLE PLANES MODELO PRUEBA A MODELO PRUEBA B MODELO PRUEBA C' },
    { pageNumber: 12, text: '3- SELLADOS PLAN / MODELO MODELO DE PRUEBA BUENOS AIRES 1.17%' },
  ]);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], { pageNumber: 3, plan: 'PLAN RAPID', model: 'VEHÍCULO PRUEBA 01', basicValue: 12345000, planType: '80/20', totalInstallments: 84, subscriptionValue: 123456, deliveryTerms: 'CTA 2, 4 Y 6', deferral: null, recovery: null, requiredFieldsMissing: [], sourceText: '1- DETALLE PLANES PLAN RAPID CUOTA DE SUSCRIPCIÓN NRO 1 $ 123,456 MODELO VEHÍCULO PRUEBA 01 PRECIO MODELO $ 12,345,000 TIPO PLAN 80/20 CANTIDAD DE CUOTAS 84 ADJUDICACIÓN PACTADA CTA 2, 4 y 6' });
});
