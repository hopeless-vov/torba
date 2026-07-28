<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { useEventListener } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'

withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    width?: string
  }>(),
  {
    title: undefined,
    subtitle: undefined,
    width: '30rem',
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
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <Motion
        v-if="open"
        class="fixed inset-0 z-50 bg-black/50"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.15 }"
        @click.self="close"
      >
        <Motion
          class="absolute top-0 right-0 flex h-full max-w-full flex-col border-l border-line bg-panel shadow-2xl"
          :style="{ width }"
          :initial="{ x: '100%' }"
          :animate="{ x: 0 }"
          :exit="{ x: '100%' }"
          :transition="{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }"
        >
          <div class="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4">
            <div class="flex items-baseline gap-2">
              <h2 class="text-base font-semibold text-fg">
                {{ title }}
              </h2>
              <span
                v-if="subtitle"
                class="text-xs text-muted"
              >{{ subtitle }}</span>
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

          <div class="flex-1 overflow-y-auto px-5 py-4">
            <slot />
          </div>

          <div
            v-if="$slots.footer"
            class="border-t border-line-soft px-5 py-4"
          >
            <slot name="footer" />
          </div>
        </Motion>
      </Motion>
    </AnimatePresence>
  </Teleport>
</template>
