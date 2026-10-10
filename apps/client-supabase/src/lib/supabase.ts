import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Browser-only Supabase client. This application must use a dedicated
 * Supabase project; never place a service-role key in VITE_* variables.
 */
export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para conectar este ambiente.');
  }
  return supabase;
}
