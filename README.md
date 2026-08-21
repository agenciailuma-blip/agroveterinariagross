# Sistema de Gestión — Agroveterinaria Gross

Sistema offline-first para Agroveterinaria Gross (Oberá, Misiones).
Stock, punto de venta, caja, cuenta corriente, facturación electrónica ARCA y sincronización con la tienda online.

Desarrollado por **ILUMA** para Agroveterinaria Gross (CUIT 20146369767 — ERNESTO HUGO GROSS).

> ### 👉 [Leé primero `docs/ESTADO.md`](docs/ESTADO.md)
> Estado actual, decisiones tomadas, qué falta y las trampas ya resueltas.
> Es el documento para retomar el trabajo sin reconstruir el contexto.

---

## Arrancar

```bash
npm --prefix app run dev
```

Queda en `http://localhost:5173`.

---

## Arquitectura

**Offline-first.** El mostrador tiene que seguir vendiendo cuando se cae internet o cuando se cae ARCA — que según el cliente es lo más frecuente.

```
┌─────────────────────────────┐     ┌──────────────────────────┐
│  Mostrador — 4 PC           │     │  Oficina / celular       │
│  · base local en el equipo  │     │  · siempre en línea      │
│  · vende sin conexión       │     │                          │
│  · caja: impresora Hasar    │     │                          │
└──────────────┬──────────────┘     └────────────┬─────────────┘
               │                                 │
               └───────────┬─────────────────────┘
                           ▼
                 ┌───────────────────┐
                 │  Supabase         │
                 │  Postgres + Auth  │
                 │  Edge Functions   │
                 └─────────┬─────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          ARCA         Tienda      (futuro)
        WSFEv1        Zubu API    MercadoLibre
```

Las decisiones de fondo y sus razones están en [`docs/ESTADO.md`](docs/ESTADO.md#3-las-decisiones-que-no-se-revisan).

---

## Estructura

```
app/                     Frontend (Vite + React 19 + TypeScript + Tailwind 4)
  src/lib/local/         Base local, sincronización y bandeja de salida
  src/lib/api/           Acceso a datos, local primero
  src/pages/             Pantallas
docs/                    Documentación del proyecto y del cliente
docs/marca/              Kit de identidad
secrets/                 Claves privadas — NUNCA se commitean
supabase/migrations/     Migraciones SQL versionadas
```

---

## Convenciones

- Todo en **español**, incluido el código.
- **RLS en todas las tablas** de `public`. Leer exige usuario activo; escribir exige un permiso concreto.
- Las funciones `SECURITY DEFINER` viven en el esquema `app`, que no se expone. Las que necesitan estar en `public` verifican el permiso adentro.
- Toda tabla sincronizable lleva `creado_en`, `actualizado_en` y `eliminado_en`. **Nada se borra físicamente.**
- Cada migración explica arriba **por qué**, no qué.

## Seguridad

- La clave privada del certificado de ARCA vive en `secrets/` y **nunca** se commitea. Si llega al repositorio, hay que revocar el certificado y emitir uno nuevo.
- El hash del PIN de operación vive en `app.usuario_pin`, fuera de `public`, para que no pueda quedar expuesto por la API.
- El verificador de PIN de cada terminal se deriva con PBKDF2 e incluye el id de la terminal, así que copiarlo a otra máquina no sirve.
