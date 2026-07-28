import './styles/main.css'
import App from './App.vue'
import i18n from './i18n'
import { appIcons } from './icons'
import router from './router'
import { useAuthStore } from '@/stores/auth'
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

library.add(...appIcons)

const app = createApp(App)
app.component('FontAwesomeIcon', FontAwesomeIcon)

app.use(createPinia())

// Resolve the session before the first navigation so refreshing on a
// protected route does not bounce an authenticated user to /login.
const auth = useAuthStore()
auth
  .init()
  .catch(() => {})
  .finally(() => {
    app.use(router)
    app.use(i18n)
    app.mount('#app')
  })
