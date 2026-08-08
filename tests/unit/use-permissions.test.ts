import { rankOf, usePermissions } from '@/composables/use-permissions'
import { useAuthStore } from '@/stores/auth'
import type { Company, MembershipRole } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/memberships', () => ({ membershipsApi: { listForUser: vi.fn(async () => []) } }))
vi.mock('@/api/profile', () => ({
  profileApi: { bootstrap: vi.fn(), getProfile: vi.fn(async () => null), updateCompany: vi.fn() },
}))
vi.mock('@/api/auth', () => ({
  authApi: { getSession: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn() },
}))

function as(role: MembershipRole | null) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  if (role) {
    auth.memberships = [
      { company_id: 'c', user_id: 'u', role, created_at: '', company: { id: 'c' } as Company },
    ]
    auth.activeCompanyId = 'c'
  }
  return usePermissions()
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('usePermissions', () => {
  // The client half of the matrix migration 0013 enforces in the database.
  it.each([
    ['owner', { canTrade: true, canConfigure: true, canManageMembers: true, canAdministerCompany: true }],
    ['admin', { canTrade: true, canConfigure: true, canManageMembers: true, canAdministerCompany: false }],
    ['member', { canTrade: true, canConfigure: false, canManageMembers: false, canAdministerCompany: false }],
    ['viewer', { canTrade: false, canConfigure: false, canManageMembers: false, canAdministerCompany: false }],
  ] as const)('grants %s exactly the matrix row', (role, expected) => {
    const p = as(role)
    expect({
      canTrade: p.canTrade.value,
      canConfigure: p.canConfigure.value,
      canManageMembers: p.canManageMembers.value,
      canAdministerCompany: p.canAdministerCompany.value,
    }).toEqual(expected)
  })

  it('marks only a viewer as read-only', () => {
    expect(as('viewer').isReadOnly.value).toBe(true)
    expect(as('member').isReadOnly.value).toBe(false)
  })

  // Before the membership list has loaded there is no role, and a UI that
  // defaulted to "allowed" would flash controls the database will refuse.
  it('denies everything when no organization is active', () => {
    const p = as(null)
    expect(p.canTrade.value).toBe(false)
    expect(p.canConfigure.value).toBe(false)
    expect(p.canManageMembers.value).toBe(false)
    expect(p.canAdministerCompany.value).toBe(false)
  })

  it('ranks an unknown role at zero so a bad value can only deny', () => {
    expect(rankOf(null)).toBe(0)
    expect(rankOf('nonsense' as MembershipRole)).toBe(0)
    expect(rankOf('viewer')).toBeLessThan(rankOf('member'))
    expect(rankOf('member')).toBeLessThan(rankOf('admin'))
    expect(rankOf('admin')).toBeLessThan(rankOf('owner'))
  })

  it('follows the active organization when the user switches', () => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.memberships = [
      { company_id: 'c1', user_id: 'u', role: 'owner', created_at: '', company: { id: 'c1' } as Company },
      { company_id: 'c2', user_id: 'u', role: 'viewer', created_at: '', company: { id: 'c2' } as Company },
    ]
    auth.activeCompanyId = 'c1'
    const p = usePermissions()
    expect(p.canConfigure.value).toBe(true)
    auth.activeCompanyId = 'c2'
    expect(p.canConfigure.value).toBe(false)
    expect(p.isReadOnly.value).toBe(true)
  })
})
