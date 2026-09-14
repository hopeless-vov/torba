import { supabase } from '@/api/supabase'
import type { PlatformCurrency } from '@/types/database'

// The currencies any company may use. Shared and append-only: a company adds
// a code the first time it needs one, and a code already there is left as it
// is (see 0020). Nothing is renamed or removed from the app.
export const platformCurrenciesApi = {
  list: async (): Promise<PlatformCurrency[]> => {
    const { data, error } = await supabase
      .from('platform_currencies')
      .select('*')
      .order('sort', { ascending: true })
      .order('code', { ascending: true })
    if (error) throw error
    return (data ?? []) as PlatformCurrency[]
  },

  ensure: async (code: string, symbol: string): Promise<PlatformCurrency> => {
    const { data, error } = await supabase.rpc('ensure_platform_currency', { p_code: code, p_symbol: symbol })
    if (error) throw error
    return data as PlatformCurrency
  },
}
