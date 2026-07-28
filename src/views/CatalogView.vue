<script setup lang="ts">
import CsvImportModal from '@/components/CsvImportModal.vue'
import ProductFormModal from '@/components/ProductFormModal.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import Tag from '@/components/ui/Tag.vue'
import { useCart } from '@/composables/use-cart'
import { useCatalog } from '@/composables/use-catalog'
import { useCurrency } from '@/composables/use-currency'
import { useInventoryStore } from '@/stores/inventory'
import { useReferenceStore } from '@/stores/reference'
import type { NewProduct, Product } from '@/types/database'
import type { ProductView } from '@/types/models'
import { formatNumber, formatPercent } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const reference = useReferenceStore()
const inventory = useInventoryStore()
const { code, format } = useCurrency()
const { addFromCatalog } = useCart()
const {
  filtered,
  brandFilter,
  categoryFilter,
  discount,
  showInactive,
  createProduct,
  updateProduct,
  removeProduct,
} = useCatalog()

const importOpen = ref(false)
const formOpen = ref(false)
const editing = ref<Product | null>(null)
const saving = ref(false)

const brandOptions = computed(() => [
  { value: 'all', label: t('catalog.allBrands') },
  ...reference.brands.map((b) => ({ value: b.id, label: b.name })),
])
const categoryOptions = computed(() => [
  { value: 'all', label: t('catalog.allCategories') },
  ...reference.categories.map((c) => ({ value: c.id, label: c.name })),
])

const columns = computed<Column[]>(() => [
  { key: 'sku', label: t('catalog.cols.article'), width: '9rem', mono: true },
  { key: 'name', label: t('catalog.cols.name') },
  { key: 'purchaseUsd', label: t('catalog.cols.purchaseUsd'), align: 'right', mono: true },
  { key: 'purchase', label: `${t('catalog.cols.purchase')} ${code}`, align: 'right', mono: true },
  { key: 'retail', label: `${t('catalog.cols.retail')} ${code}`, align: 'right', mono: true },
  { key: 'discounted', label: t('catalog.cols.discounted'), align: 'right', mono: true },
  { key: 'margin', label: t('catalog.cols.margin'), align: 'right', mono: true },
  { key: 'stock', label: t('catalog.cols.stock'), align: 'left' },
  { key: 'actions', label: '', width: '7rem', align: 'right' },
])

const rowMenu = [
  { value: 'edit', label: t('catalog.menu.edit'), icon: 'fa-solid fa-pen' },
  { value: 'delete', label: t('catalog.menu.delete'), icon: 'fa-solid fa-trash', danger: true },
]

function openNew() {
  editing.value = null
  formOpen.value = true
}

function onMenu(row: ProductView, action: string) {
  if (action === 'edit') {
    editing.value = row
    formOpen.value = true
  } else if (action === 'delete') {
    void removeProduct(row.id)
  }
}

async function onSubmit(payload: Omit<NewProduct, 'company_id'>) {
  saving.value = true
  try {
    if (editing.value) await updateProduct(editing.value.id, payload)
    else await createProduct(payload)
    formOpen.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3">
      <Select
        v-model="brandFilter"
        :options="brandOptions"
        class="w-44"
      />
      <Select
        v-model="categoryFilter"
        :options="categoryOptions"
        class="w-44"
      />
      <div class="w-32">
        <NumberInput
          v-model="discount"
          :min="0"
          :max="100"
          suffix="%"
        />
      </div>
      <Checkbox
        v-model="showInactive"
        :label="t('catalog.inactive')"
      />
      <div class="ml-auto flex items-center gap-2">
        <Button
          icon="fa-solid fa-file-arrow-up"
          @click="importOpen = true"
        >
          {{ t('catalog.importCsv') }}
        </Button>
        <Button
          variant="primary"
          icon="fa-solid fa-plus"
          @click="openNew"
        >
          {{ t('catalog.newProduct') }}
        </Button>
      </div>
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-line bg-panel">
      <DataTable
        :columns="columns"
        :rows="filtered"
        row-key="id"
        :loading="inventory.loading"
      >
        <template #cell-sku="{ row }">
          <span class="text-faint">{{ (row as ProductView).sku }}</span>
        </template>

        <template #cell-name="{ row }">
          <div class="flex flex-col gap-1">
            <span class="font-medium text-fg">{{ (row as ProductView).name }}</span>
            <div class="flex flex-wrap items-center gap-1.5">
              <Tag v-if="(row as ProductView).brand">
                {{ (row as ProductView).brand?.name }}
              </Tag>
              <Tag v-if="(row as ProductView).category">
                {{ (row as ProductView).category?.name }}
              </Tag>
              <span
                v-if="(row as ProductView).volume"
                class="text-xs text-faint"
              >{{ (row as ProductView).volume }}</span>
            </div>
          </div>
        </template>

        <template #cell-purchaseUsd="{ row }">
          <span class="text-muted">{{ formatNumber((row as ProductView).price_usd, 2) }}</span>
        </template>

        <template #cell-purchase="{ row }">
          {{ format((row as ProductView).purchase) }}
        </template>

        <template #cell-retail="{ row }">
          <template v-if="(row as ProductView).retail != null">
            {{ format((row as ProductView).retail as number) }}
          </template>
          <span
            v-else
            class="text-faint"
          >{{ t('common.emptyValue') }}</span>
        </template>

        <template #cell-discounted="{ row }">
          <span
            v-if="(row as ProductView).discounted != null"
            class="text-accent"
          >{{ format((row as ProductView).discounted as number) }}</span>
          <span
            v-else
            class="text-faint"
          >{{ t('common.emptyValue') }}</span>
        </template>

        <template #cell-margin="{ row }">
          <span :class="(row as ProductView).margin != null ? 'text-accent' : 'text-faint'">
            {{ formatPercent((row as ProductView).margin) }}
          </span>
        </template>

        <template #cell-stock="{ row }">
          <Badge
            :tone="(row as ProductView).inStock > 0 ? 'accent' : 'neutral'"
            dot
          >
            {{
              (row as ProductView).inStock > 0
                ? `${(row as ProductView).inStock} ${t('common.pcs')}`
                : t('common.none')
            }}
          </Badge>
        </template>

        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <button
              type="button"
              class="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent-line hover:text-accent"
              :title="t('catalog.addToCart')"
              @click="addFromCatalog(row as ProductView)"
            >
              <Icon
                icon="fa-solid fa-plus"
                size="sm"
              />
            </button>
            <DropdownMenu
              :items="rowMenu"
              @select="onMenu(row as ProductView, $event)"
            />
          </div>
        </template>

        <template #empty>
          <EmptyState
            icon="fa-solid fa-box-open"
            :title="t('catalog.empty')"
            :hint="t('catalog.emptyHint')"
          />
        </template>
      </DataTable>
    </div>

    <CsvImportModal v-model:open="importOpen" />
    <ProductFormModal
      v-model:open="formOpen"
      :product="editing"
      :saving="saving"
      @submit="onSubmit"
    />
  </div>
</template>
