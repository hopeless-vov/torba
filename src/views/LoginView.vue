<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useAuth } from '@/composables/use-auth'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { loading, error, info, signIn, signUp, resetPassword } = useAuth()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const fullName = ref('')
const companyName = ref('')

const isRegister = computed(() => mode.value === 'register')

function submit() {
  if (isRegister.value) {
    signUp(email.value, password.value, { fullName: fullName.value, companyName: companyName.value })
  } else {
    signIn(email.value, password.value)
  }
}

function forgot() {
  if (!email.value) {
    info.value = null
    error.value = t('auth.enterEmailFirst')
    return
  }
  resetPassword(email.value)
}

function switchMode() {
  mode.value = isRegister.value ? 'login' : 'register'
  error.value = null
  info.value = null
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-6 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-8 flex items-center gap-3">
        <span class="flex size-9 items-center justify-center rounded-lg bg-accent text-on-accent">
          <Icon icon="fa-solid fa-bag-shopping" />
        </span>
        <span class="text-lg font-semibold text-fg">{{ t('app.name') }}</span>
      </div>

      <h1 class="text-3xl font-bold tracking-tight text-fg">
        {{ isRegister ? t('auth.registerTitle') : t('auth.loginTitle') }}
      </h1>
      <p class="mt-2 text-sm text-muted">
        {{ isRegister ? t('auth.registerSubtitle') : t('auth.loginSubtitle') }}
      </p>

      <form
        class="mt-8 flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <template v-if="isRegister">
          <TextInput
            v-model="fullName"
            size="lg"
            :label="t('auth.fullName')"
            autocomplete="name"
          />
          <TextInput
            v-model="companyName"
            size="lg"
            :label="t('auth.companyName')"
            autocomplete="organization"
          />
        </template>

        <TextInput
          v-model="email"
          type="email"
          size="lg"
          :label="t('auth.email')"
          placeholder="you@example.com"
          autocomplete="email"
        />

        <TextInput
          v-model="password"
          type="password"
          size="lg"
          :label="t('auth.password')"
          placeholder="••••••••"
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
        >
          <template #labelRight>
            <button
              v-if="!isRegister"
              type="button"
              class="cursor-pointer text-xs text-muted transition-colors hover:text-fg"
              @click="forgot"
            >
              {{ t('auth.forgot') }}
            </button>
          </template>
        </TextInput>

        <p
          v-if="error"
          class="text-sm text-danger"
        >
          {{ error }}
        </p>
        <p
          v-else-if="info"
          class="text-sm text-accent"
        >
          {{ info }}
        </p>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          :loading="loading"
        >
          <template v-if="isRegister">
            {{ loading ? t('auth.creating') : t('auth.createAccount') }}
          </template>
          <template v-else>
            {{ loading ? t('auth.signingIn') : t('auth.signIn') }}
          </template>
        </Button>
      </form>

      <div class="mt-6 border-t border-line-soft pt-5 text-sm text-muted">
        <template v-if="isRegister">
          {{ t('auth.haveAccount') }}
        </template>
        <template v-else>
          {{ t('auth.noAccount') }}
        </template>
        <button
          type="button"
          class="ml-1 cursor-pointer font-medium text-accent transition-opacity hover:opacity-80"
          @click="switchMode"
        >
          {{ isRegister ? t('auth.signIn') : t('auth.register') }}
        </button>
      </div>
    </div>
  </main>
</template>
