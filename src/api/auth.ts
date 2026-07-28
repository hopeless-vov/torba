import { supabase } from '@/api/supabase'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export interface SignUpDetails {
  fullName?: string
  companyName?: string
}

export const authApi = {
  getSession: async (): Promise<Session | null> => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) =>
    supabase.auth.onAuthStateChange(callback),

  signIn: async (email: string, password: string): Promise<Session> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data.session
  },

  signUp: async (email: string, password: string, details: SignUpDetails = {}): Promise<Session | null> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: details.fullName ?? '',
          company_name: details.companyName ?? '',
        },
      },
    })
    if (error) throw error
    return data.session
  },

  signOut: async (): Promise<void> => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  resetPassword: async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  },
}
