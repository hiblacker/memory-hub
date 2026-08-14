import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'

import App from './App.vue'
import './styles.css'

createApp(App).use(createPinia()).use(VueQueryPlugin).mount('#app')
