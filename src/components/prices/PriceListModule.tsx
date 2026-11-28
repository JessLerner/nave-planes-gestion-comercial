import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Download, FileText, FileUp, Pencil, Printer, RefreshCw, Send, Tag, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { getSupabaseClient } from '../../auth/supabase';
import { formatARS } from '../../utils/businessLogic';
import { installmentBucketValues, installmentColumns } from '../../services/prices/priceListPresentation';
import { parseRenaultWorkbook } from '../../services/prices/renaultWorkbook';
import { parseMgCircular } from '../../services/prices/mgCircular';
import { parseAssistedWorkbook } from '../../services/prices/assistedWorkbook';
import { archivePriceList, confirmPriceList, createAssistedDraft, createMgDraft, createRenaultDraft, getBnaRate, getPriceLists, publishPriceList, saveOfficialValues, saveSubscriptions, type PriceListConfirmation, type PriceListItemView, type PriceListScope, type PriceListSegmentView, type PriceListVersion } from '../../services/prices/priceListsApi';
import { exportPriceListXlsx, printPriceListPdf } from '../../services/prices/priceListExport';

type LoadedData = {
  scope: PriceListScope;
  versions: PriceListVersion[];
  confirmations: PriceListConfirmation[];
  items: PriceListItemView[];
  segments: PriceListSegmentView[];
};

const rangeLabel = (from: number, to: number) => from === to ? `Cuota ${from}` : `Cuotas ${from} a ${to}`;
const optionVersionId = (option: PriceListVersion | PriceListConfirmation) => 'price_list_version_id' in option ? option.price_list_version_id : option.id;
const PRICE_LIST_BRANDS = ['Renault', 'Peugeot', 'Citroën', 'Fiat', 'Jeep/RAM', 'MG', 'Leapmotor'];
const moneyInput = (value: string) => value ? `$ ${Number(value.replace(/\D/g, '') || 0).toLocaleString('es-AR')}` : '';
const moneyDigits = (value: string) => value.replace(/\D/g, '');
const CurrencyInput: React.FC<{ value: string; onChange: (value: string) => void; placeholder?: string; className?: string }> = ({ value, onChange, placeholder, className }) => <input type="text" inputMode="numeric" value={moneyInput(value)} placeholder={placeholder} onChange={event => onChange(moneyDigits(event.target.value))} className={className} />;

