export interface SheetRecord {
  id: string;
  sourceSheet: string;
  spreadsheetTitle: string;
  spreadsheetId?: string;
  data: Record<string, any>;
  ingestedAt: string;
  updatedAt: string;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  action: 'batch_sync' | 'cell_edit' | 'on_edit_trigger' | 'reset_demo' | 'auth_rejected' | 'error' | string;
  sourceSheet: string;
  rowCount: number;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
  clientIp: string;
  userAgent?: string;
  payloadPreview?: string;
}

export interface SystemStats {
  totalRecords: number;
  totalSyncs: number;
  errorSyncs: number;
  avgLatency: number;
  sheetsCount: number;
  sheets: string[];
  totalMonetary: number;
  lastSync: string | null;
}

export interface ApiConfig {
  apiKey: string;
  ingestUrl: string;
  streamUrl: string;
}

export interface IngestPayload {
  sheetName: string;
  spreadsheetTitle?: string;
  spreadsheetId?: string;
  action: 'batch_sync' | 'cell_edit' | 'row_insert';
  records?: Record<string, any>[];
  record?: Record<string, any>;
  apiKey?: string;
}

export interface SupabaseConfig {
  projectUrl: string;
  apiKey: string;
  tableName: string;
  autoForward: boolean;
}
