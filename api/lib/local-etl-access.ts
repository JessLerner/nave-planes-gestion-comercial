export type LocalEtlAuthorization = {
  status: 200 | 401 | 403 | 503;
  userId?: string;
  message?: string;
};

type ResolveUser = (token: string) => Promise<string | null>;
type ResolveOwner = (userId: string) => Promise<boolean | null>;

const bearerToken = (authorization: string | undefined) => {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
};

// The Express server is a local-only legacy surface. Its connector and
// extractor management routes must never infer authorization from the UI.
export async function authorizeLocalEtlAdmin(
  authorization: string | undefined,
  resolveUser: ResolveUser,
  resolveOwner: ResolveOwner,
): Promise<LocalEtlAuthorization> {
  const token = bearerToken(authorization);
  if (!token) return { status: 401, message: 'Sesión requerida para administrar ETL.' };

  const userId = await resolveUser(token);
  if (!userId) return { status: 401, message: 'Sesión no válida o vencida.' };

  const owner = await resolveOwner(userId);
  if (owner === null) return { status: 503, message: 'La autorización local de ETL no está configurada.' };
  if (owner !== true) return { status: 403, message: 'Sólo Administración General puede administrar ETL.' };

  return { status: 200, userId };
}
