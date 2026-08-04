import { supabase } from '@/api/supabase'
import type { Brand, NewBrand, RateHistoryEntry } from '@/types/database'

export const brandsApi = {
  list: async (companyId: string): Promise<Brand[]> => {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    if (error) throw error
    return (data ?? []) as Brand[]
  },

  create: async (brand: NewBrand): Promise<Brand> => {
    const { data, error } = await supabase.from('brands').insert(brand).select('*').single()
    if (error) throw error
    return data as Brand
  },

  rename: async (id: string, name: string): Promise<Brand> => {
    const { data, error } = await supabase
      .from('brands')
      .update({ name })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Brand
  },

  // Updating a rate also records a history entry so the trend is auditable.
  // The catalog currency (what the supplier prices in) can change alongside it.
  updateRate: async (brand: Brand, rate: number, catalogCurrency?: string): Promise<Brand> => {
    const patch: Partial<Brand> = { supplier_rate: rate, rate_updated_at: new Date().toISOString() }
    if (catalogCurrency && catalogCurrency !== brand.catalog_currency) patch.catalog_currency = catalogCurrency
    const { data, error } = await supabase
      .from('brands')
      .update(patch)
      .eq('id', brand.id)
      .select('*')
      .single()
    if (error) throw error

    const { error: historyError } = await supabase
      .from('rate_history')
      .insert({ company_id: brand.company_id, brand_id: brand.id, rate })
    if (historyError) throw historyError

    return data as Brand
  },

  rateHistory: async (brandId: string): Promise<RateHistoryEntry[]> => {
    const { data, error } = await supabase
      .from('rate_history')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as RateHistoryEntry[]
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('brands').delete().eq('id', id)
    if (error) throw error
  },
}
