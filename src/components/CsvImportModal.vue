<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Combobox from '@/components/ui/Combobox.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import Select from '@/components/ui/Select.vue'
import { useCsvImport } from '@/composables/use-csv-import'
import { useCurrency } from '@/composables/use-currency'
import { useReferenceStore } from '@/stores/reference'
import type { CsvField } from '@/utils/csv'
import { CSV_FIELDS } from '@/utils/csv'
import { formatNumber } from '@/utils/format'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const reference = useReferenceStore()
const { options: currencies } = useCurrency()
const currencyOptions = computed(() => currencies.value.map((o) => ({ value: o.code, label: `${o.symbol}  ${o.code}` })))
const open = defineModel<boolean>('open', { default: false })

const {
  step,
  brandId,
  currency,
  fileName,
  mapping,
  columnOptions,
  preview,
  setColumn,
  parsed,
  applyRate,
  importing,
  error,
  importedCount,
  productCount,
  newCategories,
  parseFile,
  runImport,
  reset,
} = useCsvImport()

const dragging = ref(false)

const brandOptions = computed(() => reference.brands.map((b) => ({ value: b.id, label: b.name })))
const canAdvance = computed(() => !!brandId.value && !!parsed.value)

const displayError = computed(() => {
  if (!error.value) return null
  const known = ['errorEmpty', 'errorParse', 'errorNoBrand', 'errorColumns']
  return known.includes(error.value) ? t(`csv.${error.value}`) : error.value
})

// Every field offers the same list of columns, plus the answer "this file
// simply has no such column" — a price list without volumes is normal.
const fieldOptions = computed(() => [
  { value: '', label: t('csv.notInFile') },
  ...columnOptions.value,
])

function columnOf(field: CsvField) {
  const column = mapping.value[field]
  return column == null ? '' : String(column)
}

function onColumn(field: CsvField, value: string | undefined) {
  setColumn(field, value ? Number(value) : null)
}

const rateLabel = computed(() =>
  parsed.value?.rate != null ? formatNumber(parsed.value.rate, 2) : '',
)

watch(open, (isOpen) => {
  if (isOpen) reset()
})

function pickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void parseFile(file)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void parseFile(file)
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="t('csv.title')"
    :subtitle="step === 1 ? t('csv.step1') : t('csv.step2')"
    size="lg"
  >
    <!-- Success -->
    <div
      v-if="importedCount !== null"
      class="flex flex-col items-center gap-3 py-6 text-center"
    >
      <span class="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon
          icon="fa-solid fa-check"
          size="lg"
        />
      </span>
      <p class="text-sm font-medium text-fg">
        {{ t('csv.done', { count: importedCount }) }}
      </p>
    </div>

    <!-- Step 1: brand + file -->
    <div
      v-else-if="step === 1"
      class="flex flex-col gap-4"
    >
      <div class="flex items-end gap-2">
        <Combobox
          v-model="brandId"
          class="flex-1"
          :label="t('csv.brandForImport')"
          :placeholder="t('csv.chooseBrand')"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.noMatches')"
          :options="brandOptions"
        />
        <div class="w-32">
          <Combobox
            v-model="currency"
            :label="t('csv.currency')"
            :search-placeholder="t('common.search')"
            :empty-text="t('common.noMatches')"
            :options="currencyOptions"
          />
        </div>
      </div>

      <label
        class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors"
        :class="dragging ? 'border-accent-line bg-accent-soft' : 'border-line hover:border-line-hover'"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <Icon
          icon="fa-solid fa-file-arrow-up"
          size="lg"
          class="text-faint"
        />
        <span class="text-sm font-medium text-fg">
          {{ fileName ? t('csv.fileSelected', { name: fileName }) : t('csv.noFile') }}
        </span>
        <span class="text-xs text-muted">{{ t('csv.dropHint') }}</span>
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          class="hidden"
          @change="pickFile"
        >
      </label>

      <p
        v-if="parsed"
        class="text-xs text-accent"
      >
        {{ t('csv.willImport', { count: productCount }) }}
      </p>
      <p
        v-if="displayError"
        class="text-xs text-danger"
      >
        {{ displayError }}
      </p>
    </div>

    <!-- Step 2: columns + review -->
    <div
      v-else
      class="flex flex-col gap-4"
    >
      <!-- The guess is shown, never applied silently: an import upserts by
           SKU, so a column read wrongly would overwrite the catalog. -->
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-0.5">
          <h3 class="text-sm font-medium text-fg">
            {{ t('csv.mappingTitle') }}
          </h3>
          <p class="text-xs text-muted">
            {{ t('csv.mappingHint') }}
          </p>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            v-for="field in CSV_FIELDS"
            :key="field"
            :model-value="columnOf(field)"
            :label="t(`csv.fields.${field}`)"
            :options="fieldOptions"
            size="sm"
            @update:model-value="onColumn(field, $event)"
          />
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs text-faint">{{ t('csv.previewTitle') }}</span>
        <div
          v-if="preview.length"
          class="overflow-x-auto rounded-lg border border-line-soft"
        >
          <table class="w-full text-left text-xs">
            <thead class="bg-surface text-faint">
              <tr>
                <th class="px-3 py-2 font-medium">
                  {{ t('csv.fields.sku') }}
                </th>
                <th class="px-3 py-2 font-medium">
                  {{ t('csv.fields.name') }}
                </th>
                <th class="px-3 py-2 font-medium">
                  {{ t('csv.fields.volume') }}
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  {{ t('csv.fields.cost') }}
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  {{ t('csv.fields.retail') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line-soft">
              <tr
                v-for="row in preview"
                :key="row.sku"
              >
                <td class="px-3 py-2 font-mono text-faint">
                  {{ row.sku }}
                </td>
                <td class="max-w-52 truncate px-3 py-2 text-fg">
                  {{ row.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ row.volume ?? t('common.emptyValue') }}
                </td>
                <td class="px-3 py-2 text-right font-mono text-fg tabular-nums">
                  {{ formatNumber(row.priceUsd, 2) }}
                </td>
                <td class="px-3 py-2 text-right font-mono text-muted tabular-nums">
                  {{ row.retailUsd != null ? formatNumber(row.retailUsd, 2) : t('common.emptyValue') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-else
          class="rounded-lg border border-line-soft px-3 py-6 text-center text-xs text-warn"
        >
          {{ t('csv.noRows') }}
        </p>
      </div>

      <div class="flex flex-col gap-2 rounded-lg border border-line-soft bg-surface p-4 text-sm">
        <div class="flex justify-between">
          <span class="text-muted">{{ t('csv.reviewImport') }}</span>
          <span class="font-mono font-medium text-fg tabular-nums">{{ productCount }}</span>
        </div>
        <div
          v-if="parsed && parsed.skipped > 0"
          class="flex justify-between"
        >
          <span class="text-muted">{{ t('csv.reviewSkipped') }}</span>
          <span class="font-mono text-faint tabular-nums">{{ parsed.skipped }}</span>
        </div>
      </div>

      <div
        v-if="newCategories.length"
        class="text-xs text-muted"
      >
        {{ t('csv.newCategories', { list: newCategories.join(', ') }) }}
      </div>

      <Checkbox
        v-if="parsed?.rate != null"
        v-model="applyRate"
        :label="t('csv.applyRate', { rate: rateLabel })"
      />

      <p
        v-if="displayError"
        class="text-xs text-danger"
      >
        {{ displayError }}
      </p>
    </div>

    <template #footer>
      <template v-if="importedCount !== null">
        <Button
          variant="primary"
          @click="open = false"
        >
          {{ t('common.close') }}
        </Button>
      </template>
      <template v-else-if="step === 1">
        <Button
          variant="ghost"
          @click="open = false"
        >
          {{ t('common.cancel') }}
        </Button>
        <Button
          variant="primary"
          icon-right="fa-solid fa-arrow-right"
          :disabled="!canAdvance"
          @click="step = 2"
        >
          {{ t('common.next') }}
        </Button>
      </template>
      <template v-else>
        <Button
          variant="ghost"
          @click="step = 1"
        >
          {{ t('common.back') }}
        </Button>
        <Button
          variant="primary"
          :loading="importing"
          :disabled="productCount === 0"
          @click="runImport"
        >
          {{ t('csv.import', { count: productCount }) }}
        </Button>
      </template>
    </template>
  </Modal>
</template>
