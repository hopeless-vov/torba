import { currenciesApi } from '@/api/currencies'
import { BUILT_IN_CODES } from '@/composables/use-currency'
import { useToast } from '@/composables/use-toast'
import { useAuthStore } from '@/stores/auth'
import { useReferenceStore } from '@/stores/reference'
import type { CurrencyPatch } from '@/types/database'
import { CURRENCY_SYMBOLS } from '@/utils/format'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/** Codes are ISO-ish: 3 letters, stored upper-case. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().slice(0, 3)
}

function symbolFor(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code
}

// CRUD for the company's display currencies and their central rates. USD is
// the stored base (rate always 1) and can neither be added nor edited. UAH
// and EUR are built into the dropdown but their rate is stored here like any
// other, so `setRate` creates the row the first time and updates it after.
export function useCurrencies() {
  const auth = useAuthStore()
  const reference = useReferenceStore()
  const toast = useToast()
  const { t } = useI18n()

  const currencies = computed(() => reference.currencies)

  async function reload() {
    if (auth.companyId) await reference.load(auth.companyId)
  }

  // Only for adding a *custom* currency via the form — the built-ins are
  // managed through `setRate`, never added.
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
        symbol: input.symbol.trim() || symbolFor(normalizeCode(input.code)),
        usd_rate: input.usdRate || 0,
      })
      await reload()
      toast.success(t('toasts.saved'))
    } catch {
      toast.error(t('errors.save'))
    }
  }

  // Upsert the central rate for a code — creates the row for a built-in
  // (UAH/EUR) the first time its rate is set, updates it thereafter.
  async function setRate(code: string, usdRate: number) {
    const normalized = normalizeCode(code)
    if (!auth.companyId || normalized === 'USD') return
    const existing = reference.currenciesByCode.get(normalized)
    try {
      if (existing) {
        await currenciesApi.update(existing.id, { usd_rate: usdRate || 0 })
      } else {
        await currenciesApi.create({
          company_id: auth.companyId,
          code: normalized,
          symbol: symbolFor(normalized),
          usd_rate: usdRate || 0,
        })
      }
      await reload()
      toast.success(t('toasts.rateUpdated'))
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

  return { currencies, addCurrency, setRate, updateCurrency, removeCurrency, validate }
}
