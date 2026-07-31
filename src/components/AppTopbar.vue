<script setup lang="ts">
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import Icon from '@/components/ui/Icon.vue'
import Tabs from '@/components/ui/Tabs.vue'
import { useCurrency } from '@/composables/use-currency'
import { useLocale } from '@/composables/use-locale'
import { useTheme } from '@/composables/use-theme'
import { useCartStore } from '@/stores/cart'
import { formatDate } from '@/utils/format'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

// Search lives in each page's own toolbar, next to that page's filters —
// a single global box could not say what it was searching.
const { t } = useI18n()
const route = useRoute()
const cart = useCartStore()
const { isDark, toggle } = useTheme()
const { code, symbol, options, setCurrency } = useCurrency()
const { locale, setLocale } = useLocale()

// Built-ins plus whatever the owner added in Profile → Currencies.
const currencyItems = computed(() =>
  options.value.map((c) => ({ value: c.code, label: `${c.symbol}  ${c.code}` })),
)

const language = computed({
  get: () => locale.value,
  set: (v: string) => setLocale(v),
})
const languageTabs = [
  { value: 'uk', label: 'UK' },
  { value: 'en', label: 'EN' },
]

const title = computed(() => (route.name ? t(`nav.${String(route.name)}`) : t('app.name')))
const subtitle = computed(() => (route.name ? t(`${String(route.name)}.subtitle`) : ''))
const today = formatDate(new Date())
</script>

<template>
  <header
    class="sticky top-0 z-20 flex items-center gap-4 border-b border-line bg-panel/80 px-6 py-3 backdrop-blur"
  >
    <div class="flex min-w-0 flex-1 items-baseline gap-2">
      <h1 class="text-base font-semibold text-fg">
        {{ title }}
      </h1>
      <span class="truncate text-sm text-faint">{{ `/ ${subtitle}` }}</span>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <DropdownMenu
        :items="currencyItems"
        @select="setCurrency"
      >
        <button
          type="button"
          :title="t('nav.currency')"
          class="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-fg transition-colors hover:bg-hover"
        >
          <span class="font-mono">{{ symbol }}</span>
          <span class="text-xs text-faint">{{ code }}</span>
          <Icon
            icon="fa-solid fa-chevron-down"
            size="xs"
            class="text-faint"
          />
        </button>
      </DropdownMenu>

      <Tabs
        v-model="language"
        :tabs="languageTabs"
        size="sm"
        class="hidden lg:inline-flex"
      />

      <span class="hidden font-mono text-xs tracking-wide text-faint tabular-nums xl:inline">
        {{ today }}
      </span>

      <button
        type="button"
        :title="t('nav.theme')"
        class="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-hover hover:text-fg"
        @click="toggle"
      >
        <Icon
          :icon="isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun'"
          size="sm"
        />
      </button>

      <button
        type="button"
        class="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm text-fg transition-colors hover:bg-hover"
        @click="cart.toggle(true)"
      >
        <Icon
          icon="fa-solid fa-basket-shopping"
          size="sm"
          class="text-faint"
        />
        <span>{{ t('nav.cart') }}</span>
        <span class="text-faint tabular-nums">{{ `· ${cart.count}` }}</span>
      </button>
    </div>
  </header>
</template>
