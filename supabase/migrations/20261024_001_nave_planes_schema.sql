-- Nave Planes: production schema. This migration deliberately inserts no data.
-- Run it in Supabase SQL Editor, then configure the Edge Function secrets.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'gerente', 'supervisor', 'rrhh');
create type public.scoring_status as enum ('pending', 'approved', 'rejected');
create type public.operation_status as enum ('pending_scoring', 'apto_fabrica', 'ingresado_fabrica', 'caido');
create type public.advance_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null,
  team_id uuid,
  branch text,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  supervisor_id uuid references public.profiles(id) on delete set null,
  branch text not null,
  target_override integer check (target_override is null or target_override >= 0),
  created_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_team_id_fkey foreign key (team_id) references public.teams(id) on delete set null;

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  team_id uuid not null references public.teams(id),
  active boolean not null default true,
  hire_date date not null,
  termination_date date,
  phone text,
  email text,
  dni text unique,
  individual_target integer check (individual_target is null or individual_target >= 0),
  created_at timestamptz not null default now(),
  check (termination_date is null or termination_date >= hire_date)
);

create table public.monthly_config (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  min_sales_for_advance integer not null default 2 check (min_sales_for_advance >= 0),
  max_advance_amount numeric(14,2) not null check (max_advance_amount >= 0),
  advance_deadline date not null,
  default_team_target_per_seller integer not null default 0 check (default_team_target_per_seller >= 0),
  created_at timestamptz not null default now(),
  unique (start_date, end_date),
  check (end_date >= start_date)
);

create table public.sales_operations (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  operation_date date not null,
  client_name text not null,
  client_dni text,
  client_phone text,
  subscription_number text unique,
  brand text not null,
  model text,
  plan_type text,
  cuota_1_value numeric(14,2),
  total_collected numeric(14,2),
  factory_account text,
  used_car_flag boolean not null default false,
  seller_id uuid references public.sellers(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  lead_source text,
  status public.operation_status not null default 'pending_scoring',
  scoring_status public.scoring_status not null default 'pending',
  scoring_notes text,
  audited_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'apto_fabrica' or scoring_status = 'approved')
);

create table public.scoring_records (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  operation_id uuid references public.sales_operations(id) on delete cascade,
  subscription_number text,
  status public.scoring_status not null,
  call_notes text,
  rejection_reasons jsonb not null default '[]'::jsonb,
  audited_at timestamptz,
  source_row jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.leads_distribution (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  entry_date date not null,
  seller_id uuid references public.sellers(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  assigned_leads integer not null default 0 check (assigned_leads >= 0),
  contacted_leads integer not null default 0 check (contacted_leads >= 0),
  closed_leads integer not null default 0 check (closed_leads >= 0),
  lost_leads integer not null default 0 check (lost_leads >= 0),
  lead_source text,
  loss_reasons jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  version text,
  plan_type text,
  cuota_1_value numeric(14,2),
  factory_quota_value numeric(14,2),
  car_value numeric(14,2),
  bonus_discount numeric(14,2) not null default 0,
  effective_date date not null,
  source_url text,
  created_at timestamptz not null default now()
);

create table public.wage_advances (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id),
  monthly_config_id uuid not null references public.monthly_config(id),
  request_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  status public.advance_status not null default 'pending',
  seller_sales_count_at_date integer not null,
  reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.cartera_mora (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null,
  subscription_number text not null,
  client_name text,
  seller_id uuid references public.sellers(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  brand text,
  model text,
  grouping_status text,
  overdue_installments integer not null default 0 check (overdue_installments >= 0),
  total_debt numeric(14,2) not null default 0,
  plan_status text,
  last_payment_date date,
  imported_at timestamptz not null default now()
);

create index sales_operations_team_date_idx on public.sales_operations(team_id, operation_date desc);
create index sales_operations_seller_date_idx on public.sales_operations(seller_id, operation_date desc);
create index scoring_records_subscription_idx on public.scoring_records(subscription_number);
create index leads_distribution_team_date_idx on public.leads_distribution(team_id, entry_date desc);
create index cartera_mora_subscription_idx on public.cartera_mora(subscription_number);

-- Scoring can only promote an operation once it is approved.
create or replace function public.apply_scoring_to_operation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.operation_id is not null then
    update public.sales_operations
      set scoring_status = new.status,
          scoring_notes = new.call_notes,
          audited_at = new.audited_at,
          status = case when new.status = 'approved' then 'apto_fabrica' else 'pending_scoring' end
      where id = new.operation_id;
  end if;
  return new;
end;
$$;
create trigger scoring_records_apply_to_operation
after insert or update of status, call_notes, audited_at on public.scoring_records
for each row execute function public.apply_scoring_to_operation();

-- Keep personal and commercial data private by default. The ingestion Edge
-- Function uses the service-role key and bypasses RLS; signed-in staff access
-- is granted only through explicit policies added with the application auth UI.
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.sellers enable row level security;
alter table public.monthly_config enable row level security;
alter table public.sales_operations enable row level security;
alter table public.scoring_records enable row level security;
alter table public.leads_distribution enable row level security;
alter table public.price_lists enable row level security;
alter table public.wage_advances enable row level security;
alter table public.cartera_mora enable row level security;
