import { supabase } from '@/api/supabase'
import type { CompanyMember, Invitation, InvitationPreview, MembershipRole } from '@/types/database'

// Everything that changes membership goes through a SECURITY DEFINER function
// (migration 0012): the tables themselves grant no writes, so a client cannot
// invite itself or promote itself by talking to PostgREST directly.
export const invitationsApi = {
  // Outstanding invitations only — accepted and revoked ones are history and
  // would just make the members screen noisy.
  listPending: async (companyId: string): Promise<Invitation[]> => {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('company_id', companyId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Invitation[]
  },

  create: async (companyId: string, email: string, role: Invitation['role']): Promise<Invitation> => {
    const { data, error } = await supabase.rpc('create_invitation', {
      p_company_id: companyId,
      p_email: email,
      p_role: role,
    })
    if (error) throw error
    return data as Invitation
  },

  // What the link is for, for the landing page — safe to call before signing
  // in. Never throws on a bad token; an unknown one comes back as 'invalid'.
  preview: async (token: string): Promise<InvitationPreview> => {
    const { data, error } = await supabase.rpc('invitation_preview', { p_token: token })
    if (error) throw error
    // A `returns table` rpc yields an array; one row at most.
    const row = (Array.isArray(data) ? data[0] : data) as InvitationPreview | undefined
    return row ?? { company_name: null, email_hint: null, status: 'invalid', matches_current: false }
  },

  // Returns the company the caller just joined.
  accept: async (token: string): Promise<string> => {
    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
    if (error) throw error
    return data as string
  },

  revoke: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('revoke_invitation', { p_id: id })
    if (error) throw error
  },

  members: async (companyId: string): Promise<CompanyMember[]> => {
    const { data, error } = await supabase.rpc('company_members', { p_company_id: companyId })
    if (error) throw error
    return (data ?? []) as CompanyMember[]
  },

  setRole: async (companyId: string, userId: string, role: MembershipRole): Promise<void> => {
    const { error } = await supabase.rpc('set_membership_role', {
      p_company_id: companyId,
      p_user_id: userId,
      p_role: role,
    })
    if (error) throw error
  },

  removeMember: async (companyId: string, userId: string): Promise<void> => {
    const { error } = await supabase.rpc('remove_membership', {
      p_company_id: companyId,
      p_user_id: userId,
    })
    if (error) throw error
  },
}
