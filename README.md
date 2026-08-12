# Sistema de Gestión — Agroveterinaria Gross

Sistema de gestión offline-first para Agroveterinaria Gross (Oberá, Misiones).
Stock, ventas con caja, cuenta corriente, facturación electrónica ARCA y sincronización con la tienda online.

Desarrollado por **ILUMA** para Agroveterinaria Gross (CUIT 20146369767 — ERNESTO HUGO GROSS).

---

## Documentación

| Documento | Contenido |
|---|---|
| [Alcance V1](docs/alcance-v1.md) | Qué entra en V1-A y V1-B, definición de terminado, backlog |
| [Guía de reunión 1](docs/reunion-cliente-01.md) | Relevamiento y no negociables |
| [Agenda del contador](docs/agenda-contador.md) | Consultas fiscales pendientes |

---

## Arquitectura

**Offline-first.** El mostrador tiene que seguir vendiendo cuando se cae internet o cuando se cae ARCA — que según el cliente es lo más frecuente.

```
┌─────────────────────────────┐     ┌──────────────────────────┐
│  Mostrador — 4 PC (Tauri)   │     │  Oficina / celular (PWA) │
│  · base local cifrada       │     │  · siempre online        │
│  · opera sin conexión       │     │                          │
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

### Decisiones que no se revisan

1. **El stock se sincroniza como movimientos, no como saldos.** El saldo es la suma de los movimientos. Si dos terminales offline venden la última unidad, el sistema lo detecta en lugar de perder una venta.
2. **Las claves primarias son UUID generadas por el cliente.** Sin esto no hay alta de registros sin conexión.
3. **No se borra físicamente.** Baja lógica con `eliminado_en`, para que la baja también viaje a las terminales.
4. **Un punto de venta de ARCA por caja que factura.** Los vendedores no facturan, así que alcanza con uno.
5. **Sólo la caja emite comprobantes.** El vendedor arma la venta con su PIN y la envía a caja.

---

## Estructura

```
docs/                    Documentación del proyecto y del cliente
secrets/                 Claves privadas — NUNCA se commitean (ver .gitignore)
supabase/migrations/     Migraciones SQL versionadas
```

## Base de datos

Migraciones en `supabase/migrations/`, en orden cronológico.

| Migración | Contenido |
|---|---|
| `20260812120000_fundaciones` | Extensiones, schema `app`, auditoría, configuración |
| `20260812120100_usuarios_y_permisos` | Roles, permisos, usuarios con PIN, terminales, puntos de venta |
| `20260812120200_catalogo` | Productos, clasificación facetada, códigos de barra |

### Convenciones

- Toda tabla sincronizable lleva `creado_en`, `actualizado_en` y `eliminado_en`.
- RLS habilitado en **todas** las tablas de `public`.
- Las funciones `SECURITY DEFINER` viven en el schema `app`, que no se expone por la Data API.
- Leer requiere ser usuario activo; escribir requiere un permiso concreto.

## Seguridad

- La clave privada del certificado de ARCA vive en `secrets/` y **nunca** se commitea. Si llega al repositorio, hay que revocar el certificado y emitir uno nuevo.
- El hash del PIN de operación vive en `app.usuario_pin`, fuera de `public`, para que no pueda quedar expuesto por la Data API.
- La base local de las terminales va cifrada.
