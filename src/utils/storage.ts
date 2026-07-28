// A tiny localStorage wrapper that never throws. Access can fail in
// privacy modes, SSR, or test runtimes that ship a stubbed global — in
// all of those we simply fall back to no persistence.
export const safeStorage = {
  get(key: string): string | null {
    try {
      if (typeof localStorage === 'undefined') return null
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
}
