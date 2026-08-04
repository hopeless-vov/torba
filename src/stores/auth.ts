import { authApi } from '@/api/auth'
import { profileApi } from '@/api/profile'
import type { Company, Profile } from '@/types/database'
import type { Session, User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const company = ref<Company | null>(null)
  const ready = ref(false)

  const user = computed<User | null>(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => !!session.value)
  const companyId = computed(() => profile.value?.company_id ?? null)

  async function loadContext() {
    if (!user.value) {
      profile.value = null
      company.value = null
      return
    }

    let loaded = await profileApi.getProfile(user.value.id)

    // Self-heal: if the sign-up trigger didn't create a company/profile,
    // create them now so the workspace is never left half-provisioned.
    if (!loaded) {
      const meta = (user.value.user_metadata ?? {}) as { company_name?: string; full_name?: string }
      try {
        await profileApi.bootstrap(meta.company_name, meta.full_name)
        loaded = await profileApi.getProfile(user.value.id)
      } catch {
        /* leave unprovisioned; a later load will retry */
      }
    }

    profile.value = loaded
    company.value = loaded ? await profileApi.getCompany(loaded.company_id) : null
  }

  async function setSession(next: Session | null) {
    session.value = next
    await loadContext()
  }

  // Called once on boot, then kept in sync by Supabase auth events.
  async function init() {
    if (ready.value) return
    session.value = await authApi.getSession()
    await loadContext()
    authApi.onAuthStateChange((_event, next) => {
      void setSession(next)
    })
    ready.value = true
  }

  async function signIn(email: string, password: string) {
    const next = await authApi.signIn(email, password)
    await setSession(next)
  }

  async function signUp(email: string, password: string, details: { fullName?: string; companyName?: string }) {
    const next = await authApi.signUp(email, password, details)
    if (next) await setSession(next)
    return next
  }

  async function signOut() {
    await authApi.signOut()
    await setSession(null)
  }

  // The functional (base) currency the company keeps its books in.
  async function setBaseCurrency(code: string) {
    if (!company.value || company.value.base_currency === code) return
    company.value = await profileApi.updateCompany(company.value.id, { base_currency: code })
  }

  return {
    session,
    profile,
    company,
    ready,
    user,
    isAuthenticated,
    companyId,
    init,
    signIn,
    signUp,
    signOut,
    setBaseCurrency,
    loadContext,
  }
})
