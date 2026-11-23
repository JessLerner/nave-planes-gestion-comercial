import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRoster, validSelection, type Member, type SheetRow } from '../../api/lib/roster-preview';
import { readRosterPreview } from '../../api/lib/read-roster-preview';

const base: Member = { id: 'existing', dni: '10000001', name: 'Persona A', legajo: 'A', active: true, nomina: 'Plantilla', role: 'sales', supervisor: 'first', manager: 'm', manual: false };
const staff = [base, ...['first','second','m','absent'].map((id,i) => ({ ...base, id, name: id, legajo: id, dni: String(10000002+i), role: id === 'm' ? 'manager' : 'supervision', supervisor: '', manager: id === 'm' ? '' : 'm' }))];
const roles = ['sales','supervision','manager','other'].map((id,i) => ({id,name:id,alias:'',mapping:['','supervisor','gerente',''][i],seller:id === 'sales'}));
const teams = ['first','second'].map(id => ({id,name:'Equipo '+id,supervisor:id}));
const row: SheetRow = { name:base.name, dni:'10.000.001', legajo:'A', nomina:'', category:'sales', supervisor:'first', manager:'m', line:2 };
const preview = (...rows:SheetRow[]) => compareRoster(rows,staff,roles,teams).items;

test('DNI normalizado conserva identidad; vacío preserva valor y ausencia conserva estado', () => {
  const snapshot = structuredClone(staff);
  const items = preview(row);
  assert.equal(items['Sin cambios'][0].id,base.id);
  assert.ok(items['Ausencias para revisión'].some(item => item.id === 'absent'));
  assert.deepEqual(staff,snapshot);
});
test('cargo y equipo derivados; traslado inspeccionable', () => {
  assert.deepEqual(preview({...row,category:'other'})['Actualizaciones propuestas'][0].differences.map(d=>d.field),['Cargo','Equipo']);
  const transfer = preview({...row,supervisor:'second'})['Actualizaciones propuestas'][0];
  assert.equal(transfer.id,base.id);
  assert.deepEqual(transfer.differences.map(d=>[d.field,d.current,d.proposed]),[['Responsable','first','second'],['Equipo','Equipo first','Equipo second']]);
});
test('alta, DNI inválido, duplicado, ambiguo y legajo contradictorio', () => {
  assert.equal(preview({...row,name:'Nuevo',legajo:'Nuevo',dni:'20000001'})['Altas propuestas'].length,1);
  assert.equal(preview(row,{...row,line:3})['Conflictos o errores'].length,2);
  for (const patch of [{dni:'X10000001'},{legajo:'second'},{supervisor:'inexistente'},{manager:'desconocido'},{category:'rol ambiguo'}]) {
    assert.equal(preview({...row,...patch})['Conflictos o errores'].length,1);
  }
  assert.equal(compareRoster([row],[...staff,{...base,id:'duplicate'}],roles,teams).items['Conflictos o errores'].length,1);
  assert.equal(compareRoster([row],[...staff,{...staff[1],id:'ambiguous'}],roles,teams).items['Conflictos o errores'].length,1);
});
test('transacción de sólo lectura, permiso antes de acceso a datos y rollback aun con error',async () => {
  for (const role of ['admin','direccion','gerente','rrhh','error']) {
    const statements:string[]=[];
    const db={query:async (sql:string) => {
      statements.push(sql);
      if (sql.includes('public.profiles')) return {rows:[{role:role==='error'?'admin':role}]};
      if (role==='error' && sql.includes('staff_members')) throw new Error('synthetic');
      return {rows:sql.includes('from public.teams')?teams:sql.includes('from public.staff_members')?staff:sql.includes('from public.hr_roles')?roles:[]};
    }};
    const result=readRosterPreview(db as Parameters<typeof readRosterPreview>[0],'synthetic',[row]);
    if(role==='error') await assert.rejects(result);
    else if(['admin','direccion','rrhh'].includes(role)) assert.equal((await result)?.items['Sin cambios'].length,1);
    else {assert.equal(await result,null); assert.equal(statements.length,3);}
    assert.match(statements[0],/read only$/);
    assert.equal(statements.at(-1),'rollback');
    assert.ok(statements.slice(1,-1).every(sql=>/^select /.test(sql) && !/\b(insert|update|delete|call)\b/i.test(sql)));
  }
});

test('cobertura por equipo: identidad global, traslado con UUID y ausencias sólo del destino completo', () => {
  const members = staff.map(p => ({...p, area:'Ventas'}));
  const rows = [{...row,supervisor:'second'}];
  const complete = compareRoster(rows,members,roles,teams,{scope:'team',teamId:'second',coverage:'complete'});
  assert.equal(complete.items['Altas propuestas'].length,0);
  assert.equal(complete.items['Actualizaciones propuestas'][0].id,base.id);
  assert.ok(complete.items['Actualizaciones propuestas'][0].differences.some(d => d.field === 'Alcance'));
  assert.deepEqual(complete.items['Ausencias para revisión'].map(p => p.id),['second']);
  const partial = compareRoster(rows,members,roles,teams,{scope:'team',teamId:'second',coverage:'partial'});
  assert.deepEqual(partial.items['Ausencias para revisión'],[]);
  assert.equal(partial.scopeLabel,'Ventas · Equipo second');
});

test('alcance por sector y cargo, cobertura explícita y traslado de sector', () => {
  const members = staff.map((p,i) => ({...p, area:i===0?'Administración':'Ventas'}));
  const general = {...base,id:'general',role:'owner',area:'Gerencia / Dirección'};
  const director = {...general,id:'director',role:'director'};
  const catalog = [...roles,{...roles[0],id:'owner',name:'Administrador General',mapping:'admin'}, {...roles[0],id:'director',name:'Director',mapping:'admin'}];
  const directory = [...members,general,director];
  for (const [scope,expected] of [['administration',[base.id]],['general',['general']],['directors',['director']],['management',['m']]] as const) {
    assert.deepEqual(compareRoster([],directory,catalog,teams,{scope,coverage:'complete'}).items['Ausencias para revisión'].map(p=>p.id),expected);
  }
  assert.equal(compareRoster([row],members,roles,teams,{scope:'sales',coverage:'complete'}).items['Actualizaciones propuestas'][0].id,base.id);
  assert.equal(validSelection({scope:'all'}),false);
  assert.equal(validSelection({scope:'team',teamId:'inventado',coverage:'complete'}),false);
});
