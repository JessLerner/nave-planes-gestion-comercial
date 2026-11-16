-- The roster rebuild mutates Legajos and all derived commercial projections.
-- It is intentionally callable only through its SECURITY DEFINER trigger or a
-- privileged server-side database connection; it must never be a PostgREST RPC.
--
-- Apply only after confirming the target is the intended environment, capturing
-- the current ACL, and confirming no external consumer calls this function as
-- anon, authenticated, or service_role. This migration does not change the
-- function body, owner, RLS, data, projections, or schema privileges.
--
-- Residual risk: SECURITY DEFINER and search_path=public remain unchanged.
-- Hardening the function body/search_path is a separate reviewed intervention.

revoke execute on function public.rebuild_roster_projections_from_legajos()
from public, anon, authenticated, service_role;
