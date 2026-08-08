<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useInvite } from '@/composables/use-invite'
import { useAuthStore } from '@/stores/auth'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

// Landing page for an invitation link. It is public, because the recipient
// may not have an account yet: they sign up or sign in first and come back.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { submitting, accept: redeem } = useInvite()

type State = 'checking' | 'needs-auth' | 'ready' | 'invalid' | 'accepted'

const state = ref<State>('checking')

const token = String(route.params.token ?? '')

onMounted(() => {
  if (!token) state.value = 'invalid'
  else state.value = auth.isAuthenticated ? 'ready' : 'needs-auth'
})

async function accept() {
  const companyId = await redeem(token)
  if (!companyId) {
    state.value = 'invalid'
    return
  }
  state.value = 'accepted'
  await router.push({ name: 'dashboard' })
}

function goSignIn() {
  router.push({ name: 'login', query: { redirect: route.fullPath } })
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg p-6">
    <div class="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-line bg-panel p-8 text-center">
      <span class="flex size-12 items-center justify-center rounded-xl bg-accent text-on-accent">
        <Icon icon="fa-solid fa-users" />
      </span>

      <h1 class="text-lg font-semibold text-fg">
        {{ t('invite.title') }}
      </h1>

      <template v-if="state === 'checking'">
        <Spinner />
        <p class="text-sm text-muted">
          {{ t('invite.checking') }}
        </p>
      </template>

      <template v-else-if="state === 'needs-auth'">
        <p class="text-sm text-muted">
          {{ t('invite.signInFirst') }}
        </p>
        <Button
          variant="primary"
          block
          @click="goSignIn"
        >
          {{ t('invite.signIn') }}
        </Button>
      </template>

      <template v-else-if="state === 'ready'">
        <p class="font-mono text-sm text-muted">
          {{ auth.user?.email }}
        </p>
        <Button
          variant="primary"
          block
          :loading="submitting"
          @click="accept"
        >
          {{ t('invite.accept') }}
        </Button>
      </template>

      <template v-else-if="state === 'accepted'">
        <p class="text-sm text-muted">
          {{ t('invite.accepted') }}
        </p>
      </template>

      <template v-else>
        <p class="text-sm text-danger">
          {{ t('invite.invalid') }}
        </p>
        <Button
          block
          @click="router.push({ name: 'dashboard' })"
        >
          {{ t('invite.backHome') }}
        </Button>
      </template>
    </div>
  </div>
</template>
