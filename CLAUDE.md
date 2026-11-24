# Sistema de Gestión — Agroveterinaria Gross

Sistema de gestión offline-first para Agroveterinaria Gross (Oberá, Misiones): stock, punto de
venta, caja, cuenta corriente, facturación electrónica ARCA, mayorista y la API de la tienda
online. Lo usan todos los días cuatro PC del mostrador (aplicación de escritorio Tauri, con base
local) y la oficina. Stack: React + Vite + TypeScript en `app/`, Supabase (base, auth, funciones)
en `supabase/`.

## Antes de tocar algo

- **Dónde quedamos:** `docs/AHORA.md`, una página. Lo demás se lee sólo si hace falta, siguiendo
  sus enlaces (`docs/ESTADO.md` es la historia vieja, partida el 09/09).
- **Cómo se llega a cada cosa, cómo se verifica y las zonas delicadas:** `docs/Herramientas.md`.
- **La nota del tema** que se va a tocar (`docs/20 · Módulos/`, `docs/30 · Trampas/`) y las
  decisiones que no se revisan (`docs/10 · Las decisiones que no se revisan.md`).

## Lo imprescindible

- Español rioplatense en respuestas, comentarios del código y commits, también en los avisos cortos
  mientras se trabaja.
- Producción es la única base (Supabase `ywggnhoifhtoncnxrodh`, datos reales del local). Escribir
  datos, cambiar la base, mandar mails o tocar ARCA pide confirmación en el chat.
- Ninguna pantalla se desplaza hacia el costado: se verifica a 375 px.
- En pantalla no se explica lo fiscal (comprobante interno, CAE, percepción): Gross ya lo sabe.
- Los tipos se revisan con `npx tsc -b` en `app/`: `tsc --noEmit -p .` no revisa nada.
- Al terminar una tarea, `docs/AHORA.md` queda al día. Cada versión nueva termina con el bloque de
  PowerShell para publicarla (ver `docs/Herramientas.md`), y antes de decir «falta publicar» se mira
  `latest.json`.
- Lo que se entrega a un tercero (manual, API) va sin estado del proyecto ni nombres de
  proveedores.
- **Modo de la fábrica: la fábrica deja listo y el usuario publica desde la PC** (decidido el
  2026-11-24). Una versión nueva para el local se firma con una clave que está sólo en la PC y se
  sube a mano a Cloudflare, así que la fábrica programa, prueba, sube el código a `main` (eso no
  publica nada) y deja en el informe el bloque para publicar. Zonas delicadas en
  `docs/Herramientas.md`.
- **Todo pedido de cambio en la app va por la fábrica**, aunque el mensaje sea una sola frase:
  antes de empezar, leé y seguí `fabrica/LEEME.md` del repo `agenciailuma-blip/fabrica-iluma` (en
  la sesión, la carpeta `fabrica-iluma`; en la PC, `D:\00 ILUMA\Dev Code\Mi Fábrica de Desarrollo`).
  Si no está en la sesión, pedile al usuario que la abra con el enlace de la fábrica.
