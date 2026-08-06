<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const code = '404'
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
    <span class="flex size-14 items-center justify-center rounded-2xl bg-surface text-muted">
      <Icon icon="fa-solid fa-compass" />
    </span>
    <p class="mt-6 text-5xl font-bold tracking-tight text-fg">
      {{ code }}
    </p>
    <h1 class="mt-3 text-xl font-semibold text-fg">
      {{ t('not-found.title') }}
    </h1>
    <p class="mt-2 max-w-sm text-sm text-muted">
      {{ t('not-found.body') }}
    </p>
    <Button
      class="mt-8"
      variant="primary"
      @click="router.push('/')"
    >
      {{ t('not-found.back') }}
    </Button>
  </div>
</template>
