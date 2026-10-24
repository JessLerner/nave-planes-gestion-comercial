export type DatabaseType = 'postgresql' | 'supabase' | 'data_extractor' | 'google_sheets' | 'rest_api';

export interface DatabaseConnectorConfig {
  id: string;
  name: string;
  type: DatabaseType;
  description: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'testing' | 'error';
  last_sync?: string;
  records_extracted?: number;
  config: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    connection_string?: string;
    api_url?: string;
    api_key?: string;
    webhook_secret?: string;
    sheet_url?: string;
  };
  tables_mapped?: string[];
  error_message?: string;
}

export interface IngestionLog {
  id: string;
  timestamp: string;
  connector_id: string;
  connector_name: string;
  status: 'success' | 'warning' | 'error';
  records_received: number;
  records_inserted: number;
  details: string;
}
