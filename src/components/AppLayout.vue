<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import CartDrawer from '@/components/CartDrawer.vue'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import { watch } from 'vue'
import { RouterView } from 'vue-router'

const auth = useAuthStore()
const reference = useReferenceStore()
const inventory = useInventoryStore()
const clients = useClientsStore()
const orders = useOrdersStore()

// Load the workspace once the company is known (survives a hard refresh,
// where the session resolves asynchronously before this mounts).
watch(
  () => auth.companyId,
  (companyId) => {
    if (!companyId) return
    void reference.load(companyId)
    void inventory.load(companyId)
    void clients.load(companyId)
    void orders.load(companyId)
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
