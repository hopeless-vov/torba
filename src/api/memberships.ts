import { supabase } from '@/api/supabase'
import type { Company, Membership } from '@/types/database'

// A membership always arrives with its company: the switcher needs the name
// to show, and the workspace needs base_currency to load anything at all.
export interface MembershipWithCompany extends Membership {
  company: Company
}

export const membershipsApi = {
  // Every organization the user belongs to, oldest first — which puts the
  // company created at sign-up ahead of any they were later invited to, so
  // "first membership" is a sensible default active organization.
  listForUser: async (userId: string): Promise<MembershipWithCompany[]> => {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, company:companies(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (error) throw error
    // A row whose company RLS hides would break every consumer that reads
    // `company.name`; drop it rather than ship a half-populated membership.
    return ((data ?? []) as unknown as MembershipWithCompany[]).filter((m) => !!m.company)
  },
}
