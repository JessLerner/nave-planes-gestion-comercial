import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';

type Sale = { id: string; external_id: string; operation_date: string; brand: string };
type Detail = Sale & { client_name: string; model: string | null; subscription_number: string | null };

function useSaleRead<T>(url: string, token: string) {
  const [result, setResult] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    const controller = new AbortController();
    setResult({});
    async function read() {
      try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(response.status === 404 ? 'Venta no disponible.' : payload.message || 'No se pudo consultar la selección.');
        if (!controller.signal.aborted) setResult({ data: payload.data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error instanceof Error ? error.message : 'Error de consulta.' });
      }
    }
    void read();
    return () => controller.abort();
  }, [url, token]);
  return result;
}

const endpoint = '/api/presentation-sales';
const sourceId = (sale: Sale) => sale.external_id.slice('app_control_operaciones:id_ventas:'.length);

function SaleDetail({ id, token }: { id: string; token: string }) {
  const { data, error } = useSaleRead<Detail>(endpoint + '?id=' + encodeURIComponent(id), token);
  if (!data) return <p role="status">{error || 'Cargando detalle…'}</p>;
  return <section aria-label="Detalle de la cantada" className="rounded border border-slate-700 p-4">
    <h3 className="font-semibold">Venta {sourceId(data)}</h3>
    <p>{data.operation_date.slice(0, 10)} · {data.brand}</p>
    <p>Cliente: {data.client_name}</p>
    {data.model && <p>Modelo: {data.model}</p>}
    {data.subscription_number && <p>Suscripción: {data.subscription_number}</p>}
  </section>;
}

export function SaleOptions({ rows, search, select }: { rows: Sale[]; search: string; select: (id: string) => void }) {
  const term = search.trim().toLocaleLowerCase();
  const matches = rows.filter(row => [sourceId(row), row.brand, row.operation_date.slice(0, 10)].some(value => value.toLocaleLowerCase().includes(term)));
  if (!rows.length) return <p role="status">No hay ventas cantadas elegibles en tu equipo.</p>;
  if (!matches.length) return <p role="status">Sin coincidencias para la búsqueda.</p>;
  return <ul className="max-h-72 overflow-y-auto divide-y divide-slate-700">{matches.map(row =>
    <li key={row.id}><button type="button" className="w-full p-2 text-left hover:bg-slate-800" onClick={() => select(row.id)}>
      {sourceId(row)} · {row.brand} · {row.operation_date.slice(0, 10)}
    </button></li>)}</ul>;
}

function Selector({ token }: { token: string }) {
  const { data, error } = useSaleRead<Sale[]>(endpoint, token);
  const [search, setSearch] = useState('');
  const [id, setId] = useState('');
  return <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm">
    <h2 className="font-semibold">Seleccionar venta cantada de Parte Diario</h2>
    <label className="block">Buscar por ID Venta, marca o fecha
      <input type="search" value={search} onChange={event => { setSearch(event.target.value); setId(''); }}
        className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" />
    </label>
    {data ? <SaleOptions rows={data} search={search} select={setId} /> : <p role="status">{error || 'Cargando ventas…'}</p>}
    {id && <SaleDetail key={id} id={id} token={token} />}
  </section>;
}

export function PresentationSaleSelector() {
  const { session } = useAuth();
  return session ? <Selector key={session.user.id} token={session.access_token} /> : null;
}
