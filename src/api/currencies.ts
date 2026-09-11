import { supabase } from '@/api/supabase'
import type { Currency, NewCurrency } from '@/types/database'

// The platform currencies a company uses besides its base. There is no rate
// here: what a currency is worth depends on the supplier (supplier-rates).
export const currenciesApi = {
  list: async (companyId: string): Promise<Currency[]> => {
    const { data, error } = await supabase
      .from('currencies')
      .select('*')
      .eq('company_id', companyId)
      .order('code', { ascending: true })
    if (error) throw error
    return (data ?? []) as Currency[]
  },

  create: async (currency: NewCurrency): Promise<Currency> => {
    const { data, error } = await supabase.from('currencies').insert(currency).select('*').single()
    if (error) throw error
    return data as Currency
  },

  // Its supplier rates go with it — a trigger drops them (see 0019).
  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('currencies').delete().eq('id', id)
    if (error) throw error
  },
}
