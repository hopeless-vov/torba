import type { InvitationPreview } from '@/types/database'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  accept: vi.fn(),
}))

vi.mock('@/api/invitations', () => ({ invitationsApi: api }))

// The store is a thin stand-in: use-invite only leans on loadContext,
// switchCompany and signOut, so we spy on those.
const store = vi.hoisted(() => ({
  loadContext: vi.fn(),
  switchCompany: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => store }))

import { useInvite } from '@/composables/use-invite'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useInvite', () => {
  it('loads a preview and exposes it', async () => {
    const row: InvitationPreview = {
      company_name: 'Acme',
      email_hint: 'j***@x.com',
      status: 'pending',
      matches_current: true,
    }
    api.preview.mockResolvedValue(row)
    const { preview, loadPreview } = useInvite()
    await loadPreview('tok')
    expect(api.preview).toHaveBeenCalledWith('tok')
    expect(preview.value).toEqual(row)
  })

  // An empty token can never resolve; skip the round-trip and mark it invalid.
  it('marks an empty token invalid without calling the api', async () => {
    const { preview, loadPreview } = useInvite()
    await loadPreview('')
    expect(api.preview).not.toHaveBeenCalled()
    expect(preview.value?.status).toBe('invalid')
  })

  // A thrown preview means the rpc could not be reached (e.g. migration 0014
  // not applied); the view degrades to the plain flow rather than blocking.
  it('flags the preview unavailable when the rpc throws', async () => {
    api.preview.mockRejectedValue(new Error('boom'))
    const { preview, previewUnavailable, loadPreview } = useInvite()
    await loadPreview('tok')
    expect(preview.value).toBeNull()
    expect(previewUnavailable.value).toBe(true)
  })

  // A successful redemption reloads membership and lands the user in the org
  // they just joined.
  it('joins, reloads context and switches into the new company', async () => {
    api.accept.mockResolvedValue('c9')
    const { accept } = useInvite()
    const companyId = await accept('tok')
    expect(companyId).toBe('c9')
    expect(store.loadContext).toHaveBeenCalled()
    expect(store.switchCompany).toHaveBeenCalledWith('c9')
  })

  it('returns null and does not switch when redemption is refused', async () => {
    api.accept.mockRejectedValue(new Error('INVALID_INVITATION'))
    const { accept } = useInvite()
    expect(await accept('tok')).toBeNull()
    expect(store.switchCompany).not.toHaveBeenCalled()
  })

  it('signs out through the store', async () => {
    const { signOut } = useInvite()
    await signOut()
    expect(store.signOut).toHaveBeenCalled()
  })
})
