import { invitationsApi } from '@/api/invitations'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import type { CompanyMember, Invitation, MembershipRole } from '@/types/database'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// The members screen: who is in the active organization, who has been invited
// and not yet joined, and the actions on both. Every write goes through a
// database function that re-checks the caller's role, so the guards here are
// for the interface, not for security.
export function useMembers() {
  const auth = useAuthStore()
  const toast = useToast()
  const { t } = useI18n()

  const members = ref<CompanyMember[]>([])
  const invitations = ref<Invitation[]>([])
  const loading = ref(false)

  const canManage = computed(() => auth.role === 'owner' || auth.role === 'admin')
  const isOwner = computed(() => auth.role === 'owner')

  // A role the current user is allowed to hand out. Only an owner can make
  // another owner, so the invite form never offers it.
  const assignableRoles = computed<MembershipRole[]>(() =>
    isOwner.value ? ['owner', 'admin', 'member', 'viewer'] : ['admin', 'member', 'viewer'],
  )

  async function load() {
    const companyId = auth.companyId
    if (!companyId) return
    loading.value = true
    try {
      members.value = await invitationsApi.members(companyId)
      // Only administrators may read invitations; a plain member seeing an
      // empty list is correct, not an error.
      invitations.value = canManage.value ? await invitationsApi.listPending(companyId) : []
    } catch {
      toast.error(t('errors.load'))
    } finally {
      loading.value = false
    }
  }

  // Returns the link to hand to the invitee — there is no mail delivery, the
  // owner sends it through whatever channel they already use.
  async function invite(email: string, role: Invitation['role']): Promise<string | null> {
    const companyId = auth.companyId
    if (!companyId) return null
    try {
      const created = await invitationsApi.create(companyId, email, role)
      await load()
      toast.success(t('members.invited'))
      return inviteLink(created.token)
    } catch (e) {
      toast.error(inviteError(e))
      return null
    }
  }

  function inviteLink(token: string) {
    return new URL(`/invite/${token}`, window.location.origin).toString()
  }

  // The database raises tagged errors so the interface can say what actually
  // went wrong instead of a generic failure.
  function inviteError(e: unknown): string {
    const message = e instanceof Error ? e.message : ''
    if (message.includes('ALREADY_MEMBER')) return t('members.errors.alreadyMember')
    if (message.includes('INVALID_EMAIL')) return t('members.errors.invalidEmail')
    if (message.includes('FORBIDDEN')) return t('members.errors.forbidden')
    return t('errors.save')
  }

  async function revoke(id: string) {
    try {
      await invitationsApi.revoke(id)
      await load()
      toast.success(t('members.revoked'))
    } catch {
      toast.error(t('errors.save'))
    }
  }

  async function setRole(userId: string, role: MembershipRole) {
    const companyId = auth.companyId
    if (!companyId) return
    try {
      await invitationsApi.setRole(companyId, userId, role)
      await load()
      toast.success(t('toasts.saved'))
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      toast.error(message.includes('LAST_OWNER') ? t('members.errors.lastOwner') : t('errors.save'))
    }
  }

  async function remove(userId: string) {
    const companyId = auth.companyId
    if (!companyId) return
    try {
      await invitationsApi.removeMember(companyId, userId)
      // Removing yourself means losing this organization: reload the
      // membership list so the switcher drops it and lands somewhere valid.
      if (userId === auth.user?.id) await auth.loadContext()
      else await load()
      toast.success(t('toasts.deleted'))
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      toast.error(message.includes('LAST_OWNER') ? t('members.errors.lastOwner') : t('errors.delete'))
    }
  }

  return {
    members,
    invitations,
    loading,
    canManage,
    isOwner,
    assignableRoles,
    load,
    invite,
    inviteLink,
    revoke,
    setRole,
    remove,
  }
}
