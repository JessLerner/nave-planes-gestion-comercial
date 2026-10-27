import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (client) return client;
  if (clientPromise) return clientPromise;
  clientPromise = fetch('/api/public-config')
    .then(async response => {
      if (!response.ok) return null;
      const config = await response.json() as { url?: string; key?: string };
      if (!config.url || !config.key) return null;
      client = createClient(config.url, config.key, {
      auth: {
        // Keep the session only for the lifetime of this browser tab. This
        // prevents a previously authenticated browser from bypassing the
        // password-recovery flow after the tab has been closed.
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      });
      return client;
    })
    .catch(() => null);
  return clientPromise;
}
