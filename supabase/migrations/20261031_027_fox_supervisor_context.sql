-- Fox emits the historical supervisor inside `Sucursal` in the form
-- `APELLIDO o NOMBRE COMPLETO - Sucursal`.  Preserve that context separately
-- from the physical branch so it can be used to safely reconcile names.

alter table public.fox_lead_daily_snapshots
  add column if not exists fox_supervisor_name text,
  add column if not exists fox_supervisor_key text;

alter table public.fox_leads
  add column if not exists fox_supervisor_name text,
  add column if not exists fox_supervisor_key text;

alter table public.fox_user_mappings
  add column if not exists staff_member_id uuid references public.staff_members(id) on delete set null,
  add column if not exists fox_supervisor_name text,
  add column if not exists fox_supervisor_key text;

-- Backfill the direct resource identity for mappings that were approved before
-- this column existed. The historical "Recursos con baja" bucket remains null
-- and can therefore contain several retired Fox identities.
update public.fox_user_mappings mapping
set staff_member_id = seller.staff_member_id
from public.sellers seller
where seller.id = mapping.seller_id
  and mapping.staff_member_id is null
  and seller.staff_member_id is not null;

-- One current Nave.Plan resource can be linked to only one Fox identity.
-- The partial index deliberately excludes the historical inactive bucket.
create unique index if not exists fox_user_mappings_staff_member_unique
  on public.fox_user_mappings(staff_member_id)
  where staff_member_id is not null;

create index if not exists fox_lead_daily_snapshots_fox_supervisor_key_idx
  on public.fox_lead_daily_snapshots(fox_supervisor_key, snapshot_date desc)
  where fox_supervisor_key is not null;
