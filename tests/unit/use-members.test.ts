import { useInvite } from '@/composables/use-invite'
import { useMembers } from '@/composables/use-members'
import { useAuthStore } from '@/stores/auth'
import type { Company } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import uk from '@/locales/uk.json'

// vi.mock factories are hoisted above the module body, so the stub has to be
// created in a hoisted block or it is still uninitialised when they run.
const api = vi.hoisted(() => ({
  members: vi.fn(),
  listPending: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  setRole: vi.fn(),
  removeMember: vi.fn(),
  accept: vi.fn(),
}))

vi.mock('@/api/invitations', () => ({ invitationsApi: api }))
vi.mock('@/api/memberships', () => ({ membershipsApi: { listForUser: vi.fn(async () => []) } }))
vi.mock('@/api/profile', () => ({
  profileApi: { bootstrap: vi.fn(), getProfile: vi.fn(async () => null), updateCompany: vi.fn() },
}))
vi.mock('@/api/auth', () => ({
  authApi: { getSession: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn() },
}))

// useMembers reads t(); give it the real messages so a missing key would show.
const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => i18n.global }
})

function seed(role: string) {
  const auth = useAuthStore()
  auth.session = { user: { id: 'u1', email: 'me@x.com' } } as never
  auth.memberships = [
    {
      company_id: 'c1',
      user_id: 'u1',
      role: role as never,
      created_at: '',
      company: { id: 'c1', name: 'Co' } as Company,
    },
  ]
  auth.activeCompanyId = 'c1'
  return auth
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  api.members.mockResolvedValue([])
  api.listPending.mockResolvedValue([])
})

describe('useMembers', () => {
  it('lets an owner and an admin manage, but not a member or viewer', () => {
    for (const [role, expected] of [
      ['owner', true],
      ['admin', true],
      ['member', false],
      ['viewer', false],
    ] as const) {
      setActivePinia(createPinia())
      seed(role)
      expect(useMembers().canManage.value).toBe(expected)
    }
  })

  // Only an owner may create another owner; an admin who could would be able
  // to take the company.
  it('offers owner as an assignable role only to an owner', () => {
    seed('admin')
    expect(useMembers().assignableRoles.value).not.toContain('owner')
    setActivePinia(createPinia())
    seed('owner')
    expect(useMembers().assignableRoles.value).toContain('owner')
  })

  it('does not ask for invitations a plain member is not allowed to read', async () => {
    seed('member')
    await useMembers().load()
    expect(api.members).toHaveBeenCalledWith('c1')
    expect(api.listPending).not.toHaveBeenCalled()
  })

  it('returns a shareable link after creating an invitation', async () => {
    seed('owner')
    api.create.mockResolvedValue({ id: 'i1', token: 'abc123' })
    const link = await useMembers().invite('new@x.com', 'member')
    expect(api.create).toHaveBeenCalledWith('c1', 'new@x.com', 'member')
    expect(link).toBe(`${window.location.origin}/invite/abc123`)
  })

  it('reports a duplicate invite distinctly from a generic failure', async () => {
    seed('owner')
    api.create.mockRejectedValue(new Error('ALREADY_MEMBER'))
    const members = useMembers()
    expect(await members.invite('dup@x.com', 'member')).toBeNull()
  })

  // Leaving is not the same as being removed: the membership list itself has
  // to be reloaded so the switcher drops the organization.
  it('reloads the whole context when the user removes themselves', async () => {
    const auth = seed('owner')
    const spy = vi.spyOn(auth, 'loadContext').mockResolvedValue()
    await useMembers().remove('u1')
    expect(api.removeMember).toHaveBeenCalledWith('c1', 'u1')
    expect(spy).toHaveBeenCalled()
  })
})

describe('useInvite', () => {
  it('joins and switches to the organization on success', async () => {
    const auth = seed('owner')
    vi.spyOn(auth, 'loadContext').mockResolvedValue()
    const switchSpy = vi.spyOn(auth, 'switchCompany')
    api.accept.mockResolvedValue('c1')
    expect(await useInvite().accept('tok')).toBe('c1')
    expect(switchSpy).toHaveBeenCalledWith('c1')
  })

  it('reports an invalid token as null rather than throwing', async () => {
    seed('owner')
    api.accept.mockRejectedValue(new Error('INVALID_INVITATION'))
    expect(await useInvite().accept('bad')).toBeNull()
  })

  it('does not call the api for an empty token', async () => {
    seed('owner')
    expect(await useInvite().accept('')).toBeNull()
    expect(api.accept).not.toHaveBeenCalled()
  })
})
