<script setup lang="ts">
import MissingRateLink from '@/components/MissingRateLink.vue'
import QuickAddModal from '@/components/QuickAddModal.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Combobox from '@/components/ui/Combobox.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCurrency } from '@/composables/use-currency'
import { usePermissions } from '@/composables/use-permissions'
import { useRates } from '@/composables/use-rates'
import { useReferenceStore } from '@/stores/reference'
import type { NewProduct, Product } from '@/types/database'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  product?: Product | null
  saving?: boolean
}>()

const emit = defineEmits<{ submit: [payload: Omit<NewProduct, 'company_id'>] }>()

const { t } = useI18n()
const { functionalCode, functionalSymbol, options, hasRate, supplierCurrency } = useCurrency()
const { setRate } = useRates()
const { canConfigure } = usePermissions()
const reference = useReferenceStore()
const open = defineModel<boolean>('open', { default: false })

const form = reactive({
  sku: '',
  name: '',
  brand_id: '',
  category_id: '',
  volume: '',
  is_active: true,
})

const isEdit = computed(() => !!props.product)

// Cost and retail each carry the currency they were entered in; no conversion
// on save. Both default to the currency the supplier usually prices in: it
// says what you buy at and what you sell at, in its own money, and its rate
// takes both into the base.
const priceModel = ref(0)
const costCurrency = ref('USD')
const retailModel = ref(0)
const retailCurrency = ref(functionalCode.value)

// The currency the selected supplier's other products are priced in.
const catalogCurrency = computed(() => supplierCurrency(form.brand_id))

const currencyOptions = computed(() => options.value.map((o) => ({ value: o.code, label: `${o.symbol}  ${o.code}` })))

// For a new product, both currencies track the chosen brand's; editing keeps
// whatever the product was saved with.
watch(catalogCurrency, (cur) => {
  if (isEdit.value) return
  costCurrency.value = cur
  retailCurrency.value = cur
})

const brandOptions = computed(() => reference.brands.map((b) => ({ value: b.id, label: b.name })))

// Categories depend on the chosen brand. Editing keeps the product's current
// category available even if it was since unlinked, so it is never silently lost.
const categoryOptions = computed(() => {
  const list = reference.categoriesForBrand(form.brand_id).map((c) => ({ value: c.id, label: c.name }))
  const current = form.category_id ? reference.categoriesById.get(form.category_id) : null
  if (current && !list.some((o) => o.value === current.id)) list.push({ value: current.id, label: current.name })
  return list
})

// Switching brand drops a category that the new brand does not offer.
watch(
  () => form.brand_id,
  (brandId) => {
    if (!form.category_id) return
    const offered = reference.categoriesForBrand(brandId).some((c) => c.id === form.category_id)
    if (!offered && form.category_id !== props.product?.category_id) form.category_id = ''
  },
)

// Add a missing brand/category inline, without leaving the product form.
const quickAdd = ref<'brand' | 'category'>('brand')
const quickAddOpen = ref(false)
function openQuickAdd(kind: 'brand' | 'category') {
  quickAdd.value = kind
  quickAddOpen.value = true
}
function onQuickAdded(value: string) {
  if (quickAdd.value === 'brand') form.brand_id = value
  else form.category_id = value
}

const canSave = computed(() => !!form.sku.trim() && !!form.name.trim() && !!form.brand_id)

// The currencies among this product's prices that its supplier has no rate
// for — the cost first, since without it there is no margin at all. Such a
// price would show as unknown everywhere, so the form offers to set the rate
// right here; left empty, the product saves anyway and the tables point at
// the rates page.
const missingCurrencies = computed(() => {
  if (!form.brand_id) return []
  const codes: string[] = []
  if (!hasRate(form.brand_id, costCurrency.value)) codes.push(costCurrency.value)
  if (retailModel.value && !hasRate(form.brand_id, retailCurrency.value) && !codes.includes(retailCurrency.value)) {
    codes.push(retailCurrency.value)
  }
  return codes
})

const brandName = computed(() => reference.brandsById.get(form.brand_id)?.name ?? '')
const newRates = reactive<Record<string, number>>({})

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const p = props.product
    form.sku = p?.sku ?? ''
    form.name = p?.name ?? ''
    form.brand_id = p?.brand_id ?? ''
    form.category_id = p?.category_id ?? ''
    form.volume = p?.volume ?? ''
    priceModel.value = p?.cost_amount ?? 0
    costCurrency.value = p?.cost_currency ?? catalogCurrency.value
    retailModel.value = p?.retail_amount ?? 0
    retailCurrency.value = p?.retail_currency ?? catalogCurrency.value
    form.is_active = p?.is_active ?? true
    for (const code of Object.keys(newRates)) delete newRates[code]
  },
  { immediate: true },
)

