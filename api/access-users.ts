import { databasePool } from './lib/database';
import { ADMINISTRATIVE_CAPABILITIES, type AdministrativeCapability } from '../src/security/accessCapabilities';

type Req={method?:string;headers?:Record<string,string|string[]|undefined>;body?:Record<string,unknown>};
type Res={status:(n:number)=>Res;json:(x:unknown)=>Res};
type Role='admin'|'gerente'|'supervisor'|'rrhh'|'administrativo';
type Capability=AdministrativeCapability;
const pool=databasePool(process.env.POSTGRES_URL||process.env.DATABASE_URL||'');
const roles=new Set<Role>(['admin','gerente','supervisor','rrhh','administrativo']);
const capabilities=new Set<Capability>(ADMINISTRATIVE_CAPABILITIES);
const text=(value:unknown)=>String(value??'').trim();
const isEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function identity(req:Req){const raw=req.headers?.authorization;const token=Array.isArray(raw)?raw[0]:raw;if(!token?.startsWith('Bearer ')||!process.env.SUPABASE_URL||!process.env.SUPABASE_ANON_KEY)return null;const response=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:token,apikey:process.env.SUPABASE_ANON_KEY}});return response.ok?((await response.json()as{id?:string}).id||null):null;}
function requestCapabilities(value:unknown){if(!Array.isArray(value))return[];return [...new Set(value.filter((item):item is Capability=>typeof item==='string'&&capabilities.has(item as Capability)))];}

