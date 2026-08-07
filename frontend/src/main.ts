import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import 'primeicons/primeicons.css';
import './style.css';
import App from './App.vue';
import router from './router';

// Paleta teal (igual a la del rediseño) sustituyendo el esmeralda por defecto de Aura.
const FacturasRdPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      200: '#99f6e4',
      300: '#5eead4',
      400: '#2dd4bf',
      500: '#14b8a6',
      600: '#0f766e',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
      950: '#042f2e',
    },
  },
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: FacturasRdPreset,
    // La app es solo clara: el diseño define una única superficie (#eef0f3 de
    // fondo, #fff de tarjeta). `darkModeSelector: 'none'` evita que PrimeVue
    // reaccione al tema del sistema y rompa esa paleta.
    options: { darkModeSelector: 'none' },
  },
});
app.use(ToastService);
app.use(ConfirmationService);
app.mount('#app');
