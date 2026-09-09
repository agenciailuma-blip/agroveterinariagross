-- El umbral de stock de un producto, editable desde el editor.
--
-- POR QUE.
-- Sugerencia 7 de Lucas. Los umbrales existen desde la migracion de
-- stock —dos niveles, por producto o por categoria— y el listado ya
-- pinta "Stock bajo" y "Critico" con ellos. Lo unico que faltaba era
-- donde tocarlos. El 07/09 Lucas quiso verlo y no habia pantalla.
--
-- POR QUE UNA FUNCION Y NO UN UPSERT DESDE EL CLIENTE.
-- Se intento primero con `upsert(..., onConflict: 'producto_id')` y
-- FALLA. La unicidad la da un indice PARCIAL:
--
--   create unique index umbral_producto_unico
--     on umbral_stock (producto_id) where ambito = 'producto';
--
-- Postgres solo infiere un indice parcial si la sentencia repite su
-- predicado (`on conflict (producto_id) where ambito = 'producto'`), y
-- PostgREST no lo emite. El error es
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification", y habria aparecido recien al guardar el primer
-- producto con umbral. Verificado contra esta base antes de escribir
-- esto.
--
-- La alternativa era leer-y-despues-escribir desde el navegador: dos
-- viajes y una carrera entre dos pantallas guardando el mismo producto.
--
-- POR QUE SECURITY INVOKER (el de por defecto, sin declarar nada).
-- `umbral_stock` ya tiene RLS que exige `stock.configurar_umbrales`
-- para insertar, actualizar y borrar. Corriendo como quien llama, esa
-- politica sigue decidiendo. Una funcion SECURITY DEFINER aca seria
-- saltearse el permiso para despues volver a chequearlo a mano adentro
-- — mas codigo para llegar al mismo lugar, con una forma mas de
-- equivocarse.

create or replace function public.definir_umbral_producto(
  p_producto_id uuid,
  p_bajo        numeric default null,
  p_critico     numeric default null
) returns void
language plpgsql
as $$
begin
  -- Sin valores, el producto vuelve a heredar el umbral de su categoria
  -- o el general. Es la unica forma de deshacer uno puesto por error, y
  -- no es lo mismo que poner cero: cero es un umbral valido que
  -- significa "avisame recien cuando no quede nada".
  if p_bajo is null and p_critico is null then
    delete from public.umbral_stock
     where producto_id = p_producto_id and ambito = 'producto';
    return;
  end if;

  insert into public.umbral_stock (ambito, producto_id, bajo, critico)
  values ('producto', p_producto_id, coalesce(p_bajo, 0), coalesce(p_critico, 0))
  on conflict (producto_id) where ambito = 'producto'
  do update set bajo = excluded.bajo, critico = excluded.critico;
end $$;

comment on function public.definir_umbral_producto(uuid, numeric, numeric) is
  'Define o quita el umbral propio de un producto. Sin valores, lo borra y el producto vuelve a heredar. Corre como quien llama: el permiso lo sigue exigiendo la RLS de umbral_stock.';

revoke all on function public.definir_umbral_producto(uuid, numeric, numeric) from public;
grant execute on function public.definir_umbral_producto(uuid, numeric, numeric) to authenticated;
