export const ORGANIZATIONAL_OPERATIONS = [
  'legajos.read',
  'legajos.manage',
  'account.invite',
  'departure.report',
  'departure.review',
  'advance.request',
  'advance.review',
  'pacing.read',
  'etl.manage',
] as const;

export type OrganizationalOperation = typeof ORGANIZATIONAL_OPERATIONS[number];
export type OrganizationalEligibilityReason =
  | 'inactive'
  | 'missing_role_mapping'
  | 'already_has_profile'
  | 'role_not_allowed_for_operation'
  | 'missing_team_projection'
  | 'missing_seller_projection'
  | 'not_sales_resource';

export type OrganizationalAccessRequest = {
  operation: OrganizationalOperation;
  asOf?: string;
};

export type OrganizationalAccessResource = {
  staffId: string;
  active: boolean;
  roleMapping: string | null;
  responsibleStaffId: string | null;
  effectiveManagerStaffId: string | null;
  teamId: string | null;
  sellerId: string | null;
  organizationalEligible: boolean;
  organizationalExclusionReasons: OrganizationalEligibilityReason[];
};

export type OrganizationalAccessContext = {
  actor: {
    userId: string;
    profileId: string | null;
    staffMemberId: string | null;
    role: string | null;
    capabilities: string[];
    global: boolean;
  } | null;
  authorized: boolean;
  effectiveAt: string;
  scope: {
    staffIds: string[];
    supervisorIds: string[];
    teamIds: string[];
    includesAllActiveStaff: boolean;
  };
  resources: OrganizationalAccessResource[];
  period: { id: string | null; startDate: string | null; endDate: string | null; status: 'unknown' | 'missing' };
  integrity: { hierarchyCycleDetected: boolean; inconsistentReferenceDetected: boolean };
};

export type AuthenticatedRpc = (functionName: 'organizational_access_context_self', params: {
  p_operation: OrganizationalOperation;
  p_as_of: string | null;
}) => Promise<{ data: unknown; error: unknown | null }>;

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const strings = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
const nullableString = (value: unknown) => typeof value === 'string' ? value : null;
const bool = (value: unknown) => value === true;

// This adapter is intentionally RPC-only.  A Hyperdrive/Worker variant would
// not have auth.uid() and must not be improvised without a separate identity
// contract.  No consumer imports this file in Fase 1.
export async function organizationalAccessContextSelf(
  rpc: AuthenticatedRpc,
  request: OrganizationalAccessRequest,
): Promise<OrganizationalAccessContext> {
  const { data, error } = await rpc('organizational_access_context_self', {
    p_operation: request.operation,
    p_as_of: request.asOf || null,
  });
  if (error) throw new Error('No se pudo resolver el contexto organizativo.');
  return parseOrganizationalAccessContext(data);
}

export function parseOrganizationalAccessContext(value: unknown): OrganizationalAccessContext {
  const root = object(value);
  if (!root || typeof root.authorized !== 'boolean' || typeof root.effective_at !== 'string') {
    throw new Error('El contrato organizativo devolvió una respuesta inválida.');
  }
  const actor = root.actor === null ? null : object(root.actor);
  const scope = object(root.scope);
  const period = object(root.period);
  const integrity = object(root.integrity);
  if (!scope || !period || !integrity || (root.actor !== null && !actor)) throw new Error('El contrato organizativo está incompleto.');

  const resources = Array.isArray(root.resources) ? root.resources.map((entry) => {
    const resource = object(entry);
    if (!resource || typeof resource.staff_id !== 'string') throw new Error('El contrato organizativo devolvió un recurso inválido.');
    return {
      staffId: resource.staff_id,
      active: bool(resource.active),
      roleMapping: nullableString(resource.role_mapping),
      responsibleStaffId: nullableString(resource.responsible_staff_id),
      effectiveManagerStaffId: nullableString(resource.effective_manager_staff_id),
      teamId: nullableString(resource.team_id),
      sellerId: nullableString(resource.seller_id),
      organizationalEligible: bool(resource.organizational_eligible),
      organizationalExclusionReasons: strings(resource.organizational_exclusion_reasons) as OrganizationalEligibilityReason[],
    };
  }) : (() => { throw new Error('El contrato organizativo no devolvió recursos.'); })();

  return {
    actor: actor && {
      userId: String(actor.user_id || ''), profileId: nullableString(actor.profile_id), staffMemberId: nullableString(actor.staff_member_id),
      role: nullableString(actor.role), capabilities: strings(actor.capabilities), global: bool(actor.global),
    },
    authorized: root.authorized,
    effectiveAt: root.effective_at,
    scope: {
      staffIds: strings(scope.staff_ids), supervisorIds: strings(scope.supervisor_ids), teamIds: strings(scope.team_ids), includesAllActiveStaff: bool(scope.includes_all_active_staff),
    },
    resources,
    period: { id: nullableString(period.id), startDate: nullableString(period.start_date), endDate: nullableString(period.end_date), status: period.status === 'unknown' ? 'unknown' : 'missing' },
    integrity: { hierarchyCycleDetected: bool(integrity.hierarchy_cycle_detected), inconsistentReferenceDetected: bool(integrity.inconsistent_reference_detected) },
  };
}
