import { groupInstallmentSegments, type DisplayInstallmentSegment, type InstallmentSegment } from './priceListDomain';

export type PriceListColumn = { from: number; to: number; key: string; label: string };

const label = (from: number, to: number) => from === to ? `Cuota ${from}` : `Cuotas ${from} a ${to}`;
const key = (from: number, to: number) => `${from}-${to}`;

const split = (segment: DisplayInstallmentSegment, pieces: number): DisplayInstallmentSegment[] => {
  const length = segment.to - segment.from + 1;
  const amount = Math.min(pieces, length);
  const base = Math.floor(length / amount);
  const remainder = length % amount;
  let from = segment.from;
  return Array.from({ length: amount }, (_, index) => {
    const to = from + base + (index < remainder ? 1 : 0) - 1;
    const part = { ...segment, from, to };
    from = to + 1;
    return part;
  });
};

/**
 * Keeps the source detail and avoids a single ambiguous long range. A 120-plan
 * always shows at least three post-12 periods; an 84-plan shows at least two.
 */
export function displayInstallmentSegments(source: InstallmentSegment[], totalInstallments: number) {
  const grouped = groupInstallmentSegments(source.filter(segment => segment.from >= 2));
  const early = grouped.filter(segment => segment.to <= 12);
  const later = grouped.filter(segment => segment.from >= 13);
  const minimumLater = totalInstallments >= 120 ? 3 : totalInstallments >= 84 ? 2 : 1;
  const missing = Math.max(0, minimumLater - later.length);
  if (!missing) return [...early, ...later];
  const targetIndex = later.reduce((best, segment, index, all) => segment.to - segment.from > all[best].to - all[best].from ? index : best, 0);
  const target = later[targetIndex];
  if (!target || target.from === target.to) return [...early, ...later];
  return [...early, ...later.flatMap((segment, index) => index === targetIndex ? split(segment, missing + 1) : [segment])];
}

export const installmentColumns = (rows: Array<{ totalInstallments: number; segments: InstallmentSegment[] }>): PriceListColumn[] => {
  const columns = new Map<string, PriceListColumn>();
  rows.flatMap(row => displayInstallmentSegments(row.segments, row.totalInstallments)).forEach(segment => {
    columns.set(key(segment.from, segment.to), { from: segment.from, to: segment.to, key: key(segment.from, segment.to), label: label(segment.from, segment.to) });
  });
  return [...columns.values()].sort((left, right) => left.from - right.from || left.to - right.to);
};
