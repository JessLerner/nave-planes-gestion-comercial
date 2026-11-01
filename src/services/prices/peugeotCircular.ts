import { extractStellantisCircularPages, type OcrWord } from './stellantisOcr';

export type PeugeotReviewCard = {
  sourceKey: string;
  pageNumber: number;
  plan: string | null;
  model: string | null;
  basicValue: number | null;
  planType: string | null;
  totalInstallments: number | null;
  subscriptionValue: number | null;
  deliveryTerms: string | null;
  deferral: string | null;
  recovery: string | null;
  requiredFieldsMissing: string[];
  sourceText: string;
};

const money = (value?: string) => value ? Number(value.replace(/\D/g, '')) || null : null;
const between = (text: string, start: RegExp, end: RegExp) => text.match(start)?.[1]?.replace(end, '').trim() || null;
const pageIsProductDetail = (text: string) => /DETALLE\s+PLANES/.test(text.replace(/\s+/g, ' ').toUpperCase());
const pageHasSingleProduct = (text: string) => (text.replace(/PRECIO\s+MODELO/gi, '').match(/MODELO/gi) || []).length === 1;
const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
const firstMoneyAfter = (text: string, label: string) => money(text.match(new RegExp(`${label}[\\s\\S]{0,50}?([\\d][\\d.,]{2,})`, 'i'))?.[1]);
type OcrRow = { y: number; words: OcrWord[]; text: string };
const upper = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const rowWords = (words: OcrWord[]) => {
  const tolerance = Math.max(12, [...words].sort((a, b) => (a.y1 - a.y0) - (b.y1 - b.y0))[Math.floor(words.length / 2)]?.y1 - [...words].sort((a, b) => (a.y1 - a.y0) - (b.y1 - b.y0))[Math.floor(words.length / 2)]?.y0 || 12);
  const rows: OcrRow[] = [];
  for (const word of [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const center = (word.y0 + word.y1) / 2;
    const row = rows.find(candidate => Math.abs(candidate.y - center) <= tolerance);
    if (row) { row.words.push(word); row.y = (row.y * (row.words.length - 1) + center) / row.words.length; }
    else rows.push({ y: center, words: [word], text: '' });
  }
  return rows.map(row => ({ ...row, words: row.words.sort((a, b) => a.x0 - b.x0), text: row.words.sort((a, b) => a.x0 - b.x0).map(word => word.text).join(' ') }));
};
const rowValue = (row: OcrRow | undefined, left: number, right: number) => row ? compact(row.words.filter(word => (word.x0 + word.x1) / 2 >= left && (word.x0 + word.x1) / 2 <= right).map(word => word.text).join(' ')) || null : null;
const matchingRow = (rows: OcrRow[], pattern: RegExp, from: number, to: number) => rows.find(row => row.y >= from && row.y <= to && pattern.test(upper(row.text)));
const gridCards = (pageNumber: number, text: string, words: OcrWord[]): PeugeotReviewCard[] => {
  const rows = rowWords(words);
  const planWords = words.filter(word => upper(word.text) === 'PLAN').filter(word => {
    const next = words.filter(other => Math.abs((other.y0 + other.y1 - word.y0 - word.y1) / 2) < Math.max(20, word.y1 - word.y0) && other.x0 > word.x1).sort((a, b) => a.x0 - b.x0)[0];
    return next && /^(RAPID|EASY|PLUS|2008|NUEVA|EXPERT)$/i.test(upper(next.text));
  });
  const headings = planWords.map(word => ({ word, row: rows.find(row => row.words.includes(word))! })).filter(entry => entry.row);
  const groups = new Map<number, typeof headings>();
  for (const heading of headings) { const key = [...groups.keys()].find(y => Math.abs(y - heading.row.y) < 45) ?? heading.row.y; groups.set(key, [...(groups.get(key) || []), heading]); }
  const cards: PeugeotReviewCard[] = [];
  for (const [groupY, group] of groups) {
    const ordered = [...group].sort((a, b) => a.word.x0 - b.word.x0);
    const nextGroupY = [...groups.keys()].filter(y => y > groupY).sort((a, b) => a - b)[0] || Infinity;
    for (const [index, heading] of ordered.entries()) {
      const previous = ordered[index - 1]?.word; const next = ordered[index + 1]?.word;
      const left = previous ? (previous.x0 + heading.word.x0) / 2 : heading.word.x0 - ((next?.x0 || heading.word.x0 + 240) - heading.word.x0) / 2;
      const right = next ? (next.x0 + heading.word.x0) / 2 : heading.word.x0 + (heading.word.x0 - (previous?.x0 || heading.word.x0 - 240)) / 2;
      const from = heading.row.y - 25; const to = nextGroupY - 25;
      const value = (pattern: RegExp) => rowValue(matchingRow(rows, pattern, from, to), left, right);
      const plan = rowValue(heading.row, heading.word.x0 - 4, right);
      const model = value(/(^|\s)MODELO(\s|$)/);
      const basicValue = money(value(/PRECIO\s+MODELO/) || undefined);
      const planType = value(/TIPO\s+PLAN/);
      const totalInstallments = Number((value(/CANTIDAD\s+DE\s+CUOTAS/) || '').replace(/\D/g, '')) || null;
      const subscriptionValue = money(value(/CUOTA\s+DE\s+SUSCRIPCION/) || undefined);
      const deliveryTerms = value(/ADJUDICACION\s+PACTADA/);
      const deferral = value(/DIFERIMIENTO\s+COMERCIAL/);
      const recovery = value(/RECUPERO\s+DIFERIMIENTO/);
      const requiredFieldsMissing = [['modelo', model], ['plan', plan], ['valor básico', basicValue], ['tipo de plan', planType], ['cuotas', totalInstallments], ['cuota de suscripción', subscriptionValue]].filter(([, item]) => !item).map(([field]) => field as string);
      cards.push({ sourceKey: `peugeot-page-${pageNumber}-column-${index + 1}`, pageNumber, plan, model, basicValue, planType, totalInstallments, subscriptionValue, deliveryTerms, deferral, recovery, requiredFieldsMissing, sourceText: text });
    }
  }
  return cards;
};

/** Strict page-card extraction. Missing/ambiguous fields remain null for human review. */
export function extractPeugeotReviewCardsFromPages(pages: Array<{ pageNumber: number; text: string; words?: OcrWord[] }>): PeugeotReviewCard[] {
  return pages.filter(page => pageIsProductDetail(page.text)).flatMap(({ pageNumber, text, words }) => {
    if (words?.length) return gridCards(pageNumber, text, words);
    if (!pageHasSingleProduct(text)) return [];
    const normalized = compact(text).toUpperCase();
    const model = between(normalized, /MODELO\s+(.+?)(?=PRECIO\s*MODELO|TIPO\s*PLAN)/, /\s+$/);
    const plan = normalized.match(/(?:PREVENTA\s+)?PLAN\s+(?:RAPID|EASY|PLUS(?:\s+AT)?|2008(?:\s+T200)?|NUEVA\s+PARTNER\s+VAN|EXPERT)/)?.[0] || null;
    const basicValue = firstMoneyAfter(normalized, 'PRECIO\\s*MODELO');
    const planType = normalized.match(/TIPO\s*PLAN\s*(\d{2,3}\s*\/\s*\d{2,3}|100%)/)?.[1]?.replace(/\s/g, '') || null;
    const totalInstallments = Number(normalized.match(/CANTIDAD\s*DE\s*CUOTAS\s*(\d{2,3})/)?.[1] || 0) || null;
    const subscriptionValue = firstMoneyAfter(normalized, 'CUOTA\\s*DE\\s*SUSCRIPCI[ÓO]N');
    const deliveryTerms = normalized.match(/ADJUDICACI[ÓO]N\s*PACTADA\s+(CTA\s*[\d,\sY]+)/)?.[1]?.replace(/\s+/g, ' ').trim() || null;
    const deferral = between(normalized, /DIFERIMIENTO\s*COMERCIAL[^A-Z]*(.+?)(?=RECUPERO|BENEFICIO)/, /\s+$/);
    const recovery = between(normalized, /RECUPERO\s*DIFERIMIENTO\s+(.+?)(?=BENEFICIO|CUOTA)/, /\s+$/);
    const requiredFieldsMissing = [['modelo', model], ['plan', plan], ['valor básico', basicValue], ['tipo de plan', planType], ['cuotas', totalInstallments], ['cuota de suscripción', subscriptionValue]].filter(([, value]) => !value).map(([field]) => field as string);
    return { sourceKey: `peugeot-page-${pageNumber}-column-1`, pageNumber, plan, model, basicValue, planType, totalInstallments, subscriptionValue, deliveryTerms, deferral, recovery, requiredFieldsMissing, sourceText: text };
  }).filter(card => card.model || card.plan || card.basicValue);
}

export async function extractPeugeotReviewCards(buffer: ArrayBuffer, onProgress?: (progress: number) => void): Promise<PeugeotReviewCard[]> {
  return extractPeugeotReviewCardsFromPages(await extractStellantisCircularPages(buffer, onProgress));
}
