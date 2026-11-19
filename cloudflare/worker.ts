type LegacyRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type LegacyResponse = {
  status: (code: number) => LegacyResponse;
  json: (body: unknown) => LegacyResponse;
};

type LegacyHandler = (request: LegacyRequest, response: LegacyResponse) => unknown | Promise<unknown>;

type Environment = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  PUBLIC_APP_URL?: string;
};

const handlers: Record<string, () => Promise<{ default: unknown }>> = {
  '/api/fox-leads-import': () => import('../api/fox-leads-import'),
  '/api/fox-leads-metrics': () => import('../api/fox-leads-metrics'),
  '/api/fox-user-mappings': () => import('../api/fox-user-mappings'),
  '/api/hr-import': () => import('../api/hr-import'),
  '/api/access-users': () => import('../api/access-users'),
  '/api/incorporation-requests': () => import('../api/incorporation-requests'),
  '/api/incorporation-documents': () => import('../api/incorporation-documents'),
  '/api/incorporation-drafts': () => import('../api/incorporation-drafts'),
  '/api/incorporation-hr-direct': () => import('../api/incorporation-hr-direct'),
  '/api/incorporation-decisions': () => import('../api/incorporation-decisions'),
  '/api/staff-departure-notices': () => import('../api/staff-departure-notices'),
  '/api/staff-departure-documents': () => import('../api/staff-departure-documents'),
  '/api/staff-departure-decisions': () => import('../api/staff-departure-decisions'),
  '/api/operational-data': () => import('../api/operational-data'),
  '/api/operations': () => import('../api/operations'),
  '/api/price-lists': () => import('../api/price-lists'),
  '/api/public-config': () => import('../api/public-config'),
  '/api/resource-update': () => import('../api/resource-update'),
  '/api/resources-directory': () => import('../api/resources-directory'),
  '/api/session': () => import('../api/session'),
  '/api/wage-advances': () => import('../api/wage-advances'),
};

// These endpoints belong only to the local Express prototype. They must not
// fall through to the SPA in the deployed Worker, where a direct /api request
// could otherwise receive index.html and look like a valid integration.
function isLegacyLocalEtlPath(path: string) {
  return path === '/api/data'
    || path.startsWith('/api/data/')
    || path.startsWith('/api/connectors/')
    || ['/api/ingest', '/api/stream', '/api/records', '/api/sync-logs', '/api/stats', '/api/config', '/api/reset-demo', '/api/export'].includes(path);
}

function configureLegacyEnvironment(environment: Environment) {
  // The existing API modules create their pg pools on import. Setting these
  // values first lets them run unchanged while Hyperdrive keeps the direct
  // database credential outside the deployed Worker code.
  const connectionString = environment.HYPERDRIVE?.connectionString || environment.POSTGRES_URL || environment.DATABASE_URL;
  if (connectionString) {
    process.env.DATABASE_URL = connectionString;
    process.env.POSTGRES_URL = connectionString;
    process.env.CLOUDFLARE_HYPERDRIVE = environment.HYPERDRIVE?.connectionString ? 'true' : '';
  }
  if (environment.SUPABASE_URL) process.env.SUPABASE_URL = environment.SUPABASE_URL;
  const key = environment.SUPABASE_PUBLISHABLE_KEY || environment.SUPABASE_ANON_KEY;
  if (key) {
    process.env.SUPABASE_PUBLISHABLE_KEY = key;
    process.env.SUPABASE_ANON_KEY = environment.SUPABASE_ANON_KEY || key;
  }
  if (environment.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (environment.PUBLIC_APP_URL) process.env.PUBLIC_APP_URL = environment.PUBLIC_APP_URL;
}

async function bodyFor(request: Request) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return undefined;
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return undefined;
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function runLegacyHandler(request: Request, handler: LegacyHandler): Promise<Response> {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const headers = Object.fromEntries(request.headers.entries());
  const legacyRequest: LegacyRequest = { method: request.method, headers, query, body: await bodyFor(request) };
  let status = 200;
  let sent: Response | undefined;
  const response: LegacyResponse = {
    status(code) { status = code; return response; },
    json(body) {
      sent = new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
      return response;
    },
  };
  await handler(legacyRequest, response);
  return sent || new Response(JSON.stringify({ success: false, message: 'La API no emitió respuesta.' }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

async function assetOrSpa(request: Request, environment: Environment) {
  const asset = await environment.ASSETS.fetch(request);
  // Direct navigation can omit Accept: text/html (for example, embedded local
  // browsers). A non-API GET is still a SPA route and must receive index.html.
  if (asset.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
    return environment.ASSETS.fetch(new Request(new URL('/index.html', request.url), {
      method: request.method,
      headers: request.headers,
    }));
  }
  return asset;
}

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
    if (isLegacyLocalEtlPath(path)) {
      return Response.json({ success: false, message: 'Esta ruta ETL sólo existe en el entorno local aislado.' }, { status: 404 });
    }
    const loader = handlers[path];
    if (!loader) return assetOrSpa(request, environment);

    configureLegacyEnvironment(environment);
    if (!process.env.DATABASE_URL && path !== '/api/public-config') {
      return Response.json({ success: false, message: 'La conexión operativa no está configurada.' }, { status: 503 });
    }
    try {
      if (path !== '/api/session' && path !== '/api/public-config') {
        const { verifySupabaseAccessToken, getOperationalRole } = await import('../api/session');
        const actor = await verifySupabaseAccessToken({ headers: { authorization: request.headers.get('authorization') || '' } });
        if (!actor) return Response.json({ success: false }, { status: 401 });
        const { canUseOperationalEndpoint } = await import('../src/security/accountRoles');
        if (!canUseOperationalEndpoint(await getOperationalRole(actor.id), path)) {
          return Response.json({ success: false, message: 'Sin permiso para esta operación.' }, { status: 403 });
        }
      }
      const { default: handler } = await loader();
      return await runLegacyHandler(request, handler as LegacyHandler);
    } catch (error) {
      console.error(`Cloudflare API error at ${path}`, error);
      return Response.json({ success: false, message: 'No se pudo procesar la operación.' }, { status: 500 });
    }
  },
};
