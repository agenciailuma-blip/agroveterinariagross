# Cerrar sesión sólo en esta computadora

Pedido del 28/11. Tamaño grande (toca `app/src/auth/`). OK de Francisco el 28/11.

## Qué pasó

El 28/11 a las 08:16 (hora de acá) se tocó «Cerrar sesión» en una computadora con la cuenta de
Lucas. Según los registros de acceso, esa cuenta quedó cerrada en todas las computadoras donde
estaba abierta; a Lucas se le cerró mientras cargaba una venta.

Causa: `supabase.auth.signOut()` sin opciones usa el alcance `global`.

## Qué cambia

- «Cerrar sesión» cierra sólo la computadora donde se toca (`scope: 'local'`).
- Las otras computadoras con la misma cuenta siguen abiertas.

## Qué no cambia

- Para dejar a alguien afuera de todas las computadoras: quitarle el acceso desde Usuarios.
- Sin base, funciones ni migraciones.

## Cómo se comprueba

Con la versión publicada: la misma cuenta abierta en dos computadoras, cerrar sesión en una; la
otra tiene que seguir trabajando (también pasada una hora, que es cuando renueva la sesión).
