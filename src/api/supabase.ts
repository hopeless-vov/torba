import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // Surfaced early in dev so a missing .env is obvious rather than a
  // cryptic runtime failure on the first query.
  console.warn('[torba] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Copy .env.example to .env.')
}

// Fall back to harmless placeholders so importing this module never throws
// when the env is absent (CI, unit tests, first checkout). Real requests
// still require valid credentials in .env.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
