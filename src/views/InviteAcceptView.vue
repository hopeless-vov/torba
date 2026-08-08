<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useInvite } from '@/composables/use-invite'
import { useAuthStore } from '@/stores/auth'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

// Landing page for an invitation link. It is public, because the recipient
// may not have an account yet: they sign up or sign in first and come back.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { submitting, preview, loadingPreview, previewUnavailable, loadPreview, accept: redeem, signOut } =
  useInvite()

const token = String(route.params.token ?? '')

// A page reload can land here before the session has been restored; treat that
// as "not authenticated yet" and let the preview drive the rest.
const joined = ref(false)

const state = computed(() => {
  if (joined.value) return 'joined'
  if (loadingPreview.value) return 'checking'

  // Preview could not be fetched (most likely migration 0014 is not applied):
  // fall back to the plain flow — sign in, then let the database enforce the
  // email on redemption — rather than blocking everyone as "invalid".
  if (previewUnavailable.value) return auth.isAuthenticated ? 'ready' : 'needs-auth'

  if (!preview.value) return 'checking'

  const s = preview.value.status
  if (s === 'revoked') return 'revoked'
  if (s === 'expired') return 'expired'
  if (s === 'accepted') return 'used'
  if (s === 'invalid') return 'invalid'

  // status is 'pending' from here on.
  if (!auth.isAuthenticated) return 'needs-auth'
  return preview.value.matches_current ? 'ready' : 'wrong-account'
})

onMounted(() => {
  if (!token) {
    preview.value = { company_name: null, email_hint: null, status: 'invalid', matches_current: false }
    return
  }
  void loadPreview(token)
})

async function accept() {
  const companyId = await redeem(token)
  if (!companyId) {
    // The database refused it after all — re-read so the reason shows.
    await loadPreview(token)
    return
  }
  joined.value = true
  await router.push({ name: 'dashboard' })
}

function goRegister() {
  router.push({ name: 'login', query: { redirect: route.fullPath, mode: 'register' } })
}

function goSignIn() {
  router.push({ name: 'login', query: { redirect: route.fullPath } })
}

// Signed in as the wrong person: drop the session and re-check so the page
// falls back to the sign-in / register choice.
async function useAnotherAccount() {
  await signOut()
  await loadPreview(token)
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg p-6">
    <div class="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-line bg-panel p-8 text-center">
      <span class="flex size-12 items-center justify-center rounded-xl bg-accent text-on-accent">
        <Icon icon="fa-solid fa-users" />
      </span>

      <h1 class="text-lg font-semibold text-fg">
        {{ preview?.company_name ? t('invite.titleTo', { company: preview.company_name }) : t('invite.title') }}
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
        <p
          v-if="preview?.email_hint"
          class="font-mono text-sm text-fg"
        >
          {{ preview.email_hint }}
        </p>
        <Button
          variant="primary"
          block
          @click="goRegister"
        >
          {{ t('invite.register') }}
        </Button>
        <Button
          variant="ghost"
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

      <template v-else-if="state === 'wrong-account'">
        <p class="text-sm text-muted">
          {{ t('invite.wrongAccount', { email: preview?.email_hint, current: auth.user?.email }) }}
        </p>
        <Button
          variant="primary"
          block
          @click="useAnotherAccount"
        >
          {{ t('invite.useAnotherAccount') }}
        </Button>
      </template>

      <template v-else-if="state === 'joined'">
        <p class="text-sm text-muted">
          {{ t('invite.accepted') }}
        </p>
      </template>

      <template v-else>
        <p class="text-sm text-danger">
          {{
            state === 'revoked'
              ? t('invite.revoked')
              : state === 'expired'
                ? t('invite.expired')
                : state === 'used'
                  ? t('invite.used')
                  : t('invite.invalid')
          }}
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
