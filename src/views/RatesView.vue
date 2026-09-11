<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useCurrencies } from '@/composables/use-currencies'
import { useCurrency } from '@/composables/use-currency'
import { usePermissions } from '@/composables/use-permissions'
import { useRates } from '@/composables/use-rates'
import { useReferenceStore } from '@/stores/reference'
import type { Brand, Currency } from '@/types/database'
import { formatDate, formatNumber } from '@/utils/format'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// One page for everything a price is converted with: the base currency the
// books are kept in, the currencies the company's suppliers quote in, and the
// matrix of what each of those is worth to each supplier. There is no other
// rate anywhere — every amount in the app is in the base.
const { t } = useI18n()
const reference = useReferenceStore()
const { functionalCode, functionalSymbol, options, symbolOf, rateFor, formatIn } = useCurrency()
const { available, addCurrency, removeCurrency } = useCurrencies()
const {
  saving,
  history,
  loadingHistory,
  baseLocked,
  setRate,
  setCatalogCurrency,
  loadHistory,
  checkBaseLock,
  changeBase,
} = useRates()
const { canConfigure, canAdministerCompany } = usePermissions()

onMounted(checkBaseLock)

// ── base currency ────────────────────────────────────────────
// Only the owner moves it, only while nothing has been sold, and only after
// being told that it resets every supplier rate.
const nextBase = ref('')
const baseOptions = computed(() =>
  reference.platformCurrencies
    .filter((c) => c.code !== functionalCode.value)
    .map((c) => ({ value: c.code, label: `${c.symbol}  ${c.code}` })),
)
const baseConfirmOpen = ref(false)
const switchingBase = ref(false)

async function confirmBase() {
  if (!nextBase.value) return
  switchingBase.value = true
  try {
    if (await changeBase(nextBase.value)) {
      baseConfirmOpen.value = false
      nextBase.value = ''
    }
  } finally {
    switchingBase.value = false
  }
}

// ── company currencies ───────────────────────────────────────
const toAdd = ref('')
const availableOptions = computed(() =>
  available.value.map((c) => ({ value: c.code, label: `${c.symbol}  ${c.code}` })),
)

async function add() {
  if (!toAdd.value) return
  await addCurrency(toAdd.value)
  toAdd.value = ''
}

const pendingRemoval = ref<Currency | null>(null)
const removeOpen = ref(false)
const removing = ref(false)

function askRemove(currency: Currency) {
  pendingRemoval.value = currency
  removeOpen.value = true
}

async function confirmRemove() {
  if (!pendingRemoval.value) return
  removing.value = true
  try {
    await removeCurrency(pendingRemoval.value.id)
    removeOpen.value = false
    pendingRemoval.value = null
  } finally {
    removing.value = false
  }
}

// ── the supplier rate matrix ─────────────────────────────────
// One column per currency the company uses; the base has none — a price in
// the base needs no rate at all.
const rateColumns = computed(() => reference.currencies.map((c) => c.code))

const catalogOptions = computed(() =>
  options.value.map((o) => ({ value: o.code, label: `${o.symbol}  ${o.code}` })),
)

function onCatalog(brand: Brand, code: string | undefined) {
  if (code && code !== brand.catalog_currency) void setCatalogCurrency(brand.id, code)
}

// One cell is edited at a time, in place.
const editing = ref<{ brandId: string; code: string } | null>(null)
const editValue = ref(0)

function isEditing(brandId: string, code: string) {
  return editing.value?.brandId === brandId && editing.value.code === code
}

function startEdit(brandId: string, code: string) {
  if (!canConfigure.value) return
  editing.value = { brandId, code }
  editValue.value = rateFor(brandId, code) ?? 0
}

function cancelEdit() {
  editing.value = null
}

async function saveCell() {
  if (!editing.value || !(editValue.value > 0)) return
  if (await setRate(editing.value.brandId, editing.value.code, editValue.value)) editing.value = null
}

const historyOpen = ref(false)
const historyFor = ref<{ brand: Brand; code: string } | null>(null)

function openHistory(brand: Brand, code: string) {
  historyFor.value = { brand, code }
  historyOpen.value = true
  void loadHistory(brand.id, code)
}
</script>

