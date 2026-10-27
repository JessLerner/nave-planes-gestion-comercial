import * as XLSX from 'xlsx';

export type FoxLeadImportRow = {
  leadId: string;
  entryDate: string | null;
  managedAt: string | null;
  closedAt: string | null;
  foxUserName: string | null;
  foxUserKey: string | null;
  status: string | null;
  source: string | null;
  channel: string | null;
  branch: string | null;
  brand: string | null;
  closeReason: string | null;
  sold: boolean | null;
};

export type FoxLeadReportPreview = {
  rows: FoxLeadImportRow[];
  totalRows: number;
  invalidRows: number;
  duplicateIds: number;
  sha256: string;
};

const cleanText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text === '' || text === '00/00/0000 00:00hs' || text === '0000-00-00' ? null : text;
};

export const normalizeFoxUser = (value: string | null) => value
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
  : null;

function parseFoxDate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})hs)?$/);
  if (!match) return null;
  const [, day, month, year, hour = '00', minute = '00'] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:00.000Z`;
}

function pick(record: Record<string, unknown>, key: string) {
  const found = Object.keys(record).find(header => header.trim().toLocaleLowerCase('es-AR') === key.toLocaleLowerCase('es-AR'));
  return found ? record[found] : null;
}

async function sha256(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Reads only the Fox columns required for operational metrics. */
export async function parseFoxLeadReport(file: File): Promise<FoxLeadReportPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error('El archivo no contiene una hoja de datos.');
  const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: null, raw: false });
  const knownIds = new Set<string>();
  let invalidRows = 0;
  let duplicateIds = 0;
  const rows: FoxLeadImportRow[] = [];

  for (const source of sourceRows) {
    const leadId = cleanText(pick(source, 'ID'));
    if (!leadId) {
      invalidRows += 1;
      continue;
    }
    if (knownIds.has(leadId)) duplicateIds += 1;
    knownIds.add(leadId);
    const foxUserName = cleanText(pick(source, 'Usuario Gestion'));
    const soldValue = cleanText(pick(source, 'Vendido'));
    rows.push({
      leadId,
      entryDate: parseFoxDate(pick(source, 'Fecha de Ingreso')),
      managedAt: parseFoxDate(pick(source, 'Fecha de Gestion')),
      closedAt: parseFoxDate(pick(source, 'Fecha de Cierre')),
      foxUserName,
      foxUserKey: normalizeFoxUser(foxUserName),
      status: cleanText(pick(source, 'Estado')),
      source: cleanText(pick(source, 'Origen')),
      channel: cleanText(pick(source, 'Canal')),
      branch: cleanText(pick(source, 'Sucursal')),
      brand: cleanText(pick(source, 'Marca')),
      closeReason: cleanText(pick(source, 'Motivo de Cierre')),
      sold: soldValue ? ['si', 'sí', 'yes', 'true', '1'].includes(soldValue.toLocaleLowerCase('es-AR')) : null,
    });
  }

  return { rows, totalRows: sourceRows.length, invalidRows, duplicateIds, sha256: await sha256(buffer) };
}
