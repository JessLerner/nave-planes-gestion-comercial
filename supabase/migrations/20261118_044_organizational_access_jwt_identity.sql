-- Correct the identity lookup in the already-applied 042 contract without
-- requesting access to Supabase's managed auth schema.  Hosted Supabase does
-- not let postgres delegate USAGE on auth; Data API already establishes the
-- verified JWT request settings for every RPC invocation.
--
-- CREATE OR REPLACE preserves the function owner and ACL.  Reconstructing the
-- current definition limits this corrective migration to the one initializer;
-- it deliberately does not re-create policies, change table grants, or alter
-- the organizational scope introduced by 042.

do $migration$
declare
  v_definition text;
  v_old_identity constant text := 'v_user_id uuid := auth.uid();';
  v_new_identity constant text := $jwt$
v_user_id uuid := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;$jwt$;
begin
  select pg_get_functiondef('public.organizational_access_context_self(text, date)'::regprocedure)
    into v_definition;

  if v_definition is null
    or position(v_old_identity in v_definition) = 0
    or position('auth.uid()' in replace(v_definition, v_old_identity, '')) <> 0 then
    raise exception '044 requires the unmodified 042 organizational access function.';
  end if;

  execute replace(v_definition, v_old_identity, v_new_identity);

  if position('auth.uid()' in pg_get_functiondef('public.organizational_access_context_self(text, date)'::regprocedure)) <> 0 then
    raise exception '044 did not remove the auth schema dependency.';
  end if;
end
$migration$;
