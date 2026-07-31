<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Combobox from '@/components/ui/Combobox.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
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
const reference = useReferenceStore()
const open = defineModel<boolean>('open', { default: false })

const form = reactive({
  sku: '',
  name: '',
  brand_id: '',
  category_id: '',
  volume: '',
  price_usd: 0,
  retail_usd: 0,
  is_active: true,
})

const isEdit = computed(() => !!props.product)
const priceModel = ref(0)
const retailModel = ref(0)

const brandOptions = computed(() => reference.brands.map((b) => ({ value: b.id, label: b.name })))
const categoryOptions = computed(() => reference.categories.map((c) => ({ value: c.id, label: c.name })))

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
    priceModel.value = p?.price_usd ?? 0
    retailModel.value = p?.retail_price_usd ?? 0
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
    price_usd: priceModel.value || 0,
    retail_price_usd: retailModel.value || null,
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
      />
      <Combobox
        v-model="form.category_id"
        class="col-span-1"
        :label="t('catalog.form.category')"
        :placeholder="t('catalog.chooseCategory')"
        :search-placeholder="t('common.search')"
        :empty-text="t('common.noMatches')"
        :options="categoryOptions"
        clearable
      />
      <NumberInput
        v-model="priceModel"
        class="col-span-1"
        :label="t('catalog.form.priceUsd')"
        :min="0"
        :step="0.5"
      />
      <NumberInput
        v-model="retailModel"
        class="col-span-1"
        :label="t('catalog.form.retailUsd')"
        :min="0"
        :step="0.5"
      />
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
</template>
