-- Cuota 1 and official circulars are restricted to General Administration.
-- Commercial subscriptions are independent manual values, copied per management approval.

create table public.price_list_factory_values (
  price_list_item_id uuid primary key references public.price_list_items(id) on delete cascade,
  cuota_1_value numeric(14,2) not null check (cuota_1_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.price_list_factory_values (price_list_item_id, cuota_1_value)
select id, cuota_1_value from public.price_list_items
on conflict (price_list_item_id) do update set cuota_1_value = excluded.cuota_1_value;

alter table public.price_list_items
  add column if not exists subscription_normal_1 numeric(14,2) check (subscription_normal_1 >= 0),
  add column if not exists subscription_normal_3 numeric(14,2) check (subscription_normal_3 >= 0),
  add column if not exists subscription_ultra numeric(14,2) check (subscription_ultra >= 0),
  drop column if exists cuota_1_value;

create table public.price_list_item_subscriptions (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.price_list_structure_confirmations(id) on delete cascade,
  price_list_item_id uuid not null references public.price_list_items(id) on delete cascade,
  normal_1 numeric(14,2) not null check (normal_1 >= 0),
  normal_3 numeric(14,2) not null check (normal_3 >= 0),
  ultra numeric(14,2) not null check (ultra >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict,
  unique (confirmation_id, price_list_item_id)
);

alter table public.price_list_factory_values enable row level security;
alter table public.price_list_item_subscriptions enable row level security;

create policy "factory_values_manage_only" on public.price_list_factory_values
  for all to authenticated using (public.can_manage_price_lists()) with check (public.can_manage_price_lists());
create policy "subscriptions_manage_only" on public.price_list_item_subscriptions
  for all to authenticated using (public.can_manage_price_lists()) with check (public.can_manage_price_lists());

-- Browser clients use the scoped API. This also prevents direct table queries from
-- bypassing per-structure approval or exposing factory values.
revoke all on public.price_list_factory_values, public.price_list_item_subscriptions,
  public.price_list_items, public.price_list_installment_segments, public.price_list_sources,
  public.price_list_versions, public.price_list_structure_confirmations,
  public.price_list_item_surcharges, public.commercial_documents from anon, authenticated;

drop policy if exists "commercial_documents_read_price_managers" on public.commercial_documents;
drop policy if exists "price_list_versions_read_by_scope" on public.price_list_versions;
drop policy if exists "price_list_sources_read_by_scope" on public.price_list_sources;
drop policy if exists "price_list_items_read_by_scope" on public.price_list_items;
drop policy if exists "price_list_segments_read_by_scope" on public.price_list_installment_segments;
drop policy if exists "price_list_confirmations_read_by_scope" on public.price_list_structure_confirmations;
drop policy if exists "price_list_surcharges_read_by_scope" on public.price_list_item_surcharges;
drop policy if exists "price_list_surcharges_update_by_manager" on public.price_list_item_surcharges;
drop policy if exists "commercial_documents_storage_read" on storage.objects;
create policy "commercial_documents_storage_manage_only" on storage.objects
  for select to authenticated
  using (bucket_id = 'commercial-documents' and public.can_manage_price_lists());

create or replace function public.publish_price_list_to_managers(target_version uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_price_lists() then raise exception 'No autorizado para publicar listas de precios.'; end if;
  if not exists (select 1 from public.price_list_versions where id=target_version and status='draft') then raise exception 'La lista debe existir y estar en borrador.'; end if;
  if exists (select 1 from public.price_list_items i where i.price_list_version_id=target_version and (i.subscription_normal_1 is null or i.subscription_normal_3 is null or i.subscription_ultra is null)) then raise exception 'Completá las tres suscripciones comerciales de cada plan antes de publicar.'; end if;
  if exists (select 1 from public.price_list_items i where i.price_list_version_id=target_version and not exists (select 1 from public.price_list_installment_segments s where s.price_list_item_id=i.id)) then raise exception 'Cada plan debe tener al menos un tramo de cuotas.'; end if;
  update public.price_list_versions set status='published_to_managers', published_for_managers_at=now() where id=target_version;
  insert into public.price_list_structure_confirmations(price_list_version_id,manager_staff_id)
  select target_version, team.manager_staff_id from public.teams team where team.active and team.is_sales_team and team.manager_staff_id is not null group by team.manager_staff_id on conflict do nothing;
  insert into public.price_list_item_subscriptions(confirmation_id,price_list_item_id,normal_1,normal_3,ultra,updated_by)
  select c.id,i.id,i.subscription_normal_1,i.subscription_normal_3,i.subscription_ultra,auth.uid()
  from public.price_list_structure_confirmations c join public.price_list_items i on i.price_list_version_id=c.price_list_version_id
  where c.price_list_version_id=target_version on conflict (confirmation_id,price_list_item_id) do nothing;
end; $$;

create or replace function public.confirm_price_list_for_my_structure(target_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target_confirmation uuid; expected_items integer; configured_items integer;
begin
  select c.id into target_confirmation from public.price_list_structure_confirmations c join public.profiles p on p.id=auth.uid() where c.price_list_version_id=target_version and c.manager_staff_id=p.staff_member_id and p.role='gerente' and c.status='pending';
  if target_confirmation is null then raise exception 'No hay una confirmación pendiente para tu estructura.'; end if;
  select count(*) into expected_items from public.price_list_items where price_list_version_id=target_version;
  select count(*) into configured_items from public.price_list_item_subscriptions where confirmation_id=target_confirmation;
  if expected_items=0 or configured_items<>expected_items then raise exception 'Cada plan debe tener sus tres suscripciones comerciales antes de confirmar.'; end if;
  update public.price_list_structure_confirmations set status='confirmed',confirmed_at=now(),confirmed_by=auth.uid() where id=target_confirmation;
end; $$;
