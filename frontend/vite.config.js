/**
 * Configuración de Vite (el "compilador" de React).
 *
 * - En DESARROLLO (npm run dev, puerto 5173): las peticiones a /api se reenvían
 *   (proxy) a Django en el 8000. Así el navegador cree que todo es el mismo origen.
 * - En PRODUCCIÓN (npm run build): los archivos se generan en dist/ y sus rutas
 *   empiezan por /static/, porque es Django (WhiteNoise) quien los sirve.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/static/' : '/',
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
}))
