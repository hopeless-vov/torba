import { beforeEach, describe, expect, it, vi } from 'vitest'

function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'order', 'single', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result)
  return chain
}

vi.mock('@/api/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

import { supabase } from '@/api/supabase'

const mocked = vi.mocked(supabase, true)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('invitationsApi', () => {
  // Accepted and revoked invitations are history; showing them would make the
  // pending list grow forever.
  it('lists only invitations that are still outstanding', async () => {
    const chain = builder({ data: [], error: null })
    mocked.from.mockReturnValue(chain as never)
    const { invitationsApi } = await import('@/api/invitations')
    await invitationsApi.listPending('c1')
    expect(mocked.from).toHaveBeenCalledWith('invitations')
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'c1')
    expect(chain.is).toHaveBeenCalledWith('accepted_at', null)
    expect(chain.is).toHaveBeenCalledWith('revoked_at', null)
  })

  // Membership writes must never be plain table writes: the tables grant no
  // insert/update, so anything that bypassed the rpc would silently fail.
  it('creates an invitation through the rpc', async () => {
    mocked.rpc.mockResolvedValue({ data: { id: 'i1', token: 'tok' }, error: null } as never)
    const { invitationsApi } = await import('@/api/invitations')
    const created = await invitationsApi.create('c1', 'a@b.com', 'member')
    expect(mocked.rpc).toHaveBeenCalledWith('create_invitation', {
      p_company_id: 'c1',
      p_email: 'a@b.com',
      p_role: 'member',
    })
    expect(created.token).toBe('tok')
  })

  it('returns the joined company when a token is redeemed', async () => {
    mocked.rpc.mockResolvedValue({ data: 'c9', error: null } as never)
    const { invitationsApi } = await import('@/api/invitations')
    expect(await invitationsApi.accept('tok')).toBe('c9')
    expect(mocked.rpc).toHaveBeenCalledWith('accept_invitation', { p_token: 'tok' })
  })

  it('surfaces a rejected redemption as an error', async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: new Error('INVALID_INVITATION') } as never)
    const { invitationsApi } = await import('@/api/invitations')
    await expect(invitationsApi.accept('tok')).rejects.toThrow('INVALID_INVITATION')
  })

  it('changes a role and removes a member through their rpcs', async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: null } as never)
    const { invitationsApi } = await import('@/api/invitations')
    await invitationsApi.setRole('c1', 'u2', 'admin')
    expect(mocked.rpc).toHaveBeenCalledWith('set_membership_role', {
      p_company_id: 'c1',
      p_user_id: 'u2',
      p_role: 'admin',
    })
    await invitationsApi.removeMember('c1', 'u2')
    expect(mocked.rpc).toHaveBeenCalledWith('remove_membership', { p_company_id: 'c1', p_user_id: 'u2' })
  })

  it('reads members through company_members, which joins the identity', async () => {
    mocked.rpc.mockResolvedValue({ data: [{ user_id: 'u1', email: 'a@b.com' }], error: null } as never)
    const { invitationsApi } = await import('@/api/invitations')
    const rows = await invitationsApi.members('c1')
    expect(mocked.rpc).toHaveBeenCalledWith('company_members', { p_company_id: 'c1' })
    expect(rows[0].email).toBe('a@b.com')
  })
})
