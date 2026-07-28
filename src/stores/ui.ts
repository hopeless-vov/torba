import { defineStore } from 'pinia'
import { ref } from 'vue'

// Cross-page UI state. `search` is the global query in the top bar,
// consumed by the Catalog and Warehouse views.
export const useUiStore = defineStore('ui', () => {
  const search = ref('')

  function setSearch(value: string) {
    search.value = value
  }

  return { search, setSearch }
})
