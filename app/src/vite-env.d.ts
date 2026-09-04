/// <reference types="vite/client" />

/*
  La versión del programa, puesta por Vite al compilar desde
  src-tauri/tauri.conf.json — que es la misma que ve el actualizador.

  Se resuelve en tiempo de compilación y no preguntándosela a Tauri,
  para que el diagnóstico diga la versión también cuando se lo abre
  desde el navegador.
*/
declare const __VERSION__: string
