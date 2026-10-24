import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const DATA_FILE = path.resolve(process.cwd(), '.concesionaria_db.json');

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// CORS middleware for Google Apps Script & Chrome Extension fetch calls
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper to read persistent database cache
interface StoredData {
  connectors: any[];
  teams: any[];
  sellers: any[];
  operations: any[];
  priceLists: any[];
  wageAdvances: any[];
  carteraMora: any[];
  candidates: any[];
  leadDistributions: any[];
  monthlyConfig: any;
  logs: any[];
}

function getStoredData(): StoredData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading data file:', err);
  }
  return {
    connectors: [
      {
        id: 'conn-pg-main',
        name: 'PostgreSQL / Supabase (Base Central)',
        type: 'postgresql',
        description: 'Base de datos relacional para operaciones, contratos y nómina de vendedores.',
        enabled: true,
        status: 'disconnected',
        config: {
          host: process.env.POSTGRES_HOST || '',
          port: Number(process.env.POSTGRES_PORT) || 5432,
          database: process.env.POSTGRES_DB || '',
          username: process.env.POSTGRES_USER || '',
          password: process.env.POSTGRES_PASSWORD || '',
          ssl: process.env.POSTGRES_SSL === 'true',
          connection_string: process.env.DATABASE_URL || '',
        },
        tables_mapped: ['sellers', 'teams', 'sales_operations', 'cartera_mora', 'price_lists'],
      },
      {
        id: 'conn-fox-crm',
        name: 'Data-Extractor API (Fox CRM & Webhooks)',
        type: 'data_extractor',
        description: 'Pipeline de ingesta continua de leads calificados por canal de origen.',
        enabled: true,
        status: 'disconnected',
        config: {
          api_url: process.env.DATA_EXTRACTOR_API_URL || '',
          api_key: process.env.DATA_EXTRACTOR_API_KEY || '',
        },
        tables_mapped: ['leads_distribution', 'lead_sources', 'loss_reasons'],
      },
      {
        id: 'conn-google-sheets',
        name: 'Google Sheets (Auditoría de Scoring & Precios)',
        type: 'google_sheets',
        description: 'Sincronización de planillas donde Administración vuelca el llamado de calidad.',
        enabled: true,
        status: 'disconnected',
        config: {
          sheet_url: process.env.GOOGLE_SHEETS_SCORING_URL || '',
        },
        tables_mapped: ['scoring_records', 'price_lists'],
      },
    ],
    teams: [],
    sellers: [],
    operations: [],
    priceLists: [],
    wageAdvances: [],
    carteraMora: [],
    candidates: [],
    leadDistributions: [],
    monthlyConfig: {
      id: 'conf-active',
      year: 2026,
      month: 10,
      month_name: 'Octubre 2026',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      working_days: 27,
      min_sales_for_advance: 2,
      max_advance_amount: 350000,
      advance_deadline_day: 15,
      default_team_target_per_seller: 4,
    },
    logs: [],
  };
}

function saveStoredData(data: StoredData): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving data file:', err);
  }
}

// ==================== REST API ENDPOINTS ====================

// GET: Current platform data
app.get('/api/data', (_req: Request, res: Response) => {
  const data = getStoredData();
  res.json({ success: true, data });
});

// POST: Update platform data
app.post('/api/data', (req: Request, res: Response) => {
  const current = getStoredData();
  const updated = { ...current, ...req.body };
  saveStoredData(updated);
  res.json({ success: true, data: updated });
});

