import type { PoolClient } from 'pg';
const requiredDocuments = ['dni_front', 'dni_back', 'cv', 'criminal_record', 'employment_application'];

export async function authorizeDirectHire(db: Pick<PoolClient,'query'>, requestId: string, userId: string) {
  const request = (await db.query<any>(`select * from public.incorporation_requests where id=$1 and entry_mode='rrhh_direct' and direct_registered_by=$2 and status='borrador' for update`, [requestId, userId])).rows[0];
  if (!request) throw new Error('El alta directa no está disponible para finalizar.');
  const documents = await db.query<{ document_kind: string }>(`select d.document_kind from public.incorporation_request_documents d join storage.objects o on o.bucket_id='rrhh-legajos' and o.name=d.storage_path where d.request_id=$1`, [requestId]);
  if (requiredDocuments.some(kind => !documents.rows.some(document => document.document_kind === kind))) throw new Error('Falta documentación obligatoria o algún archivo privado no está disponible.');
  await db.query('select pg_advisory_xact_lock(hashtext($1))', [request.dni]);
  if ((await db.query(`select id from public.staff_members where regexp_replace(coalesce(dni,''),'\\D','','g')=$1 for update`, [request.dni])).rowCount) throw new Error('El DNI ya existe en Legajos; no se generó un legajo duplicado.');
  if (!(await db.query(`select id from public.hr_roles where id=$1 and area_id=$2 and active`, [request.role_id, request.area_id])).rowCount) throw new Error('El puesto ya no pertenece al área o no está activo.');
  const staff = await db.query<{ id: string }>(`insert into public.staff_members(full_name,dni,legajo,employment_type,active,area_id,role_id,responsible_staff_id,is_coaching,administrative_status,incorporation_authorized_at,incorporation_authorized_by) values($1,$2,null,'COACHING',true,$3,$4,$5,true,'coaching',now(),$6) returning id`, [`${request.surname} ${request.given_names}`.trim(), request.dni, request.area_id, request.role_id, request.supervisor_staff_id, userId]);
  await db.query(`update public.incorporation_requests set status='autorizado',reviewed_by=$2,reviewed_at=now(),review_note='Alta directa de RRHH',authorized_staff_member_id=$3,updated_at=now() where id=$1`, [requestId, userId, staff.rows[0].id]);
  await db.query(`insert into public.incorporation_request_decisions(request_id,decision,reason,decided_by) values($1,'autorizado','Alta directa de RRHH',$2)`, [requestId, userId]);
  await db.query(`insert into public.incorporation_request_audit(request_id,event_type,actor_id,metadata) values($1,'rrhh_direct_authorized',$2,jsonb_build_object('staff_member_id',$3::uuid))`, [requestId, userId, staff.rows[0].id]);
  return staff.rows[0].id as string;
}
