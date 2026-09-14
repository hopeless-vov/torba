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

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('brands').delete().eq('id', id)
    if (error) throw error
  },
}
