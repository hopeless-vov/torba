import { currenciesApi } from '@/api/currencies'
import { BUILT_IN_CURRENCIES } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { CurrencyPatch } from '@/types/database'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const BUILT_IN_CODES: string[] = BUILT_IN_CURRENCIES.map((c) => c.code)

/** Codes are ISO-ish: 3 letters, stored upper-case. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().slice(0, 3)
}

// CRUD for the extra display currencies. USD and UAH are built in and
// cannot be added or removed here.
export function useCurrencies() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const toast = useToast()
  const { t } = useI18n()

  const currencies = computed(() => reference.currencies)

  async function reload() {
    if (auth.companyId) await reference.load(auth.companyId)
  }

  function validate(code: string): string | null {
    const normalized = normalizeCode(code)
    if (normalized.length < 3) return t('profile.currency.errorCode')
    if (BUILT_IN_CODES.includes(normalized)) return t('profile.currency.errorBuiltIn')
    if (reference.currenciesByCode.has(normalized)) return t('profile.currency.errorExists')
    return null
  }

  async function addCurrency(input: { code: string; symbol: string; usdRate: number }) {
    if (!auth.companyId) return
    const problem = validate(input.code)
    if (problem) {
      toast.error(problem)
      return
    }
    try {
      await currenciesApi.create({
        company_id: auth.companyId,
        code: normalizeCode(input.code),
        symbol: input.symbol.trim() || normalizeCode(input.code),
        usd_rate: input.usdRate || 0,
      })
      await reload()
      toast.success(t('toasts.saved'))
    } catch {
      toast.error(t('errors.save'))
    }
  }

  async function updateCurrency(id: string, patch: CurrencyPatch) {
    try {
      await currenciesApi.update(id, patch)
      await reload()
      toast.success(t('toasts.rateUpdated'))
    } catch {
      toast.error(t('errors.save'))
    }
  }

  async function removeCurrency(id: string) {
    try {
      await currenciesApi.remove(id)
      await reload()
      toast.success(t('toasts.deleted'))
    } catch {
      toast.error(t('errors.delete'))
    }
  }

  return { currencies, addCurrency, updateCurrency, removeCurrency, validate }
}
