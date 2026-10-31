import { Pool } from 'pg';
import { confidentNameMatch } from './lib/name-match';
import { databasePoolConfig } from './lib/database';

type VercelRequest = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => VercelResponse };

type ImportedLead = {
  leadId?: unknown;
  entryDate?: unknown;
  managedAt?: unknown;
  closedAt?: unknown;
  foxUserName?: unknown;
  foxUserKey?: unknown;
  status?: unknown;
  source?: unknown;
  channel?: unknown;
  branch?: unknown;
  brand?: unknown;
  closeReason?: unknown;
  sold?: unknown;
};

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = new Pool(databasePoolConfig(rawConnectionString));
const MAX_ROWS = 20_000;

const text = (value: unknown, max = 180) => {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
};

const date = (value: unknown) => {
  const result = text(value, 10);
  return result && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
};

const timestamp = (value: unknown) => {
  const result = text(value, 40);
  return result && !Number.isNaN(Date.parse(result)) ? result : null;
};

const normalizeUser = (value: string | null) => value
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ').toLowerCase()
  : null;

const nameSignature = (value: string | null) => normalizeUser(value)
  ?.split(' ')
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right, 'es-AR'))
  .join(' ') || null;

async function verifySupabaseAccessToken(req: VercelRequest) {
  const header = req.headers?.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  if (!authorization?.startsWith('Bearer ')) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: authorization, apikey: key } });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return user.id ?? null;
}

