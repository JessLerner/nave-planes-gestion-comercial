export type RosterRole = 'admin' | 'gerente' | 'supervisor' | 'vendedor' | 'rrhh' | 'otro';

export type Staff = {
  id: string;
  role: RosterRole;
  active: boolean;
  responsibleId: string | null;
  managerId: string | null;
  managerSource: 'inherited' | 'manual';
};

export type TeamProjection = {
  id: string;
  supervisorId: string;
  managerId: string | null;
  active: boolean;
};

export type SellerProjection = {
  id: string;
  staffId: string;
  teamId: string | null;
  active: boolean;
  terminationDate: string | null;
};

export type ProfileProjection = {
  staffId: string;
  role: Exclude<RosterRole, 'otro'>;
  teamId: string | null;
};

export type RosterState = {
  staff: Staff[];
  teams: TeamProjection[];
  sellers: SellerProjection[];
  profiles: ProfileProjection[];
};

const mappedRole = (role: RosterRole): Exclude<RosterRole, 'otro'> | null => role === 'otro' ? null : role;
const createsSeller = (role: RosterRole) => role === 'vendedor';

function inheritedManager(staff: Staff, byId: Map<string, Staff>) {
  if (staff.managerSource === 'manual') return staff.managerId;
  const visited = new Set<string>([staff.id]);
  let ancestorId = staff.responsibleId;
  while (ancestorId && !visited.has(ancestorId)) {
    visited.add(ancestorId);
    const ancestor = byId.get(ancestorId);
    if (!ancestor || !ancestor.active) return null;
    if (ancestor.managerSource === 'manual' && ancestor.managerId) return ancestor.managerId;
    if (ancestor.role === 'gerente' || ancestor.role === 'admin') return ancestor.id;
    ancestorId = ancestor.responsibleId;
  }
  return null;
}

/**
 * Test-only behavioral model of the database projection defined by migration
 * 032. It lets the test suite exercise roster transitions without connecting
 * to a real Supabase project. It must not be treated as evidence that the
 * database trigger is deployed; that needs a dedicated integration database.
 */
export function projectRoster(state: RosterState, date = '2030-01-02'): RosterState {
  const staff = state.staff.map(item => ({ ...item }));
  const byId = new Map(staff.map(item => [item.id, item]));

  for (const member of staff) {
    if (member.active && member.managerSource === 'inherited') {
      member.managerId = inheritedManager(member, byId);
    }
  }

  const existingTeamBySupervisor = new Map(state.teams.map(item => [item.supervisorId, { ...item }]));
  const teams = [...existingTeamBySupervisor.values()];
  for (const team of teams) team.active = false;
  for (const supervisor of staff.filter(item => item.active && item.role === 'supervisor')) {
    const existing = existingTeamBySupervisor.get(supervisor.id);
    if (existing) {
      existing.active = true;
      existing.managerId = supervisor.managerId;
    } else {
      const created = { id: `team:${supervisor.id}`, supervisorId: supervisor.id, managerId: supervisor.managerId, active: true };
      teams.push(created);
      existingTeamBySupervisor.set(supervisor.id, created);
    }
  }

  const teamBySupervisor = new Map(teams.filter(item => item.active).map(item => [item.supervisorId, item]));
  const existingSellerByStaff = new Map(state.sellers.map(item => [item.staffId, { ...item }]));
  const sellers = [...existingSellerByStaff.values()];
  for (const seller of sellers) seller.active = false;
  for (const member of staff.filter(item => item.active && createsSeller(item.role))) {
    const team = member.responsibleId ? teamBySupervisor.get(member.responsibleId) : undefined;
    const existing = existingSellerByStaff.get(member.id);
    if (existing) {
      existing.teamId = team?.id || null;
      existing.active = true;
    } else {
      const created = { id: `seller:${member.id}`, staffId: member.id, teamId: team?.id || null, active: true, terminationDate: null };
      sellers.push(created);
      existingSellerByStaff.set(member.id, created);
    }
  }
  for (const seller of sellers) {
    if (!seller.active && !seller.terminationDate) seller.terminationDate = date;
  }

  const profiles = state.profiles.map(profile => {
    const member = byId.get(profile.staffId);
    const role = member && member.active ? mappedRole(member.role) : null;
    if (!member || !member.active || !role) return { ...profile };
    return { ...profile, role, teamId: role === 'supervisor' ? teamBySupervisor.get(member.id)?.id || null : null };
  });

  return { staff, teams, sellers, profiles };
}

export function canEditRoster(viewer: Pick<Staff, 'id' | 'role'>, target: Staff, staff: Staff[]) {
  if (viewer.role === 'admin' || viewer.role === 'rrhh') return true;
  if (viewer.role !== 'gerente') return false;
  const byId = new Map(staff.map(item => [item.id, item]));
  if (target.managerId === viewer.id) return true;
  const visited = new Set<string>();
  let current: Staff | undefined = target;
  while (current?.responsibleId && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.responsibleId === viewer.id) return true;
    current = byId.get(current.responsibleId);
  }
  return false;
}
