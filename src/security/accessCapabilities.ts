// Reintroduce each deferred capability only with its server-side check and a
// matching authorization-contract test.
export const ADMINISTRATIVE_CAPABILITIES = ['view_legajos', 'manage_legajos'] as const;

export type AdministrativeCapability = (typeof ADMINISTRATIVE_CAPABILITIES)[number];

export const ADMINISTRATIVE_CAPABILITY_LABELS: Record<AdministrativeCapability, string> = {
  view_legajos: 'Ver Legajos',
  manage_legajos: 'Editar Legajos',
};
