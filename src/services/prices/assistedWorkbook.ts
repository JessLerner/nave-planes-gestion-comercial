import * as XLSX from 'xlsx';
import type { ImportedPriceItem } from './renaultWorkbook';

type Cell = string | number | boolean | Date | null | undefined;

const text = (value: Cell) => String(value ?? '').replace(/\s+/g, ' ').trim();
const header = (value: Cell) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const amount = (value: Cell) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = text(value).replace(/\$/g, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)) return null;
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const requiredColumn = (headers: string[], name: string) => {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error(`Falta la columna obligatoria “${name}”.`);
  return index;
};

/**
 * Reads an administration-maintained mapping workbook. It deliberately does
 * not derive prices: every amount and range must be transcribed from the
 * attached official circular and remains editable in the draft afterwards.
 */
export function parseAssistedWorkbook(buffer: ArrayBuffer): ImportedPriceItem[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo de carga no contiene una hoja.');
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, raw: true });
  const [firstRow, ...entries] = rows;
  if (!firstRow) throw new Error('El archivo de carga no contiene encabezados.');
  const headers = firstRow.map(header);
  const model = requiredColumn(headers, 'modelo');
  const planType = requiredColumn(headers, 'tipo plan');
  const installments = requiredColumn(headers, 'cuotas');
  const basicValue = requiredColumn(headers, 'valor basico');
  const pureInstallment = requiredColumn(headers, 'cuota pura');
  const cuota1Value = requiredColumn(headers, 'cuota 1');
  const segments = requiredColumn(headers, 'tramos');
  const stamp = headers.indexOf('cuota 0 sellado');
  const delivery = headers.indexOf('entregas pactadas');

  const parsed = entries.filter(row => row.some(cell => text(cell))).map((row, index) => {
    const totalInstallments = amount(row[installments]);
    const values = [amount(row[basicValue]), amount(row[pureInstallment]), amount(row[cuota1Value])];
    const parsedSegments = text(row[segments]).split(';').filter(Boolean).map(part => {
      const match = part.trim().match(/^(\d+)\s*(?:-|a)\s*(\d+)\s*:\s*\$?\s*([\d.,]+)$/i);
      if (!match) throw new Error(`El tramo de la fila ${index + 2} debe usar “2-12: 123456; 13-84: 234567”.`);
      const quotaValue = amount(match[3]);
      if (quotaValue === null || quotaValue < 0) throw new Error(`El importe del tramo en la fila ${index + 2} no es válido.`);
      return { from: Number(match[1]), to: Number(match[2]), quotaValue };
    });
    if (!text(row[model]) || !text(row[planType]) || !totalInstallments || !Number.isInteger(totalInstallments) || totalInstallments < 1 || totalInstallments > 600 || values.some(value => value === null || value <= 0) || !parsedSegments.length) {
      throw new Error(`La fila ${index + 2} no contiene todos los valores oficiales obligatorios.`);
    }
    if (parsedSegments.some(segment => segment.from < 1 || segment.to < segment.from || segment.to > totalInstallments!)) throw new Error(`Los tramos de la fila ${index + 2} están fuera de las cuotas del plan.`);
    if (totalInstallments > 1 && Array.from({ length: totalInstallments - 1 }, (_, quota) => quota + 2).some(quota => !parsedSegments.some(segment => segment.from <= quota && segment.to >= quota))) {
      throw new Error(`Los tramos de la fila ${index + 2} no cubren todas las cuotas comerciales.`);
    }
    return {
      sourceKey: `${text(row[model])}-${text(row[planType])}-${index + 2}`,
      model: text(row[model]),
      planType: text(row[planType]),
      totalInstallments,
      basicValue: values[0]!,
      pureInstallment: values[1]!,
      cuota1Value: values[2]!,
      upfrontStampValue: stamp < 0 ? 0 : (amount(row[stamp]) ?? 0),
      deliveryTerms: delivery < 0 ? null : text(row[delivery]) || null,
      segments: parsedSegments,
    };
  });
  if (!parsed.length) throw new Error('El archivo de carga no contiene modelos.');
  return parsed;
}
