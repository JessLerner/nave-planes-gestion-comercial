import type { InstallmentSegment } from './priceListDomain';

export type PriceListColumn = { from: number; to: number; key: string; label: string };

const BUCKETS: PriceListColumn[] = [
  { from: 2, to: 12, key: '2-12', label: 'Cuotas 2 a 12' },
  { from: 13, to: 44, key: '13-44', label: 'Cuotas 13 a 44' },
  { from: 45, to: 84, key: '45-84', label: 'Cuotas 45 a 84' },
  { from: 85, to: 120, key: '85-120', label: 'Cuotas 85 a 120' },
];

export function installmentColumns(rows: Array<{ totalInstallments: number; segments: InstallmentSegment[] }>): PriceListColumn[] {
  const maximumInstallments = Math.max(0, ...rows.map(row => row.totalInstallments));
  return BUCKETS.filter(bucket => bucket.from <= maximumInstallments);
}

/** Uses the highest source payment intersecting each fixed commercial range. */
export function installmentBucketValues(source: InstallmentSegment[], totalInstallments: number) {
  return new Map(BUCKETS.filter(bucket => bucket.from <= totalInstallments).map(bucket => {
    const values = source.filter(segment => segment.from <= bucket.to && segment.to >= bucket.from)
      .map(segment => segment.quotaValue + (segment.stampValue || 0));
    return [bucket.key, values.length ? Math.max(...values) : null] as const;
  }));
}
