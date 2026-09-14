import { authApi } from '@/api/auth'
import type { MembershipWithCompany } from '@/api/memberships'
import { membershipsApi } from '@/api/memberships'
import { profileApi } from '@/api/profile'
import type { Company, MembershipRole, Profile } from '@/types/database'
import type { Session, User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// The active organization is remembered per user, so signing in as someone
// else on a shared browser never inherits the previous account's choice.
const ACTIVE_COMPANY_KEY = 'torba.active-company'

function activeCompanyKey(userId: string) {
  return `${ACTIVE_COMPANY_KEY}.${userId}`
}

function readStoredCompany(userId: string): string | null {
  try {
    return localStorage.getItem(activeCompanyKey(userId))
  } catch {
    return null // private mode / storage disabled — fall back to the default
  }
}

function writeStoredCompany(userId: string, companyId: string) {
  try {
    localStorage.setItem(activeCompanyKey(userId), companyId)
  } catch {
    /* not being able to remember the choice is not worth failing a switch */
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const memberships = ref<MembershipWithCompany[]>([])
  const activeCompanyId = ref<string | null>(null)
  const ready = ref(false)

  const user = computed<User | null>(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => !!session.value)

  const activeMembership = computed(
    () => memberships.value.find((m) => m.company_id === activeCompanyId.value) ?? null,
  )

  // Everything downstream keys off these two. `companyId` is the id passed to
  // every store load and every query — it is the active organization, not the
  // user's own one, which is what makes switching work without a reload.
  const companyId = computed(() => activeCompanyId.value)
  const company = computed<Company | null>(() => activeMembership.value?.company ?? null)
  const role = computed<MembershipRole | null>(() => activeMembership.value?.role ?? null)
  const hasMultipleCompanies = computed(() => memberships.value.length > 1)

  // The remembered organization, but only if it is still one of ours — a
  // revoked invitation must not strand the user on a company they cannot read.
  function resolveActiveCompany(list: MembershipWithCompany[], userId: string): string | null {
    if (list.length === 0) return null
    const stored = readStoredCompany(userId)
    if (stored && list.some((m) => m.company_id === stored)) return stored
    return list[0].company_id
  }

  async function loadContext() {
    if (!user.value) {
      profile.value = null
      memberships.value = []
      activeCompanyId.value = null
      return
    }

    let list = await membershipsApi.listForUser(user.value.id)

    // Self-heal: if the sign-up trigger didn't create a company/membership,
    // create them now so the workspace is never left half-provisioned.
    if (list.length === 0) {
      const meta = (user.value.user_metadata ?? {}) as { company_name?: string; full_name?: string }
      try {
        await profileApi.bootstrap(meta.company_name, meta.full_name)
        list = await membershipsApi.listForUser(user.value.id)
      } catch {
        /* leave unprovisioned; a later load will retry */
      }
    }

    memberships.value = list
    activeCompanyId.value = resolveActiveCompany(list, user.value.id)
    profile.value = await profileApi.getProfile(user.value.id)
  }

  // Switching only changes what the client asks for; nothing is written to the
  // database, so two tabs can sit in different organizations at once.
  function switchCompany(nextId: string) {
    if (!user.value) return
    if (nextId === activeCompanyId.value) return
    if (!memberships.value.some((m) => m.company_id === nextId)) return
    activeCompanyId.value = nextId
    writeStoredCompany(user.value.id, nextId)
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

  // The company now lives inside its membership row, so an update has to land
  // there for `company` (a computed) to see it.
  function patchActiveCompany(updated: Company) {
    const entry = memberships.value.find((m) => m.company_id === updated.id)
    if (entry) entry.company = updated
  }

  // The functional (base) currency the company keeps its books in. `rate`
  // (new base per 1 old) converts the orders already on the books.
  async function setBaseCurrency(code: string, rate: number | null = null) {
    const current = company.value
    if (!current || current.base_currency === code) return
    patchActiveCompany(await profileApi.changeBaseCurrency(current.id, code, rate))
  }

  return {
    session,
    profile,
    memberships,
    activeCompanyId,
    ready,
    user,
    isAuthenticated,
    companyId,
    company,
    role,
    hasMultipleCompanies,
    init,
    signIn,
    signUp,
    signOut,
    switchCompany,
    setBaseCurrency,
    loadContext,
  }
})
