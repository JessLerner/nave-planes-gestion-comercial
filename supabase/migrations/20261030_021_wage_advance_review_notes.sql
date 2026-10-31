-- Preserve the rationale for a rejection/approval instead of keeping it only
-- in browser state.
alter table public.wage_advances
  add column if not exists review_notes text;
