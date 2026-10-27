type VercelRequest = { method?: string };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => VercelResponse };

// The URL and publishable/anon key are intended for browser use.  No service
// role key or database credential is ever returned from this endpoint.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Método no permitido.' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ message: 'Configuración pública no disponible.' });
  return res.status(200).json({ url, key });
}
