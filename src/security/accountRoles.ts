export const ACCOUNT_ROLE_LABELS = {
  admin: 'Administración General',
  administrativo: 'Administración',
  rrhh: 'Recursos Humanos',
  contaduria: 'Contaduría',
  marketing: 'Marketing',
  direccion: 'Dirección',
  gerente: 'Gerencia',
  supervisor: 'Supervisión',
} as const;

export type AccountRole = keyof typeof ACCOUNT_ROLE_LABELS;

export function canInviteRole(actor: unknown, target: unknown): boolean {
  if (typeof target !== 'string' || !Object.hasOwn(ACCOUNT_ROLE_LABELS, target) || target === 'admin') return false;
  if (actor === 'gerente') return target === 'supervisor';
  if (actor === 'rrhh') return target !== 'direccion';
  return actor === 'admin' || actor === 'direccion';
}
