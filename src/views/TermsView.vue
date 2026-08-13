<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

// Public, and reachable from the sign-up form — someone deciding whether to
// accept has to be able to read this before they have an account.
const { t } = useI18n()
const router = useRouter()

const sections = ['service', 'account', 'data', 'acceptable', 'availability', 'liability', 'changes', 'contact']

function back() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'login' })
}
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
    <div class="flex items-center gap-3">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">
        <Icon icon="fa-solid fa-bag-shopping" />
      </span>
      <span class="text-lg font-semibold text-fg">{{ t('app.name') }}</span>
    </div>

    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight text-fg">
        {{ t('terms.title') }}
      </h1>
      <p class="text-sm text-muted">
        {{ t('terms.subtitle') }}
      </p>
      <p class="font-mono text-xs text-faint">
        {{ t('terms.updated') }}
      </p>
    </header>

    <!-- Deliberately loud: this text has not been through a lawyer, and
         shipping it as-is to real customers would be a mistake. -->
    <p class="flex items-start gap-2 rounded-lg border border-warn-soft bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
      <Icon
        icon="fa-solid fa-triangle-exclamation"
        size="xs"
        class="mt-0.5 shrink-0"
      />
      {{ t('terms.draftNotice') }}
    </p>

    <section
      v-for="key in sections"
      :key="key"
      class="flex flex-col gap-1.5"
    >
      <h2 class="text-sm font-semibold text-fg">
        {{ t(`terms.sections.${key}.title`) }}
      </h2>
      <p class="text-sm leading-relaxed text-muted">
        {{ t(`terms.sections.${key}.body`) }}
      </p>
    </section>

    <div class="pt-2">
      <Button
        icon="fa-solid fa-arrow-right-from-bracket"
        @click="back"
      >
        {{ t('terms.back') }}
      </Button>
    </div>
  </main>
</template>
