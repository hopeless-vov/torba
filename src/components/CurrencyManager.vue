<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCurrencies } from '@/composables/use-currencies'
import { BUILT_IN_CODES, BUILT_IN_CURRENCIES } from '@/composables/use-currency'
import { formatNumber } from '@/utils/format'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Adds display currencies beyond the built-in ones (UAH, USD, EUR). Rates
// for every currency are edited on the Rates page; this is a shortcut to
// register a new one.
const { t } = useI18n()
const { currencies, addCurrency, updateCurrency, removeCurrency } = useCurrencies()

// Built-in codes have their own row above, so keep the editable list to the
// custom currencies the owner added.
const customCurrencies = computed(() => currencies.value.filter((c) => !BUILT_IN_CODES.includes(c.code)))

const form = reactive({ code: '', symbol: '' })
const rate = ref(0)
const editingId = ref<string | null>(null)
const editingRate = ref(0)

async function add() {
  if (!form.code.trim()) return
  await addCurrency({ code: form.code, symbol: form.symbol, usdRate: rate.value })
  form.code = ''
  form.symbol = ''
  rate.value = 0
}

function startEdit(id: string, current: number) {
  editingId.value = id
  editingRate.value = current
}

async function saveRate(id: string) {
  await updateCurrency(id, { usd_rate: editingRate.value || 0 })
  editingId.value = null
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">
      {{ t('profile.currency.hint') }}
    </p>

    <form
      class="grid grid-cols-[6rem_5rem_1fr_auto] items-end gap-2"
      @submit.prevent="add"
    >
      <TextInput
        v-model="form.code"
        :label="t('profile.currency.code')"
        :placeholder="t('profile.currency.codePlaceholder')"
      />
      <TextInput
        v-model="form.symbol"
        :label="t('profile.currency.symbol')"
        :placeholder="t('profile.currency.symbolPlaceholder')"
      />
      <NumberInput
        v-model="rate"
        :label="t('profile.currency.rate')"
        :min="0"
        :step="0.01"
      />
      <Button
        type="submit"
        variant="primary"
        :disabled="!form.code.trim()"
      >
        {{ t('profile.currency.add') }}
      </Button>
    </form>

    <ul class="flex flex-col gap-2">
      <li
        v-for="built in BUILT_IN_CURRENCIES"
        :key="built.code"
        class="flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2.5"
      >
        <span class="flex size-8 items-center justify-center rounded-lg bg-chip font-mono text-sm text-muted">
          {{ built.symbol }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-mono text-sm font-medium text-fg">
            {{ built.code }}
          </p>
          <p class="text-xs text-faint">
            {{
              built.code === 'USD'
                ? t('profile.currency.baseHint')
                : t('profile.currency.brandRateHint')
            }}
          </p>
        </div>
        <Badge tone="neutral">
          {{ t('profile.currency.builtIn') }}
        </Badge>
      </li>

      <li
        v-for="currency in customCurrencies"
        :key="currency.id"
        class="flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2.5"
      >
        <span class="flex size-8 items-center justify-center rounded-lg bg-chip font-mono text-sm text-muted">
          {{ currency.symbol || currency.code }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-mono text-sm font-medium text-fg">
            {{ currency.code }}
          </p>
          <p class="text-xs text-faint">
            {{ `${formatNumber(currency.usd_rate, 2)} ${t('common.perUsd')}` }}
          </p>
        </div>

        <div
          v-if="editingId === currency.id"
          class="flex items-center gap-2"
        >
          <div class="w-28">
            <NumberInput
              v-model="editingRate"
              size="sm"
              :min="0"
              :step="0.01"
            />
          </div>
          <Button
            size="sm"
            variant="primary"
            @click="saveRate(currency.id)"
          >
            {{ t('common.save') }}
          </Button>
        </div>
        <Button
          v-else
          size="sm"
          variant="ghost"
          @click="startEdit(currency.id, currency.usd_rate)"
        >
          {{ t('rates.update') }}
        </Button>

        <button
          type="button"
          class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger"
          @click="removeCurrency(currency.id)"
        >
          <Icon
            icon="fa-solid fa-xmark"
            size="sm"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