// POST: Test database connection
app.post('/api/connectors/test', async (req: Request, res: Response) => {
  const { connectorId, config, type } = req.body;

  if (type === 'postgresql' || type === 'supabase') {
    const host = config?.host || process.env.POSTGRES_HOST;
    const database = config?.database || process.env.POSTGRES_DB;
    const user = config?.username || process.env.POSTGRES_USER;
    const password = config?.password || process.env.POSTGRES_PASSWORD;
    const port = Number(config?.port) || 5432;
    const connStr = config?.connection_string || process.env.DATABASE_URL;

    if (!connStr && (!host || !database || !user)) {
      return res.status(400).json({
        success: false,
        message: 'Credenciales incompletas. Especifique Host, Base de Datos y Usuario o una Connection String.',
      });
    }

    try {
      const pool = connStr
        ? new Pool({ connectionString: connStr, connectionTimeoutMillis: 4000 })
        : new Pool({
            host,
            port,
            database,
            user,
            password,
            ssl: config?.ssl ? { rejectUnauthorized: false } : undefined,
            connectionTimeoutMillis: 4000,
          });

      const client = await pool.connect();
      const queryRes = await client.query('SELECT NOW() as current_time, current_database() as db_name');
      client.release();
      await pool.end();

      // Update connector status in store
      const store = getStoredData();
      store.connectors = store.connectors.map(c =>
        c.id === connectorId
          ? { ...c, status: 'connected', error_message: undefined, last_sync: new Date().toISOString() }
          : c
      );
      saveStoredData(store);

      return res.json({
        success: true,
        message: `Conexión exitosa a ${queryRes.rows[0].db_name} a las ${new Date(queryRes.rows[0].current_time).toLocaleTimeString()}`,
        database: queryRes.rows[0].db_name,
      });
    } catch (err: any) {
      console.warn('PostgreSQL test connection failed:', err.message);
      return res.status(502).json({
        success: false,
        message: `Fallo de conexión a la base de datos: ${err.message}`,
      });
    }
  } else if (type === 'data_extractor') {
    const apiUrl = config?.api_url || process.env.DATA_EXTRACTOR_API_URL;
    if (!apiUrl) {
      return res.status(400).json({
        success: false,
        message: 'Especifique la URL de la API de Data-Extractor.',
      });
    }

    // Ping API endpoint
    try {
      const resp = await fetch(apiUrl, {
        method: 'GET',
        headers: config?.api_key ? { Authorization: `Bearer ${config.api_key}` } : {},
      });
      return res.json({
        success: true,
        message: `API Data-Extractor accesible (HTTP ${resp.status})`,
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        message: `No se pudo contactar a la API de Data-Extractor: ${err.message}`,
      });
    }
  } else if (type === 'google_sheets') {
    const sheetUrl = config?.sheet_url || process.env.GOOGLE_SHEETS_SCORING_URL;
    if (!sheetUrl) {
      return res.status(400).json({
        success: false,
        message: 'Especifique la URL de la planilla de Google Sheets.',
      });
    }
    return res.json({
      success: true,
      message: 'URL de Google Sheets validada para extracción de auditoría.',
    });
  }

  res.json({ success: true, message: 'Conector probado.' });
});

