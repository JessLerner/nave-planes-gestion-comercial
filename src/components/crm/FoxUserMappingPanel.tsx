import React, { useEffect, useState } from 'react';
import { Link2, LoaderCircle } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';

type FoxUser = { fox_user_key: string; fox_user_name: string; lead_count: number; suggested_seller_id?: string | null };
type Seller = { id: string; full_name: string; team_id: string | null };

export const FoxUserMappingPanel: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const { session } = useAuth();
  const [users, setUsers] = useState<FoxUser[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const draftKey = session?.user?.id ? `naveplan:fox-mappings:${session.user.id}` : null;
  const readDraft = () => {
    if (!draftKey) return {} as Record<string, string>;
    try { return JSON.parse(sessionStorage.getItem(draftKey) || '{}') as Record<string, string>; } catch { return {}; }
  };
  const saveDraft = (next: Record<string, string>) => {
    if (draftKey) sessionStorage.setItem(draftKey, JSON.stringify(next));
  };

  const headers = () => ({ Authorization: `Bearer ${session?.access_token || ''}` });
  const load = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await fetch('/api/fox-user-mappings', { headers: headers() });
      const payload = await response.json() as { success?: boolean; message?: string; unmappedUsers?: FoxUser[]; sellers?: Seller[] };
      if (!response.ok || !payload.success) throw new Error(payload.message || 'No se pudieron leer las asociaciones pendientes.');
      const pending = payload.unmappedUsers || [];
      setUsers(pending);
      setSellers(payload.sellers || []);
      const suggestions = Object.fromEntries(pending.filter((user) => user.suggested_seller_id).map((user) => [user.fox_user_key, user.suggested_seller_id as string]));
      setChoices((current) => ({ ...suggestions, ...readDraft(), ...current }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron leer las asociaciones pendientes.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [session]);
  const save = async () => {
    const mappings = Object.entries(choices).filter(([, sellerId]) => sellerId).map(([foxUserKey, sellerId]) => ({ foxUserKey, sellerId }));
    if (!mappings.length) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/fox-user-mappings', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings }) });
      const payload = await response.json() as { success?: boolean; message?: string; updated?: number };
      if (!response.ok || !payload.success) throw new Error(payload.message || 'No se pudieron guardar las asociaciones.');
      setMessage(`${mappings.length} usuarios asociados. ${payload.updated || 0} filas históricas actualizadas.`);
      if (draftKey) sessionStorage.removeItem(draftKey);
      setChoices({}); await load(); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron guardar las asociaciones.'); }
    finally { setSaving(false); }
  };

  if (loading) return <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">Cargando asociaciones de usuarios Fox…</section>;
  if (!users.length) return null;
  const suggestions = users.filter((user) => user.suggested_seller_id).length;
  return <section className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-sky-500/15 p-2 text-sky-300"><Link2 className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-white">Asociar usuarios de Fox a la nómina</h3><p className="mt-1 text-xs text-slate-400">Las coincidencias seguras se proponen automáticamente, ignorando orden, mayúsculas, tildes y nombres intermedios. Sólo quedan para revisión los casos ambiguos.</p></div></div>{suggestions > 0 && <p className="mt-3 text-xs text-emerald-300">{suggestions} asociación(es) segura(s) ya seleccionada(s).</p>}<div className="mt-4 max-h-80 overflow-auto rounded border border-slate-800"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-950 text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="p-2.5">Usuario Fox</th><th className="p-2.5 text-right">Leads</th><th className="p-2.5">Recurso Nave.Plan</th></tr></thead><tbody className="divide-y divide-slate-800">{users.map(user => <tr key={user.fox_user_key}><td className="p-2.5 text-slate-200">{user.fox_user_name}</td><td className="p-2.5 text-right font-mono text-slate-400">{user.lead_count.toLocaleString('es-AR')}</td><td className="p-2.5"><select value={choices[user.fox_user_key] || ''} onChange={event => setChoices(current => { const next = { ...current, [user.fox_user_key]: event.target.value }; saveDraft(next); return next; })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"><option value="">Sin asociar</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.full_name}</option>)}</select></td></tr>)}</tbody></table></div>{message && <p className="mt-3 text-xs text-slate-300">{message}</p>}<div className="mt-3 flex justify-end"><button type="button" disabled={saving || !Object.values(choices).some(Boolean)} onClick={() => void save()} className="inline-flex items-center gap-2 rounded bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50">{saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}{suggestions ? 'Confirmar asociaciones seguras' : 'Guardar asociaciones seleccionadas'}</button></div></section>;
};
