-- Nave Planes: recruitment, personnel-file metadata and private document storage.
-- This migration creates no users and inserts no candidates. It is intentionally
-- safe to apply before Supabase Auth is enabled: all access is denied by RLS
-- until a signed-in profile exists.

alter table public.profiles
  add column if not exists staff_member_id uuid references public.staff_members(id) on delete set null;

create unique index if not exists profiles_staff_member_id_unique_idx
  on public.profiles (staff_member_id) where staff_member_id is not null;

create type public.recruitment_stage as enum (
  'submitted',
  'reviewing_documents',
  'interview',
  'approved_for_hire',
  'hired',
  'rejected'
);

create type public.candidate_document_kind as enum (
  'dni_front',
  'dni_back',
  'criminal_record',
  'cv',
  'employment_application'
);

create table public.recruitment_candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  dni text,
  email text,
  phone text,
  target_team_id uuid not null references public.teams(id) on delete restrict,
  proposed_by uuid references public.profiles(id) on delete set null,
  stage public.recruitment_stage not null default 'submitted',
  notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.recruitment_candidates(id) on delete cascade,
  document_kind public.candidate_document_kind not null,
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  unique (candidate_id, document_kind)
);

create index recruitment_candidates_team_stage_idx
  on public.recruitment_candidates(target_team_id, stage, created_at desc);
create index candidate_documents_candidate_idx
  on public.candidate_documents(candidate_id);

-- One private bucket replaces manually shared Drive folders. Files are placed as:
-- candidates/<candidate-id>/<document-kind>.<extension>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rrhh-legajos',
  'rrhh-legajos',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_recruitment_team(target_team uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_app_role() = 'admin'
      or exists (
        select 1
          from public.profiles profile
          join public.teams team on team.manager_staff_id = profile.staff_member_id
         where profile.id = auth.uid()
           and team.id = target_team
      )
$$;

alter table public.recruitment_candidates enable row level security;
alter table public.candidate_documents enable row level security;

create policy "recruitment_read_by_scope" on public.recruitment_candidates
  for select to authenticated
  using (
    public.can_manage_recruitment_team(target_team_id)
    or proposed_by = auth.uid()
  );

create policy "recruitment_submit_by_team" on public.recruitment_candidates
  for insert to authenticated
  with check (
    proposed_by = auth.uid()
    and (
      public.can_manage_recruitment_team(target_team_id)
      or (
        public.current_app_role() = 'supervisor'
        and target_team_id = public.current_team_id()
      )
    )
  );

create policy "recruitment_manage_by_scope" on public.recruitment_candidates
  for update to authenticated
  using (public.can_manage_recruitment_team(target_team_id))
  with check (public.can_manage_recruitment_team(target_team_id));

create policy "candidate_documents_read_by_scope" on public.candidate_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.recruitment_candidates candidate
       where candidate.id = candidate_documents.candidate_id
         and (
           public.can_manage_recruitment_team(candidate.target_team_id)
           or candidate.proposed_by = auth.uid()
         )
    )
  );

create policy "candidate_documents_insert_by_scope" on public.candidate_documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.recruitment_candidates candidate
       where candidate.id = candidate_documents.candidate_id
         and (
           public.can_manage_recruitment_team(candidate.target_team_id)
           or (
             public.current_app_role() = 'supervisor'
             and candidate.proposed_by = auth.uid()
           )
         )
    )
  );

-- Storage upload/read policy follows the candidate record. No anonymous access
-- and no public URLs are ever granted for this bucket.
create policy "rrhh_legajos_read_by_candidate_scope" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rrhh-legajos'
    and exists (
      select 1 from public.recruitment_candidates candidate
       where candidate.id::text = (storage.foldername(name))[2]
         and (
           public.can_manage_recruitment_team(candidate.target_team_id)
           or candidate.proposed_by = auth.uid()
         )
    )
  );

create policy "rrhh_legajos_upload_by_candidate_scope" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rrhh-legajos'
    and (storage.foldername(name))[1] = 'candidates'
    and exists (
      select 1 from public.recruitment_candidates candidate
       where candidate.id::text = (storage.foldername(name))[2]
         and (
           public.can_manage_recruitment_team(candidate.target_team_id)
           or (
             public.current_app_role() = 'supervisor'
             and candidate.proposed_by = auth.uid()
           )
         )
    )
  );
