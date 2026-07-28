<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useRates } from '@/composables/use-rates'
import { useReferenceStore } from '@/stores/reference'
import type { Brand } from '@/types/database'
import { formatDate, formatMoney } from '@/utils/format'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const reference = useReferenceStore()
const { updating, history, loadingHistory, updateRate, loadHistory } = useRates()

const updateOpen = ref(false)
const historyOpen = ref(false)
const active = ref<Brand | null>(null)
const rateInput = ref(0)

function openUpdate(brand: Brand) {
  active.value = brand
  rateInput.value = brand.usd_rate
  updateOpen.value = true
}

function openHistory(brand: Brand) {
  active.value = brand
  historyOpen.value = true
  void loadHistory(brand.id)
}

async function saveRate() {
  if (!active.value) return
  await updateRate(active.value, rateInput.value)
  updateOpen.value = false
}
</script>

<template>
  <div class="flex flex-col gap-3 p-6">
    <div
      v-if="reference.brands.length === 0"
      class="rounded-xl border border-line bg-panel"
    >
      <EmptyState
        icon="fa-solid fa-hryvnia-sign"
        :title="t('rates.empty')"
        :hint="t('rates.emptyHint')"
      />
    </div>

    <div
      v-for="brand in reference.brands"
      :key="brand.id"
      class="flex items-center gap-4 rounded-xl border border-line bg-panel px-5 py-4"
    >
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-fg">
          {{ brand.name }}
        </p>
        <p class="text-xs text-faint">
          {{ t('rates.updatedAt', { date: formatDate(brand.rate_updated_at) }) }}
        </p>
      </div>

      <div class="text-right">
        <p class="font-mono text-2xl font-semibold text-accent tabular-nums">
          {{ formatMoney(brand.usd_rate, 'UAH', 2) }}
        </p>
        <p class="text-xs text-faint">
          {{ t('common.perUsd') }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button @click="openHistory(brand)">
          {{ t('rates.history') }}
        </Button>
        <Button
          variant="primary"
          @click="openUpdate(brand)"
        >
          {{ t('rates.update') }}
        </Button>
      </div>
    </div>

    <!-- Update rate -->
    <Modal
      v-model:open="updateOpen"
      size="sm"
      :title="t('rates.modalTitle', { brand: active?.name ?? '' })"
    >
      <NumberInput
        v-model="rateInput"
        :label="t('rates.newRate')"
        :min="0"
        :step="0.1"
      />
      <template #footer>
        <Button
          variant="ghost"
          @click="updateOpen = false"
        >
          {{ t('common.cancel') }}
        </Button>
        <Button
          variant="primary"
          :loading="updating"
          @click="saveRate"
        >
          {{ t('common.save') }}
        </Button>
      </template>
    </Modal>

    <!-- History -->
    <Modal
      v-model:open="historyOpen"
      size="sm"
      :title="t('rates.history')"
      :subtitle="active?.name"
    >
      <div
        v-if="loadingHistory"
        class="flex justify-center py-6"
      >
        <Spinner />
      </div>
      <ul
        v-else-if="history.length"
        class="flex flex-col divide-y divide-line-soft"
      >
        <li
          v-for="entry in history"
          :key="entry.id"
          class="flex items-center justify-between py-2.5"
        >
          <span class="text-sm text-muted tabular-nums">{{ formatDate(entry.created_at) }}</span>
          <span class="font-mono text-sm text-fg tabular-nums">{{ formatMoney(entry.rate, 'UAH', 2) }}</span>
        </li>
      </ul>
      <p
        v-else
        class="py-6 text-center text-sm text-muted"
      >
        {{ t('rates.emptyHint') }}
      </p>
    </Modal>
  </div>
</template>
