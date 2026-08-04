<script setup lang="ts">
import ClientCardModal from '@/components/ClientCardModal.vue'
import ClientModal from '@/components/ClientModal.vue'
import OrderDetailsModal from '@/components/OrderDetailsModal.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useClients } from '@/composables/use-clients'
import { useCurrency } from '@/composables/use-currency'
import { useOrders } from '@/composables/use-orders'
import { useUiStore } from '@/stores/ui'
import type { Client, NewClient } from '@/types/database'
import type { ClientView, OrderView } from '@/types/models'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { format } = useCurrency()
const { filtered, createClient, updateClient, removeClient } = useClients()

// Spend is already converted into the active currency by useClients.
function spent(client: ClientView) {
  return format(client.totalSpent)
}
const { views: orderViews } = useOrders()
const ui = useUiStore()

const modalOpen = ref(false)
const editing = ref<Client | null>(null)
const saving = ref(false)

const cardOpen = ref(false)
const activeCard = ref<ClientView | null>(null)

const orderOpen = ref(false)
const activeOrder = ref<OrderView | null>(null)

const pendingDelete = ref<ClientView | null>(null)
const confirmOpen = ref(false)
const deleting = ref(false)

function askDelete(client: ClientView) {
  pendingDelete.value = client
  cardOpen.value = false
  confirmOpen.value = true
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await removeClient(pendingDelete.value.id)
    confirmOpen.value = false
    pendingDelete.value = null
  } finally {
    deleting.value = false
  }
}

const search = computed({
  get: () => ui.search,
  set: (v: string) => ui.setSearch(v),
})

// Drill down from the client's history into the full order.
function openOrder(orderId: string) {
  activeOrder.value = orderViews.value.find((o) => o.id === orderId) ?? null
  if (activeOrder.value) orderOpen.value = true
}

function openNew() {
  editing.value = null
  modalOpen.value = true
}

function openEdit(client: ClientView) {
  editing.value = client
  cardOpen.value = false
  modalOpen.value = true
}

function openCard(client: ClientView) {
  activeCard.value = client
  cardOpen.value = true
}

function meta(client: ClientView) {
  return [client.city, client.delivery, client.note].filter(Boolean).join(' · ')
}

async function onSubmit(payload: Omit<NewClient, 'company_id'>) {
  saving.value = true
  try {
    if (editing.value) await updateClient(editing.value.id, payload)
    else await createClient(payload)
    modalOpen.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <div class="flex flex-wrap items-center gap-3">
      <div class="w-72">
        <TextInput
          v-model="search"
          type="search"
          icon-left="fa-solid fa-magnifying-glass"
          :placeholder="t('clients.searchPlaceholder')"
        />
      </div>
      <Button
        variant="primary"
        icon="fa-solid fa-plus"
        class="ml-auto"
        @click="openNew"
      >
        {{ t('clients.newClient') }}
      </Button>
    </div>

    <div
      v-if="filtered.length === 0"
      class="rounded-xl border border-line bg-panel"
    >
      <EmptyState
        icon="fa-solid fa-users"
        :title="t('clients.empty')"
        :hint="t('clients.emptyHint')"
      >
        <Button
          variant="primary"
          icon="fa-solid fa-plus"
          @click="openNew"
        >
          {{ t('clients.newClient') }}
        </Button>
      </EmptyState>
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <div
        v-for="client in filtered"
        :key="client.id"
        class="flex cursor-pointer flex-col rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line-hover"
        @click="openCard(client)"
      >
        <div class="flex items-start justify-between">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-fg">
              {{ client.name }}
            </p>
            <p
              v-if="client.phone"
              class="font-mono text-xs text-muted"
            >
              {{ client.phone }}
            </p>
          </div>
          <div
            class="flex items-center gap-1"
            @click.stop
          >
            <Badge
              v-if="client.discount > 0"
              tone="warn"
            >
              {{ t('clients.discountBadge', { pct: client.discount }) }}
            </Badge>
            <button
              type="button"
              class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-fg"
              :title="t('common.edit')"
              @click="openEdit(client)"
            >
              <Icon
                icon="fa-solid fa-pen"
                size="xs"
              />
            </button>
            <button
              type="button"
              class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger"
              :title="t('common.delete')"
              @click="askDelete(client)"
            >
              <Icon
                icon="fa-solid fa-trash"
                size="xs"
              />
            </button>
          </div>
        </div>

        <p
          v-if="meta(client)"
          class="mt-2 text-xs leading-relaxed text-faint"
        >
          {{ meta(client) }}
        </p>

        <div class="mt-4 flex items-end justify-between border-t border-line-soft pt-4">
          <div>
            <p class="text-xs text-faint">
              {{ t('clients.orders') }}
            </p>
            <p class="font-mono text-sm text-fg tabular-nums">
              {{ client.ordersCount }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-faint">
              {{ t('clients.spent') }}
            </p>
            <p class="font-mono text-sm font-medium text-fg tabular-nums">
              {{ spent(client) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <ClientModal
      v-model:open="modalOpen"
      :client="editing"
      :saving="saving"
      @submit="onSubmit"
    />
    <ClientCardModal
      v-model:open="cardOpen"
      :client="activeCard"
      @open-order="openOrder"
      @edit="openEdit"
      @delete="askDelete"
    />
    <OrderDetailsModal
      v-model:open="orderOpen"
      :order="activeOrder"
      :actions="false"
    />
    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('clients.deleteTitle')"
      :message="t('clients.deleteMessage', { name: pendingDelete?.name ?? '' })"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
