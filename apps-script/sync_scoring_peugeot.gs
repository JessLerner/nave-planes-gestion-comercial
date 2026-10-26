/**
 * Nave Planes — sincronizador de Scoring Peugeot.
 *
 * Instalar este archivo en un proyecto Apps Script independiente o en el
 * proyecto de integración. No escribe en ninguna hoja ni modifica Parte
 * Diario: sólo lee la planilla compartida y hace POST hacia Supabase.
 *
 * Configuración única (desde Apps Script > Project Settings > Script
 * properties):
 *   NAVE_SCORING_INGEST_SECRET = valor de INGEST_SHARED_SECRET en Supabase
 *   NAVE_SCORING_START_DATE = primera fecha permitida, formato YYYY-MM-DD
 *                             (por ejemplo: 2026-10-01)
 */

const NAVE_SCORING_CONFIG = Object.freeze({
  spreadsheetId: '1NT-zw6FoiBzEevgCVHasC3EgBZiahGv7E4mPGm2d-Ko',
  sourceUrl: 'https://docs.google.com/spreadsheets/d/1NT-zw6FoiBzEevgCVHasC3EgBZiahGv7E4mPGm2d-Ko/edit',
  endpoint: 'https://vguoyqfdmwktrsclkqjd.supabase.co/functions/v1/ingest-scoring-sheet',
  brand: 'Peugeot',
  batchSize: 400,
  secretProperty: 'NAVE_SCORING_INGEST_SECRET',
  startDateProperty: 'NAVE_SCORING_START_DATE',
});

function naveScoringNormalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function naveScoringRows_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(String);
  const sxIndex = headers.findIndex((header) => naveScoringNormalizeHeader_(header) === 'sx');
  if (sxIndex < 0) throw new Error(`La pestaña "${sheet.getName()}" no tiene la columna SX.`);

  return values.slice(1)
    .map((row) => headers.reduce((record, header, index) => {
      record[header] = row[index] || '';
      return record;
    }, {}))
    .filter((row) => String(row[headers[sxIndex]] || '').trim());
}

function naveScoringDate_(value) {
  const match = String(value || '').trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  if (date.getUTCFullYear() !== Number(match[3]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[1])) return null;
  return date;
}

function naveScoringStartDate_() {
  const value = PropertiesService.getScriptProperties()
    .getProperty(NAVE_SCORING_CONFIG.startDateProperty);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error(`Falta o es inválida la Script Property ${NAVE_SCORING_CONFIG.startDateProperty}. Usa YYYY-MM-DD.`);
  }
  const start = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== value) {
    throw new Error(`La Script Property ${NAVE_SCORING_CONFIG.startDateProperty} no representa una fecha válida.`);
  }
  return start;
}

function naveScoringRowsFromDate_(sheet, startDate) {
  const rows = naveScoringRows_(sheet);
  return rows.filter((row) => {
    const date = naveScoringDate_(row.FECHA);
    return date !== null && date.getTime() >= startDate.getTime();
  });
}

function naveScoringPost_(sheetName, rows, secret) {
  const payload = {
    brand: NAVE_SCORING_CONFIG.brand,
    sourceUrl: NAVE_SCORING_CONFIG.sourceUrl,
    sheetName,
    rows,
  };
  const response = UrlFetchApp.fetch(NAVE_SCORING_CONFIG.endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Supabase respondió HTTP ${status} al sincronizar "${sheetName}".`);
  }
  const result = JSON.parse(response.getContentText());
  if (!result || result.success !== true || result.stored !== rows.length) {
    throw new Error(`Respuesta inesperada de Supabase al sincronizar "${sheetName}".`);
  }
  return result.stored;
}

/**
 * Sincroniza las pestañas Peugeot que estén visibles para la cuenta dueña del
 * script. Puede ejecutarse manualmente o con un disparador horario.
 */
function naveSyncPeugeotScoring_(maximumRows) {
  const secret = PropertiesService.getScriptProperties()
    .getProperty(NAVE_SCORING_CONFIG.secretProperty);
  if (!secret) {
    throw new Error(`Falta la Script Property ${NAVE_SCORING_CONFIG.secretProperty}.`);
  }
  const startDate = naveScoringStartDate_();

  const spreadsheet = SpreadsheetApp.openById(NAVE_SCORING_CONFIG.spreadsheetId);
  const sheets = spreadsheet.getSheets()
    .filter((sheet) => /^PEUGEOT\b/i.test(sheet.getName()));
  if (sheets.length === 0) throw new Error('No se encontraron pestañas de Peugeot para sincronizar.');

  let sent = 0;
  let batches = 0;
  let remaining = maximumRows;
  sheets.forEach((sheet) => {
    if (remaining !== null && remaining <= 0) return;
    const rows = naveScoringRowsFromDate_(sheet, startDate);
    const rowsToSync = remaining === null ? rows : rows.slice(0, remaining);
    for (let index = 0; index < rowsToSync.length; index += NAVE_SCORING_CONFIG.batchSize) {
      const batch = rowsToSync.slice(index, index + NAVE_SCORING_CONFIG.batchSize);
      sent += naveScoringPost_(sheet.getName(), batch, secret);
      batches += 1;
      if (remaining !== null) remaining -= batch.length;
    }
  });

  // No registra filas ni credenciales en el log: sólo un resumen operativo.
  console.log(`Scoring Peugeot sincronizado desde ${startDate.toISOString().slice(0, 10)}: ${sent} filas en ${batches} lote(s).`);
  return { sheets: sheets.length, rows: sent, batches };
}

/** Prueba segura: sincroniza sólo las primeras cinco filas con SX. */
function syncPeugeotScoringPilot() {
  return naveSyncPeugeotScoring_(5);
}

/** Sincronización completa de todas las pestañas Peugeot detectadas. */
function syncPeugeotScoringToNavePlanes() {
  return naveSyncPeugeotScoring_(null);
}

/** Crea un único disparador cada seis horas; no duplica el existente. */
function installPeugeotScoringSixHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'syncPeugeotScoringToNavePlanes')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('syncPeugeotScoringToNavePlanes')
    .timeBased()
    .everyHours(6)
    .create();
}
