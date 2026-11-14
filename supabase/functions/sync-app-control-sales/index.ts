// Read-only synchronization of announced sales from App Control's ID Ventas.
// It never writes back to Apps Script or Google Sheets, and it never creates
// roster records: each row must resolve to the existing authoritative roster.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseSale, type ParsedSale, type SheetRow } from './sales-utils.ts';

const SOURCE_KEY = 'app_control_operaciones:id_ventas';
const SOURCE_SHEET = 'ID Ventas';
const canonical = (value: unknown) => String(value ?? '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

type Supabase = ReturnType<typeof createClient>;
type SyncError = { source_key?: string | null; error_code: string; error_message: string; source_row?: SheetRow | null };

async function recordErrors(supabase: Supabase, runId: string, errors: SyncError[]) {
  if (!errors.length) return;
  const { error } = await supabase.from('source_sync_errors').insert(errors.map((entry) => ({ run_id: runId, ...entry })));
  if (error) throw new Error(`No se pudieron registrar los errores de la corrida: ${error.message}`);
}

async function finishRun(supabase: Supabase, runId: string, rowCount: number, errorCount: number, failed = false) {
  const run_status = failed ? 'failed' : errorCount ? 'completed_with_errors' : 'completed';
  const { error } = await supabase.from('source_sync_runs').update({
    row_count: rowCount,
    error_count: errorCount,
    run_status,
    completed_at: new Date().toISOString(),
  }).eq('id', runId);
  if (error) throw new Error(`No se pudo cerrar la corrida: ${error.message}`);
}

function salesRows(payload: unknown): SheetRow[] | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const source = payload as { status?: unknown; data?: { idVentas?: unknown; id_ventas?: unknown } };
  if (source.status !== 'success') return null;
  const rows = source.data?.idVentas ?? source.data?.id_ventas;
  return Array.isArray(rows) && rows.every((row) => row && typeof row === 'object' && !Array.isArray(row)) ? rows as SheetRow[] : null;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const expectedSecret = Deno.env.get('INGEST_SHARED_SECRET');
  if (!expectedSecret || request.headers.get('x-ingest-secret') !== expectedSecret) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sourceUrl = Deno.env.get('APP_CONTROL_VENTAS_URL');
  if (!sourceUrl) {
    return Response.json({ error: 'APP_CONTROL_VENTAS_URL is not configured; it must expose ID Ventas as a read-only JSON endpoint.' }, { status: 503 });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: 'Server-side Supabase credentials are unavailable' }, { status: 503 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: startedRun, error: startedRunError } = await supabase.from('source_sync_runs').insert({
    source_key: SOURCE_KEY, source_url: sourceUrl, source_sheet: SOURCE_SHEET, row_count: 0,
    imported_by: 'sync-app-control-sales', run_status: 'running', error_count: 0,
  }).select('id').single();
  if (startedRunError || !startedRun) return Response.json({ error: startedRunError?.message ?? 'Unable to create sync run' }, { status: 500 });
  const runId = startedRun.id as string;

  try {
    let payload: unknown;
    try {
      const response = await fetch(sourceUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`App Control returned HTTP ${response.status}`);
      payload = await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo leer App Control.';
      await recordErrors(supabase, runId, [{ error_code: 'source_unavailable', error_message: message }]);
      await finishRun(supabase, runId, 0, 1, true);
      return Response.json({ error: message, runId }, { status: 502 });
    }
    const rows = salesRows(payload);
    if (!rows) {
      const message = 'App Control debe devolver { status: "success", data: { idVentas: [...] } } para la hoja ID Ventas.';
      await recordErrors(supabase, runId, [{ error_code: 'unexpected_source_contract', error_message: message }]);
      await finishRun(supabase, runId, 0, 1, true);
      return Response.json({ error: message, runId }, { status: 422 });
    }
    if (rows.length > 5_000) {
      const message = 'ID Ventas supera el máximo de 5000 filas por corrida.';
      await recordErrors(supabase, runId, [{ error_code: 'source_row_limit_exceeded', error_message: message }]);
      await finishRun(supabase, runId, rows.length, 1, true);
      return Response.json({ error: message, runId }, { status: 422 });
    }

    const errors: SyncError[] = [];
    const parsed: ParsedSale[] = [];
    const seenKeys = new Set<string>();
    for (const row of rows) {
      const result = parseSale(row);
      if (!result.sale) {
        errors.push({ error_code: result.issue!.code, error_message: result.issue!.message, source_row: row });
        continue;
      }
      if (seenKeys.has(result.sale.sourceKey)) {
        errors.push({ source_key: result.sale.sourceKey, error_code: 'duplicate_source_id_in_run', error_message: 'El mismo ID Venta aparece más de una vez en la respuesta de origen.', source_row: row });
        continue;
      }
      seenKeys.add(result.sale.sourceKey);
      parsed.push(result.sale);
    }

    const { data: roster, error: rosterError } = await supabase
      .from('sellers')
      .select('id,full_name,team_id,teams!inner(id,name)')
      .eq('active', true)
      .limit(5000);
    if (rosterError) throw new Error(`No se pudo consultar la estructura autorizada: ${rosterError.message}`);
    const sellerByTeamAndName = new Map<string, { id: string; teamId: string }>();
    for (const seller of roster ?? []) {
      const team = seller.teams as unknown as { id: string; name: string };
      const key = `${canonical(team.name)}:${canonical(seller.full_name)}`;
      if (sellerByTeamAndName.has(key)) sellerByTeamAndName.set(key, { id: '', teamId: '' });
      else sellerByTeamAndName.set(key, { id: seller.id, teamId: team.id });
    }
    const authorized = parsed.filter((sale) => {
      const match = sellerByTeamAndName.get(`${canonical(sale.teamName)}:${canonical(sale.sellerName)}`);
      if (!match || !match.id) {
        errors.push({ source_key: sale.sourceKey, error_code: 'unresolved_roster_reference', error_message: 'Equipo de Venta y Vendedor no resuelven de forma única contra la estructura autorizada.', source_row: sale.sourceRow });
        return false;
      }
      (sale as ParsedSale & { sellerId?: string; teamId?: string }).sellerId = match.id;
      (sale as ParsedSale & { sellerId?: string; teamId?: string }).teamId = match.teamId;
      return true;
    }) as Array<ParsedSale & { sellerId: string; teamId: string }>;

    const externalKeys = authorized.map((sale) => sale.sourceKey);
    const subscriptions = authorized.flatMap((sale) => sale.subscriptionNumber ? [sale.subscriptionNumber] : []);
    const [existingByExternalResult, existingBySubscriptionResult] = await Promise.all([
      externalKeys.length
        ? supabase.from('sales_operations').select('id,external_id,subscription_number').in('external_id', externalKeys)
        : Promise.resolve({ data: [], error: null }),
      subscriptions.length
        ? supabase.from('sales_operations').select('id,external_id,subscription_number').in('subscription_number', subscriptions)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (existingByExternalResult.error || existingBySubscriptionResult.error) {
      throw new Error(`No se pudieron reconciliar las ventas existentes: ${existingByExternalResult.error?.message ?? existingBySubscriptionResult.error?.message}`);
    }
    const existing = [...(existingByExternalResult.data ?? []), ...(existingBySubscriptionResult.data ?? [])];
    const byExternal = new Map(existing.filter((row) => row.external_id).map((row) => [row.external_id as string, row]));
    const bySubscription = new Map(existing.filter((row) => row.subscription_number).map((row) => [row.subscription_number as string, row]));

    const upserts: Record<string, unknown>[] = [];
    const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
    const sourceUpdatedAt = new Date().toISOString();
    for (const sale of authorized) {
      const external = byExternal.get(sale.sourceKey);
      const subscription = sale.subscriptionNumber ? bySubscription.get(sale.subscriptionNumber) : undefined;
      if (external && subscription && external.id !== subscription.id) {
        errors.push({ source_key: sale.sourceKey, error_code: 'conflicting_sale_identities', error_message: 'El ID Venta y el N° de Suscripción ya pertenecen a operaciones distintas.', source_row: sale.sourceRow });
        continue;
      }
      if (external?.subscription_number && sale.subscriptionNumber && external.subscription_number !== sale.subscriptionNumber) {
        errors.push({ source_key: sale.sourceKey, error_code: 'external_id_subscription_conflict', error_message: 'El ID Venta existente fue asociado a otro N° de Suscripción.', source_row: sale.sourceRow });
        continue;
      }
      const payload = {
        external_id: sale.sourceKey, operation_date: sale.operationDate, client_name: sale.clientName, brand: sale.brand,
        model: sale.model, plan_type: sale.planType, cuota_1_value: sale.cuota1Value, total_collected: sale.totalCollected,
        factory_account: sale.factoryAccount, used_car_flag: sale.usedCarFlag, used_car_details: sale.usedCarDetails,
        subscription_number: sale.subscriptionNumber, seller_id: sale.sellerId, team_id: sale.teamId, lead_source: sale.leadSource,
        source_updated_at: sourceUpdatedAt, source_sync_run_id: runId,
      };
      if (subscription && !external) updates.push({ id: subscription.id as string, payload });
      else upserts.push(payload);
    }
    if (upserts.length) {
      const { error } = await supabase.from('sales_operations').upsert(upserts, { onConflict: 'external_id' });
      if (error) throw new Error(`No se pudieron guardar ventas por ID Venta: ${error.message}`);
    }
    for (const update of updates) {
      const { error } = await supabase.from('sales_operations').update(update.payload).eq('id', update.id);
      if (error) throw new Error(`No se pudo vincular una venta existente por N° de Suscripción: ${error.message}`);
    }
    await recordErrors(supabase, runId, errors);
    await finishRun(supabase, runId, rows.length, errors.length);
    return Response.json({ success: true, runId, received: rows.length, synchronized: upserts.length + updates.length, errors: errors.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'La sincronización falló.';
    await recordErrors(supabase, runId, [{ error_code: 'sync_failed', error_message: message }]).catch(() => undefined);
    await finishRun(supabase, runId, 0, 1, true).catch(() => undefined);
    return Response.json({ error: message, runId }, { status: 500 });
  }
});
