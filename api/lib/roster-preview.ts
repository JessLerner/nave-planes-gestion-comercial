export type SheetRow = {
  line: number; name: string; dni: string; legajo: string; nomina: string;
  category: string; supervisor: string; manager: string;
};
export type Member = {
  area?: string;
  id: string; name: string; dni: string; legajo: string; nomina: string; active: boolean;
  role: string; supervisor: string; manager: string; manual: boolean;
};
export type Role = { id: string; name: string; alias: string; mapping: string; seller: boolean };
export type Team = { id: string; name: string; supervisor: string };
export const scopeLabels = {
  all: 'Toda la nómina', administration: 'Administración', sales: 'Ventas · Todos los equipos',
  team: 'Ventas · Equipo', management: 'Dirección · Gerencia', directors: 'Dirección · Dirección',
  general: 'Dirección · Administración General',
};
export type Selection = { scope: keyof typeof scopeLabels; coverage: 'complete' | 'partial'; teamId?: string };
export function validSelection(value: unknown): value is Selection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Selection;
  return typeof selection.scope === 'string' && Object.hasOwn(scopeLabels, selection.scope)
    && ['complete','partial'].includes(selection.coverage)
    && (selection.scope === 'team' ? typeof selection.teamId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selection.teamId) : selection.teamId === undefined);
}
type Difference = { field: string; current: string; proposed: string; reason: string };
export type PreviewItem = { id?: string; line?: number; name: string; differences: Difference[]; reasons: string[] };
export const groups = ['Sin cambios', 'Actualizaciones propuestas', 'Altas propuestas', 'Ausencias para revisión', 'Conflictos o errores', 'Excluidos'] as const;
export type Preview = { total: number; emptyRoster: boolean; scopeLabel: string; coverage: Selection['coverage']; items: Record<typeof groups[number], PreviewItem[]> };
const key = (value?: string) => (value || '').trim().normalize('NFC').toLocaleUpperCase('es').replace(/\s+/g, ' ');
const identity = (value: string) => (value || '').replace(/[.\s]/g, '');

