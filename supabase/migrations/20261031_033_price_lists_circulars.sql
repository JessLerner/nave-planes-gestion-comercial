-- Price lists built from official circulars. Source values and commercial
-- overrides are separated so historical lists stay auditable.

do $$ begin
  create type public.price_list_status as enum ('draft', 'published_to_managers', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.price_list_confirmation_status as enum ('pending', 'confirmed', 'superseded');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists can_manage_price_lists boolean not null default false;

update public.profiles
   set can_manage_price_lists = true
 where role = 'admin'::public.app_role
   and can_manage_price_lists = false;

create or replace function public.can_manage_price_lists()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select profile.can_manage_price_lists
      from public.profiles profile
     where profile.id = auth.uid()
  ), false)
$$;

create table if not exists public.commercial_documents (
  id uuid primary key default gen_random_uuid(),
  original_filename text not null,
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  detected_brand text,
  confirmed_brand text,
  effective_date date,
  document_type text not null check (document_type in ('price_update', 'price_list', 'commercial_terms', 'guaranteed_award', 'other')),
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.price_list_versions (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  name text not null,
  effective_date date not null,
  version_number integer not null default 1 check (version_number > 0),
  status public.price_list_status not null default 'draft',
  source_currency text not null default 'ARS' check (source_currency in ('ARS', 'USD')),
  display_currency text not null default 'ARS' check (display_currency = 'ARS'),
  exchange_rate numeric(18,6) check (exchange_rate is null or exchange_rate > 0),
  exchange_rate_source text,
  exchange_rate_overridden boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_for_managers_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, effective_date, version_number),
  check (
    (source_currency = 'ARS' and exchange_rate is null)
    or (source_currency = 'USD' and exchange_rate is not null)
  )
);

create table if not exists public.price_list_sources (
  price_list_version_id uuid not null references public.price_list_versions(id) on delete cascade,
  commercial_document_id uuid not null references public.commercial_documents(id) on delete restrict,
  source_order smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (price_list_version_id, commercial_document_id)
);

create table if not exists public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  price_list_version_id uuid not null references public.price_list_versions(id) on delete cascade,
  source_key text not null,
  model text not null,
  plan_type text not null,
  total_installments integer not null check (total_installments > 0),
  basic_value numeric(14,2) not null check (basic_value >= 0),
  pure_installment numeric(14,2) not null check (pure_installment >= 0),
  cuota_1_value numeric(14,2) not null check (cuota_1_value >= 0),
  base_surcharge numeric(14,2) not null check (base_surcharge > 0),
  delivery_terms text,
  source_details jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (price_list_version_id, source_key)
);

create table if not exists public.price_list_installment_segments (
  id uuid primary key default gen_random_uuid(),
  price_list_item_id uuid not null references public.price_list_items(id) on delete cascade,
  installment_from integer not null check (installment_from > 0),
  installment_to integer not null check (installment_to >= installment_from),
  quota_value numeric(14,2) not null check (quota_value >= 0),
  stamp_value numeric(14,2) not null default 0 check (stamp_value >= 0),
  total_value numeric(14,2) generated always as (quota_value + stamp_value) stored,
  source_label text,
  source_details jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (price_list_item_id, installment_from, installment_to)
);

