type VercelRequest = { headers?: Record<string, string | string[] | undefined> };

export type VerifiedIdentity = {
  id: string;
  email: string | null;
};

export async function verifySupabaseAccessToken(req: VercelRequest): Promise<VerifiedIdentity | null> {
  const authorization = req.headers?.authorization;
  const token = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!token?.startsWith('Bearer ')) return null;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: token, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string; email?: string };
  return user.id ? { id: user.id, email: user.email || null } : null;
}