export const PriceListModule: React.FC = () => {
  const { session } = useAuth();
  const [data, setData] = useState<LoadedData | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [subscriptions, setSubscriptions] = useState<Record<string, { normal1: string; normal3: string; ultra: string }>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renaultFile, setRenaultFile] = useState<File | null>(null);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [baseSurcharge, setBaseSurcharge] = useState('');
  const [editingOfficialValues, setEditingOfficialValues] = useState(false);
  const [officialValues, setOfficialValues] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [historyMonth, setHistoryMonth] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('Renault');
  const [mgFiles, setMgFiles] = useState<File[]>([]);
  const [mgRate, setMgRate] = useState('');
  const [mgRateSource, setMgRateSource] = useState('Manual');
  const [assistedFiles, setAssistedFiles] = useState<File[]>([]);
  const [assistedMapping, setAssistedMapping] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await getPriceLists(session.access_token);
      const next: LoadedData = {
        scope: response.scope || 'supervisor', versions: response.versions || [], confirmations: response.confirmations || [],
        items: response.items || [], segments: response.segments || [],
      };
      const options = next.scope === 'manage' ? next.versions.filter(version => version.status !== 'archived') : next.confirmations;
      setData(next);
      setSelectedVersionId(current => options.some(option => optionVersionId(option) === current)
        ? current : (options.find(option => option.brand === selectedBrand) ? optionVersionId(options.find(option => option.brand === selectedBrand)!) : (options[0] ? optionVersionId(options[0]) : '')));
      setSubscriptions(Object.fromEntries(next.items.map(item => [item.id, { normal1: String(item.normal_1 ?? item.subscription_normal_1 ?? ''), normal3: String(item.normal_3 ?? item.subscription_normal_3 ?? ''), ultra: String(item.ultra ?? item.subscription_ultra ?? '') }])));
      setOfficialValues(Object.fromEntries(next.items.flatMap(item => [
        [`${item.id}:basic`, String(item.basic_value)], [`${item.id}:pure`, String(item.pure_installment)], [`${item.id}:c0`, String(item.upfront_stamp_value ?? 0)], [`${item.id}:c1`, String(item.cuota_1_value ?? 0)], [`${item.id}:n1`, String(item.subscription_normal_1 ?? '')], [`${item.id}:n3`, String(item.subscription_normal_3 ?? '')], [`${item.id}:ultra`, String(item.subscription_ultra ?? '')], [`${item.id}:delivery`, item.delivery_terms || ''],
      ]).concat(next.segments.flatMap(segment => [[`${segment.id}:quota`, String(segment.total_value)]]))));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las listas.');
    } finally { setLoading(false); }
  }, [selectedBrand, session]);

  useEffect(() => { void load(); }, [load]);

  const selectedItems = useMemo(() => data?.items.filter(item => item.price_list_version_id === selectedVersionId) || [], [data, selectedVersionId]);
  const displaySegments = useMemo(() => new Map(selectedItems.map(item => [item.id, installmentBucketValues(
    (data?.segments || []).filter(segment => segment.price_list_item_id === item.id).map(segment => ({
      from: segment.installment_from, to: segment.installment_to, quotaValue: Number(segment.total_value),
    })), item.total_installments,
  )])), [data?.segments, selectedItems]);
  const installmentHeaders = useMemo(() => installmentColumns(selectedItems.map(item => ({
    totalInstallments: item.total_installments,
    segments: (data?.segments || []).filter(segment => segment.price_list_item_id === item.id).map(segment => ({ from: segment.installment_from, to: segment.installment_to, quotaValue: Number(segment.total_value) })),
  }))), [data?.segments, selectedItems]);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try { await action(); setMessage(success); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el cambio.'); }
    finally { setSaving(false); }
  };

  const importRenault = async () => {
    if (!session || !renaultFile || !effectiveDate || Number(moneyDigits(baseSurcharge)) <= 0) return setMessage('Seleccioná el Excel, su vigencia y una sobrepauta base mayor que cero.');
    setSaving(true);
    try {
      const items = parseRenaultWorkbook(await renaultFile.arrayBuffer());
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('No se pudo conectar al almacenamiento seguro.');
      const path = `price-lists/renault/${Date.now()}-${renaultFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const upload = await supabase.storage.from('commercial-documents').upload(path, renaultFile, { contentType: renaultFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
      if (upload.error) throw upload.error;
      await createRenaultDraft(session.access_token, { name: `Lista Renault ${effectiveDate}`, effective_date: effectiveDate, base_surcharge: Number(moneyDigits(baseSurcharge)), document: { filename: renaultFile.name, path, mime_type: renaultFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', byte_size: renaultFile.size }, items });
      setRenaultFile(null); setBaseSurcharge(''); setMessage('Borrador Renault creado para revisión.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo importar el Excel Renault.'); }
    finally { setSaving(false); }
  };
  const importMg = async () => {
    if (!session || !mgFiles.length || !effectiveDate || Number(moneyDigits(baseSurcharge)) <= 0 || Number(mgRate) <= 0) return setMessage('Seleccioná los PDFs MG, vigencia, sobrepauta y cotización.');
    setSaving(true); try { const parsed = await Promise.all(mgFiles.map(async file => ({ file, items: await parseMgCircular(await file.arrayBuffer()).catch(() => null) }))); const source = parsed.find(candidate => candidate.items); if (!source?.items) throw new Error('No se encontró la circular MG con la tabla de valores.'); const supabase = await getSupabaseClient(); if (!supabase) throw new Error('No se pudo conectar al almacenamiento seguro.'); const documents = await Promise.all(mgFiles.map(async file => { const path = `price-lists/mg/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`; const upload = await supabase.storage.from('commercial-documents').upload(path, file, { contentType: 'application/pdf', upsert: false }); if (upload.error) throw upload.error; return { filename: file.name, path, mime_type: 'application/pdf', byte_size: file.size }; })); await createMgDraft(session.access_token, { name: `Lista MG ${effectiveDate}`, effective_date: effectiveDate, base_surcharge: Number(moneyDigits(baseSurcharge)), exchange_rate: Number(mgRate), exchange_rate_source: mgRateSource, document: documents[0], documents, items: source.items }); setMessage('Borrador MG creado en pesos para revisión.'); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo importar MG.'); } finally { setSaving(false); }
  };
  const importAssisted = async () => {
    if (!session || !assistedFiles.length || !assistedMapping || !effectiveDate || Number(moneyDigits(baseSurcharge)) <= 0) return setMessage('Adjuntá las circulares oficiales, el Excel de carga, la vigencia y una sobrepauta base mayor que cero.');
    setSaving(true);
    try {
      const items = parseAssistedWorkbook(await assistedMapping.arrayBuffer());
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('No se pudo conectar al almacenamiento seguro.');
      const documents = await Promise.all(assistedFiles.map(async file => {
        const path = `price-lists/${selectedBrand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const upload = await supabase.storage.from('commercial-documents').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (upload.error) throw upload.error;
        return { filename: file.name, path, mime_type: file.type || 'application/octet-stream', byte_size: file.size };
      }));
      await createAssistedDraft(session.access_token, { brand: selectedBrand, name: `Lista ${selectedBrand} ${effectiveDate}`, effective_date: effectiveDate, base_surcharge: Number(moneyDigits(baseSurcharge)), document: documents[0], documents, items });
      setAssistedFiles([]); setAssistedMapping(null); setBaseSurcharge(''); setMessage('Borrador creado con circulares asociadas. Revisá cada valor antes de publicarlo.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear el borrador asistido.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">Cargando listas de precios…</div>;
  if (!data) return <div className="py-16 text-center text-sm text-rose-300">{message || 'No se pudo cargar el módulo.'}</div>;

  const options = data.scope === 'manage' ? data.versions.filter(version => version.status !== 'archived') : data.confirmations;
  const visibleOptions = options.filter(option => option.brand === selectedBrand);
  const historyVersions = data.scope === 'manage' ? data.versions.filter(version => version.brand === selectedBrand && version.status === 'archived' && (!historyMonth || version.effective_date.startsWith(historyMonth))) : [];
  const isManage = data.scope === 'manage';
  const selectedConfirmation = data.confirmations.find(item => item.price_list_version_id === selectedVersionId);
  const managerPending = data.scope === 'manager' && selectedConfirmation?.status === 'pending';
  const selectedVersion = data.versions.find(item => item.id === selectedVersionId);
  const isRenault = (selectedVersion?.brand || selectedConfirmation?.brand) === 'Renault';
  const managerCanEdit = data.scope === 'manager' && Boolean(selectedConfirmation && ['pending', 'confirmed'].includes(selectedConfirmation.status));
  const exportOptions = selectedVersion || selectedConfirmation ? { brand: (selectedVersion || selectedConfirmation)!.brand, effectiveDate: (selectedVersion || selectedConfirmation)!.effective_date, items: selectedItems, segments: data.segments, includeCuota1: isManage } : null;
  const saveOfficial = () => runAction(() => saveOfficialValues(session!.access_token, selectedVersionId, selectedItems.map(item => ({
    item_id: item.id,
    basic_value: Number(officialValues[`${item.id}:basic`]), pure_installment: Number(officialValues[`${item.id}:pure`]), cuota_1_value: Number(officialValues[`${item.id}:c1`]), upfront_stamp_value: Number(officialValues[`${item.id}:c0`]), normal_1: Number(officialValues[`${item.id}:n1`]), normal_3: Number(officialValues[`${item.id}:n3`]), ultra: Number(officialValues[`${item.id}:ultra`]), delivery_terms: officialValues[`${item.id}:delivery`],
    segments: (data.segments || []).filter(segment => segment.price_list_item_id === item.id).map(segment => ({ id: segment.id, quota_value: Number(officialValues[`${segment.id}:quota`]) })),
  }))), 'Lista actualizada. Los nuevos importes ya están disponibles.');

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

    <section className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Elegí una marca</div><div className="flex gap-2 overflow-x-auto pb-1">{PRICE_LIST_BRANDS.map(brand => <button key={brand} onClick={() => { setSelectedBrand(brand); const first = options.find(option => option.brand === brand); setSelectedVersionId(first ? optionVersionId(first) : ''); }} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold ${selectedBrand === brand ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'}`}>{brand}</button>)}</div></section>
    {isManage && selectedBrand === 'Renault' && <section className="rounded-xl border border-blue-700/50 bg-gradient-to-br from-blue-950/50 to-slate-900 p-5"><div className="flex items-start gap-3"><div className="rounded-lg bg-blue-500/15 p-2 text-blue-300"><FileUp className="h-5 w-5" /></div><div><h3 className="font-semibold text-slate-100">Nueva lista Renault</h3><p className="mt-1 text-xs text-slate-400">Subí la circular Excel, elegí vigencia y definí la sobrepauta base para generar un borrador revisable.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-blue-400/70 bg-blue-500/10 px-3 text-xs font-semibold text-blue-100 hover:bg-blue-500/20"><FileUp className="h-4 w-4" /><span className="truncate">{renaultFile?.name || 'Seleccionar archivo Excel (.xlsx)'}</span><input type="file" accept=".xlsx" onChange={event => setRenaultFile(event.target.files?.[0] || null)} className="sr-only" /></label><input type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} aria-label="Vigencia" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" /><input type="number" min="1" placeholder="Sobrepauta base" value={baseSurcharge} onChange={event => setBaseSurcharge(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" /><button disabled={saving} onClick={() => void importRenault()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">Crear borrador</button></div></section>}
    {isManage && selectedBrand === 'MG' && <section className="rounded-xl border border-blue-700/50 bg-gradient-to-br from-blue-950/50 to-slate-900 p-5"><div className="flex items-start gap-3"><div className="rounded-lg bg-blue-500/15 p-2 text-blue-300"><FileUp className="h-5 w-5" /></div><div><h3 className="font-semibold text-slate-100">Nueva lista MG</h3><p className="mt-1 text-xs text-slate-400">Seleccioná las dos circulares: valores y adjudicación asegurada.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto]"><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-blue-400/70 bg-blue-500/10 px-3 text-xs font-semibold text-blue-100 hover:bg-blue-500/20"><FileUp className="h-4 w-4" /><span className="truncate">{mgFiles.length ? `${mgFiles.length} PDFs seleccionados` : 'Seleccionar circulares MG (.pdf)'}</span><input type="file" accept=".pdf" multiple onChange={event => setMgFiles(Array.from(event.target.files || []))} className="sr-only" /></label><input type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} className="rounded bg-slate-950 px-3 py-2 text-xs text-white"/><input type="number" min="1" value={baseSurcharge} placeholder="Sobrepauta base" onChange={event=>setBaseSurcharge(event.target.value)} className="rounded bg-slate-950 px-3 py-2 text-xs text-white"/><input type="number" value={mgRate} placeholder="Dólar vendedor" onChange={event=>{setMgRate(event.target.value);setMgRateSource('Manual')}} className="rounded bg-slate-950 px-3 py-2 text-xs text-white"/><button onClick={() => void runAction(async()=>{const rate=await getBnaRate(session!.access_token);setMgRate(String(rate.exchange_rate));setMgRateSource(rate.exchange_rate_source);},'Cotización BNA cargada.')} className="rounded border border-blue-700 px-3 py-2 text-xs text-blue-100">Traer BNA</button><button disabled={saving} onClick={()=>void importMg()} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Crear borrador</button></div></section>}
    {isManage && !['Renault', 'MG'].includes(selectedBrand) && <section className="rounded-xl border border-blue-700/50 bg-gradient-to-br from-blue-950/50 to-slate-900 p-5"><div className="flex items-start gap-3"><div className="rounded-lg bg-blue-500/15 p-2 text-blue-300"><FileUp className="h-5 w-5" /></div><div><h3 className="font-semibold text-slate-100">Borrador desde circular oficial</h3><p className="mt-1 text-xs text-slate-400">Adjuntá la circular y un Excel de carga revisado. No se calculan ni completan importes: cada valor debe copiarse de la fuente y se revisa antes de publicar.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto]"><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-blue-400/70 bg-blue-500/10 px-3 text-xs font-semibold text-blue-100 hover:bg-blue-500/20"><FileUp className="h-4 w-4" /><span className="truncate">{assistedFiles.length ? `${assistedFiles.length} circular(es) seleccionada(s)` : 'Seleccionar circular(es) oficial(es)'}</span><input type="file" accept=".pdf,.xlsx" multiple onChange={event => setAssistedFiles(Array.from(event.target.files || []))} className="sr-only" /></label><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-blue-400/70 bg-blue-500/10 px-3 text-xs font-semibold text-blue-100 hover:bg-blue-500/20"><FileText className="h-4 w-4" /><span className="truncate">{assistedMapping?.name || 'Excel de carga revisado (.xlsx)'}</span><input type="file" accept=".xlsx" onChange={event => setAssistedMapping(event.target.files?.[0] || null)} className="sr-only" /></label><input type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} className="rounded bg-slate-950 px-3 py-2 text-xs text-white"/><input type="number" min="1" value={baseSurcharge} placeholder="Sobrepauta base" onChange={event=>setBaseSurcharge(event.target.value)} className="rounded bg-slate-950 px-3 py-2 text-xs text-white"/><button disabled={saving} onClick={() => void importAssisted()} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Crear borrador</button></div><p className="mt-3 text-[11px] text-slate-400">Encabezados requeridos: Modelo, Tipo plan, Cuotas, Valor básico, Cuota pura, Cuota 1 y Tramos. Los tramos se cargan como <code>2-12: 123456; 13-84: 234567</code>; opcionales: Cuota 0 sellado y Entregas pactadas.</p></section>}


    {!visibleOptions.length ? <section className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-16 text-center">
      <FileText className="mx-auto mb-3 h-9 w-9 text-slate-600" />
      <h3 className="font-semibold text-slate-200">{isManage ? `No hay circulares ${selectedBrand} cargadas` : `No hay listas ${selectedBrand} disponibles para tu estructura`}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">{isManage ? 'Elegí otra marca o cargá una nueva circular cuando su importador esté disponible.' : 'La lista aparecerá cuando Gerencia confirme la publicación para tu estructura.'}</p>
    </section> : <>
      <div className="flex gap-2 overflow-x-auto pb-1">{visibleOptions.map(option => {
        const versionId = optionVersionId(option);
        return <button key={option.id} onClick={() => setSelectedVersionId(versionId)} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold ${selectedVersionId === versionId ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>{option.brand} · {option.effective_date}</button>;
      })}</div>
      {isManage && <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold text-slate-200">Historial de listas</div><p className="text-xs text-slate-400">Listas retiradas del circuito comercial.</p></div><div className="flex items-center gap-2"><input type="month" value={historyMonth} onChange={event => setHistoryMonth(event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" /><button onClick={() => setShowHistory(current => !current)} className="rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">{showHistory ? 'Ocultar' : 'Ver historial'}</button></div></div>{showHistory && <div className="mt-3 flex flex-wrap gap-2">{historyVersions.length ? historyVersions.map(version => <button key={version.id} onClick={() => setSelectedVersionId(version.id)} className={`rounded border px-3 py-2 text-xs ${selectedVersionId === version.id ? 'border-amber-500 bg-amber-500/15 text-amber-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>{version.brand} · {version.effective_date}</button>) : <span className="text-xs text-slate-500">No hay listas retiradas para ese período.</span>}</div>}</section>}

      <div className="flex flex-wrap justify-end gap-2">
        {exportOptions && <><button onClick={() => exportPriceListXlsx(exportOptions)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"><Download className="h-3.5 w-3.5" />Exportar XLSX</button><button onClick={() => printPriceListPdf(exportOptions)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"><Printer className="h-3.5 w-3.5" />Exportar PDF</button></>}
        {isManage && selectedVersion?.status !== 'archived' && <button disabled={saving} onClick={() => { if (window.confirm('La lista se retirará de Gerencia y Supervisión. El historial se conserva. ¿Continuar?')) void runAction(() => archivePriceList(session!.access_token, selectedVersionId), 'Lista retirada del circuito comercial.'); }} className="inline-flex items-center gap-2 rounded-lg border border-rose-800/80 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/40 disabled:opacity-50"><Archive className="h-3.5 w-3.5" />Retirar lista</button>}
        {isManage && selectedVersion?.status === 'draft' && <button disabled={saving} onClick={() => void runAction(() => publishPriceList(session!.access_token, selectedVersionId), 'Lista publicada para Gerencia.')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"><Send className="h-3.5 w-3.5" />Publicar para Gerencia</button>}
      </div>

      {managerCanEdit && <section className="rounded-xl border border-blue-800/70 bg-blue-950/30 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 font-semibold text-blue-100"><Users className="h-4 w-4" />Confirmación requerida</div><p className="mt-1 text-xs text-blue-200/75">Confirmá o modificá las tres suscripciones comerciales de tu estructura. No dependen de cuota 1.</p></div>
          <div className="flex flex-wrap gap-2"><button disabled={saving} onClick={() => void runAction(() => saveSubscriptions(session!.access_token, selectedVersionId, selectedItems.map(item => ({ item_id: item.id, normal_1: Number(subscriptions[item.id]?.normal1), normal_3: Number(subscriptions[item.id]?.normal3), ultra: Number(subscriptions[item.id]?.ultra) }))), 'Suscripciones guardadas.')} className="rounded-lg border border-blue-700 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-900/50">Guardar</button>
          {managerPending && <button disabled={saving} onClick={() => void runAction(() => confirmPriceList(session!.access_token, selectedVersionId), 'Lista confirmada para tus supervisores.')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500">Confirmar</button>}</div></div>
      </section>}

      <section className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900"><table className="min-w-full text-left text-xs">
        <thead className="border-b border-slate-800 bg-slate-950/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><tr>
          <th className="px-4 py-3">Modelo</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3 text-center">Cuotas</th><th className="px-4 py-3 text-right">Valor básico</th><th className="px-4 py-3 text-right">Cuota pura</th>{isRenault && <th className="px-4 py-3 text-right">Cuota 0 · Sellado</th>}
          {isManage && <th className="px-4 py-3 text-right">Cuota 1</th>}<th className="px-4 py-3 text-right">Normal 1</th><th className="px-4 py-3 text-right">Normal 3</th><th className="px-4 py-3 text-right">Ultra</th>
          {installmentHeaders.map(header => <th key={header.key} className="whitespace-nowrap px-4 py-3 text-right">{header.label}</th>)}<th className="px-4 py-3">Entregas pactadas</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-800/80">{selectedItems.map(item => {
          const itemSegments = displaySegments.get(item.id) || new Map<string, number | null>();
          const valuesByColumn = itemSegments;
          const commercial = subscriptions[item.id] || { normal1: String(item.normal_1 ?? item.subscription_normal_1 ?? ''), normal3: String(item.normal_3 ?? item.subscription_normal_3 ?? ''), ultra: String(item.ultra ?? item.subscription_ultra ?? '') };
          return <tr key={item.id} className="hover:bg-slate-800/40"><td className="px-4 py-3 font-semibold text-white">{item.model}</td><td className="px-4 py-3 text-slate-300">{item.plan_type}</td><td className="px-4 py-3 text-center font-mono text-slate-300">{item.total_installments}</td><td className="px-4 py-3 text-right font-mono text-slate-200">{formatARS(Number(item.basic_value))}</td><td className="px-4 py-3 text-right font-mono text-slate-200">{formatARS(Number(item.pure_installment))}</td>{isRenault && <td className="px-4 py-3 text-right font-mono font-semibold text-amber-200">{formatARS(Number(item.upfront_stamp_value || 0))}</td>}
            {isManage && <td className="px-4 py-3 text-right font-mono text-slate-200">{formatARS(Number(item.cuota_1_value))}</td>}
            {(['normal1', 'normal3', 'ultra'] as const).map(key => <td key={key} className="bg-yellow-300 px-4 py-3 text-right font-mono font-bold text-slate-950">{managerCanEdit ? <CurrencyInput value={commercial[key]} onChange={value => setSubscriptions(current => ({ ...current, [item.id]: { ...commercial, [key]: value } }))} className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-slate-100" /> : formatARS(Number(commercial[key]))}</td>)}
            {installmentHeaders.map(header => <td key={header.key} className="px-4 py-3 text-right font-mono text-slate-200">{valuesByColumn.get(header.key) !== null && valuesByColumn.get(header.key) !== undefined ? formatARS(valuesByColumn.get(header.key)!) : '—'}</td>)}
            <td className="max-w-56 px-4 py-3 text-slate-300">{item.delivery_terms || '—'}</td></tr>;
        })}</tbody>
      </table></section>
      {isManage && selectedVersion?.status === 'draft' && <section className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-4"><h3 className="font-semibold text-amber-100">Suscripciones comerciales base</h3><p className="mt-1 text-xs text-amber-200/75">Son importes manuales de la concesionaria; no se calculan desde cuota 1. Completá los tres antes de publicar.</p><div className="mt-3 space-y-2">{selectedItems.map(item => <div key={item.id} className="grid gap-2 rounded border border-slate-800 p-2 md:grid-cols-4"><span className="text-xs text-slate-200">{item.model} · {item.plan_type}</span>{([['n1','Normal 1'],['n3','Normal 3'],['ultra','Ultra']] as const).map(([field,label]) => <label key={field} className="text-[10px] text-slate-400">{label}<CurrencyInput value={officialValues[`${item.id}:${field}`] ?? ''} onChange={value => setOfficialValues(current => ({ ...current, [`${item.id}:${field}`]: value }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" /></label>)}</div>)}</div><button disabled={saving} onClick={() => void saveOfficial()} className="mt-3 rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Guardar suscripciones base</button></section>}
      {isManage && selectedVersion?.status !== 'archived' && <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-100">Edición posterior</h3><p className="mt-1 text-xs text-slate-400">Corregí importes oficiales y tramos. Los cambios se aplican a la lista publicada.</p></div><button onClick={() => setEditingOfficialValues(current => !current)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"><Pencil className="h-3.5 w-3.5" />{editingOfficialValues ? 'Cerrar' : 'Editar lista'}</button></div>{editingOfficialValues && <div className="mt-4 space-y-4">{selectedItems.map(item => <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><div className="mb-3 font-semibold text-sm text-white">{item.model} · {item.plan_type}</div><div className="grid gap-2 md:grid-cols-5">{[['basic','Valor básico'],['pure','Cuota pura'],['c0','Cuota 0'],['c1','Cuota 1'],['delivery','Entregas pactadas']].map(([field,label]) => <label key={field} className="text-[10px] uppercase tracking-wide text-slate-400">{label}{field === 'delivery' ? <input type="text" value={officialValues[`${item.id}:${field}`] ?? ''} onChange={event => setOfficialValues(current => ({ ...current, [`${item.id}:${field}`]: event.target.value }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs normal-case text-white" /> : <CurrencyInput value={officialValues[`${item.id}:${field}`] ?? ''} onChange={value => setOfficialValues(current => ({ ...current, [`${item.id}:${field}`]: value }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs normal-case text-white" />}</label>)}</div><div className="mt-3 grid gap-2 md:grid-cols-4">{(data.segments || []).filter(segment => segment.price_list_item_id === item.id).map(segment => <label key={segment.id} className="text-[10px] uppercase tracking-wide text-slate-400">{rangeLabel(segment.installment_from, segment.installment_to)}<CurrencyInput value={officialValues[`${segment.id}:quota`] ?? ''} onChange={value => setOfficialValues(current => ({ ...current, [`${segment.id}:quota`]: value }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" /></label>)}</div></div>)}<button disabled={saving} onClick={() => void saveOfficial()} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50">Guardar cambios oficiales</button></div>}</section>}
      {data.scope === 'manager' && selectedConfirmation?.status === 'confirmed' && <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Lista confirmada para tu estructura.</div>}
    </>}
  </div>;
};
