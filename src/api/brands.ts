import { supabase } from '@/api/supabase'
import type { Brand, NewBrand } from '@/types/database'

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

  // The currency the supplier prices in: the default for its new products and
  // the currency its price lists are read in. What that currency is worth is a
  // separate thing — its rate lives in supplier_rates.
  setCatalogCurrency: async (id: string, code: string): Promise<Brand> => {
    const { data, error } = await supabase
      .from('brands')
      .update({ catalog_currency: code })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Brand
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('brands').delete().eq('id', id)
    if (error) throw error
  },
}
