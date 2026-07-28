<script setup lang="ts">
import ClientModal from '@/components/ClientModal.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { useClients } from '@/composables/use-clients'
import { useCurrency } from '@/composables/use-currency'
import type { Client, NewClient } from '@/types/database'
import type { ClientView } from '@/types/models'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { format } = useCurrency()
const { filtered, createClient, updateClient } = useClients()

const modalOpen = ref(false)
const editing = ref<Client | null>(null)
const saving = ref(false)

function openNew() {
  editing.value = null
  modalOpen.value = true
}

function openEdit(client: ClientView) {
  editing.value = client
  modalOpen.value = true
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
    <div class="flex items-center justify-end">
      <Button
        variant="primary"
        icon="fa-solid fa-plus"
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
      />
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <div
        v-for="client in filtered"
        :key="client.id"
        class="flex flex-col rounded-xl border border-line bg-panel p-5"
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
          <button
            type="button"
            class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-fg"
            @click="openEdit(client)"
          >
            <Icon
              icon="fa-solid fa-pen"
              size="xs"
            />
          </button>
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
              {{ format(client.totalSpent) }}
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
  </div>
</template>
