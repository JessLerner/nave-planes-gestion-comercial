type FetchLike = typeof fetch;
type LegajosOperation = 'legajos.read' | 'legajos.manage';

export type LegajosOrganizationalAccess = {
  actor: { userId: string; role: string | null; capabilities: string[]; global: boolean } | null;
  authorized: boolean;
  scope: { staffIds: string[]; includesAllActiveStaff: boolean };
};

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const strings = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

export function parseLegajosOrganizationalAccess(value: unknown, expectedUserId: string): LegajosOrganizationalAccess {
  const root = object(value);
  const scope = object(root?.scope);
  const actor = root?.actor === null ? null : object(root?.actor);
  if (!root || !scope || typeof root.authorized !== 'boolean' || (root.actor !== null && !actor)) {
    throw new Error('El contrato organizativo devolvió una respuesta inválida.');
  }
  if (!actor || actor.user_id !== expectedUserId) throw new Error('La identidad del contrato organizativo no coincide con la sesión verificada.');
  return {
    actor: {
      userId: expectedUserId,
      role: typeof actor.role === 'string' ? actor.role : null,
      capabilities: strings(actor.capabilities),
      global: actor.global === true,
    },
    authorized: root.authorized,
    scope: {
      staffIds: strings(scope.staff_ids),
      includesAllActiveStaff: scope.includes_all_active_staff === true,
    },
  };
}

export async function legajosOrganizationalAccess(
  authorization: string,
  expectedUserId: string,
  operation: LegajosOperation,
  fetcher: FetchLike = fetch,
): Promise<LegajosOrganizationalAccess> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!authorization.startsWith('Bearer ') || !url || !key) throw new Error('El contexto organizativo no está configurado.');
  const response = await fetcher(`${url}/rest/v1/rpc/organizational_access_context_self`, {
    method: 'POST',
    headers: { Authorization: authorization, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_operation: operation, p_as_of: null }),
  });
  if (!response.ok) throw new Error('No se pudo resolver el contexto organizativo.');
  return parseLegajosOrganizationalAccess(await response.json(), expectedUserId);
}

export function canReadLegajosHistory(access: LegajosOrganizationalAccess) {
  const role = access.actor?.role;
  return role === 'admin' || role === 'rrhh' || (role === 'administrativo' && (access.actor?.capabilities ?? []).some(capability => capability === 'view_legajos' || capability === 'manage_legajos'));
}

export function canManageActiveLegajo(access: LegajosOrganizationalAccess, staffId: string) {
  return access.authorized && (access.scope.includesAllActiveStaff || access.scope.staffIds.includes(staffId));
}
