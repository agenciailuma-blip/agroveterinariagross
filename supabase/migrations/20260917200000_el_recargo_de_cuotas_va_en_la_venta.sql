-- ═══════════════════════════════════════════════════════════════
-- El recargo por cuotas va en la venta, no en el pago
--
-- Encontrado en el local el 17/09, probando la caja con Lucas: cobrar
-- con tarjeta en cuotas era IMPOSIBLE.
--
-- Lo que pasaba. Al elegir "Tarjeta de credito - 2 cuotas", la pantalla
-- tomaba el recargo de medio_pago_cuota (10%) y lo sumaba al IMPORTE DEL
-- PAGO: total 181.280, pago 199.408. Pero la venta seguia valiendo
-- 181.280, y tanto la pantalla como cobrar_venta() exigen que los pagos
-- cierren exactamente con el total. Resultado: "Los pagos exceden el
-- total en $18.128" y el boton Cobrar apagado. No habia forma de cobrar
-- en cuotas salvo borrandole el recargo a mano.
--
-- Por que el recargo va en el PRECIO y no como un renglon aparte: lo
-- confirmo el contador y es como Gross trabaja hoy. El costo financiero
-- discriminado en el comprobante es otra cosa, con sus propias reglas, y
-- Gross no lo usa. Si el recargo no entra en el total, ademas, la
-- factura sale por menos de lo que el cliente pago.
--
-- Queda guardado en la venta —y no solo calculado al pasar— por tres
-- razones: la caja sin internet tiene que poder rehacer el mismo numero,
-- editar la venta despues de elegir el medio tiene que mantenerlo, y
-- dentro de un mes alguien va a preguntar por que esa venta salio 10%
-- mas cara que la lista.
-- ═══════════════════════════════════════════════════════════════

alter table public.venta
  add column if not exists recargo_porcentaje numeric(7,4) not null default 0;

comment on column public.venta.recargo_porcentaje is
  'Recargo por plan de cuotas aplicado a los precios de esta venta, en por ciento. Sale de medio_pago_cuota al elegir con qué se paga. Va en el precio y no discriminado: es como Gross lo cobra y lo que confirmó el contador.';

/*
  La firma cambia: se le agrega el recargo.

  Hay que borrar la de dos parametros antes de crear la de tres. Dejar
  las dos haria que llamarla con dos argumentos sea ambiguo y Postgres
  la rechace con "function is not unique" — justo en el momento de
  cobrar. Con los dos ultimos parametros por omision, las llamadas que
  ya estan escritas en alguna cola de una terminal siguen funcionando:
  sin recargo, que es como venian.
*/
drop function if exists public.aplicar_lista_a_venta(uuid, uuid);

create or replace function public.aplicar_lista_a_venta(
  p_venta_id           uuid,
  p_lista_id           uuid    default null,
  p_recargo_porcentaje numeric default 0
)
returns numeric
language plpgsql
set search_path = ''
as $function$
declare
  v_estado  text;
  v_ajuste  numeric := 0;
  v_recargo numeric := coalesce(p_recargo_porcentaje, 0);
  v_total   numeric;
begin
  select estado into v_estado from public.venta where id = p_venta_id for update;
  if v_estado is null then raise exception 'La venta no existe.'; end if;
  if v_estado not in ('borrador','en_caja') then
    raise exception 'La venta esta % y ya no admite cambios de precio.', v_estado; end if;

  /*
    Un recargo fuera de rango es un error de carga, no una promocion.
    Sin este limite, un 1000 mal tipeado en Configuracion multiplica por
    once el precio de una venta y el cajero lo cobra.
  */
  if v_recargo < 0 or v_recargo > 100 then
    raise exception 'El recargo tiene que estar entre 0 y 100 por ciento, y es %.', v_recargo;
  end if;

  if p_lista_id is not null then
    select coalesce(ajuste_porcentaje, 0) into v_ajuste
    from public.lista_precio where id = p_lista_id and activo and eliminado_en is null;
    if v_ajuste is null then
      raise exception 'La lista de precios no existe o esta inactiva.'; end if;
  end if;

  /*
    Siempre se parte del precio ACORDADO, no del que tiene la linea.
    Es lo que hace que cambiar de opinion —efectivo, tarjeta, efectivo
    otra vez— no acumule recargos ni pise la rebaja del vendedor.
  */
  update public.venta_linea
  set precio_unitario = round(precio_acordado * (1 + v_ajuste / 100) * (1 + v_recargo / 100), 2)
  where venta_id = p_venta_id;

  update public.venta
  set lista_precio_id    = p_lista_id,
      recargo_porcentaje = v_recargo
  where id = p_venta_id;

  select total into v_total from public.venta where id = p_venta_id;
  return v_total;
end;
$function$;

comment on function public.aplicar_lista_a_venta(uuid, uuid, numeric) is
  'Recalcula los precios de una venta con la lista del medio de pago y el recargo del plan de cuotas. Siempre desde el precio acordado, así cambiar de medio no acumula.';
