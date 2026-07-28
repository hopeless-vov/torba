import { safeStorage } from '@/utils/storage'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const STORAGE_KEY = 'torba:locale'

// UI language, persisted and reflected on <html lang>. i18n reads the
// stored value on boot (see src/i18n.ts).
export function useLocale() {
  const { locale } = useI18n({ useScope: 'global' })

  const current = computed({
    get: () => locale.value,
    set: (next: string) => setLocale(next),
  })

  function setLocale(next: string) {
    locale.value = next
    safeStorage.set(STORAGE_KEY, next)
    if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', next)
  }

  return { locale: current, setLocale }
}
