// Every currency the runtime knows (ISO 4217), with the symbol and name it
// prints for it. This is what "add a currency" offers: the pick is from the
// real world, not from a list someone has to keep. The first time a company
// picks a code, it joins the platform list (see 0020).

export interface WorldCurrency {
  code: string
  symbol: string
  name: string
}

/** The short symbol a price is shown under — "₴", "$", "zł" — or the code itself. */
export function currencySymbol(code: string, locale = 'uk'): string {
  try {
    const part = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency')
    return part?.value || code
  } catch {
    return code
  }
}

export function currencyName(code: string, locale = 'uk'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Currencies never offered: the Russian rouble, current code and old. The database refuses them too (0021). */
export const EXCLUDED_CURRENCIES: ReadonlySet<string> = new Set(['RUB', 'RUR'])

export function isOffered(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && !EXCLUDED_CURRENCIES.has(code)
}

export function worldCurrencies(locale = 'uk'): WorldCurrency[] {
  let codes: string[]
  try {
    codes = Intl.supportedValuesOf('currency')
  } catch {
    codes = []
  }
  return codes
    .filter(isOffered)
    .map((code) => ({ code, symbol: currencySymbol(code, locale), name: currencyName(code, locale) }))
}
