<script setup lang="ts">
withDefaults(
  defineProps<{
    flush?: boolean
    hover?: boolean
  }>(),
  {
    flush: false,
    hover: false,
  },
)
</script>

<template>
  <div
    class="rounded-xl border border-line bg-panel"
    :class="[flush ? '' : 'p-5', hover && 'transition-colors duration-150 hover:border-line-hover']"
  >
    <slot />
  </div>
</template>
