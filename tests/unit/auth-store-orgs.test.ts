import type { MembershipWithCompany } from '@/api/memberships'
import { useAuthStore } from '@/stores/auth'
import type { Company } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listForUser = vi.fn()
const bootstrap = vi.fn()

vi.mock('@/api/memberships', () => ({
  membershipsApi: { listForUser: (...a: unknown[]) => listForUser(...a) },
}))
vi.mock('@/api/profile', () => ({
  profileApi: {
    bootstrap: (...a: unknown[]) => bootstrap(...a),
    getProfile: vi.fn(async () => null),
    updateCompany: vi.fn(),
  },
}))
vi.mock('@/api/auth', () => ({
  authApi: { getSession: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn() },
}))

function membership(id: string, role = 'owner'): MembershipWithCompany {
  return {
    company_id: id,
    user_id: 'u1',
    role: role as MembershipWithCompany['role'],
    created_at: '',
    company: { id, name: id.toUpperCase(), base_currency: 'UAH' } as Company,
  }
}

// The store reads the session's user, which is normally set by Supabase.
function signedIn(store: ReturnType<typeof useAuthStore>) {
  store.session = { user: { id: 'u1', user_metadata: {} } } as never
}

describe('auth store — active organization', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('defaults to the first membership, which is the user’s own company', async () => {
    listForUser.mockResolvedValue([membership('c1'), membership('c2', 'member')])
    const auth = useAuthStore()
    signedIn(auth)
    await auth.loadContext()
    expect(auth.companyId).toBe('c1')
    expect(auth.company?.name).toBe('C1')
    expect(auth.role).toBe('owner')
    expect(auth.hasMultipleCompanies).toBe(true)
  })

  it('remembers the chosen organization across a reload', async () => {
    listForUser.mockResolvedValue([membership('c1'), membership('c2', 'member')])
    const auth = useAuthStore()
    signedIn(auth)
    await auth.loadContext()
    auth.switchCompany('c2')
    expect(auth.companyId).toBe('c2')
    expect(auth.role).toBe('member')

    // A fresh store, as after a page reload.
    setActivePinia(createPinia())
    const reloaded = useAuthStore()
    signedIn(reloaded)
    await reloaded.loadContext()
    expect(reloaded.companyId).toBe('c2')
  })

  // A revoked invitation must not strand the user on a company they can no
  // longer read — every query would come back empty with no explanation.
  it('falls back to the first membership when the remembered one is gone', async () => {
    listForUser.mockResolvedValue([membership('c1'), membership('c2')])
    const auth = useAuthStore()
    signedIn(auth)
    await auth.loadContext()
    auth.switchCompany('c2')

    setActivePinia(createPinia())
    listForUser.mockResolvedValue([membership('c1')])
    const reloaded = useAuthStore()
    signedIn(reloaded)
    await reloaded.loadContext()
    expect(reloaded.companyId).toBe('c1')
  })

  it('refuses to switch to an organization the user does not belong to', async () => {
    listForUser.mockResolvedValue([membership('c1')])
    const auth = useAuthStore()
    signedIn(auth)
    await auth.loadContext()
    auth.switchCompany('someone-elses-company')
    expect(auth.companyId).toBe('c1')
  })

  it('bootstraps a company when the user has no membership at all', async () => {
    listForUser.mockResolvedValueOnce([]).mockResolvedValueOnce([membership('c1')])
    bootstrap.mockResolvedValue('c1')
    const auth = useAuthStore()
    signedIn(auth)
    await auth.loadContext()
    expect(bootstrap).toHaveBeenCalled()
    expect(auth.companyId).toBe('c1')
  })

  it('clears the workspace on sign-out', async () => {
    listForUser.mockResolvedValue([membership('c1')])
    const auth = useAuthStore()
    signedIn(auth)
    await auth.loadContext()
    auth.session = null
    await auth.loadContext()
    expect(auth.companyId).toBeNull()
    expect(auth.company).toBeNull()
    expect(auth.memberships).toEqual([])
  })
})