function cleanLead(row: ImportedLead) {
  const leadId = text(row.leadId, 80);
  if (!leadId || !/^[#A-Za-z0-9_-]+$/.test(leadId)) return null;
  const foxUserName = text(row.foxUserName);
  const foxUserKey = normalizeUser(text(row.foxUserKey) || foxUserName);
  return {
    lead_id: leadId,
    entry_date: timestamp(row.entryDate)?.slice(0, 10) || null,
    managed_at: timestamp(row.managedAt),
    closed_at: timestamp(row.closedAt),
    fox_user_name: foxUserName,
    fox_user_key: foxUserKey,
    lead_status: text(row.status),
    lead_source: text(row.source),
    channel: text(row.channel),
    branch: text(row.branch),
    brand: text(row.brand),
    close_reason: text(row.closeReason),
    sold: typeof row.sold === 'boolean' ? row.sold : null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método no permitido.' });
  if (!rawConnectionString) return res.status(503).json({ success: false, message: 'La base operativa no está configurada.' });

  const userId = await verifySupabaseAccessToken(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });

  const body = req.body as Record<string, unknown> | undefined;
  const snapshotDate = date(body?.snapshotDate);
  const periodStart = date(body?.periodStart);
  const periodEnd = date(body?.periodEnd);
  const fileName = text(body?.fileName, 240);
  const fileHash = text(body?.fileHash, 64);
  const sourceRows = Array.isArray(body?.leads) ? body?.leads : null;
  if (!snapshotDate || !periodStart || !periodEnd || !fileName || !fileHash || !sourceRows || sourceRows.length === 0 || sourceRows.length > MAX_ROWS) {
    return res.status(400).json({ success: false, message: 'El reporte no tiene un formato o tamaño válido.' });
  }
  if (periodStart > periodEnd || snapshotDate < periodStart || snapshotDate > periodEnd || !/^[a-f0-9]{64}$/i.test(fileHash)) {
    return res.status(400).json({ success: false, message: 'Las fechas o la firma del reporte no son válidas.' });
  }

  const leads = (sourceRows as ImportedLead[]).map(cleanLead).filter((row): row is NonNullable<ReturnType<typeof cleanLead>> => row !== null);
  if (leads.length === 0) return res.status(400).json({ success: false, message: 'No se encontraron IDs de Fox válidos.' });

  const db = await pool.connect();
  try {
    const profile = await db.query(`select role from public.profiles where id = $1 limit 1`, [userId]);
    if (profile.rows[0]?.role !== 'admin') return res.status(403).json({ success: false, message: 'Sólo Administración puede importar reportes de Fox.' });

    await db.query('begin');
    const run = await db.query(`
      insert into public.fox_import_runs (
        snapshot_date, period_start, period_end, source_file_name, source_file_sha256, received_rows, imported_by
      ) values ($1, $2, $3, $4, $5, $6, $7) returning id
    `, [snapshotDate, periodStart, periodEnd, fileName, fileHash, sourceRows.length, userId]);
    const runId = run.rows[0].id as string;

    const mappingResult = await db.query(`
      select m.fox_user_key, m.seller_id, coalesce(s.team_id, null) as team_id
      from public.fox_user_mappings m
      left join public.sellers s on s.id = m.seller_id
    `);
    const sellerResult = await db.query(`select id, team_id, full_name from public.sellers`);
    const mappings = new Map<string, { sellerId: string | null; teamId: string | null }>();
    const sellersBySignature = new Map<string, { sellerId: string | null; teamId: string | null }>();
    const ambiguousSignatures = new Set<string>();
    for (const row of mappingResult.rows) mappings.set(row.fox_user_key, { sellerId: row.seller_id, teamId: row.team_id });
    for (const seller of sellerResult.rows) {
      const key = normalizeUser(seller.full_name);
      if (key && !mappings.has(key)) mappings.set(key, { sellerId: seller.id, teamId: seller.team_id });
      const signature = nameSignature(seller.full_name);
      if (signature) {
        if (sellersBySignature.has(signature)) ambiguousSignatures.add(signature);
        else sellersBySignature.set(signature, { sellerId: seller.id, teamId: seller.team_id });
      }
    }
    for (const signature of ambiguousSignatures) sellersBySignature.delete(signature);

    const sellerCandidates = sellerResult.rows.map((seller) => ({ ...seller, sellerId: seller.id, teamId: seller.team_id }));
    const unmappedNames = new Set<string>();
    const enriched = leads.map(lead => {
      const automatic = confidentNameMatch(lead.fox_user_name, sellerCandidates);
      const assignment = lead.fox_user_key
        ? mappings.get(lead.fox_user_key) || sellersBySignature.get(nameSignature(lead.fox_user_name) || '') || (automatic ? { sellerId: automatic.sellerId, teamId: automatic.teamId } : undefined)
        : automatic ? { sellerId: automatic.sellerId, teamId: automatic.teamId } : undefined;
      if (lead.fox_user_name && !assignment) unmappedNames.add(lead.fox_user_name);
      return { ...lead, seller_id: assignment?.sellerId ?? null, team_id: assignment?.teamId ?? null };
    });
    const serialized = JSON.stringify(enriched);

    await db.query(`
      insert into public.fox_lead_daily_snapshots (
        snapshot_date, fox_lead_id, entry_date, managed_at, closed_at, fox_user_name, fox_user_key,
        seller_id, team_id, lead_status, lead_source, channel, branch, brand, close_reason, sold, import_run_id
      )
      select $1, lead_id, entry_date::date, managed_at::timestamptz, closed_at::timestamptz, fox_user_name, fox_user_key,
        seller_id::uuid, team_id::uuid, lead_status, lead_source, channel, branch, brand, close_reason, sold, $2::uuid
      from jsonb_to_recordset($3::jsonb) as r(
        lead_id text, entry_date text, managed_at text, closed_at text, fox_user_name text, fox_user_key text,
        seller_id text, team_id text, lead_status text, lead_source text, channel text, branch text, brand text,
        close_reason text, sold boolean
      )
      on conflict (snapshot_date, fox_lead_id) do update set
        entry_date = excluded.entry_date, managed_at = excluded.managed_at, closed_at = excluded.closed_at,
        fox_user_name = excluded.fox_user_name, fox_user_key = excluded.fox_user_key,
        seller_id = excluded.seller_id, team_id = excluded.team_id, lead_status = excluded.lead_status,
        lead_source = excluded.lead_source, channel = excluded.channel, branch = excluded.branch,
        brand = excluded.brand, close_reason = excluded.close_reason, sold = excluded.sold,
        import_run_id = excluded.import_run_id, imported_at = now()
    `, [snapshotDate, runId, serialized]);

    await db.query(`
      insert into public.fox_leads as current_leads (
        fox_lead_id, first_seen_date, last_snapshot_date, entry_date, managed_at, closed_at, fox_user_name, fox_user_key,
        seller_id, team_id, lead_status, lead_source, channel, branch, brand, close_reason, sold, last_import_run_id
      )
      select fox_lead_id, $1::date, $1::date, entry_date, managed_at, closed_at, fox_user_name, fox_user_key,
        seller_id, team_id, lead_status, lead_source, channel, branch, brand, close_reason, sold, $2::uuid
      from public.fox_lead_daily_snapshots
      where snapshot_date = $1 and import_run_id = $2
      on conflict (fox_lead_id) do update set
        last_snapshot_date = excluded.last_snapshot_date, entry_date = excluded.entry_date, managed_at = excluded.managed_at,
        closed_at = excluded.closed_at, fox_user_name = excluded.fox_user_name, fox_user_key = excluded.fox_user_key,
        seller_id = excluded.seller_id, team_id = excluded.team_id, lead_status = excluded.lead_status,
        lead_source = excluded.lead_source, channel = excluded.channel, branch = excluded.branch, brand = excluded.brand,
        close_reason = excluded.close_reason, sold = excluded.sold, last_import_run_id = excluded.last_import_run_id,
        updated_at = now()
      where excluded.last_snapshot_date >= current_leads.last_snapshot_date
    `, [snapshotDate, runId]);

    const summary = { stored: enriched.length, unmappedRows: enriched.filter(row => !row.seller_id).length, unmappedFoxUsers: [...unmappedNames].sort() };
    await db.query(`update public.fox_import_runs set stored_rows = $2, unmapped_rows = $3, summary = $4::jsonb where id = $1`, [runId, enriched.length, summary.unmappedRows, JSON.stringify(summary)]);
    await db.query('commit');
    return res.status(200).json({ success: true, runId, ...summary });
  } catch (error) {
    await db.query('rollback');
    console.error('Fox lead import failed', error);
    return res.status(500).json({ success: false, message: 'No se pudo registrar el reporte de Fox. No se guardaron filas parciales.' });
  } finally {
    db.release();
  }
}
