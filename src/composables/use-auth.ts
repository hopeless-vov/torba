import { useAuthStore } from '@/stores/auth'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

export function useAuth() {
  const store = useAuthStore()
  const router = useRouter()
  const route = useRoute()
  const { t } = useI18n()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const info = ref<string | null>(null)

  function mapError(e: unknown): string {
    const msg = e instanceof Error ? e.message : ''
    if (/invalid login credentials/i.test(msg)) return t('auth.errorInvalid')
    return msg || t('auth.errorGeneric')
  }

  function redirectTarget(): string {
    const redirect = route.query.redirect
    return typeof redirect === 'string' ? redirect : '/'
  }

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    info.value = null
    try {
      await store.signIn(email, password)
      await router.replace(redirectTarget())
    } catch (e) {
      error.value = mapError(e)
    } finally {
      loading.value = false
    }
  }

  async function signUp(email: string, password: string, details: { fullName?: string; companyName?: string }) {
    loading.value = true
    error.value = null
    info.value = null
    try {
      const session = await store.signUp(email, password, details)
      if (session) {
        await router.replace(redirectTarget())
      } else {
        info.value = t('auth.checkEmail')
      }
    } catch (e) {
      error.value = mapError(e)
    } finally {
      loading.value = false
    }
  }

  async function resetPassword(email: string) {
    loading.value = true
    error.value = null
    info.value = null
    try {
      const { authApi } = await import('@/api/auth')
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined
      await authApi.resetPassword(email, redirectTo)
      info.value = t('auth.resetSent')
    } catch (e) {
      error.value = mapError(e)
    } finally {
      loading.value = false
    }
  }

  async function updatePassword(newPassword: string) {
    loading.value = true
    error.value = null
    info.value = null
    try {
      const { authApi } = await import('@/api/auth')
      await authApi.updatePassword(newPassword)
      await store.loadContext()
      await router.replace('/')
    } catch (e) {
      error.value = mapError(e)
    } finally {
      loading.value = false
    }
  }

  return { loading, error, info, signIn, signUp, resetPassword, updatePassword }
}
