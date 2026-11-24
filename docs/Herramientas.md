---
tags: [proyecto, herramientas]
actualizado: 2026-11-24
---

# Herramientas — cómo se llega a cada cosa

Lo que lee la fábrica de ILUMA (`fabrica/LEEME.md`) y cualquier sesión nueva. El estado del
proyecto está en [[AHORA]].

## Comandos (en `app/`)

```bash
npm ci
npx tsc -b          # tipos (tsc --noEmit -p . no revisa nada)
npm run prueba      # pruebas (vitest)
npm run lint        # oxlint
npm run build       # compila para revisar; NO sirve para publicar
```

`npm run build` termina con `verificar-dist.mjs`, que avisa que ese `dist` no se puede subir: es
lo esperado, no un error.

**En la nube no hay `.env`.** La compilación pasa igual, pero la app tira «Faltan las variables de
entorno de Supabase» al abrirla. Para mirarla, crear `app/.env` a partir de `app/.env.example` con
la dirección (`https://ywggnhoifhtoncnxrodh.supabase.co`) y la clave publicable (pública; sale de
`get_publishable_keys` del conector de Gross). No se commitea.

## Publicar

- **Push a `main` no publica nada.** No hay publicación automática.
- **Una versión nueva la publica el usuario desde la PC**, porque se firma con la clave de
  `secrets/` (no está en el repositorio):
  1. subir el número de versión en `app/src-tauri/tauri.conf.json`;
  2. `npm run escritorio:publicar` en `app/` (arma la app web y las actualizaciones firmadas);
  3. arrastrar `app/dist` a Cloudflare Pages, proyecto `gross-sistema`.
- **La fábrica** programa, prueba y sube el código a `main`, sube el número de versión y deja en el
  informe el bloque de PowerShell para publicar (`cd` a `app` y `npm.cmd run escritorio:publicar`).
  Nunca corre `escritorio:publicar` ni sube a Cloudflare.
- **Cambios en la base o en las funciones** (zona delicada): la migración va en
  `supabase/migrations/` y se aplica en producción sólo con OK del usuario. Si la versión nueva la
  necesita, se aplica antes de publicarla.

## Cómo se comprueba lo publicado

- **Qué versión tiene el local:** `latest.json` de las actualizaciones en Cloudflare Pages
  (`gross-sistema`). Antes de decir «falta publicar», se mira ahí.
- **Las pantallas** piden iniciar sesión y el asistente no escribe contraseñas: desde la PC, con
  Chrome donde el usuario ya tiene la sesión abierta, o con `npm run dev` y la sesión del usuario.
  Contra la base real sólo se mira; lo que escribe datos de prueba se borra al terminar y queda en
  la auditoría.

## Conectores

- **Supabase Gross** (`mcp__4b7a035c-c121-4836-9a58-31479c27c4d4`): la base de producción. Leer
  sí; escribir, sólo con OK en el chat. No hay base de pruebas.
- Los conectores de otros proyectos están ocultos (`permissions.deny` en `.claude/settings.json`).

## Zonas delicadas

Si un cambio toca algo de esta lista, es grande: se muestra antes qué se va a hacer y espera el OK
del usuario. Ante la duda, también.

| Zona | Archivos |
|---|---|
| Facturación ARCA | `app/src/lib/arca/`, `app/src/lib/comprobante/`, `app/src/lib/api/facturacion.ts`, `comprobante.ts`, `contingencia.ts`, `supabase/functions/arca-*` |
| Base de datos y permisos | `supabase/migrations/`, `supabase/functions/administrar-usuarios/`, `app/src/auth/` |
| Caja y dinero | `app/src/lib/api/caja.ts`, `cierreCaja.ts`, `deuda.ts`, `fiados.ts`, `cheques.ts`, `cuentaProveedores.ts`, `devoluciones.ts`, `costos.ts` |
| Base local y sincronización (offline) | `app/src/lib/local/` |
| Publicación y actualizador | `app/src-tauri/`, `app/publicar-actualizacion.mjs`, `app/verificar-dist.mjs`, `app/package.json`, `secrets/` |
| API de la tienda y mails | `supabase/functions/api-tienda/`, `supabase/functions/enviar-factura/` |

## Qué pruebas pueden escribir datos

En producción, ninguna sin OK del usuario. Las pruebas automáticas (`npm run prueba`, los
`*.prueba.ts`) no tocan la base. Las de `supabase/pruebas/` corren contra la base real: sólo con
OK, y tienen que terminar deshaciendo lo que hicieron. Para mirar pantallas sin la base está
`app/pruebas/vista/`.
