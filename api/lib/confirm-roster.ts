import type { PoolClient } from 'pg';
import { currentPreview, digest } from './read-roster-preview';
import type { Selection, SheetRow, PreviewItem } from './roster-preview';
import { deactivateStaff } from './deactivate-staff';
import { authorizeDirectHire } from './authorize-direct-hire';

type Database = Pick<PoolClient,'query'>;
export class ReviewError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const stale = () => new ReviewError(409,'Cambió el archivo, el Legajo o su estructura. Volvé a comparar el registro.');
type Choice = {token:string; decision:string; reason?:string; date?:string};
function validateChoice(value: unknown): Choice {
  const c = value as Partial<Choice> | null;
  if (!c || typeof c.token !== 'string' || !/^[0-9a-f]{64}$/.test(c.token) || !['apply','keep','hire','terminate','error','pending'].includes(String(c.decision))) throw new ReviewError(400,'Seleccioná una decisión válida.');
  if (c.decision === 'terminate') {
    if (typeof c.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !Number.isFinite(Date.parse(c.date)) || new Date(c.date).toISOString().slice(0,10)!==c.date ||
      typeof c.reason !== 'string' || !c.reason.trim() || c.reason.length>2000) throw new ReviewError(400,'Indicá fecha efectiva válida y motivo de baja.');
    return {token:c.token,decision:c.decision,date:c.date,reason:c.reason.trim()};
  }
  return {token:c.token,decision:c.decision!};
}

async function snapshot(db:Database,id:string) {
  return (await db.query(`select s.id,s.full_name,s.legajo,s.employment_type,s.role_id,s.area_id,s.responsible_staff_id,
    s.effective_manager_staff_id,s.effective_manager_source,s.active,s.deactivated_at,s.deactivation_reason,
    seller.team_id from public.staff_members s left join public.sellers seller on seller.staff_member_id=s.id where s.id=$1`,[id])).rows[0];
}

async function otherHierarchies(db:Database,id:string) {
  const result=await db.query(`select md5(string_agg(jsonb_build_array(id,active,area_id,role_id,
    responsible_staff_id,effective_manager_staff_id,effective_manager_source)::text,',' order by id)) as fingerprint
    from public.staff_members where id<>$1`,[id]);
  return result.rows[0].fingerprint;
}

async function applyUpdate(db:Database,item:PreviewItem,row:SheetRow) {
  const p = item.proposal!;
  const linked = (await db.query('select 1 from public.profiles where staff_member_id=$1',[item.id])).rowCount;
  if (linked && item.differences.some(d=>d.field==='Cargo')) throw new ReviewError(409,'El cambio de cargo requiere revisar la cuenta vinculada.');
  // The selected row may be independent of other proposed hierarchy edits.
  if (p.supervisor && (await db.query(`with recursive ancestors as (
    select id,responsible_staff_id from public.staff_members where id=$1
    union select s.id,s.responsible_staff_id from public.staff_members s join ancestors a on s.id=a.responsible_staff_id
  ) select 1 from ancestors where id=$2`,[p.supervisor,item.id])).rowCount) throw new ReviewError(409,'El traslado individual generaría un ciclo.');
  const changed = (field:string) => item.differences.some(d=>d.field===field);
  await db.query(`update public.staff_members set full_name=coalesce(nullif($2,''),full_name),
    legajo=coalesce(nullif($3,''),legajo),employment_type=coalesce(nullif($4,''),employment_type),
    role_id=coalesce($5,role_id),area_id=coalesce($6,area_id),responsible_staff_id=coalesce($7,responsible_staff_id),
    effective_manager_staff_id=case when $10 then $8::uuid else effective_manager_staff_id end,
    effective_manager_source=case when $10 then $9::public.manager_assignment_source else effective_manager_source end,
    updated_at=now() where id=$1 and active`,
    [item.id,changed('Nombre')?row.name:null,changed('Legajo')?row.legajo:null,changed('Nómina')?row.nomina:null,
      changed('Cargo')?p.role:null,changed('Sector')?p.area:null,changed('Responsable')?p.supervisor:null,
      p.manager,p.manual?'manual':'inherited',changed('Gerente')]);
}

