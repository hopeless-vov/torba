import { invitationsApi } from '@/api/invitations'
import { useAuthStore } from '@/stores/auth'
import type { InvitationPreview } from '@/types/database'
import { ref } from 'vue'

const INVALID_PREVIEW: InvitationPreview = {
  company_name: null,
  email_hint: null,
  status: 'invalid',
  matches_current: false,
}

// Redeeming an invitation link. Kept apart from `use-members` because this
// runs before the user is in the organization at all — there is no active
// company yet, and nothing to load.
export function useInvite() {
  const auth = useAuthStore()
  const submitting = ref(false)
  const preview = ref<InvitationPreview | null>(null)
  const loadingPreview = ref(false)
  // Set when the preview rpc could not be reached at all — most likely because
  // migration 0014 has not been applied yet. The view then falls back to the
  // plain sign-in / accept flow instead of showing a blanket "invalid".
  const previewUnavailable = ref(false)

  // What the link points at — the company, a masked hint of the invited
  // address, and whether the current account can accept it. Shown before the
  // user commits, so registering with the wrong email is caught up front
  // instead of failing as a blank "invalid".
  async function loadPreview(token: string) {
    if (!token) {
      preview.value = INVALID_PREVIEW
      previewUnavailable.value = false
      return
    }
    loadingPreview.value = true
    previewUnavailable.value = false
    try {
      preview.value = await invitationsApi.preview(token)
    } catch {
      preview.value = null
      previewUnavailable.value = true
    } finally {
      loadingPreview.value = false
    }
  }

  // The token is validated on redemption: the database only lets the intended
  // recipient accept, so this resolves to the joined company id, or null when
  // the token is invalid, expired, or for a different address.
  async function accept(token: string): Promise<string | null> {
    if (!token) return null
    submitting.value = true
    try {
      const companyId = await invitationsApi.accept(token)
      // Pick up the new membership, then land the user inside it.
      await auth.loadContext()
      auth.switchCompany(companyId)
      return companyId
    } catch {
      return null
    } finally {
      submitting.value = false
    }
  }

  // Signed in with the wrong address: drop the session so the recipient can
  // come back as the invited account.
  async function signOut() {
    await auth.signOut()
  }

  return { submitting, preview, loadingPreview, previewUnavailable, loadPreview, accept, signOut }
}
