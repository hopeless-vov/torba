<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Drawer from '@/components/ui/Drawer.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import { useCart } from '@/composables/use-cart'
import { useCurrency } from '@/composables/use-currency'
import { useClientsStore } from '@/stores/clients'
import { useReferenceStore } from '@/stores/reference'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { cart, totals, submitting, checkout } = useCart()
const { format } = useCurrency()
const reference = useReferenceStore()
const clients = useClientsStore()

const open = computed({
  get: () => cart.open,
  set: (v: boolean) => cart.toggle(v),
})

const clientId = computed({
  get: () => cart.clientId ?? '',
  set: (v: string) => (cart.clientId = v || null),
})

const paymentMethod = computed({
  get: () => cart.paymentMethod ?? '',
  set: (v: string) => (cart.paymentMethod = v || null),
})

const clientOptions = computed(() => clients.clients.map((c) => ({ value: c.id, label: c.name })))
const paymentOptions = computed(() => reference.paymentMethods.map((p) => ({ value: p.name, label: p.name })))
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="t('cart.title')"
    :subtitle="t('cart.itemsCount', { count: cart.count })"
    width="27rem"
  >
    <div
      v-if="cart.isEmpty"
      class="flex h-full items-center"
    >
      <EmptyState
        icon="fa-solid fa-basket-shopping"
        :title="t('cart.empty')"
        :hint="t('cart.emptyHint')"
      />
    </div>

    <ul
      v-else
      class="flex flex-col gap-2"
    >
      <li
        v-for="line in cart.lines"
        :key="line.key"
        class="flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2.5"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-fg">
            {{ line.product.name }}
          </p>
          <p class="font-mono text-xs text-faint">
            {{ line.product.sku }}
          </p>
        </div>
        <NumberInput
          :model-value="line.qty"
          size="sm"
          :min="1"
          :max="line.maxQty"
          align="right"
          class="w-16"
          @update:model-value="cart.setQty(line.key, $event ?? 1)"
        />
        <span class="w-24 text-right font-mono text-sm text-fg tabular-nums">
          {{ format(line.unitPrice * line.qty) }}
        </span>
        <button
          type="button"
          class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-danger"
          @click="cart.remove(line.key)"
        >
          <Icon
            icon="fa-solid fa-xmark"
            size="sm"
          />
        </button>
      </li>
    </ul>

    <template #footer>
      <div class="flex flex-col gap-3">
        <div class="flex items-end gap-2">
          <Select
            v-model="clientId"
            class="flex-1"
            :label="t('cart.client')"
            :placeholder="t('cart.chooseClient')"
            :options="clientOptions"
          />
        </div>

        <Select
          v-model="paymentMethod"
          :label="t('cart.payment')"
          :options="paymentOptions"
        />

        <p class="text-xs text-faint">
          {{ t('cart.expensesLater') }}
        </p>

        <dl class="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-surface p-3 text-sm">
          <div class="flex justify-between">
            <dt class="text-muted">
              {{ t('cart.sale') }}
            </dt>
            <dd class="font-mono text-fg tabular-nums">
              {{ format(totals.saleTotal) }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              {{ t('cart.goodsCost') }}
            </dt>
            <dd class="font-mono text-muted tabular-nums">
              {{ `− ${format(totals.goodsCost)}` }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              {{ t('cart.deliveryPack') }}
            </dt>
            <dd class="text-xs text-faint">
              {{ t('cart.afterTtn') }}
            </dd>
          </div>
          <div class="flex justify-between border-t border-line-soft pt-1.5">
            <dt class="text-fg">
              {{ t('cart.profit') }}
            </dt>
            <dd class="font-mono font-semibold text-accent tabular-nums">
              {{ format(totals.profit) }}
            </dd>
          </div>
        </dl>

        <Button
          variant="primary"
          block
          :disabled="cart.isEmpty"
          :loading="submitting"
          @click="checkout"
        >
          {{ t('cart.checkout') }}
        </Button>
      </div>
    </template>
  </Drawer>
</template>
