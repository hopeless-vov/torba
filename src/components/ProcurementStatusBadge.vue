<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import type { ProcurementStatus } from '@/types/database'
import { useI18n } from 'vue-i18n'

defineProps<{ status: ProcurementStatus }>()

const { t } = useI18n()

const TONE: Record<ProcurementStatus, 'danger' | 'info' | 'accent'> = {
  to_order: 'danger',
  ordered: 'info',
  delivered: 'accent',
}
</script>

<template>
  <Badge
    :tone="TONE[status]"
    dot
  >
    {{ t(`status.procurement.${status}`) }}
  </Badge>
</template>
