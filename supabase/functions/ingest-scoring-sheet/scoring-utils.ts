export type SheetRow = Record<string, unknown>;

export const normalizeText = (value: unknown) => String(value ?? '').trim();

export const headerKey = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

export const valueFor = (row: SheetRow, header: string) => {
  const expected = headerKey(header);
  const entry = Object.entries(row).find(([key]) => headerKey(key) === expected);
  return entry ? normalizeText(entry[1]) : '';
};

const isValidCalendarDate = (year: number, month: number, day: number) => {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
};

/**
 * Converts only unambiguous Argentine (DD/MM/YYYY or DD-MM-YYYY) and ISO
 * (YYYY-MM-DD) dates. It deliberately does not use `new Date(string)`, whose
 * locale-dependent parsing can exchange day and month.
 */
export const parseScoringDate = (value: string): string | null => {
  const source = normalizeText(value);
  if (!source) return null;

  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const argentine = source.match(/^(\d{2})(?:\/|-)(\d{2})(?:\/|-)(\d{4})$/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : argentine
    ? { year: Number(argentine[3]), month: Number(argentine[2]), day: Number(argentine[1]) }
    : null;

  if (!parts || !isValidCalendarDate(parts.year, parts.month, parts.day)) return null;
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

export const canonicalBrand = (value: unknown) => normalizeText(value).toLocaleLowerCase();

export const scoringSourceKey = (brand: string, subscription: string) =>
  `scoring:${encodeURIComponent(brand)}:${encodeURIComponent(subscription)}`;
