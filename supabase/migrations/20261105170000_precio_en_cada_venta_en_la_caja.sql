-- ═══════════════════════════════════════════════════════════════
-- PRECIO EN CADA VENTA, TAMBIÉN AL AGREGAR EN LA CAJA
--
-- En la 0.20.0 el mostrador pregunta el precio de los productos que
-- representan muchos de la góndola (Accesorios varios, Juguetes...). En
-- la caja, agregar uno entraba con el precio de la ficha y había que
-- corregirlo a mano.
--
-- La línea nueva puede traer su precio, y sólo se usa si el producto es
-- de precio en cada venta: por este camino no se cambia el precio de
-- ningún otro producto. Sin precio, el de la ficha, como antes: así una
-- caja que todavía no se actualizó sigue pudiendo agregar.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.editar_venta_en_caja(p_venta_id uuid, p_lineas jsonb, p_cajero_id uuid DEFAULT NULL::uuid, p_terminal_id uuid DEFAULT NULL::uuid)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_venta    public.venta;
  v_cliente  public.cliente;
  v_ajuste   numeric := 0;
  v_cajero   uuid;
  v_anterior numeric;
  v_cambios  jsonb := '[]'::jsonb;
  v_orden    integer := 0;
  v_item     jsonb;
  v_linea    public.venta_linea;
  v_prod     public.producto;
  v_base     numeric;
  v_cant     numeric;
  v_quedan   uuid[] := '{}';
  v_total    numeric;
begin
  if not app.tiene_permiso('ventas.editar_en_caja') then
    raise exception 'No tenes permiso para corregir ventas en la caja.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % y ya no se puede corregir.', v_venta.estado;
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La venta tiene que quedar con al menos un producto. Si no va nada, anulala.';
  end if;

  v_cajero   := coalesce(p_cajero_id, app.usuario_actual_id());
  v_anterior := v_venta.total;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;

  -- Una linea nueva entra con el mismo criterio que las demas, o el
  -- renglon agregado en la caja saldria a un precio distinto del resto.
  if v_venta.lista_precio_id is not null then
    select coalesce(ajuste_porcentaje, 0) into v_ajuste
    from public.lista_precio
    where id = v_venta.lista_precio_id and activo and eliminado_en is null;
    v_ajuste := coalesce(v_ajuste, 0);
  end if;

  for v_item in select * from jsonb_array_elements(p_lineas)
  loop
    v_orden := v_orden + 1;
    v_cant  := (v_item->>'cantidad')::numeric;

    if v_cant is null or v_cant <= 0 then
      raise exception 'Una cantidad tiene que ser mayor que cero. Para sacar el producto, quitalo.';
    end if;

    if v_item ? 'venta_linea_id' and v_item->>'venta_linea_id' is not null then
      select * into v_linea from public.venta_linea
      where id = (v_item->>'venta_linea_id')::uuid and venta_id = p_venta_id;

      if v_linea.id is null then
        raise exception 'Una de las lineas no pertenece a esta venta.';
      end if;

      if v_linea.cantidad <> v_cant then
        v_cambios := v_cambios || jsonb_build_object(
          'accion', 'cantidad', 'descripcion', v_linea.descripcion,
          'antes', v_linea.cantidad, 'despues', v_cant);
      end if;

      update public.venta_linea
      set cantidad = v_cant, orden = v_orden
      where id = v_linea.id;

      v_quedan := v_quedan || v_linea.id;

    else
      select * into v_prod from public.producto
      where id = (v_item->>'producto_id')::uuid and activo and eliminado_en is null;

      if v_prod.id is null then
        raise exception 'El producto que se quiere agregar no existe o esta dado de baja.';
      end if;

      if v_prod.precio_en_cada_venta and nullif(v_item->>'precio', '') is not null then
        v_base := round((v_item->>'precio')::numeric, 2);
        if v_base <= 0 then
          raise exception 'El precio de % tiene que ser mayor que cero.', v_prod.nombre_interno;
        end if;
      else
        select precio_final into v_base
        from public.calcular_precio(v_prod.id, null, 1, coalesce(v_cliente.descuento_porcentaje, 0));
      end if;

      insert into public.venta_linea (
        venta_id, orden, producto_id, codigo_producto, descripcion, cantidad,
        precio_original, precio_acordado, precio_unitario, alicuota_iva_id, condicion_iva
      ) values (
        p_venta_id, v_orden, v_prod.id, v_prod.codigo, v_prod.nombre_interno, v_cant,
        v_base, v_base, round(v_base * (1 + v_ajuste / 100), 4),
        v_prod.alicuota_iva_id, 'gravado'
      )
      returning id into v_linea.id;

      v_cambios := v_cambios || jsonb_build_object(
        'accion', 'agregar', 'descripcion', v_prod.nombre_interno,
        'antes', 0, 'despues', v_cant);

      v_quedan := v_quedan || v_linea.id;
    end if;
  end loop;

  for v_linea in
    select * from public.venta_linea
    where venta_id = p_venta_id and not (id = any(v_quedan))
  loop
    v_cambios := v_cambios || jsonb_build_object(
      'accion', 'quitar', 'descripcion', v_linea.descripcion,
      'antes', v_linea.cantidad, 'despues', 0);
  end loop;

  delete from public.venta_linea
  where venta_id = p_venta_id and not (id = any(v_quedan));

  select total into v_total from public.venta where id = p_venta_id;

  -- Sin cambios no se anota nada: la bandeja reintenta, y un registro
  -- por intento mostraria tres ediciones donde hubo una.
  if jsonb_array_length(v_cambios) > 0 then
    insert into public.venta_edicion
      (venta_id, cajero_id, terminal_id, total_anterior, total_nuevo, cambios)
    values (p_venta_id, v_cajero, p_terminal_id, v_anterior, v_total, v_cambios);
  end if;

  return v_total;
end;
$$;
