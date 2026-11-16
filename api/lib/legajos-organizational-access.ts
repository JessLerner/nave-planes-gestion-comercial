import {
  organizationalAccessContextSelf,
  parseOrganizationalAccessContext,
  type AuthenticatedRpc,
  type OrganizationalAccessContext,
  type OrganizationalOperation,
} from './organizational-access';

type FetchLike = typeof fetch;
type LegajosOperation = Extract<OrganizationalOperation, 'legajos.read' | 'legajos.manage'>;

export type LegajosOrganizationalAccess = {
  actor: { userId: string; role: string | null; capabilities: string[]; global: boolean } | null;
  authorized: boolean;
  scope: { staffIds: string[]; includesAllActiveStaff: boolean };
};

export function parseLegajosOrganizationalAccess(value: unknown, expectedUserId: string): LegajosOrganizationalAccess {
  return legajosAccessFromContext(parseOrganizationalAccessContext(value), expectedUserId);
}

function legajosAccessFromContext(context: OrganizationalAccessContext, expectedUserId: string): LegajosOrganizationalAccess {
  if (!context.actor || context.actor.userId !== expectedUserId) throw new Error('La identidad del contrato organizativo no coincide con la sesión verificada.');
  return {
    actor: {
      userId: expectedUserId,
      role: context.actor.role,
      capabilities: context.actor.capabilities,
      global: context.actor.global,
    },
    authorized: context.authorized,
    scope: {
      staffIds: context.scope.staffIds,
      includesAllActiveStaff: context.scope.includesAllActiveStaff,
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
  const rpc: AuthenticatedRpc = async (_functionName, params) => {
    const response = await fetcher(`${url}/rest/v1/rpc/organizational_access_context_self`, {
      method: 'POST',
      headers: { Authorization: authorization, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.ok
      ? { data: await response.json(), error: null }
      : { data: null, error: new Error('No se pudo resolver el contexto organizativo.') };
  };
  const context = await organizationalAccessContextSelf(rpc, { operation });
  return legajosAccessFromContext(context, expectedUserId);
}

export function canReadLegajosHistory(access: LegajosOrganizationalAccess) {
  const role = access.actor?.role;
  return role === 'admin' || role === 'rrhh' || (role === 'administrativo' && (access.actor?.capabilities ?? []).some(capability => capability === 'view_legajos' || capability === 'manage_legajos'));
}

export function canManageActiveLegajo(access: LegajosOrganizationalAccess, staffId: string) {
  return access.authorized && (access.scope.includesAllActiveStaff || access.scope.staffIds.includes(staffId));
}
