-- ═══════════════════════════════════════════════════════════════
-- Una orden interna con renglones ya pedidos no se corrige
--
-- Corregir una orden pendiente reemplaza todos sus renglones. Desde el
-- pedido a proveedor (12/10), una orden puede estar pendiente con parte
-- de sus renglones ya pedidos —los de un proveedor sí, los de otro
-- todavía no—. Corregirla borraba esos renglones y los volvía a crear
-- sin su pedido: aparecían otra vez para pedir, y el pedido decía que
-- cubría una orden que ya no lo sabía.
--
-- Se frena con el motivo. Si hace falta corregirla, se anula primero el
-- pedido, que la deja libre.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.guardar_orden_interna(
  p_id          uuid,
  p_emite_id    uuid,
  p_recibe_id   uuid,
  p_lineas      jsonb,
  p_fecha       date default null,
  p_observacion text default null,
  p_cliente_id  uuid default null,
  p_contacto    text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id      uuid := coalesce(p_id, gen_random_uuid());
  v_actual  public.orden_compra_interna;
  v_numero  bigint;
  v_linea   jsonb;
  v_renglon int := 0;
  v_prod    public.producto;
  v_desc    text;
  v_cant    numeric;
begin
  if not app.tiene_permiso('compras.solicitar') then
    raise exception 'No tenés permiso para hacer órdenes de compra internas.';
  end if;

  if not exists (select 1 from public.sector where id = p_emite_id and eliminado_en is null) then
    raise exception 'Falta elegir qué sector la emite.';
  end if;
  if not exists (select 1 from public.sector where id = p_recibe_id and eliminado_en is null) then
    raise exception 'Falta elegir qué sector la recibe.';
  end if;
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La orden no tiene nada para pedir.';
  end if;

  select * into v_actual from public.orden_compra_interna where id = v_id for update;

  if v_actual.id is not null and v_actual.estado <> 'pendiente' then
    raise exception 'La orden % ya está %: no se puede cambiar.', v_actual.numero, v_actual.estado;
  end if;

  -- Corregir reemplaza todos los renglones: los que ya entraron en un
  -- pedido perderían el vínculo y volverían a aparecer para pedir.
  if v_actual.id is not null and exists (
       select 1 from public.orden_compra_interna_linea
        where orden_id = v_id and pedido_id is not null) then
    raise exception 'La orden % ya tiene renglones en un pedido a proveedor: no se puede corregir. Si hace falta, primero hay que anular ese pedido.', v_actual.numero;
  end if;

  if v_actual.id is null then
    insert into public.orden_compra_interna
      (id, fecha, emite_id, recibe_id, observacion, cliente_id, contacto, creada_por)
    values
      (v_id, coalesce(p_fecha, current_date), p_emite_id, p_recibe_id,
       nullif(btrim(coalesce(p_observacion, '')), ''), p_cliente_id,
       nullif(btrim(coalesce(p_contacto, '')), ''), app.usuario_actual_id())
    returning numero into v_numero;
  else
    update public.orden_compra_interna
       set fecha = coalesce(p_fecha, fecha),
           emite_id = p_emite_id,
           recibe_id = p_recibe_id,
           observacion = nullif(btrim(coalesce(p_observacion, '')), ''),
           cliente_id = p_cliente_id,
           contacto = nullif(btrim(coalesce(p_contacto, '')), '')
     where id = v_id;
    v_numero := v_actual.numero;
    delete from public.orden_compra_interna_linea where orden_id = v_id;
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_renglon := v_renglon + 1;
    v_prod := null;
    if nullif(v_linea->>'producto_id', '') is not null then
      select * into v_prod from public.producto where id = (v_linea->>'producto_id')::uuid;
      if v_prod.id is null then
        raise exception 'El renglón % es de un producto que no existe.', v_renglon;
      end if;
    end if;

    v_desc := coalesce(nullif(btrim(coalesce(v_linea->>'descripcion', '')), ''), v_prod.nombre_interno);
    if v_desc is null then
      raise exception 'Al renglón % le falta qué hay que comprar.', v_renglon;
    end if;

    v_cant := nullif(v_linea->>'cantidad', '')::numeric;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Al renglón % («%») le falta la cantidad.', v_renglon, v_desc;
    end if;

    insert into public.orden_compra_interna_linea
      (orden_id, renglon, producto_id, codigo, descripcion, proveedor_id, cantidad)
    values
      (v_id, v_renglon, v_prod.id, v_prod.codigo, v_desc,
       nullif(v_linea->>'proveedor_id', '')::uuid, v_cant);
  end loop;

  return v_numero;
end;
$$;
