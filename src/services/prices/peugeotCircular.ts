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

const money = (value?: string) => value ? Number(value.replace(/[.]/g, '').replace(',', '.')) : null;
const between = (text: string, start: RegExp, end: RegExp) => text.match(start)?.[1]?.replace(end, '').trim() || null;

/** Strict page-card extraction. Missing/ambiguous fields remain null for human review. */
export async function extractPeugeotReviewCards(buffer: ArrayBuffer): Promise<PeugeotReviewCard[]> {
  const pages = await extractStellantisCircularPages(buffer);
  return pages.map(({ pageNumber, text }) => {
    const normalized = text.replace(/\s+/g, ' ').toUpperCase();
    const model = between(normalized, /MODELO\s+(.+?)(?=PRECIO)/, /\s+$/);
    const plan = between(normalized, /(PREVENTA\s+PLAN\s+RAPID|PLAN\s+[A-Z0-9 ]+)(?=MODELO|CUOTA)/, /\s+$/);
    const basicValue = money(normalized.match(/PRECIO\s*MODELO\s*\$?\s*([\d.,]+)/)?.[1]);
    const planType = normalized.match(/TIPO\s*PLAN\s*(\d{2,3}\s*\/\s*\d{2,3}|100%)/)?.[1]?.replace(/\s/g, '') || null;
    const totalInstallments = Number(normalized.match(/CANTIDAD\s*DE\s*CUOTAS\s*(\d{2,3})/)?.[1] || 0) || null;
    const subscriptionValue = money(normalized.match(/CUOTA\s*DE\s*SUSCRIPCI[ÓO]N[^\d]{0,25}\$?\s*([\d.,]+)/)?.[1]);
    const deliveryTerms = between(normalized, /ADJUDICACI[ÓO]N\s*PACTADA\s+(.+?)(?=LICITACI|REENC|DERECHO)/, /\s+$/);
    const deferral = between(normalized, /DIFERIMIENTO\s*COMERCIAL[^A-Z]*(.+?)(?=RECUPERO|BENEFICIO)/, /\s+$/);
    const recovery = between(normalized, /RECUPERO\s*DIFERIMIENTO\s+(.+?)(?=BENEFICIO|CUOTA)/, /\s+$/);
    const requiredFieldsMissing = [['modelo', model], ['plan', plan], ['valor básico', basicValue], ['tipo de plan', planType], ['cuotas', totalInstallments], ['cuota de suscripción', subscriptionValue]].filter(([, value]) => !value).map(([field]) => field as string);
    return { pageNumber, plan, model, basicValue, planType, totalInstallments, subscriptionValue, deliveryTerms, deferral, recovery, requiredFieldsMissing, sourceText: text };
  }).filter(card => card.model || card.plan || card.basicValue);
}
