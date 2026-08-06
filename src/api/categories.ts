import { supabase } from '@/api/supabase'
import type { BrandCategory, Category, NewBrandCategory, NewCategory } from '@/types/database'

export const categoriesApi = {
  list: async (companyId: string): Promise<Category[]> => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    if (error) throw error
    return (data ?? []) as Category[]
  },

  create: async (category: NewCategory): Promise<Category> => {
    const { data, error } = await supabase.from('categories').insert(category).select('*').single()
    if (error) throw error
    return data as Category
  },

  rename: async (id: string, name: string): Promise<Category> => {
    const { data, error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Category
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw error
  },

  // ── brand ↔ category links (many-to-many) ──────────────────────
  listLinks: async (companyId: string): Promise<BrandCategory[]> => {
    const { data, error } = await supabase
      .from('brand_categories')
      .select('*')
      .eq('company_id', companyId)
    if (error) throw error
    return (data ?? []) as BrandCategory[]
  },

  link: async (link: NewBrandCategory): Promise<void> => {
    const { error } = await supabase
      .from('brand_categories')
      .upsert(link, { onConflict: 'brand_id,category_id', ignoreDuplicates: true })
    if (error) throw error
  },

  unlink: async (brandId: string, categoryId: string): Promise<void> => {
    const { error } = await supabase
      .from('brand_categories')
      .delete()
      .eq('brand_id', brandId)
      .eq('category_id', categoryId)
    if (error) throw error
  },
}
