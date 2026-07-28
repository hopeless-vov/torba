<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { useEventListener } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'
import { tv } from 'tailwind-variants'

withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  {
    title: undefined,
    subtitle: undefined,
    size: 'md',
  },
)

const open = defineModel<boolean>('open', { default: false })

defineSlots<{ default?(): unknown; footer?(): unknown }>()

function close() {
  open.value = false
}

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && open.value) close()
})

const panel = tv({
  base: 'w-full rounded-xl border border-line bg-panel shadow-2xl',
  variants: {
    size: { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' },
  },
})
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <Motion
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.15 }"
        @click.self="close"
      >
        <Motion
          :class="panel({ size })"
          :initial="{ opacity: 0, scale: 0.98, y: 8 }"
          :animate="{ opacity: 1, scale: 1, y: 0 }"
          :transition="{ duration: 0.18, ease: 'easeOut' }"
        >
          <div
            v-if="title"
            class="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4"
          >
            <div class="flex flex-col gap-0.5">
              <h2 class="text-base font-semibold text-fg">
                {{ title }}
              </h2>
              <p
                v-if="subtitle"
                class="text-xs text-muted"
              >
                {{ subtitle }}
              </p>
            </div>
            <button
              type="button"
              class="-mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-fg"
              @click="close"
            >
              <Icon
                icon="fa-solid fa-xmark"
                size="sm"
              />
            </button>
          </div>

          <div class="px-5 py-5">
            <slot />
          </div>

          <div
            v-if="$slots.footer"
            class="flex items-center justify-end gap-2 border-t border-line-soft px-5 py-4"
          >
            <slot name="footer" />
          </div>
        </Motion>
      </Motion>
    </AnimatePresence>
  </Teleport>
</template>