<template>
  <div class="flex flex-col gap-6 p-6">
    <!-- Base currency -->
    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-sm font-semibold text-fg">
          {{ t('rates.baseTitle') }}
        </h2>
        <p class="text-xs text-faint">
          {{ t('rates.baseHint') }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-panel px-5 py-4">
        <span class="flex size-10 items-center justify-center rounded-lg bg-accent-soft font-mono text-lg text-accent">
          {{ functionalSymbol }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-mono text-sm font-semibold text-fg">
            {{ functionalCode }}
          </p>
          <p
            v-if="canAdministerCompany && baseLocked != null"
            class="text-xs text-faint"
          >
            {{ baseLocked ? t('rates.baseLocked') : t('rates.baseChangeHint') }}
          </p>
        </div>

        <form
          v-if="canAdministerCompany && baseLocked === false"
          class="flex flex-wrap items-end gap-2"
          @submit.prevent="baseConfirmOpen = true"
        >
          <div class="w-40">
            <Select
              v-model="nextBase"
              size="sm"
              :options="baseOptions"
              :placeholder="t('rates.chooseBase')"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            :disabled="!nextBase"
          >
            {{ t('rates.changeBase') }}
          </Button>
        </form>
      </div>
    </section>

    <!-- Company currencies -->
    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-sm font-semibold text-fg">
          {{ t('rates.currenciesTitle') }}
        </h2>
        <p class="text-xs text-faint">
          {{ t('rates.currenciesHint') }}
        </p>
      </div>

      <div class="flex flex-col gap-4 rounded-xl border border-line bg-panel px-5 py-4">
        <ul class="flex flex-wrap items-center gap-2">
          <li class="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm">
            <span class="font-mono text-muted">{{ functionalSymbol }}</span>
            <span class="font-mono font-medium text-fg">{{ functionalCode }}</span>
            <Badge tone="info">
              {{ t('rates.base') }}
            </Badge>
          </li>
          <li
            v-for="currency in reference.currencies"
            :key="currency.id"
            class="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface pr-1 pl-3 text-sm"
          >
            <span class="font-mono text-muted">{{ symbolOf(currency.code) }}</span>
            <span class="font-mono font-medium text-fg">{{ currency.code }}</span>
            <button
              v-if="canConfigure"
              type="button"
              class="flex size-6 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-danger"
              :title="t('common.delete')"
              @click="askRemove(currency)"
            >
              <Icon
                icon="fa-solid fa-xmark"
                size="xs"
              />
            </button>
          </li>
        </ul>

        <form
          v-if="canConfigure && available.length > 0"
          class="flex flex-wrap items-end gap-2"
          @submit.prevent="add"
        >
          <div class="w-48">
            <Select
              v-model="toAdd"
              size="sm"
              :options="availableOptions"
              :placeholder="t('rates.chooseCurrency')"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            icon="fa-solid fa-plus"
            :disabled="!toAdd"
          >
            {{ t('rates.addCurrency') }}
          </Button>
        </form>
      </div>
    </section>

    <!-- Supplier rates -->
    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-sm font-semibold text-fg">
          {{ t('rates.brandsTitle') }}
        </h2>
        <p class="text-xs text-faint">
          {{ t('rates.brandsHint', { base: functionalCode }) }}
        </p>
      </div>

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

      <p
        v-else-if="rateColumns.length === 0"
        class="rounded-xl border border-line bg-panel px-5 py-4 text-sm text-muted"
      >
        {{ t('rates.noCurrencies') }}
      </p>

      <div
        v-else
        class="overflow-x-auto rounded-xl border border-line bg-panel"
      >
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-faint">
            <tr class="border-b border-line-soft">
              <th class="px-5 py-3 font-medium">
                {{ t('rates.colBrand') }}
              </th>
              <th class="px-3 py-3 font-medium">
                {{ t('rates.colCatalog') }}
              </th>
              <th
                v-for="code in rateColumns"
                :key="code"
                class="px-3 py-3 text-right font-medium whitespace-nowrap"
              >
                {{ t('rates.perUnit', { base: functionalCode, code }) }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line-soft">
            <tr
              v-for="brand in reference.brands"
              :key="brand.id"
            >
              <td class="px-5 py-3 font-medium whitespace-nowrap text-fg">
                {{ brand.name }}
              </td>
              <td class="px-3 py-2">
                <div
                  v-if="canConfigure"
                  class="w-28"
                >
                  <Select
                    :model-value="brand.catalog_currency"
                    size="sm"
                    :options="catalogOptions"
                    @update:model-value="onCatalog(brand, $event)"
                  />
                </div>
                <span
                  v-else
                  class="font-mono text-muted"
                >{{ brand.catalog_currency }}</span>
              </td>
              <td
                v-for="code in rateColumns"
                :key="code"
                class="px-3 py-2 text-right"
              >
                <form
                  v-if="isEditing(brand.id, code)"
                  class="flex items-center justify-end gap-1.5"
                  @submit.prevent="saveCell"
                  @keydown.esc="cancelEdit"
                >
                  <div class="w-28">
                    <NumberInput
                      v-model="editValue"
                      size="sm"
                      align="right"
                      :min="0"
                      :step="0.01"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    :loading="saving"
                    :disabled="!(editValue > 0)"
                  >
                    {{ t('common.save') }}
                  </Button>
                  <button
                    type="button"
                    class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-fg"
                    :title="t('common.cancel')"
                    @click="cancelEdit"
                  >
                    <Icon
                      icon="fa-solid fa-xmark"
                      size="sm"
                    />
                  </button>
                </form>

                <div
                  v-else-if="rateFor(brand.id, code) != null"
                  class="flex items-center justify-end gap-1"
                >
                  <button
                    type="button"
                    class="rounded-md px-2 py-1 font-mono text-fg tabular-nums transition-colors"
                    :class="canConfigure ? 'cursor-pointer hover:bg-hover' : 'cursor-default'"
                    @click="startEdit(brand.id, code)"
                  >
                    {{ formatIn(functionalCode, rateFor(brand.id, code) as number, 2) }}
                  </button>
                  <button
                    type="button"
                    class="flex size-7 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-fg"
                    :title="t('rates.history')"
                    @click="openHistory(brand, code)"
                  >
                    <Icon
                      icon="fa-solid fa-clock-rotate-left"
                      size="xs"
                    />
                  </button>
                </div>

                <!-- A supplier with no rate for a currency the company uses:
                     any price of theirs in it has nothing to convert by. -->
                <button
                  v-else-if="canConfigure"
                  type="button"
                  class="cursor-pointer rounded-md border border-dashed border-line px-2 py-1 text-xs text-warn transition-colors hover:border-line-hover"
                  @click="startEdit(brand.id, code)"
                >
                  {{ t('rates.missing') }}
                </button>
                <span
                  v-else
                  class="text-xs text-warn"
                >{{ t('rates.missing') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Rate history for one cell -->
    <Modal
      v-model:open="historyOpen"
      size="sm"
      :title="t('rates.history')"
      :subtitle="historyFor ? `${historyFor.brand.name} · ${historyFor.code}` : undefined"
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
          <span class="font-mono text-sm text-fg tabular-nums">{{ formatNumber(entry.rate, 2) }}</span>
        </li>
      </ul>
      <p
        v-else
        class="py-6 text-center text-sm text-muted"
      >
        {{ t('rates.historyEmpty') }}
      </p>
    </Modal>

    <ConfirmDialog
      v-model:open="removeOpen"
      :title="t('rates.deleteCurrencyTitle', { code: pendingRemoval?.code ?? '' })"
      :message="t('rates.deleteCurrencyMessage')"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :loading="removing"
      @confirm="confirmRemove"
    />

    <ConfirmDialog
      v-model:open="baseConfirmOpen"
      :title="t('rates.baseConfirmTitle', { code: nextBase })"
      :message="t('rates.baseConfirmMessage')"
      :confirm-label="t('rates.changeBase')"
      :cancel-label="t('common.cancel')"
      :loading="switchingBase"
      @confirm="confirmBase"
    />
  </div>
</template>