// POST: Execute extraction / ingestion from external database or API
app.post('/api/connectors/sync', async (req: Request, res: Response) => {
  const { connectorId } = req.body;
  const store = getStoredData();
  const connector = store.connectors.find(c => c.id === connectorId);

  if (!connector) {
    return res.status(404).json({ success: false, message: 'Conector no encontrado.' });
  }

  const logEntry: {
    id: string;
    timestamp: string;
    connector_id: string;
    connector_name: string;
    status: 'success' | 'warning' | 'error';
    records_received: number;
    records_inserted: number;
    details: string;
  } = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    connector_id: connector.id,
    connector_name: connector.name,
    status: 'success',
    records_received: 0,
    records_inserted: 0,
    details: '',
  };

  if (connector.type === 'postgresql' || connector.type === 'supabase') {
    const connStr = connector.config?.connection_string || process.env.DATABASE_URL;
    const host = connector.config?.host || process.env.POSTGRES_HOST;
    const database = connector.config?.database || process.env.POSTGRES_DB;
    const user = connector.config?.username || process.env.POSTGRES_USER;
    const password = connector.config?.password || process.env.POSTGRES_PASSWORD;
    const port = Number(connector.config?.port) || 5432;

    if (!connStr && (!host || !database || !user)) {
      logEntry.status = 'warning';
      logEntry.details = 'Sin credenciales configuradas para extraer datos de PostgreSQL.';
      store.logs.unshift(logEntry);
      saveStoredData(store);
      return res.status(400).json({
        success: false,
        message: 'Configure las credenciales de conexión a la base de datos antes de extraer.',
      });
    }

    try {
      const pool = connStr
        ? new Pool({ connectionString: connStr, connectionTimeoutMillis: 5000 })
        : new Pool({
            host,
            port,
            database,
            user,
            password,
            ssl: connector.config?.ssl ? { rejectUnauthorized: false } : undefined,
            connectionTimeoutMillis: 5000,
          });

      const client = await pool.connect();

      // Check if tables exist and query them
      const checkTables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('sellers', 'teams', 'sales_operations', 'cartera_mora', 'price_lists')
      `);

      const existingTables = checkTables.rows.map(r => r.table_name);
      let extractedCount = 0;

      if (existingTables.includes('teams')) {
        const teamsRes = await client.query('SELECT * FROM teams');
        if (teamsRes.rows.length > 0) {
          store.teams = teamsRes.rows;
          extractedCount += teamsRes.rows.length;
        }
      }

      if (existingTables.includes('sellers')) {
        const sellersRes = await client.query('SELECT * FROM sellers');
        if (sellersRes.rows.length > 0) {
          store.sellers = sellersRes.rows;
          extractedCount += sellersRes.rows.length;
        }
      }

      if (existingTables.includes('sales_operations')) {
        const opsRes = await client.query('SELECT * FROM sales_operations ORDER BY date DESC');
        if (opsRes.rows.length > 0) {
          store.operations = opsRes.rows;
          extractedCount += opsRes.rows.length;
        }
      }

      client.release();
      await pool.end();

      logEntry.records_received = extractedCount;
      logEntry.records_inserted = extractedCount;
      logEntry.details = `Tablas consultadas: ${existingTables.join(', ') || 'ninguna'}. ${extractedCount} registros extraídos.`;
      
      connector.status = 'connected';
      connector.last_sync = new Date().toISOString();
      connector.records_extracted = (connector.records_extracted || 0) + extractedCount;
      
      store.logs.unshift(logEntry);
      saveStoredData(store);

      return res.json({
        success: true,
        message: `Extracción completada. ${extractedCount} registros sincronizados desde PostgreSQL.`,
        data: store,
      });
    } catch (err: any) {
      logEntry.status = 'error';
      logEntry.details = `Fallo en query de extracción: ${err.message}`;
      store.logs.unshift(logEntry);
      connector.status = 'error';
      connector.error_message = err.message;
      saveStoredData(store);

      return res.status(502).json({
        success: false,
        message: `Error al extraer de la base de datos: ${err.message}`,
      });
    }
  } else {
    // Non-SQL connector simulation / pull
    logEntry.details = `Pipeline ${connector.name} sincronizado.`;
    connector.last_sync = new Date().toISOString();
    store.logs.unshift(logEntry);
    saveStoredData(store);

    return res.json({
      success: true,
      message: `Sincronización completada con ${connector.name}.`,
    });
  }
});

// POST: Bulk CSV / JSON Data Import
app.post('/api/data/import', (req: Request, res: Response) => {
  const { entityType, records } = req.body;
  if (!records || !Array.isArray(records)) {
    return res.status(400).json({ success: false, message: 'Formato inválido de registros.' });
  }

  const store = getStoredData();

  switch (entityType) {
    case 'operations':
      store.operations = [...records, ...store.operations];
      break;
    case 'sellers':
      store.sellers = [...records, ...store.sellers];
      break;
    case 'teams':
      store.teams = [...records, ...store.teams];
      break;
    case 'cartera_mora':
      store.carteraMora = [...records, ...store.carteraMora];
      break;
    case 'price_lists':
      store.priceLists = [...records, ...store.priceLists];
      break;
    default:
      return res.status(400).json({ success: false, message: 'Tipo de entidad no soportado.' });
  }

  saveStoredData(store);
  return res.json({
    success: true,
    message: `Se importaron ${records.length} registros en ${entityType}.`,
    count: records.length,
  });
});

// ==================== EXTRACTOR ETL & SHEETSTREAM INTEGRATION ====================

interface ExtractorRecord {
  id: string;
  sourceSheet: string;
  spreadsheetTitle: string;
  spreadsheetId?: string;
  data: Record<string, any>;
  ingestedAt: string;
  updatedAt: string;
}

interface ExtractorSyncLog {
  id: string;
  timestamp: string;
  action: string;
  sourceSheet: string;
  rowCount: number;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
  clientIp: string;
  userAgent?: string;
  payloadPreview?: string;
}

const EXTRACTOR_DATA_FILE = path.resolve(process.cwd(), '.extractor_db.json');

let extractorDatabase: {
  records: ExtractorRecord[];
  syncLogs: ExtractorSyncLog[];
  apiKey: string;
} = {
  records: [],
  syncLogs: [],
  apiKey: 'sk_live_sheetstream_prod_99f2'
};

// Load saved extractor data if exists
try {
  if (fs.existsSync(EXTRACTOR_DATA_FILE)) {
    const raw = fs.readFileSync(EXTRACTOR_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.records)) {
      extractorDatabase = parsed;
    }
  }
} catch (e) {
  console.warn('Could not load extractor database file, using default state', e);
}

function persistExtractorDb() {
  try {
    fs.writeFileSync(EXTRACTOR_DATA_FILE, JSON.stringify(extractorDatabase, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error persisting extractor database:', err);
  }
}

// SSE Connection Management for live updates
const sseClients = new Set<Response>();

function broadcastSSE(event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  });
}

// POST: API Ingest Webhook - Receives data from Google Sheets Extension, Apps Script, cURL or CRM Webhook
app.post('/api/ingest', (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || 'Google-Sheets-Client';
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || req.body.apiKey;

  // Validate API key if configured
  if (extractorDatabase.apiKey && authHeader) {
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;
    if (token !== extractorDatabase.apiKey && token !== 'test_demo_key') {
      const durationMs = Date.now() - startTime;
      const logEntry: ExtractorSyncLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'auth_rejected',
        sourceSheet: req.body.sheetName || 'Desconocida',
        rowCount: 0,
        durationMs,
        status: 'error',
        errorMessage: 'API Key inválida o no autorizada',
        clientIp,
        userAgent,
        payloadPreview: 'Acceso rechazado por clave de API incorrecta'
      };
      extractorDatabase.syncLogs.unshift(logEntry);
      persistExtractorDb();
      broadcastSSE('sync_log', logEntry);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'La API Key proporcionada no es válida. Verifíquela en el panel del Extractor.'
      });
    }
  }

  try {
    const {
      sheetName = 'Hoja 1',
      spreadsheetTitle = 'Planilla Externa / CRM',
      spreadsheetId = '',
      action = 'batch_sync',
      records = [],
      record = null
    } = req.body;

    const incomingRows: Array<Record<string, any>> = Array.isArray(records) && records.length > 0
      ? records
      : record ? [record] : [];

    if (incomingRows.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No se recibieron filas o datos para procesar en el payload.'
      });
    }

    let insertedCount = 0;
    let updatedCount = 0;
    const nowIso = new Date().toISOString();
    const processedRecords: ExtractorRecord[] = [];

    for (const rawRow of incomingRows) {
      const matchKey = rawRow.codigo || rawRow.id || rawRow.subscription_number || rawRow['N° Suscripción'] || rawRow.sku || rawRow.email;
      let existingIndex = -1;

      if (matchKey) {
        existingIndex = extractorDatabase.records.findIndex(r => {
          const rowData = r.data;
          const rKey = rowData.codigo || rowData.id || rowData.subscription_number || rowData['N° Suscripción'] || rowData.sku || rowData.email;
          return rKey === matchKey && r.sourceSheet === sheetName;
        });
      }

      if (existingIndex >= 0) {
        extractorDatabase.records[existingIndex].data = {
          ...extractorDatabase.records[existingIndex].data,
          ...rawRow
        };
        extractorDatabase.records[existingIndex].updatedAt = nowIso;
        processedRecords.push(extractorDatabase.records[existingIndex]);
        updatedCount++;
      } else {
        const newRec: ExtractorRecord = {
          id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          sourceSheet: sheetName,
          spreadsheetTitle: spreadsheetTitle || 'Planilla Externa',
          spreadsheetId: spreadsheetId || undefined,
          data: rawRow,
          ingestedAt: nowIso,
          updatedAt: nowIso,
        };
        extractorDatabase.records.unshift(newRec);
        processedRecords.push(newRec);
        insertedCount++;
      }
    }

    // Keep max 3000 records
    if (extractorDatabase.records.length > 3000) {
      extractorDatabase.records = extractorDatabase.records.slice(0, 3000);
    }

    const durationMs = Date.now() - startTime;
    const sampleNames = incomingRows.slice(0, 3).map(r => r.codigo || r.cliente || r.nombre || Object.values(r)[0] || 'Fila').join(', ');

    const logEntry: ExtractorSyncLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      action: action === 'cell_edit' ? 'cell_edit' : 'batch_sync',
      sourceSheet: sheetName,
      rowCount: incomingRows.length,
      durationMs,
      status: 'success',
      clientIp,
      userAgent,
      payloadPreview: `${incomingRows.length} fila(s) procesadas (${insertedCount} nuevas, ${updatedCount} actualizadas). Ej: ${sampleNames}`
    };

    extractorDatabase.syncLogs.unshift(logEntry);
    if (extractorDatabase.syncLogs.length > 500) {
      extractorDatabase.syncLogs = extractorDatabase.syncLogs.slice(0, 500);
    }

    persistExtractorDb();

    // Broadcast in real-time via SSE
    broadcastSSE('record_ingested', {
      action,
      sheetName,
      spreadsheetTitle,
      insertedCount,
      updatedCount,
      records: processedRecords,
      log: logEntry,
      totalRecords: extractorDatabase.records.length
    });

    return res.status(200).json({
      success: true,
      message: 'Datos extraídos recibidos y sincronizados en tiempo real.',
      insertedCount,
      updatedCount,
      totalStored: extractorDatabase.records.length,
      durationMs,
      timestamp: nowIso
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorLog: ExtractorSyncLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'error',
      sourceSheet: req.body.sheetName || 'Desconocida',
      rowCount: 0,
      durationMs,
      status: 'error',
      errorMessage: err.message || 'Error procesando datos entrantes',
      clientIp,
      userAgent
    };
    extractorDatabase.syncLogs.unshift(errorLog);
    persistExtractorDb();
    broadcastSSE('sync_log', errorLog);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'Fallo al procesar el webhook'
    });
  }
});

// GET: SSE Real-Time Event Stream
app.get('/api/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({
    connected: true,
    time: new Date().toISOString(),
    activeRecords: extractorDatabase.records.length
  })}\n\n`);

  const pingInterval = setInterval(() => {
    try {
      res.write(`event: ping\ndata: {"time":"${new Date().toISOString()}"}\n\n`);
    } catch {
      clearInterval(pingInterval);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
    sseClients.delete(res);
  });
});

// GET: Query Extractor Records
app.get('/api/records', (req: Request, res: Response) => {
  const sheet = req.query.sheet as string;
  const search = (req.query.search as string || '').toLowerCase().trim();

  let list = extractorDatabase.records;
  if (sheet && sheet !== 'all') {
    list = list.filter(r => r.sourceSheet === sheet);
  }
  if (search) {
    list = list.filter(r => {
      const str = (JSON.stringify(r.data) + ' ' + r.sourceSheet + ' ' + r.spreadsheetTitle).toLowerCase();
      return str.includes(search);
    });
  }

  res.json({
    records: list,
    total: list.length,
    sheets: Array.from(new Set(extractorDatabase.records.map(r => r.sourceSheet)))
  });
});

// DELETE: Delete record or clear all
app.delete('/api/records', (req: Request, res: Response) => {
  const { id, clearAll } = req.body || {};
  if (clearAll) {
    extractorDatabase.records = [];
    persistExtractorDb();
    broadcastSSE('records_cleared', { total: 0 });
    return res.json({ success: true, message: 'Todos los registros han sido eliminados.' });
  }
  if (id) {
    extractorDatabase.records = extractorDatabase.records.filter(r => r.id !== id);
    persistExtractorDb();
    broadcastSSE('record_deleted', { id, total: extractorDatabase.records.length });
    return res.json({ success: true, message: `Registro ${id} eliminado.` });
  }
  res.status(400).json({ error: 'Missing id or clearAll parameter' });
});

// GET: Sync logs
app.get('/api/sync-logs', (_req: Request, res: Response) => {
  res.json({
    logs: extractorDatabase.syncLogs.slice(0, 100),
    totalLogs: extractorDatabase.syncLogs.length
  });
});

// GET: Extractor statistics
app.get('/api/stats', (_req: Request, res: Response) => {
  const totalRecords = extractorDatabase.records.length;
  const totalSyncs = extractorDatabase.syncLogs.filter(l => l.status === 'success').length;
  const errorSyncs = extractorDatabase.syncLogs.filter(l => l.status === 'error').length;
  
  const recentLogs = extractorDatabase.syncLogs.slice(0, 50);
  const avgLatency = recentLogs.length > 0 
    ? Math.round(recentLogs.reduce((acc, l) => acc + (l.durationMs || 0), 0) / recentLogs.length) 
    : 0;

  const sheets = Array.from(new Set(extractorDatabase.records.map(r => r.sourceSheet)));
  
  let totalMonetary = 0;
  extractorDatabase.records.forEach(r => {
    const val = parseFloat(r.data.monto || r.data.total || r.data.precio || r.data.cuota_1_value || 0);
    if (!isNaN(val)) totalMonetary += val;
  });

  res.json({
    totalRecords,
    totalSyncs,
    errorSyncs,
    avgLatency,
    sheetsCount: sheets.length,
    sheets,
    totalMonetary,
    lastSync: extractorDatabase.syncLogs[0]?.timestamp || null
  });
});

// GET / POST: API Key configuration
app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    apiKey: extractorDatabase.apiKey,
    ingestUrl: '/api/ingest',
    streamUrl: '/api/stream'
  });
});

