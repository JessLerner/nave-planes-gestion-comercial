const RESET_PASSWORD_PATH = '/restablecer-contrasena';

export function trustedInvitationRedirect(publicAppUrl: string | undefined): string | null {
  const value = publicAppUrl?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return `${url.origin}${RESET_PASSWORD_PATH}`;
  } catch {
    return null;
  }
}
