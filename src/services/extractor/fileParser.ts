import * as XLSX from 'xlsx';

export interface ParsedFileResult {
  fileName: string;
  fileSize: number;
  sheetNames: string[];
  activeSheet: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  previewRows: Array<Record<string, any>>;
  totalRows: number;
}

/**
 * Parses an Excel (.xlsx, .xls) or CSV/TSV (.csv, .vsc, .tsv) file.
 * Defaults to the LAST sheet in multi-sheet Excel workbooks per requirements.
 */
export async function parseSpreadsheetFile(
  file: File,
  targetSheetName?: string
): Promise<ParsedFileResult> {
  const buffer = await file.arrayBuffer();
  
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: true,
    raw: false
  });

  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('El archivo no contiene ninguna hoja de cálculo válida.');
  }

  // Default is ALWAYS the last sheet
  const activeSheet = targetSheetName && sheetNames.includes(targetSheetName)
    ? targetSheetName
    : sheetNames[sheetNames.length - 1];

  const worksheet = workbook.Sheets[activeSheet];
  if (!worksheet) {
    throw new Error(`No se pudo leer la pestaña "${activeSheet}" del archivo.`);
  }

  const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    blankrows: false
  });

  if (rawData.length === 0) {
    return {
      fileName: file.name,
      fileSize: file.size,
      sheetNames,
      activeSheet,
      columns: [],
      rows: [],
      previewRows: [],
      totalRows: 0
    };
  }

  const columnSet = new Set<string>();
  rawData.forEach(row => {
    Object.keys(row).forEach(k => {
      const trimmed = k.trim();
      if (trimmed && !trimmed.startsWith('__EMPTY')) {
        columnSet.add(trimmed);
      }
    });
  });

  const columns = Array.from(columnSet);

  const rows: Array<Record<string, any>> = rawData.map(row => {
    const cleanRow: Record<string, any> = {};
    columns.forEach(col => {
      const val = row[col];
      cleanRow[col] = val !== undefined && val !== null ? val : '';
    });
    return cleanRow;
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    sheetNames,
    activeSheet,
    columns,
    rows,
    previewRows: rows.slice(0, 5),
    totalRows: rows.length
  };
}

/**
 * Filter an array of records so they only include the specified columns
 */
export function filterColumns(
  rows: Array<Record<string, any>>,
  selectedColumns: string[]
): Array<Record<string, any>> {
  if (selectedColumns.length === 0) return rows;
  const colSet = new Set(selectedColumns);

  return rows.map(row => {
    const filtered: Record<string, any> = {};
    selectedColumns.forEach(col => {
      if (colSet.has(col)) {
        filtered[col] = row[col] !== undefined ? row[col] : '';
      }
    });
    return filtered;
  });
}
