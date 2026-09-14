/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

/*
  La versión sale de tauri.conf.json, que es la única que importa: es la
  que compara el actualizador para decidir si hay algo nuevo. Tenerla
  también adentro de la interfaz permite que el diagnóstico de la
  terminal diga qué versión está instalada, que es la primera pregunta
  de cualquier soporte a distancia.
*/
const version = JSON.parse(
  readFileSync(fileURLToPath(new URL('./src-tauri/tauri.conf.json', import.meta.url)), 'utf8'),
).version as string

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
  define: { __VERSION__: JSON.stringify(version) },
  /*
    Hasta dónde tiene que llegar hacia atrás lo que se compila.

    Adentro del programa instalado corre WebView2, que Windows mantiene
    al día: ahí se puede usar lo último y no tiene sentido compilar para
    navegadores viejos.

    La web es otra cosa. En el local hay al menos una PC con Windows 7
    (la de ventas, verificado el 07/09), y el último Chrome que existe
    para Windows 7 es el 109. El valor por omisión de Vite 8 apunta al
    111, así que esa máquina recibía JavaScript que no entiende y la
    página quedaba en blanco, sin ningún error visible.

    ⚠️ Esto arregla el JavaScript, NO el CSS: Tailwind 4 también pide
    Chrome 111 y usa características que el 109 no tiene. En esas
    máquinas el sistema va a funcionar pero verse mal. La solución de
    fondo es actualizar esas PC.
  */
  build: {
    target: enTauri ? 'baseline-widely-available' : ['chrome109', 'firefox115'],
  },
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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'marca/*.svg', 'fuentes/*.ttf'],
      manifest: {
        name: 'Agroveterinaria Gross · Sistema de gestión',
        short_name: 'Gross',
        description: 'Sistema de gestión de Agroveterinaria Gross',
        lang: 'es-AR',
        theme_color: '#3d0134',
        background_color: '#3d0134',
        display: 'standalone',
        start_url: '/',
        /*
          Íconos en PNG, además del SVG.

          Con el SVG solo, Android instala un acceso directo pobre en vez
          de la aplicación, y el iPhone ni lo mira: usa una captura de la
          pantalla. El «maskable» tiene el isotipo más chico a propósito:
          Android lo recorta en círculo o en gota según el teléfono, y con
          el tamaño normal le comería los bordes al dibujo.
        */
        icons: [
          { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ttf,png}'],
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
