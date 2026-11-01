import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, RefreshCw, Send, Tag, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { getSupabaseClient } from '../../auth/supabase';
import { formatARS } from '../../utils/businessLogic';
import { groupInstallmentSegments } from '../../services/prices/priceListDomain';
import { parseRenaultWorkbook } from '../../services/prices/renaultWorkbook';
import { confirmPriceList, createRenaultDraft, getPriceLists, publishPriceList, saveSurcharges, type PriceListConfirmation, type PriceListItemView, type PriceListScope, type PriceListSegmentView, type PriceListVersion } from '../../services/prices/priceListsApi';

type LoadedData = {
  scope: PriceListScope;
  versions: PriceListVersion[];
  confirmations: PriceListConfirmation[];
  items: PriceListItemView[];
  segments: PriceListSegmentView[];
};

const rangeLabel = (from: number, to: number) => from === to ? `Cuota ${from}` : `Cuotas ${from} a ${to}`;
const optionVersionId = (option: PriceListVersion | PriceListConfirmation) => 'price_list_version_id' in option ? option.price_list_version_id : option.id;

export const PriceListModule: React.FC = () => {
  const { session } = useAuth();
  const [data, setData] = useState<LoadedData | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [surcharges, setSurcharges] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renaultFile, setRenaultFile] = useState<File | null>(null);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [baseSurcharge, setBaseSurcharge] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await getPriceLists(session.access_token);
      const next: LoadedData = {
        scope: response.scope || 'supervisor', versions: response.versions || [], confirmations: response.confirmations || [],
        items: response.items || [], segments: response.segments || [],
      };
      const options = next.scope === 'manage' ? next.versions : next.confirmations;
      setData(next);
      setSelectedVersionId(current => options.some(option => optionVersionId(option) === current)
        ? current : (options[0] ? optionVersionId(options[0]) : ''));
      setSurcharges(Object.fromEntries(next.items.map(item => [item.id, String(item.surcharge_amount ?? '')])));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las listas.');
    } finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const selectedItems = useMemo(() => data?.items.filter(item => item.price_list_version_id === selectedVersionId) || [], [data, selectedVersionId]);
  const displaySegments = useMemo(() => new Map(selectedItems.map(item => [item.id, groupInstallmentSegments(
    (data?.segments || []).filter(segment => segment.price_list_item_id === item.id).map(segment => ({
      from: segment.installment_from, to: segment.installment_to, quotaValue: Number(segment.total_value),
    })),
  )])), [data?.segments, selectedItems]);
  const columns = useMemo(() => [...new Map([...displaySegments.values()].flat().map(segment => [`${segment.from}-${segment.to}`, segment])).values()], [displaySegments]);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try { await action(); setMessage(success); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el cambio.'); }
    finally { setSaving(false); }
  };

  const importRenault = async () => {
    if (!session || !renaultFile || !effectiveDate || Number(baseSurcharge) <= 0) return setMessage('Seleccioná el Excel, su vigencia y una sobrepauta base mayor que cero.');
    setSaving(true);
    try {
      const items = parseRenaultWorkbook(await renaultFile.arrayBuffer());
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('No se pudo conectar al almacenamiento seguro.');
      const path = `price-lists/renault/${Date.now()}-${renaultFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const upload = await supabase.storage.from('commercial-documents').upload(path, renaultFile, { contentType: renaultFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
      if (upload.error) throw upload.error;
      await createRenaultDraft(session.access_token, { name: `Lista Renault ${effectiveDate}`, effective_date: effectiveDate, base_surcharge: Number(baseSurcharge), document: { filename: renaultFile.name, path, mime_type: renaultFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', byte_size: renaultFile.size }, items });
      setRenaultFile(null); setBaseSurcharge(''); setMessage('Borrador Renault creado para revisión.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo importar el Excel Renault.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">Cargando listas de precios…</div>;
  if (!data) return <div className="py-16 text-center text-sm text-rose-300">{message || 'No se pudo cargar el módulo.'}</div>;

  const options = data.scope === 'manage' ? data.versions : data.confirmations;
  const isManage = data.scope === 'manage';
  const selectedConfirmation = data.confirmations.find(item => item.price_list_version_id === selectedVersionId);
  const managerPending = data.scope === 'manager' && selectedConfirmation?.status === 'pending';
  const selectedVersion = data.versions.find(item => item.id === selectedVersionId);

  return <div className="space-y-5">
    <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400"><Tag className="h-4 w-4" />Listas de precios</div>
        <h2 className="mt-1 text-xl font-bold text-white">{isManage ? 'Circulares y publicación comercial' : data.scope === 'manager' ? 'Confirmación por estructura' : 'Lista de precios vigente'}</h2>
        <p className="mt-1 text-xs text-slate-400">{isManage ? 'La lista se publica primero para Gerencia.' : data.scope === 'manager' ? 'Confirmá los valores para habilitarlos a tus supervisores.' : 'Valores vigentes para tu estructura comercial.'}</p>
      </div>
      <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"><RefreshCw className="h-3.5 w-3.5" />Actualizar</button>
    </section>

    {message && <div className={`rounded-lg border px-4 py-3 text-sm ${/guardad|confirmad|publicad/i.test(message) ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200' : 'border-amber-700/60 bg-amber-950/40 text-amber-200'}`}>{message}</div>}

    {isManage && <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h3 className="font-semibold text-slate-100">Crear borrador Renault</h3><div className="mt-3 grid gap-3 md:grid-cols-4"><input type="file" accept=".xlsx" onChange={event => setRenaultFile(event.target.files?.[0] || null)} className="text-xs text-slate-300" /><input type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} className="rounded bg-slate-950 px-3 py-2 text-xs text-white" /><input type="number" min="1" placeholder="Sobrepauta base" value={baseSurcharge} onChange={event => setBaseSurcharge(event.target.value)} className="rounded bg-slate-950 px-3 py-2 text-xs text-white" /><button disabled={saving} onClick={() => void importRenault()} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Importar Excel Renault</button></div></section>}

    {!options.length ? <section className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-16 text-center">
      <FileText className="mx-auto mb-3 h-9 w-9 text-slate-600" />
      <h3 className="font-semibold text-slate-200">{isManage ? 'No hay circulares cargadas' : 'No hay listas disponibles para tu estructura'}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">{isManage ? 'La carga de circulares se incorpora en el siguiente paso del módulo.' : 'La lista aparecerá cuando Gerencia confirme la publicación para tu estructura.'}</p>
    </section> : <>
      <div className="flex gap-2 overflow-x-auto pb-1">{options.map(option => {
        const versionId = optionVersionId(option);
        return <button key={option.id} onClick={() => setSelectedVersionId(versionId)} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold ${selectedVersionId === versionId ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>{option.brand} · {option.effective_date}</button>;
      })}</div>

      {isManage && selectedVersion?.status === 'draft' && <div className="flex justify-end"><button disabled={saving} onClick={() => void runAction(() => publishPriceList(session!.access_token, selectedVersionId), 'Lista publicada para Gerencia.')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"><Send className="h-3.5 w-3.5" />Publicar para Gerencia</button></div>}

      {managerPending && <section className="rounded-xl border border-blue-800/70 bg-blue-950/30 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 font-semibold text-blue-100"><Users className="h-4 w-4" />Confirmación requerida</div><p className="mt-1 text-xs text-blue-200/75">¿Confirmás los valores de sobrepauta establecidos en el tramo anterior? Podés conservarlos, aplicar un valor único o editar cada modelo.</p></div>
          <div className="flex flex-wrap gap-2"><button disabled={saving} onClick={() => { const value = window.prompt('Sobrepauta para todos los modelos de esta marca'); if (value !== null) setSurcharges(Object.fromEntries(selectedItems.map(item => [item.id, value]))); }} className="rounded-lg border border-blue-700 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-900/50">Aplicar a todos</button>
          <button disabled={saving} onClick={() => void runAction(() => saveSurcharges(session!.access_token, selectedVersionId, selectedItems.map(item => ({ item_id: item.id, surcharge_amount: Number(surcharges[item.id]) }))), 'Sobrepautas guardadas.')} className="rounded-lg border border-blue-700 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-900/50">Guardar</button>
          <button disabled={saving} onClick={() => void runAction(() => confirmPriceList(session!.access_token, selectedVersionId), 'Lista confirmada para tus supervisores.')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500">Confirmar</button></div></div>
      </section>}

      <section className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900"><table className="min-w-full text-left text-xs">
        <thead className="border-b border-slate-800 bg-slate-950/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><tr>
          <th className="px-4 py-3">Modelo</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3 text-center">Cuotas</th><th className="px-4 py-3 text-right">Valor básico</th><th className="px-4 py-3 text-right">Cuota pura</th>
          {data.scope !== 'supervisor' && <th className="px-4 py-3 text-right">Cuota 1</th>}{data.scope !== 'supervisor' && <th className="px-4 py-3 text-right">Sobrepauta</th>}<th className="px-4 py-3 text-right">Suscripción</th>
          {columns.map(column => <th key={`${column.from}-${column.to}`} className="whitespace-nowrap px-4 py-3 text-right">{rangeLabel(column.from, column.to)}</th>)}<th className="px-4 py-3">Entregas pactadas</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-800/80">{selectedItems.map(item => {
          const itemSegments = displaySegments.get(item.id) || [];
          return <tr key={item.id} className="hover:bg-slate-800/40"><td className="px-4 py-3 font-semibold text-white">{item.model}</td><td className="px-4 py-3 text-slate-300">{item.plan_type}</td><td className="px-4 py-3 text-center font-mono text-slate-300">{item.total_installments}</td><td className="px-4 py-3 text-right font-mono text-slate-200">{formatARS(Number(item.basic_value))}</td><td className="px-4 py-3 text-right font-mono text-slate-200">{formatARS(Number(item.pure_installment))}</td>
            {data.scope !== 'supervisor' && <td className="px-4 py-3 text-right font-mono text-slate-200">{formatARS(Number(item.cuota_1_value))}</td>}
            {data.scope !== 'supervisor' && <td className="px-4 py-3 text-right">{managerPending ? <input type="number" min={item.base_surcharge} value={surcharges[item.id] ?? ''} onChange={event => setSurcharges(current => ({ ...current, [item.id]: event.target.value }))} className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-slate-100 focus:border-blue-500 focus:outline-none" /> : <span className="font-mono text-emerald-300">{formatARS(Number(item.surcharge_amount ?? item.base_surcharge))}</span>}</td>}
            <td className="px-4 py-3 text-right font-mono font-bold text-blue-300">{formatARS(Number(item.subscription_value))}</td>
            {columns.map(column => { const segment = itemSegments.find(entry => entry.from <= column.from && entry.to >= column.to); return <td key={`${item.id}-${column.from}`} className="px-4 py-3 text-right font-mono text-slate-200">{segment ? formatARS(segment.displayValue) : '—'}</td>; })}
            <td className="max-w-56 px-4 py-3 text-slate-300">{item.delivery_terms || '—'}</td></tr>;
        })}</tbody>
      </table></section>
      {data.scope === 'manager' && selectedConfirmation?.status === 'confirmed' && <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Lista confirmada para tu estructura.</div>}
    </>}
  </div>;
};
