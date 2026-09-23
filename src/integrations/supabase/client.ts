import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { demoClient } from './demo-client';

/**
 * Two backends, one interface:
 *  - Real Supabase when SUPABASE_URL / publishable key are configured.
 *  - A fully local demo backend (JSON file store + LMSR engine in
 *    src/lib/server/demo/*) when they are not — zero external services.
 */
export const isDemoMode =
  !import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function createSupabaseClient(): SupabaseClient<Database> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env file (or leave them unset to run in local demo mode).'
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _real: SupabaseClient<Database> | undefined;

function getClient(): SupabaseClient<Database> {
  if (isDemoMode) return demoClient as SupabaseClient<Database>;
  if (!_real) _real = createSupabaseClient();
  return _real;
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
