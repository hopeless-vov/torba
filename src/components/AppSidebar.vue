<script setup lang="ts">
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { useUiStore } from '@/stores/ui'
import { batchStatus } from '@/utils/batch-status'
import { useEventListener } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const inventory = useInventoryStore()
const ui = useUiStore()

// The off-canvas nav (below `lg`) closes on navigation and on Escape — above
// `lg` the sidebar is always visible and this state has no visual effect.
watch(() => route.name, () => ui.closeSidebar())
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && ui.sidebarOpen) ui.closeSidebar()
})

const warehouseWarnings = computed(
  () =>
    inventory.batches.filter((b) => {
      const s = batchStatus(b.expiry_date)
      return s === 'expired' || s === 'critical'
    }).length,
)

const nav = computed(() => [
  { name: 'dashboard', label: t('nav.dashboard'), icon: 'fa-solid fa-table-cells-large' },
  { name: 'catalog', label: t('nav.catalog'), icon: 'fa-solid fa-box-open', count: inventory.products.length },
  {
    name: 'warehouse',
    label: t('nav.warehouse'),
    icon: 'fa-solid fa-warehouse',
    count: warehouseWarnings.value || undefined,
    warn: warehouseWarnings.value > 0,
  },
  { name: 'clients', label: t('nav.clients'), icon: 'fa-solid fa-users' },
  { name: 'orders', label: t('nav.orders'), icon: 'fa-solid fa-arrow-right-arrow-left' },
  { name: 'rates', label: t('nav.rates'), icon: 'fa-solid fa-hryvnia-sign' },
  { name: 'links', label: t('nav.links'), icon: 'fa-solid fa-layer-group' },
  { name: 'profile', label: t('nav.profile'), icon: 'fa-solid fa-circle-user' },
])

const companyName = computed(() => auth.company?.name ?? t('app.name'))
const userName = computed(() => auth.profile?.full_name ?? auth.user?.email ?? '')

async function logout() {
  await auth.signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <AnimatePresence>
    <Motion
      v-if="ui.sidebarOpen"
      class="fixed inset-0 z-40 bg-black/60 lg:hidden"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :exit="{ opacity: 0 }"
      :transition="{ duration: 0.15 }"
      @click="ui.closeSidebar()"
    />
  </AnimatePresence>

  <aside
    class="fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 -translate-x-full flex-col border-r border-line bg-panel transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0"
    :class="ui.sidebarOpen && 'translate-x-0'"
  >
    <div class="flex items-center gap-2.5 px-5 py-5">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">
        <Icon
          icon="fa-solid fa-bag-shopping"
          size="sm"
        />
      </span>
      <span class="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{{ companyName }}</span>
      <button
        type="button"
        :title="t('common.close')"
        class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-fg lg:hidden"
        @click="ui.closeSidebar()"
      >
        <Icon
          icon="fa-solid fa-xmark"
          size="sm"
        />
      </button>
    </div>

    <nav class="flex flex-1 flex-col gap-1 px-3 py-2">
      <RouterLink
        v-for="item in nav"
        :key="item.name"
        :to="{ name: item.name }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150"
        :class="
          route.name === item.name
            ? 'bg-accent-soft font-medium text-fg'
            : 'text-muted hover:bg-hover hover:text-fg'
        "
      >
        <Icon
          :icon="item.icon"
          size="sm"
          :class="route.name === item.name ? 'text-accent' : 'text-faint'"
        />
        <span class="flex-1">{{ item.label }}</span>
        <span
          v-if="item.count"
          class="flex items-center gap-1 text-xs tabular-nums"
          :class="item.warn ? 'text-danger' : 'text-faint'"
        >
          {{ item.count }}
          <Icon
            v-if="item.warn"
            icon="fa-solid fa-triangle-exclamation"
            size="xs"
          />
        </span>
      </RouterLink>
    </nav>

    <div class="flex items-center gap-3 border-t border-line-soft px-4 py-4">
      <Avatar
        :name="userName"
        size="sm"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-fg">
          {{ userName }}
        </p>
        <p class="truncate text-xs text-faint">
          {{ companyName }}
        </p>
      </div>
      <button
        type="button"
        :title="t('nav.logout')"
        class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger"
        @click="logout"
      >
        <Icon
          icon="fa-solid fa-arrow-right-from-bracket"
          size="sm"
        />
      </button>
    </div>
  </aside>
</template>
