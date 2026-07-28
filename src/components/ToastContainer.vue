<script setup lang="ts">
import Toast from '@/components/ui/Toast.vue'
import { useToastStore } from '@/stores/toast'
import { AnimatePresence, Motion } from 'motion-v'

const store = useToastStore()
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence>
        <Motion
          v-for="toast in store.toasts"
          :key="toast.id"
          class="pointer-events-auto cursor-pointer"
          :initial="{ opacity: 0, x: 24, scale: 0.96 }"
          :animate="{ opacity: 1, x: 0, scale: 1 }"
          :exit="{ opacity: 0, x: 24, scale: 0.96 }"
          :transition="{ duration: 0.18, ease: 'easeOut' }"
          @click="store.remove(toast.id)"
        >
          <Toast
            :type="toast.type"
            :message="toast.message"
          />
        </Motion>
      </AnimatePresence>
    </div>
  </Teleport>
</template>
