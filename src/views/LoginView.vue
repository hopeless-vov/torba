<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useAuth } from '@/composables/use-auth'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const { loading, error, info, signIn, signUp, resetPassword } = useAuth()

// An invitation link sends new recipients here in sign-up mode: they have no
// account, and the invitation is tied to a specific email, so the register
// path has to be the one they land on.
const mode = ref<'login' | 'register'>(route.query.mode === 'register' ? 'register' : 'login')
const fromInvite = computed(
  () => typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/invite/'),
)
const email = ref('')
const password = ref('')
const fullName = ref('')
const companyName = ref('')
// Only asked for on sign-up; signing in again does not re-prompt.
const acceptedTerms = ref(false)

const isRegister = computed(() => mode.value === 'register')

function submit() {
  // The button is disabled without it, but Enter in a field can still submit.
  if (isRegister.value && !acceptedTerms.value) return
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
      <p
        v-if="fromInvite"
        class="mt-3 rounded-lg border border-accent-line bg-accent-soft px-3 py-2 text-sm text-fg"
      >
        {{ t('auth.inviteHint') }}
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

        <!-- The link opens in a new tab so a half-filled form is not lost,
             and stops the click from toggling the wrapping label. -->
        <Checkbox
          v-if="isRegister"
          v-model="acceptedTerms"
        >
          <i18n-t
            keypath="terms.accept"
            scope="global"
          >
            <template #link>
              <RouterLink
                :to="{ name: 'terms' }"
                target="_blank"
                class="text-accent underline underline-offset-2 hover:opacity-80"
                :title="t('terms.openInNew')"
                @click.stop
              >
                {{ t('terms.acceptLink') }}
              </RouterLink>
            </template>
          </i18n-t>
        </Checkbox>

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
          :disabled="isRegister && !acceptedTerms"
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
