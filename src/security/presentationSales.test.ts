import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { listSales, detailSale } from '../../api/presentation-sales';
import { SaleOptions } from '../components/operations/PresentationSaleSelector';

test('ID Ventas: procedencia, unicidad y alcance vigente para lista y detalle', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`attach ':memory:' as public;
      create table public.profiles(id text, role text, team_id text, staff_member_id text);
      create table public.teams(id text, active int, is_sales_team int, supervisor_staff_id text);
      create table public.sellers(id text, team_id text, active int);
      create table public.source_sync_runs(id text, source_key text, source_sheet text, imported_by text, run_status text);
      create table public.source_sync_errors(run_id text, source_key text);
      create table public.sales_operations(id text primary key, external_id text unique, operation_date text, brand text, client_name text,
        model text, subscription_number text, seller_id text, team_id text, source_updated_at text, source_sync_run_id text);
      insert into public.profiles values ('one','supervisor','a','s1'),('two','supervisor','b','s2');
      insert into public.teams values ('a',1,1,'s1'),('b',1,1,'s2');
      insert into public.sellers values ('seller','a',1);
      insert into public.source_sync_runs values ('run','app_control_operaciones:id_ventas','ID Ventas','sync-app-control-sales','completed');`);
    const insert = db.prepare("insert into public.sales_operations values (?,?, '2026-01-01','Marca','Cliente',null,null,?,?, '2026-01-01',?)");
    const prefix = 'app_control_operaciones:id_ventas:';
    insert.run('valid', prefix+'v1','seller','a','run');
    insert.run('manual', null,'seller','a',null);
    insert.run('unverified', prefix+'v2','seller','a',null);
    insert.run('unresolved', prefix+'v3',null,'a','run');
    insert.run('no-team', prefix+'v4','seller',null,'run');
    assert.throws(() => insert.run('duplicate',prefix+'v1','seller','a','run'), /unique/i);
    const list = (actor: string) => db.prepare(listSales).all({ $1: actor }).map(row => row.id);
    const detail = (actor: string) => db.prepare(detailSale).get({ $1: actor, $2: 'valid' });
    assert.deepEqual(list('one'), ['valid']);
    assert.deepEqual(list('two'), []);
    assert.equal(detail('two'), undefined);
    assert.equal(detail('one')?.id, 'valid');
    db.exec("update public.sellers set team_id='b'");
    assert.equal(detail('one'), undefined);
    assert.deepEqual(list('two'), ['valid']);
    db.exec("update public.teams set supervisor_staff_id='replacement' where id='b'");
    assert.equal(detail('two'), undefined);
    db.exec("update public.teams set supervisor_staff_id='s2' where id='b'");
    db.prepare("insert into public.source_sync_errors values ('run',?)").run(prefix+'v1');
    assert.deepEqual(list('two'), []);
  } finally { db.close(); }
});

test('la lista vacía comunica el estado sin ofrecer selección', () => {
  const html = renderToStaticMarkup(createElement(SaleOptions, { rows: [], search: '', select() {} }));
  assert.match(html, /No hay ventas cantadas elegibles en tu equipo/);
  assert.doesNotMatch(html, /<button/);
});