export default async function handler(req:Req,res:Res){
  const actorId=await identity(req);if(!actorId)return res.status(401).json({success:false,message:'Sesión no válida.'});
  const db=await pool.connect();
  try{
    const actor=(await db.query<{role:Role;staff_member_id:string|null}>('select role,staff_member_id from public.profiles where id=$1',[actorId])).rows[0];
    if(!actor)return res.status(403).json({success:false,message:'No tenés perfil operativo para gestionar cuentas.'});
    const isGlobalAdmin=actor.role==='admin'; const isHr=actor.role==='rrhh'; const isManager=actor.role==='gerente'&&!!actor.staff_member_id;
    if(!isGlobalAdmin&&!isHr&&!isManager)return res.status(403).json({success:false,message:'Sólo Dirección, Administración General, Gerencia o RR. HH. pueden gestionar cuentas.'});
    const scopeSql=isManager?`and staff.id in (with recursive hierarchy as (select id from public.staff_members where id=$1 union select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id=parent.id) select id from hierarchy)`:'';
    const scopeValues=isManager?[actor.staff_member_id!]:[];
    if(req.method==='GET'){
      const [staff,accounts]=await Promise.all([
        db.query(`select staff.id,staff.full_name,hr_role.app_role_mapping from public.staff_members staff join public.hr_roles hr_role on hr_role.id=staff.role_id left join public.profiles profile on profile.staff_member_id=staff.id where staff.active and hr_role.app_role_mapping is not null and (hr_role.app_role_mapping <> 'admin'::public.app_role or hr_role.grants_global_admin) and profile.id is null ${scopeSql} order by staff.full_name`,scopeValues),
        db.query(`select profile.id,profile.full_name,profile.role,profile.staff_member_id,auth.email,coalesce(array_agg(permission.capability order by permission.capability) filter(where permission.capability is not null),'{}') capabilities from public.profiles profile left join auth.users auth on auth.id=profile.id left join public.profile_access_permissions permission on permission.profile_id=profile.id where 1=1 ${isManager?`and profile.staff_member_id in (with recursive hierarchy as (select id from public.staff_members where id=$1 union select child.id from public.staff_members child join hierarchy parent on child.responsible_staff_id=parent.id) select id from hierarchy)`:''} group by profile.id,profile.full_name,profile.role,profile.staff_member_id,auth.email order by profile.full_name`,scopeValues),
      ]);
      return res.status(200).json({success:true,data:{eligible_staff:staff.rows,accounts:accounts.rows,capabilities:[...capabilities],can_grant_capabilities:isGlobalAdmin}});
    }
    if(req.method!=='POST')return res.status(405).json({success:false,message:'Método no permitido.'});
    const email=text(req.body?.email).toLowerCase(),staffId=text(req.body?.staff_member_id),role=text(req.body?.role) as Role,grants=requestCapabilities(req.body?.capabilities);
    if(!isEmail(email)||!staffId||!roles.has(role))return res.status(400).json({success:false,message:'Completá correo, recurso y perfil de acceso válidos.'});
    if(isManager&&role!=='supervisor')return res.status(403).json({success:false,message:'Gerencia sólo puede invitar Supervisión de su propia estructura.'});
    if(!isGlobalAdmin&&role==='admin')return res.status(403).json({success:false,message:'Sólo Dirección o Administración General pueden otorgar acceso global.'});
    if(!isGlobalAdmin&&grants.length)return res.status(403).json({success:false,message:'Sólo Dirección o Administración General pueden asignar permisos administrativos.'});
    if(role!=='administrativo'&&grants.length)return res.status(400).json({success:false,message:'Los permisos granulares sólo corresponden a cuentas administrativas.'});
    const target=(await db.query<{id:string;full_name:string;app_role_mapping:Role}>(`select staff.id,staff.full_name,hr_role.app_role_mapping from public.staff_members staff join public.hr_roles hr_role on hr_role.id=staff.role_id where staff.id=$1 and staff.active and hr_role.app_role_mapping=$2::public.app_role and ($2::public.app_role <> 'admin'::public.app_role or hr_role.grants_global_admin) ${scopeSql}`,[staffId,role,...scopeValues])).rows[0];
    if(!target)return res.status(403).json({success:false,message:'El recurso no está activo, no coincide con su perfil de acceso configurado o queda fuera de tu alcance.'});
    if((await db.query('select 1 from public.profiles where staff_member_id=$1',[staffId])).rowCount)return res.status(409).json({success:false,message:'Ese recurso ya tiene una cuenta vinculada.'});
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!serviceKey)return res.status(503).json({success:false,message:'La invitación segura no está configurada todavía.'});
    const origin=text(req.headers?.origin)||'https://gestioncomercial.naveplan.workers.dev';
    const invited=await fetch(`${process.env.SUPABASE_URL}/auth/v1/invite`,{method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'},body:JSON.stringify({email,data:{full_name:target.full_name},redirect_to:`${origin}/restablecer-contrasena`})});
    const payload=await invited.json() as{id?:string;msg?:string;message?:string};if(!invited.ok||!payload.id)return res.status(400).json({success:false,message:payload.msg||payload.message||'No se pudo emitir la invitación.'});
    try{
      await db.query('begin'); await db.query('insert into public.profiles(id,full_name,role,staff_member_id) values($1,$2,$3::public.app_role,$4)',[payload.id,target.full_name,role,staffId]);
      for(const capability of grants)await db.query('insert into public.profile_access_permissions(profile_id,capability,granted_by) values($1,$2,$3)',[payload.id,capability,actorId]);
      await db.query(`insert into public.access_account_audit(action,actor_id,target_profile_id,target_staff_member_id,target_role,target_email,capabilities) values('invited',$1,$2,$3,$4::public.app_role,$5,$6)`,[actorId,payload.id,staffId,role,email,grants]); await db.query('commit');
    }catch(error){await db.query('rollback').catch(()=>undefined);await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${payload.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey}}).catch(()=>undefined);throw error;}
    return res.status(201).json({success:true,data:{id:payload.id,email,full_name:target.full_name,role,capabilities:grants}});
  }catch(error){await db.query('rollback').catch(()=>undefined);return res.status(400).json({success:false,message:error instanceof Error?error.message:'No se pudo gestionar la cuenta.'});}finally{db.release();}
}
