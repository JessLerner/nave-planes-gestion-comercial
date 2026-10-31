import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export function databasePoolConfig(rawConnectionString: string): PoolConfig {
  const connectionString = rawConnectionString
    .replace(/([?&])sslmode=[^&]*/i, '$1')
    .replace(/[?&]$/, '');

  // Hyperdrive exposes a local Postgres endpoint to the Worker. It rejects a
  // second SSL negotiation, while direct Supabase connections on Vercel need it.
  if (process.env.CLOUDFLARE_HYPERDRIVE === 'true') return { connectionString };
  return { connectionString, ssl: { rejectUnauthorized: false } };
}

class HyperdriveRequestDatabase {
  private config() {
    return databasePoolConfig(process.env.POSTGRES_URL || process.env.DATABASE_URL || '');
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
    const pool = new Pool(this.config());
    try {
      return await pool.query<T>(text, values);
    } finally {
      await pool.end();
    }
  }

  async connect(): Promise<PoolClient> {
    const pool = new Pool(this.config());
    const client = await pool.connect();
    const release = client.release.bind(client);
    let closed = false;
    client.release = (error?: Error | boolean) => {
      if (closed) return;
      closed = true;
      release(error);
      void pool.end();
    };
    return client;
  }
}

// Cloudflare may retain module scope between requests, but a Hyperdrive
// connection string is request-scoped. The facade creates and closes a native
// pg pool for each operation so a stale client cannot hang a later request.
export function databasePool(rawConnectionString: string): Pool {
  if (process.env.CLOUDFLARE_HYPERDRIVE === 'true') return new HyperdriveRequestDatabase() as unknown as Pool;
  return new Pool(databasePoolConfig(rawConnectionString));
}
