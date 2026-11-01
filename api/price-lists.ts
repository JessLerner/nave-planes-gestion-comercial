import { databasePool } from './lib/database';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => Response };
type Profile = { id: string; role: 'admin' | 'gerente' | 'supervisor' | 'rrhh'; staff_member_id: string | null; can_manage_price_lists: boolean };

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = databasePool(connectionString);

async function authenticatedUserId(request: Request) {
  const authorizationHeader = request.headers?.authorization;
  const authorization = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (!authorization?.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const result = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: process.env.SUPABASE_ANON_KEY },
  });
  return result.ok ? ((await result.json() as { id?: string }).id || null) : null;
}

const isUuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
const numberValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export default async function handler(request: Request, response: Response) {
  if (!connectionString) return response.status(503).json({ success: false, message: 'La base operativa no está configurada.' });
  const userId = await authenticatedUserId(request);
  if (!userId) return response.status(401).json({ success: false, message: 'Sesión no válida o vencida.' });

  const db = await pool.connect();
  try {
    const profileResult = await db.query<Profile>(
      'select id,role,staff_member_id,can_manage_price_lists from public.profiles where id=$1 limit 1',
      [userId],
    );
    const profile = profileResult.rows[0];
    if (!profile) return response.status(403).json({ success: false, message: 'Tu cuenta no tiene perfil operativo asignado.' });

    if (request.method === 'GET') {
      if (profile.can_manage_price_lists) {
        const [versions, items, segments, sources] = await Promise.all([
          db.query(`select id,brand,name,effective_date,version_number,status,source_currency,display_currency,exchange_rate,exchange_rate_source,exchange_rate_overridden,published_for_managers_at from public.price_list_versions order by effective_date desc,brand,version_number desc`),
          db.query(`select id,price_list_version_id,source_key,model,plan_type,total_installments,basic_value,pure_installment,cuota_1_value,upfront_stamp_value,base_surcharge,delivery_terms,sort_order from public.price_list_items order by sort_order,model`),
          db.query(`select id,price_list_item_id,installment_from,installment_to,quota_value,stamp_value,total_value,source_label,sort_order from public.price_list_installment_segments order by installment_from`),
          db.query(`select source.price_list_version_id,document.id,document.original_filename,document.document_type,document.effective_date from public.price_list_sources source join public.commercial_documents document on document.id=source.commercial_document_id order by source.source_order`),
        ]);
        return response.status(200).json({ success: true, scope: 'manage', versions: versions.rows, items: items.rows, segments: segments.rows, sources: sources.rows });
      }

      if (!profile.staff_member_id) return response.status(403).json({ success: false, message: 'Tu perfil no está vinculado a una estructura comercial.' });
      const managerScope = profile.role === 'gerente';
      const confirmations = await db.query(managerScope ? `
        select confirmation.id,confirmation.price_list_version_id,confirmation.status,confirmation.confirmed_at,
               version.brand,version.name,version.effective_date
          from public.price_list_structure_confirmations confirmation
          join public.price_list_versions version on version.id=confirmation.price_list_version_id
         where confirmation.manager_staff_id=$1 and version.status='published_to_managers'
         order by version.effective_date desc,version.brand
      ` : `
        select confirmation.id,confirmation.price_list_version_id,confirmation.status,confirmation.confirmed_at,
               version.brand,version.name,version.effective_date
          from public.price_list_structure_confirmations confirmation
          join public.price_list_versions version on version.id=confirmation.price_list_version_id
          join public.teams team on team.manager_staff_id=confirmation.manager_staff_id
         where team.supervisor_staff_id=$1 and team.active and team.is_sales_team
           and confirmation.status='confirmed' and version.status='published_to_managers'
         order by version.effective_date desc,version.brand
      `, [profile.staff_member_id]);
      const confirmationIds = confirmations.rows.map(row => row.id);
      if (!confirmationIds.length) return response.status(200).json({ success: true, scope: managerScope ? 'manager' : 'supervisor', confirmations: [], items: [], segments: [] });

      const items = await db.query(managerScope ? `
        select item.id,item.price_list_version_id,item.model,item.plan_type,item.total_installments,item.basic_value,item.pure_installment,item.upfront_stamp_value,
               item.cuota_1_value,item.delivery_terms,surcharge.surcharge_amount,(item.cuota_1_value+surcharge.surcharge_amount) as subscription_value
          from public.price_list_item_surcharges surcharge
          join public.price_list_items item on item.id=surcharge.price_list_item_id
         where surcharge.confirmation_id=any($1::uuid[])
         order by item.sort_order,item.model
      ` : `
        select item.id,item.price_list_version_id,item.model,item.plan_type,item.total_installments,item.basic_value,item.pure_installment,item.upfront_stamp_value,
               item.delivery_terms,(item.cuota_1_value+surcharge.surcharge_amount) as subscription_value
          from public.price_list_item_surcharges surcharge
          join public.price_list_items item on item.id=surcharge.price_list_item_id
         where surcharge.confirmation_id=any($1::uuid[])
         order by item.sort_order,item.model
      `, [confirmationIds]);
      const itemIds = items.rows.map(row => row.id);
      const segments = itemIds.length ? await db.query(
        `select price_list_item_id,installment_from,installment_to,total_value,source_label,sort_order from public.price_list_installment_segments where price_list_item_id=any($1::uuid[]) order by installment_from`,
        [itemIds],
      ) : { rows: [] };
      return response.status(200).json({ success: true, scope: managerScope ? 'manager' : 'supervisor', confirmations: confirmations.rows, items: items.rows, segments: segments.rows });
    }

    if (request.method !== 'POST') return response.status(405).json({ success: false, message: 'Método no permitido.' });
    const body = request.body as { action?: unknown; version_id?: unknown; surcharges?: unknown };
    const action = typeof body?.action === 'string' ? body.action : '';
    const versionId = body?.version_id;
    if (action !== 'create_renault_draft' && !isUuid(versionId)) return response.status(400).json({ success: false, message: 'Lista inválida.' });

    await db.query('begin');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    if (action === 'create_renault_draft') {
      if (!profile.can_manage_price_lists) throw new Error('No tenés permiso para crear borradores.');
      const draft = body as { name?: unknown; effective_date?: unknown; base_surcharge?: unknown; document?: { filename?: unknown; path?: unknown; mime_type?: unknown; byte_size?: unknown }; items?: Array<{ sourceKey?: string; model?: string; planType?: string; totalInstallments?: number; basicValue?: number; pureInstallment?: number; cuota1Value?: number; upfrontStampValue?: number; segments?: Array<{ from?: number; to?: number; quotaValue?: number }> }> };
      const base = numberValue(draft.base_surcharge);
      if (!draft.document || !Array.isArray(draft.items) || !draft.items.length || !base || base <= 0 || typeof draft.effective_date !== 'string') throw new Error('Completá vigencia, sobrepauta base y datos del archivo.');
      const document = draft.document;
      if (typeof document.filename !== 'string' || typeof document.path !== 'string' || typeof document.mime_type !== 'string' || !numberValue(document.byte_size)) throw new Error('El archivo no se subió correctamente.');
      const version = await db.query<{ id: string }>(`insert into public.price_list_versions(brand,name,effective_date,created_by) values('Renault',$1,$2,$3) returning id`, [typeof draft.name === 'string' ? draft.name : `Lista Renault ${draft.effective_date}`, draft.effective_date, userId]);
      const storedDocument = await db.query<{ id: string }>(`insert into public.commercial_documents(original_filename,storage_path,mime_type,byte_size,confirmed_brand,effective_date,document_type,uploaded_by) values($1,$2,$3,$4,'Renault',$5,'price_list',$6) returning id`, [document.filename, document.path, document.mime_type, document.byte_size, draft.effective_date, userId]);
      await db.query(`insert into public.price_list_sources(price_list_version_id,commercial_document_id) values($1,$2)`, [version.rows[0].id, storedDocument.rows[0].id]);
      for (const [sortOrder, item] of draft.items.entries()) {
        if (!item.sourceKey || !item.model || !item.planType || !numberValue(item.totalInstallments) || !numberValue(item.basicValue) || !numberValue(item.pureInstallment) || !numberValue(item.cuota1Value) || !item.segments?.length) throw new Error('El Excel contiene un plan incompleto.');
        const upfrontStamp = numberValue(item.upfrontStampValue);
        if (upfrontStamp === null || upfrontStamp < 0) throw new Error('El Excel contiene un sellado Renault inválido.');
        const saved = await db.query<{ id: string }>(`insert into public.price_list_items(price_list_version_id,source_key,model,plan_type,total_installments,basic_value,pure_installment,cuota_1_value,upfront_stamp_value,base_surcharge,sort_order) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`, [version.rows[0].id, item.sourceKey, item.model, item.planType, item.totalInstallments, item.basicValue, item.pureInstallment, item.cuota1Value, upfrontStamp, base, sortOrder]);
        for (const [segmentOrder, segment] of item.segments.entries()) {
          if (!numberValue(segment.from) || !numberValue(segment.to) || numberValue(segment.quotaValue) === null) throw new Error('El Excel contiene un tramo inválido.');
          await db.query(`insert into public.price_list_installment_segments(price_list_item_id,installment_from,installment_to,quota_value,sort_order) values($1,$2,$3,$4,$5)`, [saved.rows[0].id, segment.from, segment.to, segment.quotaValue, segmentOrder]);
        }
      }
    } else if (action === 'archive') {
      if (!profile.can_manage_price_lists) throw new Error('No tenés permiso para retirar listas de precios.');
      const archived = await db.query(`update public.price_list_versions set status='archived',archived_at=now() where id=$1 and status <> 'archived' returning id`, [versionId]);
      if (!archived.rowCount) throw new Error('La lista ya fue retirada o no existe.');
    } else if (action === 'save_official_values') {
      if (!profile.can_manage_price_lists) throw new Error('No tenés permiso para editar listas de precios.');
      const updates = (body as { items?: unknown }).items;
      if (!Array.isArray(updates) || updates.length === 0 || updates.length > 300) throw new Error('Los valores de la lista no tienen un formato válido.');
      for (const entry of updates as Array<{ item_id?: unknown; basic_value?: unknown; pure_installment?: unknown; cuota_1_value?: unknown; upfront_stamp_value?: unknown; delivery_terms?: unknown; segments?: Array<{ id?: unknown; quota_value?: unknown }> }>) {
        const values = [entry.basic_value, entry.pure_installment, entry.cuota_1_value, entry.upfront_stamp_value].map(numberValue);
        if (!isUuid(entry.item_id) || values.some(value => value === null || value < 0) || !Array.isArray(entry.segments)) throw new Error('Hay un modelo con valores inválidos.');
        const saved = await db.query(`update public.price_list_items set basic_value=$1,pure_installment=$2,cuota_1_value=$3,upfront_stamp_value=$4,delivery_terms=$5 where id=$6 and price_list_version_id=$7 returning id`, [...values, typeof entry.delivery_terms === 'string' ? entry.delivery_terms || null : null, entry.item_id, versionId]);
        if (!saved.rowCount) throw new Error('Uno de los modelos no pertenece a esta lista.');
        for (const segment of entry.segments) {
          const quota = numberValue(segment.quota_value);
          if (!isUuid(segment.id) || quota === null || quota < 0) throw new Error('Hay una cuota inválida.');
          const updated = await db.query(`update public.price_list_installment_segments set quota_value=$1 where id=$2 and price_list_item_id=$3`, [quota, segment.id, entry.item_id]);
          if (!updated.rowCount) throw new Error('Uno de los tramos no pertenece al modelo.');
        }
      }
    } else if (action === 'publish') {
      if (!profile.can_manage_price_lists) throw new Error('No tenés permiso para publicar listas de precios.');
      await db.query('select public.publish_price_list_to_managers($1::uuid)', [versionId]);
    } else {
      if (profile.role !== 'gerente' || !profile.staff_member_id) throw new Error('Sólo Gerencia puede confirmar sobrepautas.');
      const confirmation = await db.query<{ id: string }>(`
        select confirmation.id from public.price_list_structure_confirmations confirmation
        join public.price_list_versions version on version.id=confirmation.price_list_version_id
        where confirmation.price_list_version_id=$1 and confirmation.manager_staff_id=$2
          and confirmation.status in ('pending','confirmed') and version.status='published_to_managers'
      `, [versionId, profile.staff_member_id]);
      if (!confirmation.rows[0]) throw new Error('No hay una lista pendiente para tu estructura.');

      if (action === 'save_surcharges') {
        if (!Array.isArray(body.surcharges) || body.surcharges.length === 0 || body.surcharges.length > 300) throw new Error('Las sobrepautas no tienen un formato válido.');
        for (const entry of body.surcharges as Array<{ item_id?: unknown; surcharge_amount?: unknown }>) {
          if (!isUuid(entry.item_id) || numberValue(entry.surcharge_amount) === null) throw new Error('Hay una sobrepauta inválida.');
          const saved = await db.query(`
            update public.price_list_item_surcharges surcharge
               set surcharge_amount=$1,carried_from_previous=false,updated_by=$2
              from public.price_list_items item
             where surcharge.confirmation_id=$3 and surcharge.price_list_item_id=$4 and item.id=surcharge.price_list_item_id
               and $1 >= surcharge.surcharge_amount and $1 >= item.base_surcharge
             returning surcharge.id
          `, [entry.surcharge_amount, userId, confirmation.rows[0].id, entry.item_id]);
          if (!saved.rowCount) throw new Error('Uno de los modelos no pertenece a tu lista pendiente.');
        }
      } else if (action === 'confirm') {
        await db.query('select public.confirm_price_list_for_my_structure($1::uuid)', [versionId]);
      } else {
        throw new Error('Acción no válida.');
      }
    }
    await db.query('commit');
    return response.status(200).json({ success: true });
  } catch (error) {
    await db.query('rollback');
    return response.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No se pudo procesar la lista.' });
  } finally {
    db.release();
  }
}
