import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // Forward /api calls to the FastAPI backend so the browser sees one origin.
      proxy: {
        '/api': env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
      },
    },
  }
})
