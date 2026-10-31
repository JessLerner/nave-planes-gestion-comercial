import { ScoringStatus, BrandType, LeadSource } from '../types';

/**
 * Calculates Team Ideal Target according to business rule:
 * Objetivo Equipo = Max(15, Objetivo General Configurado * N° Vendedores Activos del Equipo)
 * Or user override if configured by Gerencia.
 */
export function calculateTeamTarget(
  defaultTargetPerSeller: number,
  activeSellersCount: number,
  targetOverride?: number
): number {
  if (targetOverride && targetOverride > 0) {
    return targetOverride;
  }
  const calculated = Math.round(defaultTargetPerSeller * activeSellersCount);
  return Math.max(15, calculated);
}

/**
 * Calculates Mon-Sat working days between start and end date (Sundays excluded).
 * Returns total days, elapsed days, and remaining days.
 */
export function calculateWorkingDays(
  startDateStr: string,
  endDateStr: string,
  currentDateStr?: string
): {
  totalWorkingDays: number;
  elapsedWorkingDays: number;
  remainingWorkingDays: number;
  completionRate: number;
} {
  // `new Date('YYYY-MM-DD')` is interpreted as UTC. In Argentina that moves
  // midnight to the preceding local day and corrupts weekday calculations.
  const parseCalendarDate = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return new Date(value);
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const start = parseCalendarDate(startDateStr);
  const end = parseCalendarDate(endDateStr);
  const current = currentDateStr ? parseCalendarDate(currentDateStr) : new Date();

  // Clamp current to [start, end]
  const clampedCurrent = new Date(
    Math.min(Math.max(current.getTime(), start.getTime()), end.getTime())
  );

  let total = 0;
  let elapsed = 0;

  const temp = new Date(start);
  while (temp <= end) {
    const dayOfWeek = temp.getDay(); // 0 is Sunday
    if (dayOfWeek !== 0) {
      total++;
      if (temp <= clampedCurrent) {
        elapsed++;
      }
    }
    temp.setDate(temp.getDate() + 1);
  }

  const remaining = Math.max(0, total - elapsed);
  const completionRate = total > 0 ? elapsed / total : 0;

  return {
    totalWorkingDays: total,
    elapsedWorkingDays: elapsed,
    remainingWorkingDays: remaining,
    completionRate,
  };
}

/**
 * Calculates commercial pacing and month-end projection.
 */
export function calculatePacing(
  currentSales: number,
  target: number,
  elapsedWorkingDays: number,
  totalWorkingDays: number
): {
  dailyPace: number;
  requiredDailyPace: number;
  projectedSales: number;
  targetAchievementPct: number;
  pacingIndexPct: number; // >100% means ahead of schedule
} {
  const safeElapsed = Math.max(1, elapsedWorkingDays);
  const remainingDays = Math.max(0, totalWorkingDays - elapsedWorkingDays);
  const remainingSales = Math.max(0, target - currentSales);

  const dailyPace = Number((currentSales / safeElapsed).toFixed(2));
  const requiredDailyPace = remainingDays > 0 ? Number((remainingSales / remainingDays).toFixed(2)) : 0;
  
  // Month-end projection = currentSales + (dailyPace * remainingDays)
  const projectedSales = Math.round(currentSales + dailyPace * remainingDays);
  
  const targetAchievementPct = target > 0 ? Number(((currentSales / target) * 100).toFixed(1)) : 0;
  
  // Expected sales at this point: target * (elapsed / total)
  const expectedSalesNow = totalWorkingDays > 0 ? (target * (elapsedWorkingDays / totalWorkingDays)) : 0;
  const pacingIndexPct = expectedSalesNow > 0 ? Number(((currentSales / expectedSalesNow) * 100).toFixed(1)) : 100;

  return {
    dailyPace,
    requiredDailyPace,
    projectedSales,
    targetAchievementPct,
    pacingIndexPct,
  };
}

/**
 * STRICT BUSINESS RULE:
 * Operation can ONLY advance to "Apto Presentación a Fábrica" if Scoring is APPROVED.
 */
export function canPresentToFactory(scoringStatus: ScoringStatus): boolean {
  return scoringStatus === 'approved';
}

/**
 * STRICT BUSINESS RULE:
 * Advance eligibility verification:
 * Seller MUST have at least 2 closed sales (or configured minimum) by deadline.
 * Requested amount must not exceed max amount.
 */
export function validateAdvanceEligibility(
  sellerSalesCount: number,
  minSalesRequired: number,
  requestedAmount: number,
  maxAdvanceAmount: number,
  requestDay: number,
  deadlineDay: number
): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (sellerSalesCount < minSalesRequired) {
    reasons.push(
      `El vendedor posee ${sellerSalesCount} venta(s) cerrada(s). Se requieren como mínimo ${minSalesRequired} ventas para solicitar adelanto.`
    );
  }

  if (requestedAmount > maxAdvanceAmount) {
    reasons.push(
      `El monto solicitado ($${requestedAmount.toLocaleString('es-AR')}) supera el límite máximo permitido de $${maxAdvanceAmount.toLocaleString('es-AR')}.`
    );
  }

  if (requestedAmount <= 0) {
    reasons.push('El monto solicitado debe ser mayor a 0.');
  }

  if (requestDay > deadlineDay) {
    reasons.push(
      `La fecha límite mensual para solicitar adelantos venció el día ${deadlineDay} del mes operativo.`
    );
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

/**
 * Format currency in Argentine Pesos (ARS)
 */
export function formatARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}
