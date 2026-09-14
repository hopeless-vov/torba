<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import type { ExportFormat } from '@/composables/use-export'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// "Export" on a list screen: a CSV for Excel, or a PDF under our logo. The
// screen builds the table from what it shows; this only asks which file.
defineProps<{ loading?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ select: [format: ExportFormat] }>()

const { t } = useI18n()

const items = computed(() => [
  { value: 'csv' as const, label: t('export.csv'), icon: 'fa-solid fa-file-csv' },
  { value: 'pdf' as const, label: t('export.pdf'), icon: 'fa-solid fa-file-pdf' },
])
</script>

<template>
  <DropdownMenu
    :items="items"
    :heading="t('export.heading')"
    @select="emit('select', $event)"
  >
    <Button
      icon="fa-solid fa-file-arrow-down"
      :loading="loading"
      :disabled="disabled"
      :title="t('export.button')"
    >
      <span class="hidden sm:inline">{{ t('export.button') }}</span>
    </Button>
  </DropdownMenu>
</template>
