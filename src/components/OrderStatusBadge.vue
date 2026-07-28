<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import type { OrderStatus } from '@/types/database'
import { useI18n } from 'vue-i18n'

defineProps<{ status: OrderStatus }>()

const { t } = useI18n()

const TONE: Record<OrderStatus, 'warn' | 'accent' | 'info' | 'neutral'> = {
  new: 'warn',
  paid: 'accent',
  sent: 'info',
  done: 'neutral',
}
</script>

<template>
  <Badge
    :tone="TONE[status]"
    dot
  >
    {{ t(`status.order.${status}`) }}
  </Badge>
</template>
