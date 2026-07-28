<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import type { BatchStatus } from '@/types/models'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  status: BatchStatus
  daysLeft?: number | null
}>()

const { t } = useI18n()

const TONE: Record<BatchStatus, 'neutral' | 'accent' | 'warn' | 'danger' | 'info'> = {
  expired: 'neutral',
  critical: 'danger',
  ending: 'warn',
  almost: 'info',
  ok: 'accent',
}

const label = computed(() => {
  const base = t(`status.batch.${props.status}`)
  if (props.status === 'expired' || props.status === 'ok' || props.daysLeft == null) return base
  return `${base} · ${t('status.batch.days', { n: props.daysLeft })}`
})
</script>

<template>
  <Badge
    :tone="TONE[status]"
    dot
  >
    {{ label }}
  </Badge>
</template>
