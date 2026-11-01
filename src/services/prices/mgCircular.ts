import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ImportedPriceItem } from './renaultWorkbook';

const usd = (value: string) => Number(value.replace(/[.]/g, '').replace(',', '.'));
const amounts = (text: string, label: string) => [...(text.match(new RegExp(`${label}\\s+USD\\s*([\\d.,]+)\\s+USD\\s*([\\d.,]+)`, 'i'))?.slice(1) || [])].map(usd);

/** Reads MG's textual circular layout. Values remain in USD until publication converts them to ARS. */
export async function parseMgCircular(buffer: ArrayBuffer): Promise<ImportedPriceItem[]> {
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await document.getPage(1);
  const text = (await page.getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ');
  const basic = amounts(text, 'Valor Móvil');
  const pure = amounts(text, 'Cuota pura mensual');
  const total = amounts(text, 'Cuota mensual total');
  const models = text.match(/PRODUCTOS Y CONDICIONES DEL PLAN\s+(.+?)\s+Valor Móvil/i)?.[1]?.trim().split(/\s{2,}|(?=MG\s*ZS)/) || [];
  if (basic.length !== 2 || pure.length !== 2 || total.length !== 2 || models.length < 2) throw new Error('La circular MG no contiene la tabla de productos esperada.');
  return [0, 1].map(index => ({
    sourceKey: `mg-${models[index].replace(/\W+/g, '-').toLowerCase()}-84`, model: models[index].trim(), planType: '70%', totalInstallments: 84,
    basicValue: basic[index], pureInstallment: pure[index], cuota1Value: total[index], upfrontStampValue: 0, deliveryTerms: null,
    segments: [{ from: 1, to: 84, quotaValue: total[index] }],
  }));
}
