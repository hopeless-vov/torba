import { useToastStore } from '@/stores/toast'

// Thin helper over the toast store so composables read as
// `toast.success(...)` / `toast.error(...)`.
export function useToast() {
  const store = useToastStore()
  return {
    success: (message: string) => store.push('success', message),
    error: (message: string) => store.push('error', message),
    info: (message: string) => store.push('info', message),
  }
}
