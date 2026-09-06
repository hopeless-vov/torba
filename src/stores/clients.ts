import { clientsApi } from '@/api/clients'
import type { Client } from '@/types/database'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useClientsStore = defineStore('clients', () => {
  const clients = ref<Client[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function load(companyId: string) {
    loading.value = true
    error.value = null
    try {
      clients.value = await clientsApi.list(companyId)
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  function upsert(client: Client) {
    const idx = clients.value.findIndex((c) => c.id === client.id)
    if (idx >= 0) clients.value[idx] = client
    else clients.value.unshift(client)
  }

  function removeLocal(id: string) {
    clients.value = clients.value.filter((c) => c.id !== id)
  }

  function reset() {
    clients.value = []
    loaded.value = false
    error.value = null
  }

  return { clients, loading, loaded, error, load, upsert, removeLocal, reset }
})
