import { invitationsApi } from '@/api/invitations'
import { useAuthStore } from '@/stores/auth'
import { ref } from 'vue'

// Redeeming an invitation link. Kept apart from `use-members` because this
// runs before the user is in the organization at all — there is no active
// company yet, and nothing to load.
export function useInvite() {
  const auth = useAuthStore()
  const submitting = ref(false)

  // The token is only validated on redemption: the database gives no way to
  // inspect an invitation without accepting it, so a link cannot be used to
  // probe which addresses were invited. Resolves to the joined company id,
  // or null when the token is invalid, expired, or for someone else.
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

  return { submitting, accept }
}
