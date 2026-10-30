-- Editable equivalences for source values. Importers retain the source value
-- and record the approved canonical value; no client-side name heuristics.
create table public.resource_normalization_rules (
  id uuid primary key default gen_random_uuid(),
  field_name text not null check (field_name in ('person_reference', 'category')),
  source_value text not null,
  canonical_value text not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  unique (field_name, source_value)
);

insert into public.resource_normalization_rules (field_name, source_value, canonical_value, note)
values
  ('person_reference', 'GONZALEZ FABRIZIO IGNACIO', 'GONZALEZ FABRICIO IGNACIO', 'Variante ortográfica aprobada por Administración.'),
  ('category', 'ADMINISTRACION', 'Administración', 'Categoría normalizada.'),
  ('category', 'ADMINISTRACION PDA', 'Administración', 'Categoría normalizada.'),
  ('category', 'ADMISNTRACION PDA', 'Administración', 'Error de escritura normalizado.')
on conflict (field_name, source_value) do update
  set canonical_value = excluded.canonical_value,
      note = excluded.note,
      active = true;

alter table public.resource_normalization_rules enable row level security;
