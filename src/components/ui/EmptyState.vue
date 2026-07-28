<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

withDefaults(
  defineProps<{
    icon?: string
    title: string
    hint?: string
  }>(),
  {
    icon: 'fa-solid fa-inbox',
    hint: undefined,
  },
)
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    <span class="flex size-12 items-center justify-center rounded-full bg-chip text-faint">
      <Icon
        :icon="icon"
        size="lg"
      />
    </span>
    <div class="flex flex-col gap-1">
      <p class="text-sm font-medium text-fg">
        {{ title }}
      </p>
      <p
        v-if="hint"
        class="text-xs text-muted"
      >
        {{ hint }}
      </p>
    </div>
    <slot />
  </div>
</template>
