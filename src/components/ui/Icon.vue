<script setup lang="ts">
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { tv } from 'tailwind-variants'

// Accepts a Font Awesome lookup string (e.g. "fa-solid fa-house") since
// all free icon packs are registered globally, or an IconDefinition.
withDefaults(
  defineProps<{
    icon: string | string[] | IconDefinition
    size?: 'xs' | 'sm' | 'md' | 'lg'
  }>(),
  {
    size: 'md',
  },
)

const box = tv({
  base: 'inline-flex flex-none items-center justify-center',
  variants: {
    size: {
      xs: 'size-3.5',
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-6',
    },
  },
})
</script>

<template>
  <span :class="box({ size })">
    <FontAwesomeIcon
      :icon="icon"
      class="h-full! w-full!"
    />
  </span>
</template>
