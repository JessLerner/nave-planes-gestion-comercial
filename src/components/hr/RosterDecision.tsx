import React, { useState } from 'react';
import type { PreviewItem } from '../../../api/lib/roster-preview';

export type Decision = 'pending' | 'apply' | 'keep' | 'hire' | 'terminate' | 'error';
export type Choice = { token: string; decision: Decision; date?: string; reason?: string };
const labels: Record<Decision,string> = {
  pending: 'Dejar pendiente', apply: 'Aplicar actualización propuesta', keep: 'Conservar información actual', hire: 'Aprobar incorporación',
  terminate: 'Confirmar baja laboral', error: 'Error administrativo · mantener activo',
};
export function RosterDecision({ item, group, confirm }: { item: PreviewItem; group: string; confirm: (choice: Choice) => Promise<void> }) {
  const [decision, choose] = useState<Decision | ''>('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  if (!item.token) return null;
  const options: Decision[] = group === 'Ausencias para revisión' ? ['terminate','error'] : group === 'Altas propuestas' ? ['hire'] : ['apply','keep'];
  async function submit() {
    if (!item.token || !decision || busy) return;
    setBusy(true);
    try {
      await confirm({ token:item.token, decision, ...(decision === 'terminate' ? { date, reason:reason.trim() } : {}) });
      setDone(decision !== 'pending'); setReview(false); choose(''); setMessage('Decisión registrada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo confirmar.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 space-y-2">
    {decision === 'hire' && <p>Se autorizará el expediente de alta directa del revisor para este DNI, cargo y supervisor. Debe tener los cinco documentos obligatorios.</p>}
    {!done && <><label>Decisión <select className="bg-slate-900" disabled={review} value={decision} onChange={e => {choose(e.target.value as Decision|'');setMessage('');}}>
      <option value="">Sin decisión</option><option value="pending">Dejar pendiente</option>{options.map(d=><option key={d} value={d}>{labels[d]}</option>)}
    </select></label>
    {decision === 'terminate' && <div className="flex flex-wrap gap-3"><label>Fecha efectiva <input type="date" disabled={review} value={date} onChange={e=>setDate(e.target.value)} /></label>
      <label>Motivo <input className="bg-slate-900" disabled={review} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} /></label></div>}
    {decision && (review ? <div><p>{labels[decision]} · {item.name}{decision==='terminate' && ' · '+date+' · '+reason}</p>
      <button disabled={busy} onClick={()=>void submit()}>Confirmar este registro</button> <button disabled={busy} onClick={()=>setReview(false)}>Volver</button></div>
      : <button disabled={decision==='terminate' && (!date || !reason.trim())} onClick={()=>setReview(true)}>Revisar decisión</button>)}</>}
    {message && <p role="status">{message}</p>}
  </div>;
}
