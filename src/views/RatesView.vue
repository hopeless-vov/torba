<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Combobox from '@/components/ui/Combobox.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Spinner from '@/components/ui/Spinner.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCurrencies } from '@/composables/use-currencies'
import { BUILT_IN_CODES, BUILT_IN_CURRENCIES, NUMERAIRE, useCurrency } from '@/composables/use-currency'
import { useRates } from '@/composables/use-rates'
import { useReferenceStore } from '@/stores/reference'
import type { Brand } from '@/types/database'
import { formatDate, formatNumber } from '@/utils/format'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const reference = useReferenceStore()
const { code: activeCode, functionalCode, options, rateOf, convertBetween, formatIn, setBase } = useCurrency()
const { addCurrency, setRate, removeCurrency } = useCurrencies()
const { updating, history, loadingHistory, updateRate, loadHistory } = useRates()

// What 1 unit of `codeStr` is worth in the base currency — the readable,
// USD-free way to show a market rate.
function baseEquiv(codeStr: string): number {
  return convertBetween(1, codeStr, functionalCode.value)
}

// Switching the base re-expresses every brand supplier rate, so it is gated.
const baseConfirmOpen = ref(false)
const pendingBase = ref<string | null>(null)
const switchingBase = ref(false)
function askBase(codeStr: string) {
  pendingBase.value = codeStr
  baseConfirmOpen.value = true
}
async function confirmBase() {
  if (!pendingBase.value) return
  switchingBase.value = true
  try {
    await setBase(pendingBase.value)
    baseConfirmOpen.value = false
  } finally {
    switchingBase.value = false
    pendingBase.value = null
  }
}

// ── currencies ───────────────────────────────────────────────
type CurrencyRow = {
  code: string
  symbol: string
  rate: number
  id: string | null
  kind: 'anchor' | 'builtin' | 'custom'
}

const currencyRows = computed<CurrencyRow[]>(() => {
  const builtin = BUILT_IN_CURRENCIES.map((b) => ({
    code: b.code,
    symbol: b.symbol,
    rate: rateOf(b.code),
    id: reference.currenciesByCode.get(b.code)?.id ?? null,
    kind: (b.code === 'USD' ? 'anchor' : 'builtin') as CurrencyRow['kind'],
  }))
  const custom = reference.currencies
    .filter((c) => !BUILT_IN_CODES.includes(c.code))
    .map((c) => ({
      code: c.code,
      symbol: c.symbol || c.code,
      rate: c.usd_rate,
      id: c.id,
      kind: 'custom' as const,
    }))
  return [...builtin, ...custom]
})

// One row is rate-edited at a time, always the readable way: "1 unit = ? base".
// The base currency itself is the pivot (its value in itself is 1), so it has
// no editable rate; every other row — USD included — is entered against the
// base and converted to the stored per-USD numeraire on save.
const editCode = ref<string | null>(null)
const editRate = ref(0)
function startEdit(row: CurrencyRow) {
  editCode.value = row.code
  editRate.value = baseEquiv(row.code)
}
async function saveEdit(code: string) {
  const entered = editRate.value || 0
  if (code === NUMERAIRE) {
    // The USD row reads "1 USD = X base" — that number *is* the base currency's
    // own per-USD market rate. USD stays the numeraire (rate 1); we store the
    // rate on the base currency instead.
    await setRate(functionalCode.value, entered)
  } else {
    const usdRate = entered > 0 ? rateOf(functionalCode.value) / entered : 0
    await setRate(code, usdRate)
  }
  editCode.value = null
}

// Add a custom currency. The rate is entered the same base-centric way as the
// rows above — "1 unit = ? base" — and converted to the stored per-USD
// numeraire on save, so USD never surfaces here either.
const addForm = reactive({ code: '', symbol: '' })
const addRate = ref(0)
async function addCustom() {
  if (!addForm.code.trim()) return
  const entered = addRate.value || 0
  const usdRate = entered > 0 ? rateOf(functionalCode.value) / entered : 0
  await addCurrency({ code: addForm.code, symbol: addForm.symbol, usdRate })
  addForm.code = ''
  addForm.symbol = ''
  addRate.value = 0
}