export function compareRoster(rows: SheetRow[], staff: Member[], roles: Role[], teams: Team[], selection: Selection = {scope:'all',coverage:'complete'}): Preview {
  const items: Preview['items'] = { 'Sin cambios': [], 'Actualizaciones propuestas': [], 'Altas propuestas': [], 'Ausencias para revisión': [], 'Conflictos o errores': [], Excluidos: [] };
  const present = new Set<string>();
  const byId = new Map(staff.map(person => [person.id, person]));
  const roleById = new Map(roles.map(role => [role.id, role]));
  const team = teams.find(t => t.id === selection.teamId);
  const inScope = (person: Member) => {
    const role = roleById.get(person.role);
    switch (selection.scope) {
      case 'all': return true;
      case 'administration': return key(person.area) === 'ADMINISTRACIÓN';
      case 'sales': return key(person.area) === 'VENTAS';
      case 'team': return !!team && (person.id === team.supervisor || (role?.seller && person.supervisor === team.supervisor));
      case 'management': return role?.mapping === 'gerente';
      case 'directors': return key(role?.name) === 'DIRECTOR' || role?.mapping === 'direccion';
      case 'general': return key(role?.name) === 'ADMINISTRADOR GENERAL';
    }
  };
  const proposedParents = new Map<string,string>();
  const evaluated: { item: PreviewItem; person?: Member }[] = [];
  for (const row of rows) {
    const dni = identity(row.dni);
    const matches = staff.filter(person => dni && identity(person.dni) === dni);
    const person = matches.length === 1 ? matches[0] : undefined;
    const item: PreviewItem = { name: row.name || 'Sin nombre', line: row.line, id: person?.id, differences: [], reasons: [] };
    const { reasons, differences } = item;
    matches.forEach(match => present.add(match.id));
    if (key(row.nomina) === 'CONVENCIONAL') { items.Excluidos.push(item); continue; }
    if (!/^\d{7,8}$/.test(dni)) reasons.push('DNI inválido.');
    if (rows.filter(other => identity(other.dni) === dni).length > 1) reasons.push('DNI duplicado en el archivo.');
    if (matches.length > 1) reasons.push('DNI ambiguo en Legajos.');
    if (!row.name) reasons.push('Falta el nombre.');
    if (row.legajo) {
      const owners = staff.filter(other => key(other.legajo) === key(row.legajo));
      owners.forEach(owner => present.add(owner.id));
      if (owners.some(owner => owner.id !== person?.id) || rows.some(other => other !== row && key(other.legajo) === key(row.legajo))) reasons.push('El número de legajo identifica otra fila o persona.');
    }
    if (!person && staff.some(other => key(other.name) === key(row.name))) reasons.push('Nombre existente con otra identidad. Revisar DNI.');
    if (person && !person.active) reasons.push('Legajo inactivo. Revisar su estado por separado.');
    const diff = (field: string, current: string | undefined, proposed: string | undefined, reason = 'Valor informado en la planilla.') => {
      if (proposed && key(current ?? '') !== key(proposed)) differences.push({ field, current: current || '—', proposed, reason });
    };
    diff('Nombre', person?.name, row.name);
    diff('Legajo', person?.legajo, row.legajo);
    diff('Nómina', person?.nomina, row.nomina);
    const oldRole = roleById.get(person?.role ?? '');
    let role = oldRole;
    if (row.category) {
      const candidates = new Map(roles.filter(r => [r.name,r.alias].some(label => key(label) === key(row.category))).map(r => [r.id,r]));
      if (candidates.size !== 1) reasons.push('Cargo inexistente o ambiguo.');
      else { role = [...candidates.values()][0]; diff('Cargo', oldRole?.name, role.name); }
    } else if (!person) reasons.push('Falta cargo para el alta.');
    if (!person && !row.legajo && !/COACHING/.test(key(row.category)) && !/FREE\s*LANCE/.test(key(row.nomina))) reasons.push('Falta legajo para el alta.');
    const reference = (name: string, mapping: string, field: string) => {
      if (!name) return;
      const options = staff.filter(p => p.active && key(p.name) === key(name) && (!mapping || roleById.get(p.role)?.mapping === mapping));
      if (options.length !== 1 || options[0].id === person?.id) { reasons.push(field + ' inexistente, ambiguo o autorreferente.'); return; }
      return options[0];
    };
    const supervisor = reference(row.supervisor, role?.seller ? 'supervisor' : '', 'Responsable');
    const manager = reference(row.manager, 'gerente', 'Gerente');
    if (supervisor) {
      diff('Responsable', byId.get(person?.supervisor ?? '')?.name, supervisor.name);
      if (person) proposedParents.set(person.id, supervisor.id);
    }
    const parent = supervisor || byId.get(person?.supervisor ?? '');
    if (parent && (row.supervisor || row.manager || row.category)) {
      const parentRow = rows.find(other => identity(other.dni) === identity(parent.dni));
      if (parentRow && ((parentRow.manager && key(parentRow.manager) !== key(byId.get(parent.manager)?.name)) ||
        (parentRow.supervisor && key(parentRow.supervisor) !== key(byId.get(parent.supervisor)?.name)) ||
        (parentRow.category && !roles.some(r => r.id === parent.role && [r.name,r.alias].some(s => key(s) === key(parentRow.category)))))) {
        reasons.push('El responsable también cambia de estructura en esta planilla. Revisar la dependencia.');
      }
    }
    const inherited = parent && (roleById.get(parent.role)?.mapping === 'gerente' ? parent : byId.get(parent.manager));
    if (person?.manual && manager && manager.id !== person.manager) reasons.push('El gerente informado contradice una excepción manual.');
    if (!person?.manual && manager && inherited && manager.id !== inherited.id) reasons.push('Gerente incompatible con el responsable.');
    const nextManager = manager || (!person?.manual && supervisor ? inherited : undefined);
    diff('Gerente', byId.get(person?.manager ?? '')?.name, nextManager?.name, manager ? 'Gerente informado.' : 'Heredado del responsable propuesto.');
    if (role?.seller && parent) {
      const targets = teams.filter(team => team.supervisor === parent.id);
      if (targets.length !== 1) reasons.push('Equipo del responsable inexistente o ambiguo.');
      else diff('Equipo', oldRole?.seller ? teams.find(team => team.supervisor === person?.supervisor)?.name : '', targets[0].name, 'Derivado del supervisor.');
    }
    if (oldRole?.seller && role && !role.seller) {
      const previousTeam = teams.find(team => team.supervisor === person?.supervisor);
      if (previousTeam) diff('Equipo', previousTeam.name, 'Sin equipo de vendedor', 'El cargo propuesto no proyecta vendedor.');
    }
    evaluated.push({ item, person });
  }
  for (const { item, person } of evaluated) {
    if (person && proposedParents.has(person.id)) {
      const visited = new Set<string>();
      let id = person.id;
      while (id && !visited.has(id)) { visited.add(id); id = proposedParents.get(id) || byId.get(id)?.supervisor || ''; }
      if (id) item.reasons.push('Ciclo en la jerarquía propuesta.');
    }
    if (person && !inScope(person)) {
      item.differences.push({ field: 'Alcance', current: [person.area, roleById.get(person.role)?.name, teams.find(t => t.supervisor === person.supervisor)?.name].filter(Boolean).join(' · ') || 'Fuera del alcance elegido',
        proposed: team?.name || scopeLabels[selection.scope], reason: 'Discrepancia con el alcance declarado. Revisar posible traslado.' });
    }
    const group = item.reasons.length ? 'Conflictos o errores' : !person ? 'Altas propuestas' : item.differences.length ? 'Actualizaciones propuestas' : 'Sin cambios';
    items[group].push(item);
  }
  for (const person of staff.filter(p => selection.coverage === 'complete' && inScope(p) && p.active && !present.has(p.id) && key(p.nomina) !== 'CONVENCIONAL')) {
    items['Ausencias para revisión'].push({ id: person.id, name: person.name, differences: [], reasons: ['Ausente en la planilla. Conserva su estado laboral.'] });
  }
  return { total: rows.length, emptyRoster: !staff.length, items, scopeLabel: team ? 'Ventas · ' + team.name : scopeLabels[selection.scope], coverage: selection.coverage };
}
