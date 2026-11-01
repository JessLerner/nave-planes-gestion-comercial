import * as XLSX from 'xlsx-js-style';
import { installmentBucketValues, installmentColumns } from './priceListPresentation';
import type { PriceListItemView, PriceListSegmentView } from './priceListsApi';

type ExportOptions = {
  brand: string;
  effectiveDate: string;
  items: PriceListItemView[];
  segments: PriceListSegmentView[];
  includeCuota1: boolean;
};

const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

const rows = ({ brand, items, segments, includeCuota1 }: ExportOptions) => {
  const isRenault = brand.toLowerCase() === 'renault';
  const displayRows = items.map(item => ({ item, segments: segments.filter(segment => segment.price_list_item_id === item.id).map(segment => ({ from: segment.installment_from, to: segment.installment_to, quotaValue: Number(segment.total_value) })) }));
  const columns = installmentColumns(displayRows.map(row => ({ totalInstallments: row.item.total_installments, segments: row.segments })));
  const headers = ['Modelo', 'Tipo plan', 'Cuotas', 'Valor básico', 'Cuota pura', ...(isRenault ? ['Cuota 0 · Sellado'] : []), ...(includeCuota1 ? ['Cuota 1', 'Sobrepauta'] : []), 'Suscripción', ...columns.map(column => column.label), 'Entregas pactadas'];
  const values = items.map(item => {
    const valuesByColumn = installmentBucketValues(displayRows.find(row => row.item.id === item.id)?.segments || [], item.total_installments);
    const surcharge = Number(item.surcharge_amount ?? item.base_surcharge ?? 0);
    const subscription = Number(item.subscription_value) || Number(item.cuota_1_value || 0) + surcharge;
    return [item.model, item.plan_type, item.total_installments, Number(item.basic_value), Number(item.pure_installment), ...(isRenault ? [Number(item.upfront_stamp_value || 0)] : []), ...(includeCuota1 ? [Number(item.cuota_1_value || 0), surcharge] : []), subscription, ...columns.map(column => valuesByColumn.get(column.key) ?? null), item.delivery_terms || '—'];
  });
  return { headers, values };
};

export function exportPriceListXlsx(options: ExportOptions) {
  const { headers, values } = rows(options);
  const sheet = XLSX.utils.aoa_to_sheet([[`${options.brand} · Lista de precios · ${options.effectiveDate}`], headers, ...values]);
  sheet['!cols'] = headers.map((header, index) => ({ wch: Math.max(header.length + 2, index === 0 ? 25 : index > headers.length - 2 ? 25 : 15) }));
  sheet['!rows'] = [{ hpt: 24 }, { hpt: 30 }, ...values.map(() => ({ hpt: 34 }))];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: values.length + 1, c: headers.length - 1 } }) };
  for (let row = 3; row <= values.length + 2; row += 1) for (let col = 4; col <= headers.length - 1; col += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })];
    if (cell?.t === 'n') cell.z = '"$" #,##0';
  }
  const workbook = XLSX.utils.book_new();
  const subscriptionColumn = headers.indexOf('Suscripción');
  [0, 1].forEach(row => headers.forEach((_, column) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: row === 1 ? 'FFFFFF' : '0F172A' } }, fill: { fgColor: { rgb: row === 1 ? (column === subscriptionColumn ? 'FACC15' : '0F172A') : 'FFFFFF' } }, alignment: { horizontal: column === subscriptionColumn || column >= 3 ? 'right' : 'left', vertical: 'center', wrapText: true } };
  }));
  values.forEach((_, row) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: row + 2, c: subscriptionColumn })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: '111827' } }, fill: { fgColor: { rgb: 'FEF08A' } }, alignment: { horizontal: 'right' } };
  });
  XLSX.utils.book_append_sheet(workbook, sheet, 'Lista de precios');
  XLSX.writeFile(workbook, `Lista ${options.brand} ${options.effectiveDate}.xlsx`);
}

export function printPriceListPdf(options: ExportOptions) {
  const { headers, values } = rows(options);
  const subscriptionColumn = headers.indexOf('Suscripción');
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('El navegador bloqueó la ventana de exportación. Habilitá ventanas emergentes e intentá nuevamente.');
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista ${escape(options.brand)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#111;font-size:7px}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#444}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:4px;vertical-align:top}th{background:#0f172a;color:white;font-size:6px;text-transform:uppercase}td{white-space:pre-line}.amount{text-align:right;font-variant-numeric:tabular-nums}.subscription{background:#fef08a!important;color:#111827!important;font-weight:700}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Guardar como PDF / Imprimir</button><h1>${escape(options.brand)} · Lista de precios</h1><p>Vigencia: ${escape(options.effectiveDate)}</p><table><thead><tr>${headers.map((header,index) => `<th class="${index === subscriptionColumn ? 'subscription' : ''}">${escape(header)}</th>`).join('')}</tr></thead><tbody>${values.map(row => `<tr>${row.map((value, index) => `<td class="${typeof value === 'number' && index >= 3 ? 'amount' : ''} ${index === subscriptionColumn ? 'subscription' : ''}">${typeof value === 'number' && index >= 3 ? money(value) : escape(String(value))}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`);
  popup.document.close();
}
