// Days as 'YYYY-MM-DD' strings, which is how every date bound in the app is
// compared: `created_at` is UTC and the bounds are plain days, so comparing
// them as text keeps a timezone offset from moving a row across a boundary.

/** How far back the app reads by default — the window the dashboard opens on. */
export const DEFAULT_MONTHS_BACK = 6

const pad = (n: number) => String(n).padStart(2, '0')

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The first day of the month `months - 1` back: the start of "this month and
 * the five before it". The orders store loads from here and the dashboard
 * opens on it, so the chart's default range is always fully covered by what
 * was fetched.
 */
export function periodStart(months = DEFAULT_MONTHS_BACK, now = new Date()): string {
  return isoDay(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1))
}
