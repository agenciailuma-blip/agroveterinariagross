-- ═══════════════════════════════════════════════════════════════
-- LA API DE LA TIENDA TIENE UNA SOLA PUERTA
--
-- Supabase le da permiso de ejecución a los usuarios con sesión
-- (authenticated) sobre cada función nueva del esquema public, y el
-- "revoke ... from public" de la migración anterior no lo saca: es un
-- permiso aparte. No era un riesgo —sin la clave de la tienda no
-- devuelven nada—, pero la API tiene que tener una sola entrada, la
-- llave pública que usa la función api-tienda. Dos entradas son dos
-- lugares que revisar el día que algo no cierre.
-- ═══════════════════════════════════════════════════════════════
revoke execute on function public.api_tienda_catalogo(text, text, integer) from authenticated, service_role;
revoke execute on function public.api_tienda_clasificaciones(text)         from authenticated, service_role;