export async function decideInTransaction(db:Database,actor:string,rows:SheetRow[],selection:Selection,input:unknown) {
  const allowed = await db.query(`select 1 from public.profiles p where p.id=$1 and (p.role='rrhh' or
    (p.role='admin' and exists(select 1 from naveplan_private.platform_owner o where o.profile_id=p.id))) for share of p`,[actor]);
  if (!allowed.rowCount) throw new ReviewError(403,'La confirmación requiere RRHH o Administración General.');
  const choice=validateChoice(input);
  const source=digest([selection.scope,selection.teamId,selection.coverage,selection.fileHash,rows]);
  const decisionHash=digest([source,choice]);
  const auditKey=choice.decision === 'pending' ? digest([choice.token,'pending']) : choice.token;
  const prior=(await db.query('select decision_hash from naveplan_private.roster_review_decisions where review_token=$1',[auditKey])).rows[0];
  if (prior) {
    if (prior.decision_hash!==decisionHash) throw stale();
    return;
  }
  const preview=await currentPreview(db,rows,selection);
  const group=choice.decision==='hire'?'Altas propuestas': ['terminate','error'].includes(choice.decision)?'Ausencias para revisión':'Actualizaciones propuestas';
  const candidates=choice.decision === 'pending' ? Object.values(preview.items).flat() : preview.items[group];
  const item=candidates.find(entry=>entry.token===choice.token);
  if (!item) throw stale();
  let id=item.id;
  const before=id?await snapshot(db,id):null;
  const affectsHierarchy=id && (choice.decision==='terminate' || (choice.decision==='apply' &&
    item.differences.some(d=>['Cargo','Responsable','Gerente','Sector'].includes(d.field))));
  const otherBefore=affectsHierarchy ? await otherHierarchies(db,id!) : null;
  const row=rows.find(r=>r.line===item.line);
  if (choice.decision==='hire') {
    const p=item.proposal!;
    const drafts=await db.query(`select id from public.incorporation_requests where dni=$1 and role_id=$2 and area_id=$3
      and supervisor_staff_id=$4 and direct_registered_by=$5 and entry_mode='rrhh_direct' and status='borrador' for update`,
      [row!.dni.replace(/[.\s]/g,''),p.role,p.area,p.supervisor,actor]);
    if (drafts.rowCount!==1) throw new ReviewError(409,'Completá un único expediente de alta directa con ese DNI, cargo y supervisor en Incorporaciones.');
    id=await authorizeDirectHire(db,drafts.rows[0].id,actor);
  } else if (choice.decision==='terminate') {
    await deactivateStaff(db,id!,actor,choice.date!,choice.reason!);
  } else if (choice.decision==='apply') {
    await applyUpdate(db,item,row!);
  }
  if (affectsHierarchy && otherBefore!==await otherHierarchies(db,id!)) {
    throw new ReviewError(409,'La decisión cambiaría la jerarquía de otros Legajos. Revisá primero las dependencias.');
  }
  await db.query(`insert into naveplan_private.roster_review_decisions
    (review_token,source_hash,scope,decision,decision_hash,staff_id,actor_id,before_value,after_value,reason,effective_date)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[auditKey,source,selection,choice.decision,decisionHash,id,actor,before,id ? await snapshot(db,id) : {line:item.line},choice.reason||null,choice.date||null]);
}

export async function confirmRoster(db:Database,actor:string,rows:SheetRow[],selection:Selection,input:unknown) {
  for (let attempt=0; ; attempt++) {
    await db.query('begin isolation level serializable');
    try {
      await decideInTransaction(db,actor,rows,selection,input);
      await db.query('commit'); return;
    } catch (error) {
      await db.query('rollback');
      const code=(error as {code?:string}).code;
      if (['40001','40P01','23505'].includes(code || '')) {
        if (attempt===0) continue;
        throw stale();
      }
      throw error;
    }
  }
}
