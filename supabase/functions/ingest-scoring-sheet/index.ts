// Authenticated ingestion endpoint for scoring spreadsheets. It stores source
// rows verbatim in a landing zone; operational status is never guessed here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SheetRow = Record<string, unknown>;

const normalize = (value: unknown) => String(value ?? '').trim();
const headerKey = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

const valueFor = (row: SheetRow, header: string) => {
  const expected = headerKey(header);
  const entry = Object.entries(row).find(([key]) => headerKey(key) === expected);
  return entry ? normalize(entry[1]) : '';
};

const parseDate = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const secret = Deno.env.get('INGEST_SHARED_SECRET');
  if (!secret || request.headers.get('x-ingest-secret') !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { brand?: unknown; sourceUrl?: unknown; sheetName?: unknown; rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const brand = normalize(body.brand);
  const rows = Array.isArray(body.rows) ? body.rows.filter((row): row is SheetRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : [];
  if (!brand || rows.length === 0) {
    return Response.json({ error: 'brand and at least one real source row are required' }, { status: 400 });
  }

  const records = rows.map((row) => ({
    row,
    subscription: valueFor(row, 'SX'),
  })).filter(({ subscription }) => subscription);

  if (records.length === 0) {
    return Response.json({ error: 'No source rows contained SX (subscription number); nothing was imported' }, { status: 422 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: run, error: runError } = await supabase
    .from('source_sync_runs')
    .insert({
      source_key: `scoring:${brand.toLocaleLowerCase()}`,
      source_url: normalize(body.sourceUrl) || null,
      source_sheet: normalize(body.sheetName) || null,
      row_count: records.length,
      imported_by: 'ingest-scoring-sheet',
    })
    .select('id')
    .single();
  if (runError) return Response.json({ error: runError.message }, { status: 500 });

  const payload = records.map(({ row, subscription }) => ({
    source_key: `scoring:${brand.toLocaleLowerCase()}:${subscription}`,
    latest_run_id: run.id,
    brand,
    subscription_number: subscription,
    client_name: valueFor(row, 'CLIENTE') || null,
    scoring_date: parseDate(valueFor(row, 'FECHA')),
    seller_name: valueFor(row, 'VENDEDOR') || null,
    supervisor_name: valueFor(row, 'SUPERVISOR') || null,
    administrator_name: valueFor(row, 'ADM') || null,
    observed_category: valueFor(row, 'CATEGORIA') || null,
    rejection_reason_1: valueFor(row, 'MOTIVO RECHAZO 1') || null,
    rejection_reason_2: valueFor(row, 'MOTIVO RECHAZO 2') || null,
    approval_reason: valueFor(row, 'MOTIVO APROBADO') || null,
    cancellation_reason: valueFor(row, 'MOTIVO ANULADO') || null,
    comments: valueFor(row, 'COMENTARIOS') || null,
    source_row: row,
    last_seen_at: new Date().toISOString(),
  }));
  const { error: rowsError } = await supabase
    .from('scoring_source_rows')
    .upsert(payload, { onConflict: 'source_key' });
  if (rowsError) return Response.json({ error: rowsError.message }, { status: 500 });

  return Response.json({ success: true, brand, received: rows.length, stored: payload.length, runId: run.id });
});
