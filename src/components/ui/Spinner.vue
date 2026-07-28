<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg'
  }>(),
  {
    size: 'md',
  },
)
</script>

<template>
  <span class="inline-flex items-center justify-center text-muted">
    <Icon
      icon="fa-solid fa-circle-notch"
      :size="size"
      class="animate-spin"
    />
  </span>
</template>
