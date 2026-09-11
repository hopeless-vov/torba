import { supabase } from '@/api/supabase'
import type { NewSupplierRate, RateHistoryEntry, SupplierRate } from '@/types/database'

// The supplier × currency matrix: how much of the base currency one unit of
// a currency is worth to one supplier. The database keeps the history — a
// trigger writes it on every change — so nothing here writes it twice.
export const supplierRatesApi = {
  list: async (companyId: string): Promise<SupplierRate[]> => {
    const { data, error } = await supabase
      .from('supplier_rates')
      .select('*')
      .eq('company_id', companyId)
    if (error) throw error
    return (data ?? []) as SupplierRate[]
  },

  // One cell of the matrix, created the first time and updated after.
  set: async (rate: NewSupplierRate): Promise<SupplierRate> => {
    const { data, error } = await supabase
      .from('supplier_rates')
      .upsert(rate, { onConflict: 'brand_id,currency' })
      .select('*')
      .single()
    if (error) throw error
    return data as SupplierRate
  },

  history: async (brandId: string, currency: string): Promise<RateHistoryEntry[]> => {
    const { data, error } = await supabase
      .from('rate_history')
      .select('*')
      .eq('brand_id', brandId)
      .eq('currency', currency)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as RateHistoryEntry[]
  },
}
