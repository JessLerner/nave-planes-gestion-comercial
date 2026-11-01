import * as XLSX from 'xlsx';

export type ImportedPriceItem = {
  sourceKey: string;
  model: string;
  planType: string;
  totalInstallments: number;
  basicValue: number;
  pureInstallment: number;
  cuota1Value: number;
  deliveryTerms: string | null;
  segments: Array<{ from: number; to: number; quotaValue: number }>;
};

type Cell = string | number | boolean | Date | null | undefined;
const text = (value: Cell) => String(value ?? '').replace(/\s+/g, ' ').trim();
const number = (value: Cell) => typeof value === 'number' && Number.isFinite(value) ? value : null;

const range = (value: Cell) => {
  const match = text(value).replace('*', '').match(/(\d+)\s*(?:a|-)\s*(\d+)/i) || text(value).match(/(\d+)/);
  return match ? { from: Number(match[1]), to: Number(match[2] || match[1]) } : null;
};

const rightNumber = (row: Cell[]) => row.slice(7).map(number).filter((value): value is number => value !== null).at(-1) ?? 0;

/** Reads the current Plan Rombo layout without inferring any missing values. */
export function parseRenaultWorkbook(buffer: ArrayBuffer): ImportedPriceItem[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no contiene una hoja para importar.');
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, raw: true });
  const headers = rows.map((row, index) => ({ index, row })).filter(({ row }) => text(row[6]).toLowerCase() === 'n° cuota');
  if (!headers.length) throw new Error('No se encontró el detalle de cuotas de Plan Rombo.');

  return headers.map(({ index, row }, itemIndex) => {
    const start = rows.slice(0, index).map((candidate, rowIndex) => ({ candidate, rowIndex })).filter(({ candidate }) => Boolean(text(candidate[1]))).at(-1)?.rowIndex ?? 0;
    const end = headers[itemIndex + 1]?.index ?? rows.length;
    const block = rows.slice(start, end);
    const find = (label: string) => block.find(candidate => text(candidate[6]).toLowerCase() === label.toLowerCase());
    const previousModel = text(rows[start]?.[1]);
    const planRows = rows.slice(start, index).filter(candidate => /\d+\s*cuotas/i.test(`${text(candidate[5])} ${text(candidate[6])}`));
    const installmentsRow = planRows.find(candidate => /modalidad/i.test(`${text(candidate[5])} ${text(candidate[6])}`)) || planRows[0] || [];
    const totalInstallments = number(installmentsRow[5]) || Number(text(installmentsRow[5]).match(/(\d+)\s*cuotas/i)?.[1] || 0);
    const planText = `${text(installmentsRow[5])} ${text(installmentsRow[6])}`;
    const financedPercent = planText.match(/(\d{2,3})%/)?.[1];
    const planType = financedPercent ? `${financedPercent}%` : planText;
    const totalRow = find('cuota total');
    const headersInRow = row.slice(7).map(range);
    const totals = totalRow?.slice(7).map(number) || [];
    const segments = headersInRow.flatMap((period, position) => period && totals[position] !== null
      ? [{ ...period, quotaValue: totals[position] as number }]
      : []);
    const cuota1 = totals[0] || 0;
    const basicValue = rightNumber(find('Precio público') || []);
    const pureInstallment = rightNumber(find('Cuota Pura') || []);
    if (!previousModel || !totalInstallments || !basicValue || !pureInstallment || !cuota1 || !segments.length) {
      throw new Error(`El bloque Renault ${itemIndex + 1} no contiene los valores mínimos requeridos.`);
    }
    return {
      sourceKey: `${previousModel}-${totalInstallments}-${itemIndex + 1}`,
      model: previousModel,
      planType,
      totalInstallments,
      basicValue,
      pureInstallment,
      cuota1Value: cuota1,
      deliveryTerms: null,
      segments,
    };
  });
}