async function submit() {
  if (!canSave.value) return
  // Rates typed in here become that supplier's rates, before the product
  // lands — so it shows converted from the first render.
  for (const code of missingCurrencies.value) {
    const rate = newRates[code] ?? 0
    if (rate > 0 && !(await setRate(form.brand_id, code, rate, true))) return
  }
  emit('submit', {
    sku: form.sku.trim(),
    name: form.name.trim(),
    brand_id: form.brand_id || null,
    category_id: form.category_id || null,
    volume: form.volume.trim() || null,
    cost_amount: priceModel.value || 0,
    cost_currency: costCurrency.value,
    retail_amount: retailModel.value ? retailModel.value : null,
    retail_currency: retailCurrency.value,
    is_active: form.is_active,
  })
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="isEdit ? t('catalog.form.titleEdit') : t('catalog.form.titleNew')"
  >
    <form
      class="grid grid-cols-1 gap-4 sm:grid-cols-2"
      @submit.prevent="submit"
    >
      <TextInput
        v-model="form.sku"
        class="col-span-1"
        :label="t('catalog.form.sku')"
      />
      <TextInput
        v-model="form.volume"
        class="col-span-1"
        :label="t('catalog.form.volume')"
      />
      <TextInput
        v-model="form.name"
        class="col-span-1 sm:col-span-2"
        :label="t('catalog.form.name')"
      />
      <Combobox
        v-model="form.brand_id"
        class="col-span-1"
        :label="t('catalog.form.brand')"
        :placeholder="t('csv.chooseBrand')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.noMatches')"
        :options="brandOptions"
        :add-label="t('profile.addBrand')"
        @add="openQuickAdd('brand')"
      />
      <Combobox
        v-model="form.category_id"
        class="col-span-1"
        :label="t('catalog.form.category')"
        :placeholder="form.brand_id ? t('catalog.chooseCategory') : t('catalog.form.categoryPickBrand')"
        :search-placeholder="t('common.search')"
        :empty-text="t('catalog.form.categoryEmpty')"
        :options="categoryOptions"
        :add-label="t('profile.addCategory')"
        :disabled="!form.brand_id"
        clearable
        @add="openQuickAdd('category')"
      />
      <div class="col-span-1 flex items-end gap-2">
        <NumberInput
          v-model="priceModel"
          class="flex-1"
          :label="t('catalog.form.priceUsd')"
          :min="0"
          :step="0.5"
        />
        <div class="w-28">
          <Combobox
            v-model="costCurrency"
            :label="t('catalog.form.currency')"
            :search-placeholder="t('common.search')"
            :empty-text="t('common.noMatches')"
            :options="currencyOptions"
          />
        </div>
      </div>
      <div class="col-span-1 flex items-end gap-2">
        <NumberInput
          v-model="retailModel"
          class="flex-1"
          :label="t('catalog.form.retailUsd')"
          :min="0"
          :step="0.5"
        />
        <div class="w-28">
          <Combobox
            v-model="retailCurrency"
            :label="t('catalog.form.currency')"
            :search-placeholder="t('common.search')"
            :empty-text="t('common.noMatches')"
            :options="currencyOptions"
          />
        </div>
      </div>
      <p class="col-span-1 -mt-1 text-xs text-faint sm:col-span-2">
        {{ t('catalog.form.priceHint') }}
      </p>
      <div
        v-if="missingCurrencies.length"
        class="col-span-1 flex flex-col gap-3 rounded-lg border border-dashed border-line px-4 py-3 sm:col-span-2"
      >
        <p class="text-xs text-warn">
          {{ t('catalog.form.rateMissing', { brand: brandName }) }}
        </p>
        <template v-if="canConfigure">
          <NumberInput
            v-for="code in missingCurrencies"
            :key="code"
            v-model="newRates[code]"
            :label="t('catalog.form.rateFor', { code, base: functionalCode })"
            :suffix="functionalSymbol"
            :min="0"
            :step="0.01"
          />
          <p class="text-xs text-faint">
            {{ t('catalog.form.rateHint') }}
          </p>
        </template>
        <MissingRateLink
          v-else
          :brand-id="form.brand_id || null"
          :currency="missingCurrencies[0] as string"
        />
      </div>
      <div class="col-span-1 sm:col-span-2">
        <Checkbox
          v-model="form.is_active"
          :label="t('catalog.form.active')"
        />
      </div>
    </form>

    <template #footer>
      <Button
        variant="ghost"
        @click="open = false"
      >
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="primary"
        :loading="saving"
        :disabled="!canSave"
        @click="submit"
      >
        {{ t('common.save') }}
      </Button>
    </template>
  </Modal>

  <QuickAddModal
    v-model:open="quickAddOpen"
    :kind="quickAdd"
    :brand-id="quickAdd === 'category' ? form.brand_id : undefined"
    @added="onQuickAdded"
  />
</template>
