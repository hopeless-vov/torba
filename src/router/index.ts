import { rankOf } from '@/composables/use-permissions'
import { useAuthStore } from '@/stores/auth'
import type { MembershipRole } from '@/types/database'
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
    path: '/reset-password',
    name: 'reset-password',
    meta: { public: true },
    component: () => import('@/views/ResetPasswordView.vue'),
  },
  {
    // Public: the recipient may not have an account yet, so they have to be
    // able to land here, sign up, and come back to the same link.
    path: '/invite/:token',
    name: 'invite',
    meta: { public: true },
    component: () => import('@/views/InviteAcceptView.vue'),
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
      { path: 'links', name: 'links', component: () => import('@/views/LinksView.vue') },
      {
        // Managing the team is an administrator's job; a member or viewer who
        // types the URL is bounced to the dashboard (the guard below), and the
        // sidebar never offers the link in the first place.
        path: 'members',
        name: 'members',
        meta: { minRole: 'admin' },
        component: () => import('@/views/MembersView.vue'),
      },
      { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue') },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFoundView.vue'),
      },
    ],
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
  // Page-level role gate: a route may demand a minimum role. The database
  // enforces the same thing, so this is about not showing a screen the user
  // could not use, not about security.
  const minRole = to.meta.minRole as MembershipRole | undefined
  if (minRole && auth.isAuthenticated && rankOf(auth.role) < rankOf(minRole)) {
    return { name: 'dashboard' }
  }
})

export default router
