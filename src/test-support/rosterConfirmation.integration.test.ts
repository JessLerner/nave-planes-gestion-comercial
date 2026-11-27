import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { currentPreview } from '../../api/lib/read-roster-preview';
import { decideInTransaction, ReviewError } from '../../api/lib/confirm-roster';
import type { SheetRow,Selection } from '../../api/lib/roster-preview';

const endpoint=process.env.NAVE_TEST_DATABASE_URL;
test('confirmación individual en PostgreSQL local con rollback de fixtures y decisiones', {skip:!endpoint},async t=>{
  const target=new URL(endpoint!);
  assert.ok(['127.0.0.1','localhost'].includes(target.hostname) && target.port==='54322');
  const db=new Client({connectionString:endpoint}); await db.connect();
  try {
    await db.query('begin isolation level serializable');
    await db.query(await readFile(new URL('../../supabase/migrations/20261123_051_roster_review_decisions.sql',import.meta.url),'utf8'));
    // Local bootstrap may predate 048. Model the private singleton only inside this rolled-back transaction.
    await db.query('create table if not exists naveplan_private.platform_owner(profile_id uuid unique)');
    const user=async(role:string)=>{
      const id=randomUUID();
      await db.query('insert into auth.users(id) values($1)',[id]);
      await db.query('insert into public.profiles(id,role,full_name) values($1,$2,$3)',[id,role,'Prueba REV05']);
      return id;
    };
    const actor=await user('rrhh'), manager=await user('gerente'), admin=await user('admin');
    const catalog=(await db.query('select * from public.hr_roles where active')).rows;
    const seller=catalog.find(r=>r.creates_seller_record), supervisor=catalog.find(r=>r.app_role_mapping==='supervisor');
    const staff=async(name:string,dni:string,role:typeof seller,parent?:string)=>{
      const r=await db.query(`insert into public.staff_members(full_name,dni,legajo,active,role_id,area_id,responsible_staff_id)
        values($1,$2,$2,true,$3,$4,$5) returning id`,[name,dni,role.id,role.area_id,parent||null]);
      return r.rows[0].id;
    };
    const first=await staff('REV05 ORIGEN','79111001',supervisor), second=await staff('REV05 DESTINO','79111002',supervisor);
    const moved=await staff('REV05 VENTA','79111003',seller,first);
    const absent=await staff('REV05 AUSENTE','79111004',seller,first);
    const pending=await staff('REV05 PENDIENTE','79111005',seller,first);
    const error=await staff('REV05 ERROR','79111006',seller,first);
    const keep=await staff('REV05 CONSERVAR','79111007',seller,first);
    const row:SheetRow={line:2,name:'REV05 VENTA',dni:'79111003',legajo:'79111003',category:seller.name,supervisor:'REV05 DESTINO',manager:'',nomina:'PLANTA'};
    const hire={...row,line:3,name:'REV05 ALTA',dni:'79111008',legajo:'79111008'};
    const rows=[row,hire,{...row,line:4,name:'REV05 CONSERVAR',dni:'79111007',legajo:'79111007'}];
    const selection:Selection={scope:'all',coverage:'complete'};
    const preview=()=>currentPreview(db,rows,selection);
    const decide=(token:string,decision:string,extra={})=>decideInTransaction(db,actor,rows,selection,{token,decision,...extra});
    const find=async(group:'Actualizaciones propuestas'|'Ausencias para revisión',id:string)=>(await preview()).items[group].find(i=>i.id===id)!.token!;
    await t.test('alcance, permisos, vigencia de archivo y de Legajo',async()=>{
      const token=await find('Actualizaciones propuestas',moved);
      for(const unauthorized of [manager,admin]) await assert.rejects(decideInTransaction(db,unauthorized,rows,selection,{token,decision:'apply'}),{status:403});
      await db.query('insert into naveplan_private.platform_owner(profile_id) values($1)',[admin]);
      await decideInTransaction(db,admin,rows,selection,{token,decision:'pending'});
      await assert.rejects(decideInTransaction(db,actor,rows,{...selection,fileHash:'changed'},{token,decision:'apply'}),{status:409});
      await db.query("update public.staff_members set employment_type='CAMBIADO' where id=$1",[moved]);
      await assert.rejects(decide(token,'apply'),{status:409});
      const team=(await db.query('select id from public.teams where supervisor_staff_id=$1',[second])).rows[0].id;
      const limited={scope:'team',teamId:team,coverage:'complete'} as const;
      const discrepancy=(await currentPreview(db,rows,limited)).items['Actualizaciones propuestas'].find(i=>i.id===moved);
      assert.ok(discrepancy && !discrepancy.token);
    });
    await t.test('actualización, traslado, UUID, proyección, auditoría y reintento',async()=>{
      const token=await find('Actualizaciones propuestas',moved);
      await decide(token,'apply'); await decide(token,'apply');
      const log=(await db.query('select * from naveplan_private.roster_review_decisions where review_token=$1',[token])).rows;
      assert.equal(log.length,1); assert.equal(log[0].actor_id,actor); assert.equal(log[0].staff_id,moved);
      assert.equal(log[0].before_value.responsible_staff_id,first); assert.equal(log[0].after_value.responsible_staff_id,second);
      assert.equal(log[0].after_value.employment_type,'PLANTA'); assert.notEqual(log[0].before_value.team_id,log[0].after_value.team_id);
    });
    await t.test('baja con fecha/motivo, error administrativo, conservar y pendiente independiente',async()=>{
      const token=await find('Ausencias para revisión',absent);
      await assert.rejects(decide(token,'terminate'),ReviewError);
      await decide(token,'terminate',{date:'2026-11-23',reason:'Motivo sintético'});
      assert.equal((await db.query("select count(*)::int as n from public.staff_status_events where staff_member_id=$1 and event_type='termination' and occurred_at::date='2026-11-23'",[absent])).rows[0].n,1);
      await decide(await find('Ausencias para revisión',pending),'pending');
      await decide(await find('Ausencias para revisión',error),'error');
      await decide(await find('Actualizaciones propuestas',keep),'keep');
      assert.equal((await db.query('select count(*)::int as n from public.staff_members where active and responsible_staff_id=$1 and id=any($2::uuid[])',[first,[pending,error,keep]])).rows[0].n,3);
      assert.equal((await db.query("select 1 from naveplan_private.roster_review_decisions where staff_id=$1 and decision='pending'",[pending])).rowCount,1);
    });
    await t.test('alta por expediente directo y reintento sin duplicados',async()=>{
      const token=(await preview()).items['Altas propuestas'][0].token!;
      await assert.rejects(decide(token,'hire'),{status:409});
      const draft=(await db.query(`insert into public.incorporation_requests(status,surname,given_names,dni,birth_date,role_id,area_id,supervisor_staff_id,planned_start_date,requested_by,entry_mode,direct_registered_by,direct_registered_at)
        values('borrador','REV05','ALTA',$1,'1990-01-01',$2,$3,$4,'2026-11-23',$5,'rrhh_direct',$5,now()) returning id`,[hire.dni,seller.id,seller.area_id,second,actor])).rows[0].id;
      for(const kind of ['dni_front','dni_back','cv','criminal_record','employment_application']){
        const path='incorporations/'+draft+'/'+kind+'.pdf';
        await db.query("insert into storage.objects(bucket_id,name) values('rrhh-legajos',$1)",[path]);
        await db.query(`insert into public.incorporation_request_documents(request_id,document_kind,original_filename,content_type,size_bytes,uploaded_by,storage_path) values($1,$2,'fixture.pdf','application/pdf',1,$3,$4)`,[draft,kind,actor,path]);
      }
      await decide(token,'hire'); await decide(token,'hire');
      assert.equal((await db.query('select id from public.staff_members where dni=$1 and is_coaching',[hire.dni])).rowCount,1);
    });
  } finally { await db.query('rollback'); await db.end(); }
});
