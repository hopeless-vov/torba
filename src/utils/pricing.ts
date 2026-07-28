// Pricing helpers. USD is canonical; display prices are derived from a
// brand's exchange rate. Margin is a ratio, so it is the same in any
// currency and is computed straight from the USD figures.

export function convertPrice(usd: number, rate: number): number {
  return usd * rate
}

/** Margin as a 0..1 ratio, or null when there is no valid retail price. */
export function computeMargin(priceUsd: number, retailUsd: number | null): number | null {
  if (retailUsd == null || retailUsd <= 0) return null
  return (retailUsd - priceUsd) / retailUsd
}

/** Clamp a discount to 0..100 and apply it to an amount. */
export function applyDiscount(amount: number, discountPct: number): number {
  const pct = Math.min(100, Math.max(0, discountPct))
  return amount * (1 - pct / 100)
}
