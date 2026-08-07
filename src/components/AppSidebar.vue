<script setup lang="ts">
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import { useAuthStore } from '@/stores/auth'
import { useInventoryStore } from '@/stores/inventory'
import { batchStatus } from '@/utils/batch-status'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const inventory = useInventoryStore()

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
  <aside class="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
    <div class="flex items-center gap-2.5 px-5 py-5">
      <span class="flex size-8 items-center justify-center rounded-lg bg-accent text-on-accent">
        <Icon
          icon="fa-solid fa-bag-shopping"
          size="sm"
        />
      </span>
      <span class="truncate text-sm font-semibold text-fg">{{ companyName }}</span>
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
