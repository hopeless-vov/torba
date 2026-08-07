import { useUiStore } from '@/stores/ui'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

describe('ui store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with the mobile sidebar closed', () => {
    const store = useUiStore()
    expect(store.sidebarOpen).toBe(false)
  })

  it('toggles the sidebar open and closed', () => {
    const store = useUiStore()
    store.toggleSidebar()
    expect(store.sidebarOpen).toBe(true)
    store.toggleSidebar()
    expect(store.sidebarOpen).toBe(false)
  })

  it('closeSidebar always leaves it closed', () => {
    const store = useUiStore()
    store.toggleSidebar()
    store.closeSidebar()
    expect(store.sidebarOpen).toBe(false)
  })
})
