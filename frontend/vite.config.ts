import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        // En docker-compose.dev.yml el backend corre en otro contenedor
        // ("backend", no "localhost") — VITE_API_PROXY_TARGET lo sobreescribe ahí.
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    watch: {
      // Bind mounts de Docker en Windows/macOS no siempre disparan eventos
      // de fs nativos — CHOKIDAR_USEPOLLING=true (seteado en el compose de
      // desarrollo) activa polling para que el HMR siga funcionando.
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
    },
  },
})
