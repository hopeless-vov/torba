// Batch numbers are generated, not typed: the warehouse only needs them
// to tell two deliveries of the same product apart. Shape is
// `<SKU>-<NN>`, where NN is the next free sequence for that SKU.

const FALLBACK_PREFIX = 'BATCH'
const SEQUENCE_WIDTH = 2

/** Strips anything that would make a batch number hard to read or sort. */
function toPrefix(sku: string): string {
  const cleaned = sku
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || FALLBACK_PREFIX
}

/**
 * Next batch number for a product, skipping sequences already taken by
 * its existing batches.
 *
 * generateBatchNumber('FRY-500', ['FRY-500-01']) → 'FRY-500-02'
 */
export function generateBatchNumber(sku: string, existing: (string | null)[] = []): string {
  const prefix = toPrefix(sku)
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)

  let highest = 0
  for (const value of existing) {
    const match = value?.trim().toUpperCase().match(pattern)
    if (match) highest = Math.max(highest, Number(match[1]))
  }

  return `${prefix}-${String(highest + 1).padStart(SEQUENCE_WIDTH, '0')}`
}
