-- The Cloudflare Free plan limits every Worker request to 10 ms CPU.  Fox
-- imports are an administrative database transaction, so run them inside
-- Postgres instead of through the Worker. The authenticated caller must be an
-- application administrator; customer PII is not part of this payload.

create or replace function public.import_fox_leads(
  p_snapshot_date date,
  p_period_start date,
  p_period_end date,
  p_source_file_name text,
  p_source_file_sha256 text,
  p_leads jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_stored integer := 0;
  v_unmapped integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Sólo Administración puede importar reportes de Fox.' using errcode = '42501';
  end if;

  if p_snapshot_date is null or p_period_start is null or p_period_end is null
    or p_period_start > p_period_end or p_snapshot_date < p_period_start or p_snapshot_date > p_period_end
    or coalesce(length(trim(p_source_file_name)), 0) = 0
    or p_source_file_sha256 !~ '^[a-fA-F0-9]{64}$'
    or jsonb_typeof(p_leads) <> 'array' or jsonb_array_length(p_leads) = 0 or jsonb_array_length(p_leads) > 1000 then
    raise exception 'El reporte no tiene un formato o tamaño válido.' using errcode = '22023';
  end if;

  insert into public.fox_import_runs (
    snapshot_date, period_start, period_end, source_file_name, source_file_sha256, received_rows, imported_by
  ) values (
    p_snapshot_date, p_period_start, p_period_end, p_source_file_name, p_source_file_sha256,
    jsonb_array_length(p_leads), auth.uid()
  ) returning id into v_run_id;

  with rows as (
    select * from jsonb_to_recordset(p_leads) as r(
      lead_id text, entry_date text, managed_at text, closed_at text,
      fox_user_name text, fox_user_key text, fox_supervisor_name text, fox_supervisor_key text,
      lead_status text, lead_source text, channel text, branch text, brand text, close_reason text, sold boolean
    )
  ), resolved as (
    select rows.*, mapping.seller_id, seller.team_id
    from rows
    left join public.fox_user_mappings mapping on mapping.fox_user_key = rows.fox_user_key
    left join public.sellers seller on seller.id = mapping.seller_id
  )
  insert into public.fox_lead_daily_snapshots (
    snapshot_date, fox_lead_id, entry_date, managed_at, closed_at, fox_user_name, fox_user_key,
    fox_supervisor_name, fox_supervisor_key, seller_id, team_id, lead_status, lead_source, channel,
    branch, brand, close_reason, sold, import_run_id
  )
  select
    p_snapshot_date, lead_id, nullif(entry_date, '')::date, nullif(managed_at, '')::timestamptz,
    nullif(closed_at, '')::timestamptz, fox_user_name, fox_user_key, fox_supervisor_name,
    fox_supervisor_key, seller_id, team_id, lead_status, lead_source, channel, branch, brand,
    close_reason, sold, v_run_id
  from resolved
  where lead_id ~ '^[#A-Za-z0-9_-]+$'
  on conflict (snapshot_date, fox_lead_id) do update set
    entry_date = excluded.entry_date, managed_at = excluded.managed_at, closed_at = excluded.closed_at,
    fox_user_name = excluded.fox_user_name, fox_user_key = excluded.fox_user_key,
    fox_supervisor_name = excluded.fox_supervisor_name, fox_supervisor_key = excluded.fox_supervisor_key,
    seller_id = excluded.seller_id, team_id = excluded.team_id, lead_status = excluded.lead_status,
    lead_source = excluded.lead_source, channel = excluded.channel, branch = excluded.branch,
    brand = excluded.brand, close_reason = excluded.close_reason, sold = excluded.sold,
    import_run_id = excluded.import_run_id, imported_at = now();
  get diagnostics v_stored = row_count;

  insert into public.fox_leads as current_leads (
    fox_lead_id, first_seen_date, last_snapshot_date, entry_date, managed_at, closed_at, fox_user_name,
    fox_user_key, fox_supervisor_name, fox_supervisor_key, seller_id, team_id, lead_status,
    lead_source, channel, branch, brand, close_reason, sold, last_import_run_id
  )
  select
    fox_lead_id, p_snapshot_date, p_snapshot_date, entry_date, managed_at, closed_at, fox_user_name,
    fox_user_key, fox_supervisor_name, fox_supervisor_key, seller_id, team_id, lead_status,
    lead_source, channel, branch, brand, close_reason, sold, v_run_id
  from public.fox_lead_daily_snapshots
  where snapshot_date = p_snapshot_date and import_run_id = v_run_id
  on conflict (fox_lead_id) do update set
    last_snapshot_date = excluded.last_snapshot_date, entry_date = excluded.entry_date,
    managed_at = excluded.managed_at, closed_at = excluded.closed_at,
    fox_user_name = excluded.fox_user_name, fox_user_key = excluded.fox_user_key,
    fox_supervisor_name = excluded.fox_supervisor_name, fox_supervisor_key = excluded.fox_supervisor_key,
    seller_id = excluded.seller_id, team_id = excluded.team_id, lead_status = excluded.lead_status,
    lead_source = excluded.lead_source, channel = excluded.channel, branch = excluded.branch,
    brand = excluded.brand, close_reason = excluded.close_reason, sold = excluded.sold,
    last_import_run_id = excluded.last_import_run_id, updated_at = now()
  where excluded.last_snapshot_date >= current_leads.last_snapshot_date;

  select count(*) into v_unmapped
  from public.fox_lead_daily_snapshots
  where snapshot_date = p_snapshot_date and import_run_id = v_run_id and seller_id is null;

  update public.fox_import_runs
  set stored_rows = v_stored,
      unmapped_rows = v_unmapped,
      summary = jsonb_build_object('stored', v_stored, 'unmappedRows', v_unmapped, 'via', 'supabase_rpc')
  where id = v_run_id;

  return jsonb_build_object('success', true, 'runId', v_run_id, 'stored', v_stored, 'unmappedRows', v_unmapped);
end;
$$;

revoke all on function public.import_fox_leads(date, date, date, text, text, jsonb) from public;
grant execute on function public.import_fox_leads(date, date, date, text, text, jsonb) to authenticated;
