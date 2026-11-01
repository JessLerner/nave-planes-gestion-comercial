import { extractStellantisCircularPages } from './stellantisOcr';

export type PeugeotReviewCard = {
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

/** Strict page-card extraction. Missing/ambiguous fields remain null for human review. */
export function extractPeugeotReviewCardsFromPages(pages: Array<{ pageNumber: number; text: string }>): PeugeotReviewCard[] {
  return pages.filter(page => pageIsProductDetail(page.text) && pageHasSingleProduct(page.text)).map(({ pageNumber, text }) => {
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
    return { pageNumber, plan, model, basicValue, planType, totalInstallments, subscriptionValue, deliveryTerms, deferral, recovery, requiredFieldsMissing, sourceText: text };
  }).filter(card => card.model || card.plan || card.basicValue);
}

export async function extractPeugeotReviewCards(buffer: ArrayBuffer, onProgress?: (progress: number) => void): Promise<PeugeotReviewCard[]> {
  return extractPeugeotReviewCardsFromPages(await extractStellantisCircularPages(buffer, onProgress));
}
