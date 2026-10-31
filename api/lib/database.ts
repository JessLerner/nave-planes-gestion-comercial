import type { PoolConfig } from 'pg';

export function databasePoolConfig(rawConnectionString: string): PoolConfig {
  const connectionString = rawConnectionString
    .replace(/([?&])sslmode=[^&]*/i, '$1')
    .replace(/[?&]$/, '');

  // Hyperdrive exposes a local Postgres endpoint to the Worker. It rejects a
  // second SSL negotiation, while direct Supabase connections on Vercel need it.
  if (process.env.CLOUDFLARE_HYPERDRIVE === 'true') return { connectionString };
  return { connectionString, ssl: { rejectUnauthorized: false } };
}
