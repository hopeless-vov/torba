import { useColorMode } from '@vueuse/core'
import { computed } from 'vue'

// Light/dark theme, written to `data-theme` on <html> and persisted.
// The CSS tokens in styles/main.css react to that attribute.
export function useTheme() {
  const mode = useColorMode({
    selector: 'html',
    attribute: 'data-theme',
    initialValue: 'dark',
    storageKey: 'torba:theme',
    modes: { light: 'light', dark: 'dark' },
  })

  const isDark = computed(() => mode.value !== 'light')

  function toggle() {
    mode.value = isDark.value ? 'light' : 'dark'
  }

  return { mode, isDark, toggle }
}
