/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

/*
  El programa instalado y la página web son la misma aplicación, pero no
  necesitan lo mismo.

  Adentro de Tauri los archivos ya viven en el disco de la terminal, así
  que el service worker que hace andar la versión web sin internet no
  sólo sobra: estorba. Guardaría una copia de una copia, y el día que se
  actualiza el sistema la terminal seguiría abriendo la versión vieja
  sin que nadie entienda por qué.

  La variable la pone el propio Tauri cuando compila o corre, así que no
  hay que acordarse de nada.
*/
const enTauri = !!process.env.TAURI_ENV_PLATFORM

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
    ...(enTauri ? [] : [VitePWA({
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
    })]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    /*
      Tauri apunta a esta dirección exacta mientras se desarrolla. Si
      Vite se corriera al 5174 porque el 5173 está ocupado, la ventana
      abriría en blanco sin decir por qué.
    */
    strictPort: enTauri,
    watch: {
      /*
        Vite no tiene que mirar la carpeta donde Rust compila.

        Son miles de archivos que aparecen, cambian y quedan bloqueados
        mientras cargo trabaja. El vigilante de Vite se cae con EBUSY y
        se lleva puesto el modo desarrollo entero, con un error que no
        menciona a Rust por ningún lado.
      */
      ignored: ['**/src-tauri/**'],
    },
  },
  /*
    Las pruebas corren en Node, no en un navegador: lo que se prueba es
    la lógica que decide cosas con plata, no cómo se ve. Dexie necesita
    un IndexedDB igual, y eso lo pone fake-indexeddb desde
    pruebas/preparar.ts.
  */
  test: {
    environment: 'node',
    setupFiles: ['./pruebas/preparar.ts'],
    include: ['src/**/*.prueba.ts', 'src/**/*.prueba.tsx'],
  },
})
