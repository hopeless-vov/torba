import OrgSwitcher from '@/components/OrgSwitcher.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import uk from '@/locales/uk.json'
import { useAuthStore } from '@/stores/auth'
import type { Company, MembershipRole } from '@/types/database'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/memberships', () => ({ membershipsApi: { listForUser: vi.fn(async () => []) } }))
vi.mock('@/api/profile', () => ({
  profileApi: { bootstrap: vi.fn(), getProfile: vi.fn(async () => null), updateCompany: vi.fn() },
}))
vi.mock('@/api/auth', () => ({
  authApi: {
    getSession: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}))

function seed(companies: { id: string; name: string; role: MembershipRole }[]) {
  const auth = useAuthStore()
  // switchCompany remembers the choice per user, so it needs a session.
  auth.session = { user: { id: 'u1', email: 'me@x.com' } } as never
  auth.memberships = companies.map((c) => ({
    company_id: c.id,
    user_id: 'u1',
    role: c.role,
    created_at: '',
    company: { id: c.id, name: c.name, base_currency: 'UAH' } as Company,
  }))
  auth.activeCompanyId = companies[0]?.id ?? null
}

function render() {
  const i18n = createI18n({ legacy: false, locale: 'uk', fallbackLocale: 'uk', messages: { uk } })
  return mount(OrgSwitcher, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('OrgSwitcher', () => {
  // One organization means nothing to switch to: a menu that opens onto a
  // single item would only be a dead end.
  it('renders flat, without a menu, for a single organization', () => {
    seed([{ id: 'c1', name: 'Acme Inc', role: 'owner' }])
    const wrapper = render()
    expect(wrapper.text()).toContain('Acme Inc')
    expect(wrapper.findComponent(DropdownMenu).exists()).toBe(false)
  })

  // The role is the one thing that differs between organizations and is shown
  // nowhere else in the chrome, so it is the trigger's second line.
  it('shows the active role as the subtitle', () => {
    seed([{ id: 'c1', name: 'Acme Inc', role: 'viewer' }])
    expect(render().text()).toContain(uk.org.roles.viewer)
  })

  it('opens a menu listing every organization once there are several', () => {
    seed([
      { id: 'c1', name: 'Acme Inc', role: 'owner' },
      { id: 'c2', name: 'Evil Corp', role: 'member' },
    ])
    const wrapper = render()
    const menu = wrapper.findComponent(DropdownMenu)
    expect(menu.exists()).toBe(true)
    expect(menu.props('items')).toHaveLength(2)
    // The active one is ticked rather than dropped from the list.
    expect(menu.props('items')[0].icon).toBe('fa-solid fa-check')
    expect(menu.props('items')[1].icon).toBeUndefined()
  })

  it('switches the active organization when one is picked', async () => {
    seed([
      { id: 'c1', name: 'Acme Inc', role: 'owner' },
      { id: 'c2', name: 'Evil Corp', role: 'member' },
    ])
    const wrapper = render()
    wrapper.findComponent(DropdownMenu).vm.$emit('select', 'c2')
    await wrapper.vm.$nextTick()
    expect(useAuthStore().activeCompanyId).toBe('c2')
  })
})
