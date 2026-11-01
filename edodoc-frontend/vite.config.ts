import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "path"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = env.VITE_API_BASE_URL || 'http://localhost:8081/api'

  return {
    appType: 'spa',
    plugins: [react(), tailwindcss()],
    define: {
      __VERSIONE_BUILD__: JSON.stringify(new Date().toISOString()),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: '0.0.0.0',
      // 5173 è di Mobilitas: i due gestionali girano insieme in locale
      port: 5174,
      strictPort: true,
      proxy: {
        // Il browser parla solo con Vite: niente CORS, anche da altri dispositivi in LAN
        '/api': {
          target: apiBaseUrl.replace(/\/api\/?$/, ''),
          changeOrigin: true,
        },
      },
    },
  }
})
