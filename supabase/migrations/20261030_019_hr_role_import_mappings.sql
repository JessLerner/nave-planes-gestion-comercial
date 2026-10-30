-- Source labels are data configuration, not conditions embedded in the importer.
-- They can be extended from the HR configuration when a source changes wording.
create table public.hr_role_source_labels (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.hr_roles(id) on delete cascade,
  source_label text not null,
  unique (role_id, source_label)
);

alter table public.hr_role_source_labels enable row level security;

alter table public.hr_roles
  add column if not exists app_role_mapping public.app_role unique;

insert into public.hr_roles (area_id,name,active,sort_order,app_role_mapping)
select area.id, 'Administrador General', true, 5, 'admin'
from public.hr_areas area
where area.name='Gerencia / Dirección'
on conflict (area_id,name) do update set app_role_mapping=excluded.app_role_mapping;

update public.hr_roles set app_role_mapping='gerente' where lower(name)='gerente';
update public.hr_roles set app_role_mapping='supervisor' where lower(name)='supervisor';
update public.hr_roles set app_role_mapping='rrhh' where lower(name)='rrhh';

insert into public.hr_role_source_labels(role_id,source_label)
select role.id, labels.source_label
from public.hr_roles role
join (values
  ('Vendedor', 'VENDEDOR PDA'),
  ('Supervisor', 'SUPERVISOR PDA'),
  ('Administración', 'ADMINISTRACION PDA'),
  ('Administración', 'ADMISNTRACION PDA'),
  ('Administración', 'GESTION COMERCIALIZADORAS'),
  ('Administración', 'RESPONSABLE GESTION COMERCIALIZADORAS'),
  ('Administración', 'CAPACITACION PDA'),
  ('Administración', 'MAESTRANZA PDA'),
  ('Gerente', 'GERENTE PDA'),
  ('Director', 'DIRECCION PDA')
) as labels(role_name,source_label) on labels.role_name=role.name
on conflict (role_id,source_label) do nothing;
