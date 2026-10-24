import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConfig } from '../../types/extractor';

const STORAGE_KEY = 'nave_sheetstream_supabase_config';

const DEFAULT_CONFIG: SupabaseConfig = {
  projectUrl: '',
  apiKey: '',
  tableName: 'sheet_records',
  autoForward: true
};

export function loadSupabaseConfig(): SupabaseConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Could not read Supabase config from localStorage', e);
  }
  return DEFAULT_CONFIG;
}

export function saveSupabaseConfig(config: SupabaseConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving Supabase config', e);
  }
}

let activeSupabaseClient: SupabaseClient | null = null;
let currentClientKey = '';

export function getSupabase(config: SupabaseConfig): SupabaseClient | null {
  if (!config.projectUrl || !config.apiKey) return null;

  const key = `${config.projectUrl.trim()}_${config.apiKey.trim()}`;
  if (activeSupabaseClient && currentClientKey === key) {
    return activeSupabaseClient;
  }

  try {
    activeSupabaseClient = createClient(config.projectUrl.trim(), config.apiKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    currentClientKey = key;
    return activeSupabaseClient;
  } catch (err) {
    console.error('Error creating Supabase client:', err);
    return null;
  }
}

export async function testSupabaseConnection(config: SupabaseConfig): Promise<{
  success: boolean;
  message: string;
  rowCount?: number;
}> {
  const client = getSupabase(config);
  if (!client) {
    return { success: false, message: 'URL o API Key de Supabase faltante o inválida.' };
  }

  try {
    const { count, error } = await client
      .from(config.tableName || 'sheet_records')
      .select('*', { count: 'exact', head: true });

    if (error) {
      if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return {
          success: false,
          message: `La tabla "${config.tableName}" aún no existe en Supabase. Puedes crearla con 1 clic usando el script SQL generado.`
        };
      }
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: `Conexión con Supabase verificada con éxito. Tabla "${config.tableName}" lista.`,
      rowCount: count || 0
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error de conexión con Supabase' };
  }
}

export async function sendRowsToSupabase(
  rows: Array<Record<string, any>>,
  config: SupabaseConfig,
  metadata?: { sheetName?: string; spreadsheetTitle?: string; spreadsheetId?: string }
): Promise<{ success: boolean; insertedCount: number; error?: string }> {
  const client = getSupabase(config);
  if (!client) {
    return { success: false, insertedCount: 0, error: 'Supabase no está configurado.' };
  }

  try {
    const targetTable = (config.tableName || 'sheet_records').trim();

    // Generic JSONB table format (default: sheet_records)
    if (targetTable === 'sheet_records' || targetTable.startsWith('sheet_')) {
      const formattedRows = rows.map((r, idx) => {
        const recordCode = r.codigo || r.id || r.sku || r.dni || r.suscripcion || `row_${Date.now()}_${idx}`;
        return {
          record_id: String(recordCode),
          sheet_name: metadata?.sheetName || 'Google Sheets',
          spreadsheet_title: metadata?.spreadsheetTitle || 'Planilla Nave',
          spreadsheet_id: metadata?.spreadsheetId || null,
          data: r,
          ingested_at: new Date().toISOString()
        };
      });

      const { error } = await client
        .from(targetTable)
        .upsert(formattedRows, { onConflict: 'record_id' });

      if (error) throw error;
      return { success: true, insertedCount: formattedRows.length };
    } else {
      // Direct column upsert into structured SQL table
      const { error } = await client
        .from(targetTable)
        .upsert(rows);

      if (error) throw error;
      return { success: true, insertedCount: rows.length };
    }
  } catch (err: any) {
    console.error('Error inserting into Supabase:', err);
    return { success: false, insertedCount: 0, error: err.message || 'Error al insertar en Supabase' };
  }
}

export function getSupabaseSqlScript(tableName = 'sheet_records'): string {
  return `-- DDL SQL PARA CREAR LA TABLA DE DESTINO EN SUPABASE
-- Copia y ejecuta este script en el SQL Editor de tu proyecto de Supabase

create table if not exists public.${tableName} (
  record_id text primary key,
  sheet_name text not null,
  spreadsheet_title text,
  spreadsheet_id text,
  data jsonb not null default '{}'::jsonb,
  ingested_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar Row Level Security (RLS)
alter table public.${tableName} enable row level security;

-- Política para permitir lectura autenticada o anónima (según tu anon key)
create policy "Permitir lectura en ${tableName}"
  on public.${tableName} for select
  using (true);

-- Política para permitir inserción de registros extraídos
create policy "Permitir insercion en ${tableName}"
  on public.${tableName} for insert
  with check (true);

-- Política para permitir actualización (upsert)
create policy "Permitir actualizacion en ${tableName}"
  on public.${tableName} for update
  using (true);

-- Índices optimizados para consultas de alta velocidad y filtros por hoja
create index if not exists idx_${tableName}_sheet on public.${tableName} (sheet_name);
create index if not exists idx_${tableName}_ingested on public.${tableName} (ingested_at desc);
create index if not exists idx_${tableName}_data_gin on public.${tableName} using gin (data);
`;
}
