<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useTheme } from '@/composables/use-theme'
import { useCartStore } from '@/stores/cart'
import { useUiStore } from '@/stores/ui'
import { formatDate } from '@/utils/format'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const ui = useUiStore()
const cart = useCartStore()
const { isDark, toggle } = useTheme()

const search = computed({
  get: () => ui.search,
  set: (v: string) => ui.setSearch(v),
})

const title = computed(() => (route.name ? t(`nav.${String(route.name)}`) : t('app.name')))
const subtitle = computed(() => (route.name ? t(`${String(route.name)}.subtitle`) : ''))
const today = formatDate(new Date())
</script>

<template>
  <header
    class="sticky top-0 z-20 flex items-center gap-4 border-b border-line bg-panel/80 px-6 py-3 backdrop-blur"
  >
    <div class="flex shrink-0 items-baseline gap-2">
      <h1 class="text-base font-semibold text-fg">
        {{ title }}
      </h1>
      <span class="text-sm text-faint">{{ `/ ${subtitle}` }}</span>
    </div>

    <div class="mx-auto w-full max-w-xl">
      <TextInput
        v-model="search"
        type="search"
        icon-left="fa-solid fa-magnifying-glass"
        :placeholder="t('nav.searchPlaceholder')"
      />
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <span class="hidden font-mono text-xs tracking-wide text-faint tabular-nums sm:inline">
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
