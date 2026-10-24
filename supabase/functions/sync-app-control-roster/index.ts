// Supabase Edge Function: keeps the real sales roster in sync with
// App Control Operaciones without altering its Google Sheet.
//
// Required secrets:
//   APP_CONTROL_OPERACIONES_URL  Google Apps Script /exec URL (read-only GET)
//   INGEST_SHARED_SECRET         shared secret sent by the scheduler/extractor
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RemoteSeller = { name?: unknown; active?: unknown };
type RemoteTeam = { supervisor?: unknown; vendedores?: unknown };

const normalize = (value: unknown) => String(value ?? '').trim();
const key = (value: unknown) => normalize(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const expectedSecret = Deno.env.get('INGEST_SHARED_SECRET');
  if (!expectedSecret || request.headers.get('x-ingest-secret') !== expectedSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sourceUrl = Deno.env.get('APP_CONTROL_OPERACIONES_URL');
  if (!sourceUrl) {
    return Response.json({ error: 'APP_CONTROL_OPERACIONES_URL is not configured' }, { status: 503 });
  }

  const sourceResponse = await fetch(sourceUrl, { headers: { Accept: 'application/json' } });
  if (!sourceResponse.ok) {
    return Response.json({ error: `App Control returned HTTP ${sourceResponse.status}` }, { status: 502 });
  }

  const payload = await sourceResponse.json();
  const teams: RemoteTeam[] = payload?.data?.equiposDeVenta;
  if (payload?.status !== 'success' || !Array.isArray(teams)) {
    return Response.json({ error: 'Unexpected App Control response' }, { status: 502 });
  }

  // A legacy Apps Script response contains only string names and cannot tell
  // whether a seller is inactive. Refuse that response rather than silently
  // reactivating former staff in the master database.
  if (teams.some((team) => Array.isArray(team.vendedores) && team.vendedores.some((seller) => typeof seller === 'string'))) {
    return Response.json({
      error: 'El endpoint de App Control debe enviar vendedores con { name, active }. Ver docs/APP_CONTROL_ROSTER_ADAPTER.md.',
    }, { status: 422 });
  }

  const filtered = teams
    .map((team) => ({
      supervisor: normalize(team.supervisor),
      sellers: (Array.isArray(team.vendedores) ? team.vendedores as RemoteSeller[] : [])
        .filter((seller) => seller?.active === true)
        .map((seller) => normalize(seller.name))
        .filter((seller) => seller && key(seller) !== 'convencional'),
    }))
    .filter((team) => team.supervisor && team.sellers.length > 0);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error: teamError } = await supabase
    .from('teams')
    .upsert(filtered.map((team) => ({ name: team.supervisor })), { onConflict: 'name' });
  if (teamError) return Response.json({ error: teamError.message }, { status: 500 });

  const { data: storedTeams, error: storedTeamsError } = await supabase
    .from('teams')
    .select('id,name')
    .in('name', filtered.map((team) => team.supervisor));
  if (storedTeamsError) return Response.json({ error: storedTeamsError.message }, { status: 500 });

  const idBySupervisor = new Map((storedTeams ?? []).map((team) => [team.name, team.id]));
  const sellers = filtered.flatMap((team) => team.sellers.map((full_name) => ({
    full_name,
    team_id: idBySupervisor.get(team.supervisor),
    active: true,
  }))).filter((seller) => seller.team_id);

  const { error: sellerError } = await supabase
    .from('sellers')
    .upsert(sellers, { onConflict: 'team_id,full_name' });
  if (sellerError) return Response.json({ error: sellerError.message }, { status: 500 });

  return Response.json({
    success: true,
    source: 'app_control_operaciones',
    supervisors: filtered.length,
    sellers: sellers.length,
    excluded_conventional: 0,
  });
});
