import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTeamTarget,
  calculateWorkingDays,
  calculatePacing,
  canPresentToFactory,
  validateAdvanceEligibility,
} from './businessLogic';

test('calculateTeamTarget enforces Max(15, defaultTarget * activeSellers)', () => {
  // 1 active seller with default 4 = 4 -> should be clamped to 15
  assert.equal(calculateTeamTarget(4, 1), 15);
  // 3 active sellers with default 4 = 12 -> clamped to 15
  assert.equal(calculateTeamTarget(4, 3), 15);
  // 5 active sellers with default 4 = 20 -> 20 (> 15)
  assert.equal(calculateTeamTarget(4, 5), 20);
  // 8 active sellers with default 3.5 = 28
  assert.equal(calculateTeamTarget(3.5, 8), 28);
  // Manual override by Gerencia takes precedence if set
  assert.equal(calculateTeamTarget(4, 2, 25), 25);
});

test('calculateWorkingDays counts Monday through Saturday (excluding Sundays)', () => {
  // Test a full week: 2026-10-05 (Monday) to 2026-10-11 (Sunday)
  // Mon, Tue, Wed, Thu, Fri, Sat = 6 working days
  const weekResult = calculateWorkingDays('2026-10-05', '2026-10-11', '2026-10-08');
  assert.equal(weekResult.totalWorkingDays, 6);
  // Oct 5, 6, 7, 8 = 4 working days elapsed
  assert.equal(weekResult.elapsedWorkingDays, 4);
  assert.equal(weekResult.remainingWorkingDays, 2);
});

test('calculatePacing computes daily pace and projected sales correctly', () => {
  // 10 sales in 10 elapsed working days out of 25 total working days. Target = 20
  const pacing = calculatePacing(10, 20, 10, 25);
  assert.equal(pacing.dailyPace, 1.0);
  // 15 days remaining * 1.0 pace = 15 projected additional + 10 current = 25 projected
  assert.equal(pacing.projectedSales, 25);
  assert.equal(pacing.targetAchievementPct, 50);
});

test('canPresentToFactory strictly validates scoring approval', () => {
  assert.equal(canPresentToFactory('approved'), true);
  assert.equal(canPresentToFactory('rejected'), false);
  assert.equal(canPresentToFactory('pending'), false);
});

test('validateAdvanceEligibility enforces minimum 2 sales and deadline parameters', () => {
  // Seller has 1 sale (< 2 sales required) -> rejected
  const res1 = validateAdvanceEligibility(1, 2, 200000, 300000, 10, 15);
  assert.equal(res1.eligible, false);
  assert.match(res1.reasons[0], /1 venta/);

  // Seller has 2 sales, within deadline (day 12 <= day 15), amount within max -> approved
  const res2 = validateAdvanceEligibility(2, 2, 250000, 300000, 12, 15);
  assert.equal(res2.eligible, true);
  assert.equal(res2.reasons.length, 0);

  // Seller has 4 sales, but exceeds max amount -> rejected
  const res3 = validateAdvanceEligibility(4, 2, 400000, 300000, 10, 15);
  assert.equal(res3.eligible, false);
  assert.match(res3.reasons[0], /supera el límite máximo/);

  // Seller has 3 sales, but past monthly deadline -> rejected
  const res4 = validateAdvanceEligibility(3, 2, 150000, 300000, 18, 15);
  assert.equal(res4.eligible, false);
  assert.match(res4.reasons[0], /venció el día 15/);
});
