import { supabase } from '@/api/supabase'
import type { Company, Profile } from '@/types/database'

export const profileApi = {
  // Idempotently create the caller's company + owner profile (defaults
  // included) when the sign-up trigger didn't. Returns the company id.
  bootstrap: async (companyName?: string, fullName?: string): Promise<string> => {
    const { data, error } = await supabase.rpc('bootstrap_current_user', {
      p_company_name: companyName ?? null,
      p_full_name: fullName ?? null,
    })
    if (error) throw error
    return data as string
  },

  getProfile: async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    return data as Profile | null
  },

  getCompany: async (companyId: string): Promise<Company | null> => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle()
    if (error) throw error
    return data as Company | null
  },

  updateCompany: async (
    companyId: string,
    patch: Partial<Pick<Company, 'name' | 'display_currency' | 'base_currency'>>,
  ): Promise<Company> => {
    const { data, error } = await supabase
      .from('companies')
      .update(patch)
      .eq('id', companyId)
      .select('*')
      .single()
    if (error) throw error
    return data as Company
  },
}
