-- ═══════════════════════════════════════════════════════════════
-- PRENDER UNA CATEGORÍA AVISA CUÁNTOS NO SALEN
--
-- Verificando la pantalla apareció esto: al prender una categoría
-- entera, el aviso decía cuántos productos se prendieron pero no
-- cuántos de ésos NO van a salir a la tienda por faltarles el nombre
-- público o el precio.
--
-- En la lista se ve —la marca «Web» queda en ámbar— pero con una
-- categoría de 800 productos nadie mira fila por fila, y el que falta
-- se descubre cuando alguien lo busca en la web y no está.
--
-- Por eso ahora devuelve las dos cosas. Cambia el tipo devuelto, así
-- que la función se borra y se vuelve a crear.
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.definir_venta_online_por_clasificacion(uuid, uuid, boolean);

create function public.definir_venta_online_por_clasificacion(
  p_categoria_id uuid,
  p_marca_id     uuid,
  p_vender       boolean
)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids       uuid[];
  v_cambiados integer;
  v_sin_salir integer;
begin
  if p_categoria_id is null and p_marca_id is null then
    raise exception 'Elegí una categoría o una marca: sin eso se prenderían todos los productos.';
  end if;

  /*
    Los mismos que muestra la lista con ese filtro: los que no están
    dados de baja, de esa categoría y esa marca. Así la cantidad que se
    confirma es la que se ve.
  */
  v_ids := array(
    select p.id from public.producto p
    where p.eliminado_en is null
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
      and (p_marca_id is null or p.marca_id = p_marca_id));

  -- El permiso lo controla la función de adentro, que es la misma que
  -- usa la ficha: una sola regla para prender, se prenda desde donde se prenda.
  v_cambiados := public.definir_venta_online(v_ids, p_vender);

  select count(*) into v_sin_salir
  from app.productos_de_canal(app.canal_de_la_tienda()) pc
  where pc.producto_id = any(v_ids)
    and pc.vender_online
    and pc.motivo is not null;

  return json_build_object('cambiados', v_cambiados, 'sin_salir', v_sin_salir);
end;
$$;

revoke all on function public.definir_venta_online_por_clasificacion(uuid, uuid, boolean) from public, anon;
grant execute on function public.definir_venta_online_por_clasificacion(uuid, uuid, boolean) to authenticated;
