import en from '@/locales/en.json'
import uk from '@/locales/uk.json'
import { safeStorage } from '@/utils/storage'
import { createI18n } from 'vue-i18n'

const STORAGE_KEY = 'torba:locale'
const stored = safeStorage.get(STORAGE_KEY)

const i18n = createI18n({
  legacy: false,
  locale: stored === 'en' || stored === 'uk' ? stored : 'uk',
  fallbackLocale: 'uk',
  messages: { uk, en },
})

export default i18n
