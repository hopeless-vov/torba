import { useAuthStore } from '@/stores/auth'
import type { MembershipRole } from '@/types/database'
import { computed } from 'vue'

// viewer < member < admin < owner. An unknown role ranks 0, so a value we do
// not recognise can only ever deny.
const RANK: Record<MembershipRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
}

export function rankOf(role: MembershipRole | null): number {
  return role ? (RANK[role] ?? 0) : 0
}

// The interface half of the role matrix enforced by migration 0013. These
// gates hide controls that would fail anyway — the database is what actually
// decides, so nothing here is load-bearing for security.
export function usePermissions() {
  const auth = useAuthStore()

  const role = computed<MembershipRole | null>(() => auth.role)

  function atLeast(min: MembershipRole) {
    return rankOf(role.value) >= RANK[min]
  }

  return {
    role,
    // Day-to-day trade: products, batches, clients, orders.
    canTrade: computed(() => atLeast('member')),
    // The setup behind it: brands, categories, links, payment methods, and
    // the currencies and rates that silently re-price the whole catalogue.
    canConfigure: computed(() => atLeast('admin')),
    // Members and invitations.
    canManageMembers: computed(() => atLeast('admin')),
    // The company row itself: name, functional currency.
    canAdministerCompany: computed(() => atLeast('owner')),
    // A viewer sees everything and changes nothing.
    isReadOnly: computed(() => role.value === 'viewer'),
  }
}
