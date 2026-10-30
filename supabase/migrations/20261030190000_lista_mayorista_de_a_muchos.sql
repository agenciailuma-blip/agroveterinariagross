/*
  La lista mayorista, de a muchos

  Fase 03, punto 5.2. La planilla carga muchos precios de una vez: o
  entran todos o no entra ninguno, para que un error en la mitad no deje
  la lista a medias. Un precio nulo saca el producto de la lista.
*/
create or replace function public.mayorista_guardar_precios(p_cambios jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista uuid := app.lista_mayorista();
  v_cambio jsonb;
  v_producto uuid;
  v_precio numeric;
  v_cuantos integer := 0;
begin
  if not app.tiene_permiso('productos.editar_precio') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;
  if v_lista is null then
    raise exception 'No hay una lista mayorista configurada.';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'La planilla no se entiende.';
  end if;

  for v_cambio in select value from jsonb_array_elements(p_cambios) loop
    v_producto := (v_cambio ->> 'producto_id')::uuid;
    v_precio := (v_cambio ->> 'precio')::numeric;

    if v_precio is null then
      delete from public.producto_precio_lista
      where producto_id = v_producto and lista_precio_id = v_lista;
    else
      if v_precio <= 0 then
        raise exception 'El precio tiene que ser mayor que cero.';
      end if;
      if not exists (select 1 from public.producto p where p.id = v_producto and p.eliminado_en is null and p.activo) then
        raise exception 'Uno de los productos ya no está en el catálogo.';
      end if;
      insert into public.producto_precio_lista (producto_id, lista_precio_id, precio)
      values (v_producto, v_lista, round(v_precio, 2))
      on conflict (producto_id, lista_precio_id) do update set precio = excluded.precio;
    end if;
    v_cuantos := v_cuantos + 1;
  end loop;
  return v_cuantos;
end;
$$;

revoke all on function public.mayorista_guardar_precios(jsonb) from public, anon;
grant execute on function public.mayorista_guardar_precios(jsonb) to authenticated, service_role;
