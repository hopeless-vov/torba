<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { useI18n } from 'vue-i18n'

// Shown wherever a price has nothing to be converted by: its supplier has no
// rate yet for the currency the price is in. Rather than only saying so, it
// leads to the one place that fixes it — that supplier's row on /rates.
defineProps<{ brandId: string | null; currency: string }>()

const { t } = useI18n()
</script>

<template>
  <RouterLink
    :to="{ name: 'rates', query: brandId ? { brand: brandId } : {} }"
    :title="t('rates.missingFor', { code: currency })"
    class="inline-flex items-center gap-1 text-xs text-warn hover:underline"
  >
    <Icon
      icon="fa-solid fa-triangle-exclamation"
      size="xs"
    />
    {{ t('rates.addForSupplier') }}
  </RouterLink>
</template>