create table if not exists public.price_list_structure_confirmations (
  id uuid primary key default gen_random_uuid(),
  price_list_version_id uuid not null references public.price_list_versions(id) on delete cascade,
  manager_staff_id uuid not null references public.staff_members(id) on delete restrict,
  status public.price_list_confirmation_status not null default 'pending',
  carried_from_confirmation_id uuid references public.price_list_structure_confirmations(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  unique (price_list_version_id, manager_staff_id),
  check (
    (status = 'pending' and confirmed_at is null)
    or (status in ('confirmed', 'superseded') and confirmed_at is not null)
  )
);

create table if not exists public.price_list_item_surcharges (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.price_list_structure_confirmations(id) on delete cascade,
  price_list_item_id uuid not null references public.price_list_items(id) on delete cascade,
  surcharge_amount numeric(14,2) not null check (surcharge_amount > 0),
  carried_from_previous boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict,
  unique (confirmation_id, price_list_item_id)
);

create index if not exists commercial_documents_brand_date_idx
  on public.commercial_documents(coalesce(confirmed_brand, detected_brand), effective_date desc);
create index if not exists price_list_versions_brand_date_idx
  on public.price_list_versions(brand, effective_date desc);
create index if not exists price_list_items_version_sort_idx
  on public.price_list_items(price_list_version_id, sort_order, model);
create index if not exists price_list_segments_item_range_idx
  on public.price_list_installment_segments(price_list_item_id, installment_from, installment_to);
create index if not exists price_list_confirmations_manager_idx
  on public.price_list_structure_confirmations(manager_staff_id, status);

create or replace function public.touch_price_list_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists price_list_versions_touch_updated_at on public.price_list_versions;
create trigger price_list_versions_touch_updated_at
before update on public.price_list_versions
for each row execute function public.touch_price_list_updated_at();

drop trigger if exists price_list_items_touch_updated_at on public.price_list_items;
create trigger price_list_items_touch_updated_at
before update on public.price_list_items
for each row execute function public.touch_price_list_updated_at();

create or replace function public.validate_price_list_surcharge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  required_minimum numeric(14,2);
begin
  select item.base_surcharge
    into required_minimum
    from public.price_list_items item
   where item.id = new.price_list_item_id;

  if required_minimum is null or new.surcharge_amount < required_minimum then
    raise exception 'La sobrepauta no puede ser inferior a la base publicada.';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists price_list_item_surcharges_validate on public.price_list_item_surcharges;
create trigger price_list_item_surcharges_validate
before insert or update of price_list_item_id, surcharge_amount on public.price_list_item_surcharges
for each row execute function public.validate_price_list_surcharge();

create or replace function public.can_view_price_list_version(target_version uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_price_lists()
      or exists (
        select 1
          from public.price_list_structure_confirmations confirmation
          join public.profiles profile on profile.id = auth.uid()
         where confirmation.price_list_version_id = target_version
           and (
             confirmation.manager_staff_id = profile.staff_member_id
             or (
               confirmation.status = 'confirmed'
               and exists (
                 select 1
                   from public.teams team
                  where team.manager_staff_id = confirmation.manager_staff_id
                    and team.supervisor_staff_id = profile.staff_member_id
                    and team.active
                    and team.is_sales_team
               )
             )
           )
      )
$$;

create or replace function public.can_edit_price_list_surcharge(target_confirmation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.price_list_structure_confirmations confirmation
      join public.price_list_versions version on version.id = confirmation.price_list_version_id
      join public.profiles profile on profile.id = auth.uid()
     where confirmation.id = target_confirmation
       and confirmation.manager_staff_id = profile.staff_member_id
       and profile.role = 'gerente'::public.app_role
       and confirmation.status = 'pending'
       and version.status = 'published_to_managers'::public.price_list_status
  )
$$;

create or replace function public.publish_price_list_to_managers(target_version uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_price_lists() then
    raise exception 'No autorizado para publicar listas de precios.';
  end if;

  if not exists (
    select 1
      from public.price_list_versions version
     where version.id = target_version
       and version.status = 'draft'::public.price_list_status
  ) then
    raise exception 'La lista debe existir y estar en borrador.';
  end if;

  if not exists (
    select 1 from public.price_list_items item where item.price_list_version_id = target_version
  ) then
    raise exception 'La lista no contiene modelos.';
  end if;

  update public.price_list_versions
     set status = 'published_to_managers',
         published_for_managers_at = now()
   where id = target_version;

  insert into public.price_list_structure_confirmations (price_list_version_id, manager_staff_id)
  select target_version, team.manager_staff_id
    from public.teams team
   where team.active
     and team.is_sales_team
     and team.manager_staff_id is not null
  group by team.manager_staff_id
  on conflict (price_list_version_id, manager_staff_id) do nothing;

  insert into public.price_list_item_surcharges (
    confirmation_id,
    price_list_item_id,
    surcharge_amount,
    carried_from_previous,
    updated_by
  )
  select confirmation.id,
         item.id,
         greatest(item.base_surcharge, coalesce(previous.surcharge_amount, item.base_surcharge)),
         previous.surcharge_amount is not null,
         auth.uid()
    from public.price_list_structure_confirmations confirmation
    join public.price_list_items item on item.price_list_version_id = target_version
    left join lateral (
      select prior_surcharge.surcharge_amount
        from public.price_list_structure_confirmations prior_confirmation
        join public.price_list_versions prior_version on prior_version.id = prior_confirmation.price_list_version_id
        join public.price_list_items prior_item on prior_item.price_list_version_id = prior_version.id
        join public.price_list_item_surcharges prior_surcharge
          on prior_surcharge.confirmation_id = prior_confirmation.id
         and prior_surcharge.price_list_item_id = prior_item.id
       where prior_confirmation.manager_staff_id = confirmation.manager_staff_id
         and prior_confirmation.status = 'confirmed'::public.price_list_confirmation_status
         and prior_version.brand = (select brand from public.price_list_versions where id = target_version)
         and prior_version.effective_date < (select effective_date from public.price_list_versions where id = target_version)
         and lower(trim(prior_item.model)) = lower(trim(item.model))
         and lower(trim(prior_item.plan_type)) = lower(trim(item.plan_type))
       order by prior_version.effective_date desc, prior_confirmation.confirmed_at desc
       limit 1
    ) previous on true
   where confirmation.price_list_version_id = target_version
  on conflict (confirmation_id, price_list_item_id) do nothing;
end;
$$;

create or replace function public.confirm_price_list_for_my_structure(target_version uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_confirmation uuid;
  expected_items integer;
  configured_items integer;
begin
  select confirmation.id
    into target_confirmation
    from public.price_list_structure_confirmations confirmation
    join public.profiles profile on profile.id = auth.uid()
   where confirmation.price_list_version_id = target_version
     and confirmation.manager_staff_id = profile.staff_member_id
     and profile.role = 'gerente'::public.app_role
     and confirmation.status = 'pending'::public.price_list_confirmation_status;

  if target_confirmation is null then
    raise exception 'No hay una confirmación pendiente para tu estructura.';
  end if;

  select count(*) into expected_items
    from public.price_list_items item
   where item.price_list_version_id = target_version;

  select count(*) into configured_items
    from public.price_list_item_surcharges surcharge
   where surcharge.confirmation_id = target_confirmation
     and surcharge.surcharge_amount > 0;

  if expected_items = 0 or configured_items <> expected_items then
    raise exception 'Cada modelo debe tener una sobrepauta mayor que cero antes de confirmar.';
  end if;

  update public.price_list_structure_confirmations
     set status = 'confirmed',
         confirmed_at = now(),
         confirmed_by = auth.uid()
   where id = target_confirmation;
end;
$$;

alter table public.commercial_documents enable row level security;
alter table public.price_list_versions enable row level security;
alter table public.price_list_sources enable row level security;
alter table public.price_list_items enable row level security;
alter table public.price_list_installment_segments enable row level security;
alter table public.price_list_structure_confirmations enable row level security;
alter table public.price_list_item_surcharges enable row level security;

create policy "commercial_documents_read_price_managers" on public.commercial_documents
  for select to authenticated
  using (public.can_manage_price_lists() or public.current_app_role() = 'gerente'::public.app_role);
create policy "commercial_documents_manage_price_lists" on public.commercial_documents
  for all to authenticated
  using (public.can_manage_price_lists())
  with check (public.can_manage_price_lists());

create policy "price_list_versions_read_by_scope" on public.price_list_versions
  for select to authenticated using (public.can_view_price_list_version(id));
create policy "price_list_versions_manage" on public.price_list_versions
  for all to authenticated
  using (public.can_manage_price_lists())
  with check (public.can_manage_price_lists());

create policy "price_list_sources_read_by_scope" on public.price_list_sources
  for select to authenticated using (public.can_view_price_list_version(price_list_version_id));
create policy "price_list_sources_manage" on public.price_list_sources
  for all to authenticated
  using (public.can_manage_price_lists())
  with check (public.can_manage_price_lists());

create policy "price_list_items_read_by_scope" on public.price_list_items
  for select to authenticated using (public.can_view_price_list_version(price_list_version_id));
create policy "price_list_items_manage" on public.price_list_items
  for all to authenticated
  using (public.can_manage_price_lists())
  with check (public.can_manage_price_lists());

create policy "price_list_segments_read_by_scope" on public.price_list_installment_segments
  for select to authenticated
  using (exists (
    select 1 from public.price_list_items item
     where item.id = price_list_installment_segments.price_list_item_id
       and public.can_view_price_list_version(item.price_list_version_id)
  ));
create policy "price_list_segments_manage" on public.price_list_installment_segments
  for all to authenticated
  using (public.can_manage_price_lists())
  with check (public.can_manage_price_lists());

create policy "price_list_confirmations_read_by_scope" on public.price_list_structure_confirmations
  for select to authenticated
  using (public.can_manage_price_lists() or manager_staff_id = (select staff_member_id from public.profiles where id = auth.uid()));

create policy "price_list_surcharges_read_by_scope" on public.price_list_item_surcharges
  for select to authenticated
  using (exists (
    select 1 from public.price_list_structure_confirmations confirmation
     where confirmation.id = price_list_item_surcharges.confirmation_id
       and (public.can_manage_price_lists() or confirmation.manager_staff_id = (select staff_member_id from public.profiles where id = auth.uid()))
  ));
create policy "price_list_surcharges_update_by_manager" on public.price_list_item_surcharges
  for update to authenticated
  using (public.can_edit_price_list_surcharge(confirmation_id))
  with check (public.can_edit_price_list_surcharge(confirmation_id));

insert into storage.buckets (id, name, public)
values ('commercial-documents', 'commercial-documents', false)
on conflict (id) do nothing;

create policy "commercial_documents_storage_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'commercial-documents'
    and (public.can_manage_price_lists() or public.current_app_role() = 'gerente'::public.app_role)
  );
create policy "commercial_documents_storage_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'commercial-documents' and public.can_manage_price_lists());
create policy "commercial_documents_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'commercial-documents' and public.can_manage_price_lists());
