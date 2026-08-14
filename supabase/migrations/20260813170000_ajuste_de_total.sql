-- ═══════════════════════════════════════════════════════════════
-- 017 — AJUSTE DEL TOTAL EN LA CAJA
--
-- "Dale, te queda en mil."
--
-- Redondear el total para un cliente conocido es parte de como se
-- atiende en un mostrador, y no tenerlo obliga a la gente a inventar
-- vueltas: cargar el producto mal, poner un descuento falso, o cobrar de
-- menos y descuadrar la caja. Mejor que exista, con motivo y responsable.
--
-- POR QUE SE PRORRATEA EN LAS LINEAS
--
-- Podria guardarse como un descuento global, pero el comprobante fiscal
-- necesita el IVA discriminado por alicuota, y una venta puede tener
-- productos al 21 y al 10,5. Un descuento global habria que prorratearlo
-- igual para calcular cada base imponible. Se hace de una vez, en las
-- lineas, y todo lo demas sigue funcionando sin enterarse.
--
-- Se ajusta el precio ACORDADO, no el cobrado. Asi la rebaja sobrevive
-- si despues cambia el medio de pago: el cliente que negocio mil pesos
-- no los pierde porque la tarjeta no paso y termino pagando en efectivo.
--
-- EL CENTAVO QUE SOBRA
--
-- Prorratear reparte con redondeo, y la suma de las partes rara vez cae
-- exactamente en el objetivo. La diferencia se carga sobre la linea de
-- mayor importe, que es donde menos se nota. Sin esto, el cajero dice
-- mil y el sistema pide 1000,01, y el cobro se rechaza.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.ajustar_total_venta(
  p_venta_id    uuid,
  p_nuevo_total numeric,
  p_motivo      text,
  p_usuario_id  uuid default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado    text;
  v_lista     uuid;
  v_ajuste    numeric := 0;
  v_factor    numeric;
  v_total     numeric;
  v_usuario   uuid;
  v_linea     record;
  v_asignado  numeric := 0;
  v_mayor     uuid;
  v_resto     numeric;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar por que se ajusta el total.';
  end if;
  if p_nuevo_total is null or p_nuevo_total <= 0 then
    raise exception 'El nuevo total tiene que ser mayor que cero.';
  end if;

  select estado, lista_precio_id, total into v_estado, v_lista, v_total
  from public.venta where id = p_venta_id for update;

  if v_estado is null then
    raise exception 'La venta no existe.';
  end if;
  if v_estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % y ya no admite cambios.', v_estado;
  end if;
  if coalesce(v_total, 0) <= 0 then
    raise exception 'La venta no tiene importe para ajustar.';
  end if;

  v_usuario := coalesce(p_usuario_id, app.usuario_actual_id());
  if v_usuario is null then
    raise exception 'No se pudo determinar quien autoriza el ajuste.';
  end if;

  if v_lista is not null then
    select coalesce(ajuste_porcentaje, 0) into v_ajuste
    from public.lista_precio where id = v_lista;
  end if;

  -- Proporcion del nuevo total sobre el actual
  v_factor := p_nuevo_total / v_total;

  -- Linea de mayor importe: ahi va a caer la diferencia de redondeo
  select id into v_mayor
  from public.venta_linea
  where venta_id = p_venta_id
  order by cantidad * precio_unitario desc, id
  limit 1;

  for v_linea in
    select id, cantidad, precio_unitario
    from public.venta_linea where venta_id = p_venta_id
  loop
    declare
      v_importe numeric := round(v_linea.cantidad * v_linea.precio_unitario * v_factor, 2);
    begin
      update public.venta_linea
      set precio_unitario     = round(v_importe / v_linea.cantidad, 4),
          precio_acordado     = round(v_importe / v_linea.cantidad / (1 + v_ajuste / 100), 4),
          modificado_por      = v_usuario,
          motivo_modificacion = trim(p_motivo)
      where id = v_linea.id;

      v_asignado := v_asignado + v_importe;
    end;
  end loop;

  -- El resto se carga en la linea mas grande
  v_resto := p_nuevo_total - v_asignado;
  if v_mayor is not null and abs(v_resto) > 0 then
    update public.venta_linea
    set precio_unitario = round(precio_unitario + v_resto / cantidad, 4),
        precio_acordado = round((precio_unitario + v_resto / cantidad) / (1 + v_ajuste / 100), 4)
    where id = v_mayor;
  end if;

  select total into v_total from public.venta where id = p_venta_id;
  return v_total;
end;
$$;

comment on function public.ajustar_total_venta(uuid, numeric, text, uuid) is
  'Lleva el total de la venta a un importe acordado, prorrateando en las lineas y dejando motivo y responsable. Ajusta el precio acordado para que la rebaja sobreviva a un cambio de medio de pago.';

grant execute on function public.ajustar_total_venta(uuid, numeric, text, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Permiso propio
--
-- Ajustar el total no es lo mismo que cambiar el precio de una linea:
-- lo hace quien tiene autoridad comercial, no cualquiera que cobra.
-- ───────────────────────────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden)
values ('ventas.ajustar_total', 'Ventas', 'Ajustar el total de una venta', 235)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'ventas.ajustar_total'
from public.rol r
where r.nombre in ('Administrador', 'Encargado')
on conflict do nothing;
