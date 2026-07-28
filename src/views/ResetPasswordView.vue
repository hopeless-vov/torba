<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useAuth } from '@/composables/use-auth'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { loading, error, updatePassword } = useAuth()

const password = ref('')
const confirm = ref('')

function submit() {
  if (password.value !== confirm.value) {
    error.value = t('auth.passwordMismatch')
    return
  }
  updatePassword(password.value)
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-6 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-8 flex items-center gap-3">
        <span class="flex size-9 items-center justify-center rounded-lg bg-accent text-on-accent">
          <Icon icon="fa-solid fa-lock" />
        </span>
        <span class="text-lg font-semibold text-fg">{{ t('app.name') }}</span>
      </div>

      <h1 class="text-3xl font-bold tracking-tight text-fg">
        {{ t('auth.resetTitle') }}
      </h1>
      <p class="mt-2 text-sm text-muted">
        {{ t('auth.resetSubtitle') }}
      </p>

      <form
        class="mt-8 flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <TextInput
          v-model="password"
          type="password"
          size="lg"
          :label="t('auth.newPassword')"
          placeholder="••••••••"
          autocomplete="new-password"
        />
        <TextInput
          v-model="confirm"
          type="password"
          size="lg"
          :label="t('auth.confirmPassword')"
          placeholder="••••••••"
          autocomplete="new-password"
        />

        <p
          v-if="error"
          class="text-sm text-danger"
        >
          {{ error }}
        </p>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          :loading="loading"
          :disabled="!password || !confirm"
        >
          {{ t('auth.updatePassword') }}
        </Button>
      </form>
    </div>
  </main>
</template>