// ── brand supplier rates ─────────────────────────────────────
const updateOpen = ref(false)
const historyOpen = ref(false)
const active = ref<Brand | null>(null)
const rateInput = ref(0)
const catalogInput = ref('USD')

// The currencies a supplier might price in — the display options, so any
// currency the owner uses is available.
const catalogOptions = computed(() => options.value.map((o) => ({ value: o.code, label: `${o.symbol}  ${o.code}` })))

function openUpdate(brand: Brand) {
  active.value = brand
  rateInput.value = brand.supplier_rate
  catalogInput.value = brand.catalog_currency
  updateOpen.value = true
}
function openHistory(brand: Brand) {
  active.value = brand
  historyOpen.value = true
  void loadHistory(brand.id)
}
// When a supplier prices in the base currency there is nothing to convert, so
// the rate is pinned to 1 rather than left as a meaningless free number.
const catalogIsBase = computed(() => catalogInput.value === functionalCode.value)
async function saveBrandRate() {
  if (!active.value) return
  await updateRate(active.value, catalogIsBase.value ? 1 : rateInput.value, catalogInput.value)
  updateOpen.value = false
}
</script>

<template>
  <div class="flex flex-col gap-6 p-6">
    <!-- Currencies -->
    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-sm font-semibold text-fg">
          {{ t('rates.currenciesTitle') }}
        </h2>
        <p class="text-xs text-faint">
          {{ t('rates.currenciesHint') }}
        </p>
      </div>

      <div class="flex flex-col divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-panel">
        <div
          v-for="row in currencyRows"
          :key="row.code"
          class="flex flex-wrap items-center gap-3 px-5 py-3.5"
        >
          <span class="flex size-9 items-center justify-center rounded-lg bg-chip font-mono text-sm text-muted">
            {{ row.symbol }}
          </span>
          <div class="min-w-0">
            <p class="flex items-center gap-2 font-mono text-sm font-medium text-fg">
              {{ row.code }}
              <Badge
                v-if="row.code === activeCode"
                tone="accent"
              >
                {{ t('rates.active') }}
              </Badge>
              <Badge
                v-if="row.code === functionalCode"
                tone="info"
              >
                {{ t('rates.base') }}
              </Badge>
            </p>
            <p class="text-xs text-faint">
              {{
                row.code === functionalCode
                  ? t('rates.isBase')
                  : t('rates.oneEquals', { code: row.code, amount: formatIn(functionalCode, baseEquiv(row.code), 2) })
              }}
            </p>
          </div>

          <div class="ml-auto flex flex-wrap items-end justify-end gap-2">
            <template v-if="editCode === row.code">
              <div class="w-36">
                <NumberInput
                  v-model="editRate"
                  size="sm"
                  :label="t('rates.marketRate')"
                  :min="0"
                  :step="0.01"
                />
                <p class="mt-1 text-xs text-faint">
                  {{ t('rates.oneEquals', { code: row.code, amount: formatIn(functionalCode, editRate, 2) }) }}
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                @click="saveEdit(row.code)"
              >
                {{ t('rates.saveRate') }}
              </Button>
            </template>
            <template v-else>
              <Button
                v-if="row.code !== functionalCode"
                size="sm"
                variant="ghost"
                @click="askBase(row.code)"
              >
                {{ t('rates.makeBase') }}
              </Button>
              <Button
                v-if="row.code !== functionalCode"
                size="sm"
                @click="startEdit(row)"
              >
                {{ t('rates.update') }}
              </Button>
              <button
                v-if="row.kind === 'custom' && row.id"
                type="button"
                class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger"
                :title="t('common.delete')"
                @click="removeCurrency(row.id)"
              >
                <Icon
                  icon="fa-solid fa-xmark"
                  size="sm"
                />
              </button>
            </template>
          </div>
        </div>

        <!-- Add custom currency -->
        <form
          class="grid grid-cols-[6rem_5rem_1fr_auto] items-end gap-2 bg-surface px-5 py-4"
          @submit.prevent="addCustom"
        >
          <TextInput
            v-model="addForm.code"
            :label="t('profile.currency.code')"
            :placeholder="t('profile.currency.codePlaceholder')"
          />
          <TextInput
            v-model="addForm.symbol"
            :label="t('profile.currency.symbol')"
            :placeholder="t('profile.currency.symbolPlaceholder')"
          />
          <NumberInput
            v-model="addRate"
            :label="t('rates.addRate', { base: functionalCode })"
            :min="0"
            :step="0.01"
          />
          <Button
            type="submit"
            variant="primary"
            icon="fa-solid fa-plus"
            :disabled="!addForm.code.trim()"
          >
            {{ t('rates.addCurrency') }}
          </Button>
        </form>
      </div>
    </section>

    <!-- Brand supplier rates -->
    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-sm font-semibold text-fg">
          {{ t('rates.brandsTitle') }}
        </h2>
        <p class="text-xs text-faint">
          {{ t('rates.brandsHint') }}
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

      <div
        v-for="brand in reference.brands"
        :key="brand.id"
        class="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-panel px-5 py-4"
      >
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm font-semibold text-fg">
            {{ brand.name }}
            <Badge tone="neutral">
              {{ brand.catalog_currency }}
            </Badge>
          </p>
          <p class="text-xs text-faint">
            {{ t('rates.updatedAt', { date: formatDate(brand.rate_updated_at) }) }}
          </p>
        </div>

        <div class="text-right">
          <template v-if="brand.catalog_currency === functionalCode">
            <p class="text-sm font-medium text-muted">
              {{ t('rates.catalogIsBase') }}
            </p>
            <p class="text-xs text-faint">
              {{ t('rates.catalogIsBaseHint') }}
            </p>
          </template>
          <template v-else>
            <p class="font-mono text-2xl font-semibold text-accent tabular-nums">
              {{ formatIn(functionalCode, brand.supplier_rate, 2) }}
            </p>
            <p class="text-xs text-faint">
              {{ t('rates.perUnit', { code: brand.catalog_currency }) }}
            </p>
          </template>
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
    </section>

    <!-- Update brand rate -->
    <Modal
      v-model:open="updateOpen"
      size="sm"
      :title="t('rates.modalTitle', { brand: active?.name ?? '' })"
    >
      <div class="flex flex-col gap-4">
        <Combobox
          v-model="catalogInput"
          :label="t('rates.catalogCurrency')"
          :placeholder="t('common.search')"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.noMatches')"
          :options="catalogOptions"
        />
        <p
          v-if="catalogIsBase"
          class="rounded-lg border border-line bg-surface px-3 py-2.5 text-xs text-muted"
        >
          {{ t('rates.catalogIsBaseNote', { base: functionalCode }) }}
        </p>
        <NumberInput
          v-else
          v-model="rateInput"
          :label="t('rates.perUnitInBase', { base: functionalCode, code: catalogInput })"
          :min="0"
          :step="0.1"
        />
      </div>
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
          @click="saveBrandRate"
        >
          {{ t('common.save') }}
        </Button>
      </template>
    </Modal>

    <!-- Brand rate history -->
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
          <span class="font-mono text-sm text-fg tabular-nums">{{ formatNumber(entry.rate, 2) }}</span>
        </li>
      </ul>
      <p
        v-else
        class="py-6 text-center text-sm text-muted"
      >
        {{ t('rates.emptyHint') }}
      </p>
    </Modal>

    <!-- Switch base currency -->
    <ConfirmDialog
      v-model:open="baseConfirmOpen"
      tone="accent"
      :title="t('rates.baseConfirmTitle', { code: pendingBase ?? '' })"
      :message="t('rates.baseConfirmMessage')"
      :confirm-label="t('rates.makeBase')"
      :cancel-label="t('common.cancel')"
      :loading="switchingBase"
      @confirm="confirmBase"
    />
  </div>
</template>
