import { defineStore } from 'pinia'
import { ref } from 'vue'

// Cross-page UI state. `search` is the global query in the top bar,
// consumed by the Catalog and Warehouse views. `sidebarOpen` drives the
// mobile off-canvas nav — irrelevant above the `lg` breakpoint, where the
// sidebar is always visible regardless of this flag.
export const useUiStore = defineStore('ui', () => {
  const search = ref('')
  const sidebarOpen = ref(false)

  function setSearch(value: string) {
    search.value = value
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  return { search, setSearch, sidebarOpen, toggleSidebar, closeSidebar }
})