app.post('/api/config', (req: Request, res: Response) => {
  const { apiKey } = req.body;
  if (apiKey && typeof apiKey === 'string') {
    extractorDatabase.apiKey = apiKey.trim();
    persistExtractorDb();
    return res.json({ success: true, apiKey: extractorDatabase.apiKey });
  }
  res.status(400).json({ error: 'Invalid apiKey' });
});

// POST: Reset demo data
app.post('/api/reset-demo', (_req: Request, res: Response) => {
  extractorDatabase.records = [];
  extractorDatabase.syncLogs = [
    {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'reset_demo',
      sourceSheet: 'Sistema',
      rowCount: 0,
      durationMs: 10,
      status: 'success',
      clientIp: '127.0.0.1',
      userAgent: 'Internal-System',
      payloadPreview: 'Base de datos del extractor vaciada'
    }
  ];
  persistExtractorDb();
  broadcastSSE('reset_demo', { total: 0 });
  res.json({ success: true, records: [] });
});

// POST: Export records with column filtering
app.post('/api/export', (req: Request, res: Response) => {
  const { columns = [], format = 'json', sheet = 'all' } = req.body || {};
  let list = extractorDatabase.records;
  if (sheet && sheet !== 'all') {
    list = list.filter(r => r.sourceSheet === sheet);
  }

  const filtered = list.map(r => {
    if (!Array.isArray(columns) || columns.length === 0) return r.data;
    const row: Record<string, any> = {};
    columns.forEach((col: string) => {
      if (r.data[col] !== undefined) row[col] = r.data[col];
    });
    return row;
  });

  if (format === 'csv') {
    const keys = Array.isArray(columns) && columns.length > 0
      ? columns
      : Array.from(new Set(filtered.flatMap(Object.keys)));

    const csvRows = [
      keys.join(','),
      ...filtered.map((row: any) =>
        keys.map((k: string) => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',')
      )
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="extractor_export.csv"');
    return res.send(csvRows.join('\n'));
  }

  return res.json({
    success: true,
    total: filtered.length,
    columns: Array.isArray(columns) && columns.length > 0 ? columns : 'all',
    records: filtered
  });
});

// ==================== VITE SPA / STATIC SERVER ====================
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Concesionaria Nave Planes server running on port ${PORT}`);
  });
}

startServer();
