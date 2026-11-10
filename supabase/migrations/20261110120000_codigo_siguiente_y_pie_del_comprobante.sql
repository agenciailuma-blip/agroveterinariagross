-- ═══════════════════════════════════════════════════════════════
-- EL CÓDIGO SIGUIENTE, Y LA LEYENDA AL PIE DEL COMPROBANTE
--
-- Pedidos de Lucas del 10/11.
--
-- 1. Al crear un producto o un cliente, la ficha propone el código que
--    sigue: el mayor de los numéricos más uno. Es una sugerencia; se
--    puede cambiar. No rellena huecos: en OBTech se buscaba el último
--    y se le sumaba uno, y eso es lo que se espera.
--
--    El orden de texto no sirve («999» va después de «3667»), por eso
--    se calcula acá y no con un filtro desde la app. Corre con los
--    permisos de quien pregunta: ve lo mismo que ya ve en la lista.
--
-- 2. Una leyenda al pie de todos los comprobantes, configurable en
--    Datos del emisor. Arranca con la de la tienda online.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.siguiente_codigo_producto()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select (coalesce(max(codigo::bigint), 0) + 1)::text
    from public.producto
   where eliminado_en is null
     and codigo ~ '^[0-9]{1,15}$';
$$;

create or replace function public.siguiente_codigo_cliente()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select (coalesce(max(codigo::bigint), 0) + 1)::text
    from public.cliente
   where eliminado_en is null
     and codigo ~ '^[0-9]{1,15}$';
$$;

revoke all on function public.siguiente_codigo_producto() from public, anon;
revoke all on function public.siguiente_codigo_cliente() from public, anon;
grant execute on function public.siguiente_codigo_producto() to authenticated;
grant execute on function public.siguiente_codigo_cliente() to authenticated;

insert into public.configuracion (clave, valor, descripcion, grupo)
select 'comercio.pie',
       to_jsonb('Compra fácil, rápido y seguro en:' || chr(10) || 'www.agroveterinariagross.com.ar'),
       'Leyenda que se imprime al pie de todos los comprobantes. Puede tener varias líneas.',
       'comercio'
where not exists (select 1 from public.configuracion where clave = 'comercio.pie');
