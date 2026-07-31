import { supabase } from '@/api/supabase'
import type { Currency, CurrencyPatch, NewCurrency } from '@/types/database'

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

  update: async (id: string, patch: CurrencyPatch): Promise<Currency> => {
    const { data, error } = await supabase
      .from('currencies')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Currency
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('currencies').delete().eq('id', id)
    if (error) throw error
  },
}
