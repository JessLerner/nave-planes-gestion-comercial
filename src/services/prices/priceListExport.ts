import * as XLSX from 'xlsx';
import { groupInstallmentSegments } from './priceListDomain';
import type { PriceListItemView, PriceListSegmentView } from './priceListsApi';

type ExportOptions = {
  brand: string;
  effectiveDate: string;
  items: PriceListItemView[];
  segments: PriceListSegmentView[];
  includeCuota1: boolean;
};

const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
const range = (from: number, to: number) => from === to ? `Cuota ${from}` : `Cuotas ${from} a ${to}`;
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

const rows = ({ brand, items, segments, includeCuota1 }: ExportOptions) => {
  const isRenault = brand.toLowerCase() === 'renault';
  const headers = ['Modelo', 'Tipo plan', 'Cuotas', 'Valor básico', 'Cuota pura', ...(isRenault ? ['Cuota 0 · Sellado'] : []), ...(includeCuota1 ? ['Cuota 1', 'Sobrepauta'] : []), 'Suscripción', 'Cuotas 2 a 12', 'Cuotas 13 en adelante', 'Entregas pactadas'];
  const values = items.map(item => {
    const grouped = groupInstallmentSegments(segments.filter(segment => segment.price_list_item_id === item.id).map(segment => ({ from: segment.installment_from, to: segment.installment_to, quotaValue: Number(segment.total_value) })));
    const formatRanges = (from: number, to: number) => grouped.filter(segment => segment.from >= from && segment.to <= to).map(segment => `${range(segment.from, segment.to)}: ${money(segment.displayValue)}`).join('\n') || '—';
    const surcharge = Number(item.surcharge_amount ?? item.base_surcharge ?? 0);
    const subscription = Number(item.subscription_value) || Number(item.cuota_1_value || 0) + surcharge;
    return [item.model, item.plan_type, item.total_installments, Number(item.basic_value), Number(item.pure_installment), ...(isRenault ? [Number(item.upfront_stamp_value || 0)] : []), ...(includeCuota1 ? [Number(item.cuota_1_value || 0), surcharge] : []), subscription, formatRanges(2, 12), formatRanges(13, Number.MAX_SAFE_INTEGER), item.delivery_terms || '—'];
  });
  return { headers, values };
};

export function exportPriceListXlsx(options: ExportOptions) {
  const { headers, values } = rows(options);
  const sheet = XLSX.utils.aoa_to_sheet([[`${options.brand} · Lista de precios · ${options.effectiveDate}`], headers, ...values]);
  sheet['!cols'] = headers.map((header, index) => ({ wch: Math.max(header.length + 2, index > headers.length - 4 ? 34 : 15) }));
  sheet['!rows'] = [{ hpt: 24 }, { hpt: 30 }, ...values.map(() => ({ hpt: 34 }))];
  for (let row = 3; row <= values.length + 2; row += 1) for (let col = 4; col <= headers.length; col += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })];
    if (cell?.t === 'n') cell.z = '"$" #,##0';
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Lista de precios');
  XLSX.writeFile(workbook, `Lista ${options.brand} ${options.effectiveDate}.xlsx`);
}

export function printPriceListPdf(options: ExportOptions) {
  const { headers, values } = rows(options);
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('El navegador bloqueó la ventana de exportación. Habilitá ventanas emergentes e intentá nuevamente.');
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista ${escape(options.brand)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111;font-size:8px}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 12px;color:#444}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:5px;vertical-align:top}th{background:#0f172a;color:white;font-size:7px;text-transform:uppercase}td{white-space:pre-line}.amount{text-align:right;font-variant-numeric:tabular-nums}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Guardar como PDF / Imprimir</button><h1>${escape(options.brand)} · Lista de precios</h1><p>Vigencia: ${escape(options.effectiveDate)}</p><table><thead><tr>${headers.map(header => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${values.map(row => `<tr>${row.map((value, index) => `<td class="${typeof value === 'number' && index >= 3 ? 'amount' : ''}">${typeof value === 'number' && index >= 3 ? money(value) : escape(String(value)).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}
