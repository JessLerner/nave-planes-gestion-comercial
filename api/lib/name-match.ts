export type NameCandidate<T> = T & { full_name: string };

export const normalizeName = (value: string | null | undefined) => (value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ').toUpperCase();

const distance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]; previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const stored = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = stored;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
};

const sameToken = (left: string, right: string) => left === right || left.startsWith(right) || right.startsWith(left) || distance(left, right) >= 0.8;

/**
 * Returns a candidate only when the match is unequivocal: token order,
 * casing, diacritics and an additional middle name do not matter.
 */
export function confidentNameMatch<T extends NameCandidate<T>>(sourceName: string | null | undefined, candidates: T[]) {
  const source = [...new Set(normalizeName(sourceName).split(' ').filter((token) => token.length > 1))];
  if (source.length < 2) return undefined;
  const scored = candidates.map((candidate) => {
    const target = [...new Set(normalizeName(candidate.full_name).split(' ').filter((token) => token.length > 1))];
    const matches = source.filter((token) => target.some((other) => sameToken(token, other))).length;
    const sourceCoverage = matches / source.length;
    const targetCoverage = target.length ? matches / target.length : 0;
    const exactSet = source.length === target.length && source.every((token) => target.some((other) => sameToken(token, other)));
    const score = exactSet ? 1 : sourceCoverage === 1 && targetCoverage >= 0.5 ? 0.9 + targetCoverage / 20 : sourceCoverage * targetCoverage;
    return { candidate, score };
  }).sort((left, right) => right.score - left.score);
  const best = scored[0]; const second = scored[1];
  return best && best.score >= 0.9 && (!second || best.score - second.score >= 0.08) ? best.candidate : undefined;
}
