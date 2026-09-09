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

/**
 * Which purchase price applies to a batch: its own when it carries one, the
 * product's catalogue price otherwise. Two deliveries of the same product can
 * have cost different money — a promotion, a rate move — and the one on the
 * shelf is the one that decides this sale's margin.
 */
export function costOf(
  batch: { cost_amount: number | null; cost_currency: string | null } | null | undefined,
  product: { cost_amount: number; cost_currency: string },
): { amount: number; currency: string } {
  if (batch?.cost_amount == null) {
    return { amount: product.cost_amount, currency: product.cost_currency }
  }
  return { amount: batch.cost_amount, currency: batch.cost_currency ?? product.cost_currency }
}

/**
 * Which selling price applies to a batch — its own when it carries one, the
 * product's otherwise. A delivery bought on promotion is often passed on
 * cheaper, and the one on the shelf is the one being sold.
 */
export function retailOf(
  batch: { retail_amount: number | null; retail_currency: string | null } | null | undefined,
  product: { retail_amount: number | null; retail_currency: string },
): { amount: number | null; currency: string } {
  if (batch?.retail_amount == null) {
    return { amount: product.retail_amount, currency: product.retail_currency }
  }
  return { amount: batch.retail_amount, currency: batch.retail_currency ?? product.retail_currency }
}

/** Clamp a discount to 0..100 and apply it to an amount. */
export function applyDiscount(amount: number, discountPct: number): number {
  const pct = Math.min(100, Math.max(0, discountPct))
  return amount * (1 - pct / 100)
}
