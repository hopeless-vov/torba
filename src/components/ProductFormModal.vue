<script setup lang="ts">
import QuickAddModal from '@/components/QuickAddModal.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Combobox from '@/components/ui/Combobox.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCurrency } from '@/composables/use-currency'
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
const { functionalCode } = useCurrency()
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

// Cost is entered and stored in the brand's catalog currency; retail is
// entered and stored in the functional currency. No conversion on save.
const priceModel = ref(0)
const retailModel = ref(0)

// The catalog currency follows the selected brand — that is the currency the
// supplier prices its goods in.
const catalogCurrency = computed(() => reference.brandsById.get(form.brand_id)?.catalog_currency ?? 'USD')

const brandOptions = computed(() => reference.brands.map((b) => ({ value: b.id, label: b.name })))
const categoryOptions = computed(() => reference.categories.map((c) => ({ value: c.id, label: c.name })))

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
    retailModel.value = p?.retail_amount ?? 0
    form.is_active = p?.is_active ?? true
  },
  { immediate: true },
)

function submit() {
  if (!canSave.value) return
  emit('submit', {
    sku: form.sku.trim(),
    name: form.name.trim(),
    brand_id: form.brand_id || null,
    category_id: form.category_id || null,
    volume: form.volume.trim() || null,
    cost_amount: priceModel.value || 0,
    retail_amount: retailModel.value ? retailModel.value : null,
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
      class="grid grid-cols-2 gap-4"
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
        class="col-span-2"
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
        :placeholder="t('catalog.chooseCategory')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.noMatches')"
        :options="categoryOptions"
        :add-label="t('profile.addCategory')"
        clearable
        @add="openQuickAdd('category')"
      />
      <NumberInput
        v-model="priceModel"
        class="col-span-1"
        :label="`${t('catalog.form.priceUsd')} (${catalogCurrency})`"
        :min="0"
        :step="0.5"
      />
      <NumberInput
        v-model="retailModel"
        class="col-span-1"
        :label="`${t('catalog.form.retailUsd')} (${functionalCode})`"
        :min="0"
        :step="0.5"
      />
      <p class="col-span-2 -mt-1 text-xs text-faint">
        {{ t('catalog.form.priceHint') }}
      </p>
      <div class="col-span-2">
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
    @added="onQuickAdded"
  />
</template>
