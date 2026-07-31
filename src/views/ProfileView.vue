<script setup lang="ts">
import CurrencyManager from '@/components/CurrencyManager.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { usePersonalization } from '@/composables/use-personalization'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useInventoryStore } from '@/stores/inventory'
import { useOrdersStore } from '@/stores/orders'
import { useReferenceStore } from '@/stores/reference'
import { formatMoney } from '@/utils/format'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const reference = useReferenceStore()
const inventory = useInventoryStore()
const clients = useClientsStore()
const orders = useOrdersStore()
const { brandStats, addBrand, removeBrand, addCategory, removeCategory, addPayment, removePayment } =
  usePersonalization()

const tab = ref<'brands' | 'categories' | 'payment' | 'currencies'>('brands')
const newValue = ref('')

const tabs = computed(() => [
  { value: 'brands', label: t('profile.tabs.brands'), count: reference.brands.length },
  { value: 'categories', label: t('profile.tabs.categories'), count: reference.categories.length },
  { value: 'payment', label: t('profile.tabs.payment'), count: reference.paymentMethods.length },
  { value: 'currencies', label: t('profile.tabs.currencies'), count: reference.currencies.length },
])

const email = computed(() => auth.user?.email ?? '')
const name = computed(() => auth.profile?.full_name ?? email.value)
const companyName = computed(() => auth.company?.name ?? '')

const lastSignIn = computed(() => {
  const iso = auth.user?.last_sign_in_at
  if (!iso) return '—'
  const d = new Date(iso)
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} · ${time}`
})

const stats = computed(() => [
  { label: t('profile.stats.brands'), value: reference.brands.length },
  { label: t('profile.stats.products'), value: inventory.products.length },
  { label: t('profile.stats.clients'), value: clients.clients.length },
  { label: t('profile.stats.orders'), value: orders.orders.length },
])

const placeholder = computed(() => {
  if (tab.value === 'brands') return t('profile.brandPlaceholder')
  if (tab.value === 'categories') return t('profile.categoryPlaceholder')
  return t('profile.paymentPlaceholder')
})

const addLabel = computed(() => {
  if (tab.value === 'brands') return t('profile.addBrand')
  if (tab.value === 'categories') return t('profile.addCategory')
  return t('profile.addPayment')
})

async function add() {
  const value = newValue.value.trim()
  if (!value) return
  if (tab.value === 'brands') await addBrand(value)
  else if (tab.value === 'categories') await addCategory(value)
  else await addPayment(value)
  newValue.value = ''
}

async function logout() {
  await auth.signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="grid grid-cols-1 gap-5 p-6 lg:grid-cols-[22rem_1fr]">
    <!-- Account card -->
    <div class="flex flex-col rounded-xl border border-line bg-panel p-6">
      <div class="flex flex-col items-center gap-3 pb-6">
        <Avatar
          :name="name"
          size="lg"
        />
        <div class="text-center">
          <p class="text-base font-semibold text-fg">
            {{ name }}
          </p>
          <p class="text-sm text-muted">
            {{ companyName }}
          </p>
        </div>
        <Badge tone="accent">
          {{ t('profile.owner') }}
        </Badge>
      </div>

      <dl class="flex flex-col divide-y divide-line-soft border-t border-line-soft">
        <div class="flex items-center justify-between py-3">
          <dt class="text-sm text-muted">
            {{ t('profile.email') }}
          </dt>
          <dd class="font-mono text-sm text-fg">
            {{ email }}
          </dd>
        </div>
        <div class="flex items-center justify-between py-3">
          <dt class="text-sm text-muted">
            {{ t('profile.lastSignIn') }}
          </dt>
          <dd class="font-mono text-sm text-fg tabular-nums">
            {{ lastSignIn }}
          </dd>
        </div>
        <div
          v-for="s in stats"
          :key="s.label"
          class="flex items-center justify-between py-3"
        >
          <dt class="text-sm text-muted">
            {{ s.label }}
          </dt>
          <dd class="font-mono text-sm text-fg tabular-nums">
            {{ s.value }}
          </dd>
        </div>
      </dl>

      <Button
        variant="danger"
        block
        class="mt-4"
        @click="logout"
      >
        {{ t('profile.logout') }}
      </Button>
    </div>

    <!-- Personalization -->
    <div class="flex flex-col gap-4 rounded-xl border border-line bg-panel p-6">
      <div>
        <h2 class="text-base font-semibold text-fg">
          {{ t('profile.personalization.title') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('profile.personalization.hint') }}
        </p>
      </div>

      <Tabs
        v-model="tab"
        :tabs="tabs"
      />

      <CurrencyManager v-if="tab === 'currencies'" />

      <form
        v-if="tab !== 'currencies'"
        class="flex items-center gap-2"
        @submit.prevent="add"
      >
        <TextInput
          v-model="newValue"
          class="flex-1"
          :placeholder="placeholder"
        />
        <Button
          type="submit"
          variant="primary"
          :disabled="!newValue.trim()"
        >
          {{ addLabel }}
        </Button>
      </form>

      <!-- Brands -->
      <ul
        v-if="tab === 'brands'"
        class="flex flex-col gap-2"
      >
        <li
          v-for="b in reference.brands"
          :key="b.id"
          class="flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2.5"
        >
          <Avatar
            :name="b.name"
            size="sm"
            tone="muted"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-fg">
              {{ b.name }}
            </p>
            <p class="text-xs text-faint">
              {{ t('profile.brandMeta', brandStats(b.id)) }}
            </p>
          </div>
          <Badge tone="accent">
            {{ formatMoney(b.usd_rate, 'UAH', 2) }}
          </Badge>
          <button
            type="button"
            class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger"
            @click="removeBrand(b.id)"
          >
            <Icon
              icon="fa-solid fa-xmark"
              size="sm"
            />
          </button>
        </li>
      </ul>

      <!-- Categories -->
      <ul
        v-else-if="tab === 'categories'"
        class="flex flex-wrap gap-2"
      >
        <li
          v-for="c in reference.categories"
          :key="c.id"
          class="flex items-center gap-2 rounded-lg border border-line-soft bg-surface py-1.5 pr-1.5 pl-3"
        >
          <span class="text-sm text-fg">{{ c.name }}</span>
          <button
            type="button"
            class="flex size-6 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-danger"
            @click="removeCategory(c.id)"
          >
            <Icon
              icon="fa-solid fa-xmark"
              size="xs"
            />
          </button>
        </li>
      </ul>

      <!-- Payment methods -->
      <ul
        v-else-if="tab === 'payment'"
        class="flex flex-col gap-2"
      >
        <li
          v-for="p in reference.paymentMethods"
          :key="p.id"
          class="flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2.5"
        >
          <Icon
            icon="fa-solid fa-credit-card"
            size="sm"
            class="text-faint"
          />
          <span class="flex-1 text-sm text-fg">{{ p.name }}</span>
          <button
            type="button"
            class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger"
            @click="removePayment(p.id)"
          >
            <Icon
              icon="fa-solid fa-xmark"
              size="sm"
            />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
