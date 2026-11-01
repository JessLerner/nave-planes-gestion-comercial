export type InstallmentSegment = {
  from: number;
  to: number;
  quotaValue: number;
  stampValue?: number;
};

export type DisplayInstallmentSegment = {
  from: number;
  to: number;
  minValue: number;
  maxValue: number;
  displayValue: number;
  sourceSegments: InstallmentSegment[];
};

const EARLY_INSTALLMENT_END = 12;
const DEFAULT_GROUP_TOLERANCE = 30_000;

export const installmentTotal = ({ quotaValue, stampValue = 0 }: InstallmentSegment) => quotaValue + stampValue;

const copySegment = (segment: InstallmentSegment, from: number, to: number): InstallmentSegment => ({
  ...segment,
  from,
  to,
});

const toDisplaySegment = (segments: InstallmentSegment[]): DisplayInstallmentSegment => {
  const values = segments.map(installmentTotal);
  return {
    from: segments[0].from,
    to: segments.at(-1)!.to,
    minValue: Math.min(...values),
    maxValue: Math.max(...values),
    // A grouped commercial value must never understate a possible payment.
    displayValue: Math.max(...values),
    sourceSegments: segments,
  };
};

/**
 * Keeps installments 2-12 exact and compacts later contiguous ranges only
 * when their complete quota differs by no more than the permitted tolerance.
 */
export function groupInstallmentSegments(
  sourceSegments: InstallmentSegment[],
  tolerance = DEFAULT_GROUP_TOLERANCE,
): DisplayInstallmentSegment[] {
  if (tolerance < 0) throw new Error('La tolerancia no puede ser negativa.');

  const normalized = sourceSegments
    .filter(segment => segment.from > 0 && segment.to >= segment.from)
    .flatMap(segment => {
      if (segment.from <= EARLY_INSTALLMENT_END && segment.to > EARLY_INSTALLMENT_END) {
        return [
          copySegment(segment, segment.from, EARLY_INSTALLMENT_END),
          copySegment(segment, EARLY_INSTALLMENT_END + 1, segment.to),
        ];
      }
      return [segment];
    })
    .sort((left, right) => left.from - right.from || left.to - right.to);

  const early = normalized
    .filter(segment => segment.from <= EARLY_INSTALLMENT_END)
    .map(segment => toDisplaySegment([segment]));
  const later = normalized.filter(segment => segment.from > EARLY_INSTALLMENT_END);
  const groupedLater: DisplayInstallmentSegment[] = [];

  for (const segment of later) {
    const current = groupedLater.at(-1);
    const value = installmentTotal(segment);
    const isContiguous = current && current.to + 1 === segment.from;
    const staysWithinTolerance = current
      && Math.max(current.maxValue, value) - Math.min(current.minValue, value) <= tolerance;

    if (!current || !isContiguous || !staysWithinTolerance) {
      groupedLater.push(toDisplaySegment([segment]));
      continue;
    }

    current.to = segment.to;
    current.minValue = Math.min(current.minValue, value);
    current.maxValue = Math.max(current.maxValue, value);
    current.displayValue = current.maxValue;
    current.sourceSegments.push(segment);
  }

  return [...early, ...groupedLater];
}

export const subscriptionValue = (cuota1Value: number, surchargeAmount: number) => cuota1Value + surchargeAmount;

export function validateSurcharge(surchargeAmount: number, baseSurcharge: number) {
  return Number.isFinite(surchargeAmount)
    && Number.isFinite(baseSurcharge)
    && surchargeAmount > 0
    && surchargeAmount >= baseSurcharge;
}

export function convertUsdToArs(usdAmount: number, exchangeRate: number) {
  if (!Number.isFinite(usdAmount) || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('La cotización para convertir MG debe ser mayor que cero.');
  }
  return Math.round(usdAmount * exchangeRate * 100) / 100;
}
