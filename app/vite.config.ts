import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /*
      El caparazón de la aplicación queda cacheado, así que abre sin
      internet. Sin esto, la base local no sirve de nada: la terminal
      tendría todos los datos y una pantalla en blanco.

      Las fuentes van adentro a propósito: son 855 kB que sólo se bajan
      una vez, y sin ellas el mostrador se ve distinto justo el día que
      se corta la conexión.
    */
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'marca/*.svg', 'fuentes/*.ttf'],
      manifest: {
        name: 'Agroveterinaria Gross · Sistema de gestión',
        short_name: 'Gross',
        description: 'Sistema de gestión de Agroveterinaria Gross',
        lang: 'es-AR',
        theme_color: '#3d0134',
        background_color: '#3d0134',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ttf}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Los datos NO se cachean acá: viven en la base local, que sabe
        // qué está fresco y qué falta subir. Cachear respuestas de la
        // API además serviría datos viejos sin que nadie se entere.
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
