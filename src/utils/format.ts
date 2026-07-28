// Display formatting. Uses the uk-UA locale so numbers group with spaces
// and use a comma decimal separator, matching the design (e.g. "2 047 ₴").

const LOCALE = 'uk-UA'

export const CURRENCY_SYMBOLS: Record<string, string> = {
  UAH: '₴',
  USD: '$',
  EUR: '€',
}

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency
}

export function formatNumber(amount: number, fractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)
}

/** e.g. formatMoney(2047, 'UAH') → "2 047 ₴"; formatMoney(46, 'USD', 2) → "46,00 $". */
export function formatMoney(amount: number, currency = 'UAH', fractionDigits = 0): string {
  return `${formatNumber(amount, fractionDigits)} ${currencySymbol(currency)}`
}

/** Ratio (0..1) → integer percent string, e.g. 0.48 → "48%". */
export function formatPercent(ratio: number | null, fractionDigits = 0): string {
  if (ratio == null) return '—'
  return `${(ratio * 100).toFixed(fractionDigits)}%`
}

/** ISO date → "dd.MM.yyyy" (e.g. "2026-07-27" → "27.07.2026"). */
export function formatDate(value: string | Date | null): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${d.getUTCFullYear()}`
}
