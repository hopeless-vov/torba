import { useAuthStore } from '@/stores/auth'
import type { RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    meta: { public: true },
    component: () => import('@/views/LoginView.vue'),
  },
  {
    path: '/',
    component: () => import('@/components/AppLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'catalog', name: 'catalog', component: () => import('@/views/CatalogView.vue') },
      { path: 'warehouse', name: 'warehouse', component: () => import('@/views/WarehouseView.vue') },
      { path: 'clients', name: 'clients', component: () => import('@/views/ClientsView.vue') },
      { path: 'orders', name: 'orders', component: () => import('@/views/OrdersView.vue') },
      { path: 'rates', name: 'rates', component: () => import('@/views/RatesView.vue') },
      { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue') },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

export default router
