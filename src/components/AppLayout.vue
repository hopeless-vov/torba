<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import CartDrawer from '@/components/CartDrawer.vue'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import { useUiStore } from '@/stores/ui'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'

const auth = useAuthStore()
const reference = useReferenceStore()
const inventory = useInventoryStore()
const clients = useClientsStore()
const orders = useOrdersStore()
const ui = useUiStore()
const toast = useToast()
const route = useRoute()
const { t } = useI18n()

// Each page owns its search box, so a stale query must not leak into the
// next page's filters.
watch(
  () => route.name,
  () => ui.setSearch(''),
)

// Load the workspace once the company is known (survives a hard refresh,
// where the session resolves asynchronously before this mounts).
watch(
  () => auth.companyId,
  async (companyId) => {
    if (!companyId) return
    const results = await Promise.allSettled([
      reference.load(companyId),
      inventory.load(companyId),
      clients.load(companyId),
      orders.load(companyId),
    ])
    if (results.some((r) => r.status === 'rejected')) toast.error(t('errors.load'))
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-bg">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopbar />
      <main class="flex-1 overflow-y-auto">
        <RouterView v-slot="{ Component }">
          <Transition
            name="page"
            mode="out-in"
          >
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>
    <CartDrawer />
  </div>
</template>
