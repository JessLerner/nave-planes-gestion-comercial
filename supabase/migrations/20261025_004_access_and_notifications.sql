-- Nave Planes: authorization, advance approvals and in-app notifications.
-- This migration inserts no users and no operational data.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('wage_advance_pending', 'wage_advance_resolved', 'system')),
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.wage_advances
  add column if not exists requested_by uuid references public.profiles(id) on delete set null;

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_id, read_at, created_at desc);

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_team_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select team_id from public.profiles where id = auth.uid()
$$;

create or replace function public.notify_gerencia_about_wage_advance()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  seller_name text;
begin
  select full_name into seller_name from public.sellers where id = new.seller_id;

  insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id)
  select id,
         'wage_advance_pending',
         'Adelanto pendiente de autorización',
         coalesce(seller_name, 'Un vendedor') || ' solicitó un adelanto de $' || to_char(new.amount, 'FM999G999G999G990D00'),
         'wage_advance', new.id
    from public.profiles
   where role = 'gerente';

  return new;
end;
$$;

create or replace function public.notify_requester_about_advance_decision()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  seller_name text;
  decision text;
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') and new.requested_by is not null then
    select full_name into seller_name from public.sellers where id = new.seller_id;
    decision := case when new.status = 'approved' then 'aprobado' else 'rechazado' end;

    insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id)
    values (
      new.requested_by,
      'wage_advance_resolved',
      'Adelanto ' || decision,
      'La solicitud de ' || coalesce(seller_name, 'vendedor') || ' fue ' || decision || ' por Gerencia.',
      'wage_advance', new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists wage_advances_notify_gerencia on public.wage_advances;
create trigger wage_advances_notify_gerencia
after insert on public.wage_advances
for each row execute function public.notify_gerencia_about_wage_advance();

drop trigger if exists wage_advances_notify_requester on public.wage_advances;
create trigger wage_advances_notify_requester
after update of status on public.wage_advances
for each row execute function public.notify_requester_about_advance_decision();

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "notifications_mark_own_read" on public.notifications;
create policy "notifications_mark_own_read" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Everyone can consult price lists; only the platform administrator publishes them.
drop policy if exists "price_lists_read_authenticated" on public.price_lists;
create policy "price_lists_read_authenticated" on public.price_lists
  for select to authenticated using (true);

drop policy if exists "price_lists_admin_write" on public.price_lists;
create policy "price_lists_admin_write" on public.price_lists
  for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- Supervisors work only with their own team. Gerencia has the global approval role.
drop policy if exists "wage_advances_read_by_scope" on public.wage_advances;
create policy "wage_advances_read_by_scope" on public.wage_advances
  for select to authenticated
  using (
    public.current_app_role() in ('admin', 'gerente', 'rrhh')
    or exists (
      select 1 from public.sellers s
       where s.id = wage_advances.seller_id
         and s.team_id = public.current_team_id()
    )
  );

drop policy if exists "wage_advances_supervisor_request" on public.wage_advances;
create policy "wage_advances_supervisor_request" on public.wage_advances
  for insert to authenticated
  with check (
    public.current_app_role() = 'supervisor'
    and requested_by = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.sellers s
       where s.id = wage_advances.seller_id
         and s.team_id = public.current_team_id()
    )
  );

drop policy if exists "wage_advances_gerente_review" on public.wage_advances;
create policy "wage_advances_gerente_review" on public.wage_advances
  for update to authenticated
  using (public.current_app_role() = 'gerente')
  with check (public.current_app_role() = 'gerente');
