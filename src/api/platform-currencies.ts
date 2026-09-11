import { supabase } from '@/api/supabase'
import type { PlatformCurrency } from '@/types/database'

// The currencies a company may choose from. The platform keeps this list;
// from the app it can only be read (see 0019).
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
}
