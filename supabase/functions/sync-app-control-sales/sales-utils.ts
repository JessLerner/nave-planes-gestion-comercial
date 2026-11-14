export type SheetRow = Record<string, unknown>;

export type ParsedSale = {
  sourceId: string;
  sourceKey: string;
  operationDate: string;
  clientName: string;
  brand: string;
  model: string | null;
  planType: string | null;
  cuota1Value: number | null;
  totalCollected: number | null;
  factoryAccount: string | null;
  usedCarFlag: boolean;
  usedCarDetails: Record<string, string | number> | null;
  subscriptionNumber: string | null;
  sellerName: string;
  teamName: string;
  leadSource: string | null;
  sourceRow: SheetRow;
};

export type RowIssue = { code: string; message: string };

const canonical = (value: unknown) => String(value ?? '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

export const text = (value: unknown, maximum = 240) => {
  const result = String(value ?? '').trim();
  return result && result.length <= maximum ? result : null;
};

export const valueFor = (row: SheetRow, ...names: string[]) => {
  const wanted = new Set(names.map(canonical));
  for (const [key, value] of Object.entries(row)) if (wanted.has(canonical(key))) return value;
  return undefined;
};

export const sourceKey = (sourceId: string) => `app_control_operaciones:id_ventas:${canonical(sourceId)}`;

export const parseDate = (value: unknown) => {
  const input = text(value, 32);
  if (!input) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const latin = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  const parts = iso ? [iso[1], iso[2], iso[3]] : latin ? [latin[3], latin[2], latin[1]] : null;
  if (!parts) return null;
  const [year, month, day] = parts.map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
    ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : null;
};

export const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const input = text(value, 64)?.replace(/\s/g, '');
  if (!input) return null;
  const normalized = input.includes(',')
    ? input.replace(/\./g, '').replace(',', '.')
    : input.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function parseSale(row: SheetRow): { sale?: ParsedSale; issue?: RowIssue } {
  const sourceId = text(valueFor(row, 'ID Venta', 'ID de Venta', 'ID Externo'), 160);
  const operationDate = parseDate(valueFor(row, 'Fecha', 'Fecha de Cantada'));
  const clientName = text(valueFor(row, 'Cliente'), 240);
  const brand = text(valueFor(row, 'Marca'), 80);
  const sellerName = text(valueFor(row, 'Vendedor'), 240);
  const teamName = text(valueFor(row, 'Equipo de Venta', 'Equipo'), 240);
  if (!sourceId) return { issue: { code: 'missing_external_sale_id', message: 'La fila no contiene un ID Venta estable.' } };
  if (!operationDate) return { issue: { code: 'invalid_operation_date', message: 'La fila no contiene una Fecha válida.' } };
  if (!clientName || !brand) return { issue: { code: 'missing_required_sale_data', message: 'La fila requiere Cliente y Marca.' } };
  if (!sellerName || !teamName) return { issue: { code: 'missing_roster_reference', message: 'La fila requiere Equipo de Venta y Vendedor para asociarla a la estructura autorizada.' } };

  const used = canonical(valueFor(row, '¿Entrega Usado?', 'Entrega Usado'));
  const model = text(valueFor(row, 'Modelo'), 240);
  const usedModel = text(valueFor(row, 'Modelo Usado'), 240);
  const usedYear = parseNumber(valueFor(row, 'Año Usado'));
  const usedInfoauto = parseNumber(valueFor(row, 'Valor Infoauto'));
  const usedValue = parseNumber(valueFor(row, 'Valor Toma'));
  const usedCarFlag = ['si', 'sí', 'true', '1'].includes(used);
  const usedCarDetails = usedCarFlag ? Object.fromEntries(Object.entries({ model: usedModel, year: usedYear, infoauto_value: usedInfoauto, trade_in_value: usedValue }).filter(([, value]) => value !== null)) : null;
  return { sale: {
    sourceId,
    sourceKey: sourceKey(sourceId),
    operationDate,
    clientName,
    brand,
    model,
    planType: text(valueFor(row, 'Tipo de Plan'), 80),
    cuota1Value: parseNumber(valueFor(row, 'Valor Cuota #1', 'Valor Cuota 1')),
    totalCollected: parseNumber(valueFor(row, 'Monto Cobrado')),
    factoryAccount: text(valueFor(row, 'Cta. Fábrica', 'Cta. Fabrica'), 240),
    usedCarFlag,
    usedCarDetails: usedCarDetails && Object.keys(usedCarDetails).length ? usedCarDetails : null,
    subscriptionNumber: text(valueFor(row, 'N° Suscripción', 'Nº Suscripción', 'Numero Suscripcion'), 160),
    sellerName,
    teamName,
    leadSource: text(valueFor(row, 'Origen del Dato'), 120),
    sourceRow: row,
  } };
}
