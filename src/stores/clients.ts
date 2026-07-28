import { clientsApi } from '@/api/clients'
import type { Client } from '@/types/database'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useClientsStore = defineStore('clients', () => {
  const clients = ref<Client[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  async function load(companyId: string) {
    loading.value = true
    try {
      clients.value = await clientsApi.list(companyId)
      loaded.value = true
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
  }

  return { clients, loading, loaded, load, upsert, removeLocal, reset }
})
