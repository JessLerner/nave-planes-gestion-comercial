// Authenticated ingestion endpoint for scoring spreadsheets. It stores source
// rows verbatim in a landing zone; operational status is never guessed here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  canonicalBrand,
  normalizeText,
  parseScoringDate,
  scoringSourceKey,
  type SheetRow,
  valueFor,
} from './scoring-utils.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (!request.headers.get('content-type')?.toLocaleLowerCase().includes('application/json')) {
    return Response.json({ error: 'Content-Type must be application/json' }, { status: 415 });
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

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'JSON body must be an object' }, { status: 400 });
  }

  const rawBrand = normalizeText(body.brand);
  const brand = canonicalBrand(body.brand);
  if (!rawBrand || rawBrand.length > 80 || !Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 5_000) {
    return Response.json({ error: 'brand and at least one real source row are required' }, { status: 400 });
  }
  if (normalizeText(body.sourceUrl).length > 2_048 || normalizeText(body.sheetName).length > 200) {
    return Response.json({ error: 'Source metadata exceeds the permitted length' }, { status: 400 });
  }

  if (body.rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    return Response.json({ error: 'Every row must be a JSON object' }, { status: 400 });
  }
  const rows = body.rows as SheetRow[];

  const records = rows.map((row) => ({
    row,
    subscription: normalizeText(valueFor(row, 'SX')),
  }));

  if (records.some(({ subscription }) => !subscription || subscription.length > 160)) {
    return Response.json({ error: 'Every source row must contain a valid SX (subscription number); nothing was imported' }, { status: 422 });
  }
  const uniqueKeys = new Set(records.map(({ subscription }) => scoringSourceKey(brand, subscription)));
  if (uniqueKeys.size !== records.length) {
    return Response.json({ error: 'The request contains duplicate SX values for the same brand; nothing was imported' }, { status: 422 });
  }

  // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase into
  // Edge Functions. Both values remain server-side and are never returned.
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: 'Server-side Supabase credentials are unavailable' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // `source_key` is the chosen upsert arbiter. Before any write, verify the
  // second unique identity (brand, subscription_number) is canonical too.
  // This prevents a legacy/malformed row from causing an unexpected conflict
  // after a source_sync_runs row was already created.
  const subscriptions = records.map(({ subscription }) => subscription);
  const expectedKeyBySubscription = new Map(records.map(({ subscription }) => [
    subscription,
    scoringSourceKey(brand, subscription),
  ]));
  const { data: existingRows, error: existingRowsError } = await supabase
    .from('scoring_source_rows')
    .select('source_key,brand,subscription_number')
    .eq('brand', brand)
    .in('subscription_number', subscriptions);
  if (existingRowsError) return Response.json({ error: 'Unable to validate existing scoring identities' }, { status: 500 });
  const conflictingExistingRow = (existingRows ?? []).find((row) =>
    row.source_key !== expectedKeyBySubscription.get(row.subscription_number));
  if (conflictingExistingRow) {
    return Response.json({ error: 'Existing scoring identity is inconsistent; import was not started' }, { status: 409 });
  }
  const { data: existingKeys, error: existingKeysError } = await supabase
    .from('scoring_source_rows')
    .select('source_key,brand,subscription_number')
    .in('source_key', Array.from(uniqueKeys));
  if (existingKeysError) return Response.json({ error: 'Unable to validate existing scoring source keys' }, { status: 500 });
  const conflictingExistingKey = (existingKeys ?? []).find((row) =>
    row.source_key !== scoringSourceKey(canonicalBrand(row.brand), row.subscription_number));
  if (conflictingExistingKey) {
    return Response.json({ error: 'Existing scoring source key is inconsistent; import was not started' }, { status: 409 });
  }

  const { data: run, error: runError } = await supabase
    .from('source_sync_runs')
    .insert({
      source_key: `scoring:${brand}`,
      source_url: normalizeText(body.sourceUrl) || null,
      source_sheet: normalizeText(body.sheetName) || null,
      row_count: records.length,
      imported_by: 'ingest-scoring-sheet',
    })
    .select('id')
    .single();
  if (runError) return Response.json({ error: runError.message }, { status: 500 });

  const payload = records.map(({ row, subscription }) => ({
    source_key: scoringSourceKey(brand, subscription),
    latest_run_id: run.id,
    brand,
    subscription_number: subscription,
    client_name: valueFor(row, 'CLIENTE') || null,
    scoring_date: parseScoringDate(valueFor(row, 'FECHA')),
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
