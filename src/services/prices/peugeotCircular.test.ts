import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPeugeotReviewCardsFromPages } from './peugeotCircular';

test('Peugeot only creates a review card from a product-detail page', () => {
  const cards = extractPeugeotReviewCardsFromPages([
    { pageNumber: 3, text: '1- DETALLE PLANES PREVENTA PLAN RAPID CUOTA DE SUSCRIPCIÓN NRO 1 $ 305,160 MODELO PARTNER RAPID AM27 PRECIO MODELO $ 34,510,000 TIPO PLAN 80/20 CANTIDAD DE CUOTAS 84 ADJUDICACIÓN PACTADA CTA 2, 4 y 6' },
    { pageNumber: 5, text: 'PLAN EASY 120 Cuotas 70/30 208 Allure MT TOTAL CUOTA $ 197,012' },
    { pageNumber: 2, text: 'DETALLE PLANES MODELO 208 ALLURE MT MODELO 208 ALLURE AT MODELO EXPERT' },
    { pageNumber: 12, text: '3- SELLADOS PLAN / MODELO PARTNER RAPID BUENOS AIRES 1.17%' },
  ]);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], { pageNumber: 3, plan: 'PREVENTA PLAN RAPID', model: 'PARTNER RAPID AM27', basicValue: 34510000, planType: '80/20', totalInstallments: 84, subscriptionValue: 305160, deliveryTerms: 'CTA 2, 4 Y 6', deferral: null, recovery: null, requiredFieldsMissing: [], sourceText: '1- DETALLE PLANES PREVENTA PLAN RAPID CUOTA DE SUSCRIPCIÓN NRO 1 $ 305,160 MODELO PARTNER RAPID AM27 PRECIO MODELO $ 34,510,000 TIPO PLAN 80/20 CANTIDAD DE CUOTAS 84 ADJUDICACIÓN PACTADA CTA 2, 4 y 6' });
});
