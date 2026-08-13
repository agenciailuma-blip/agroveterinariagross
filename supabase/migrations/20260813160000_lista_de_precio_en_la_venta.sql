-- ═══════════════════════════════════════════════════════════════
-- 016 — LA VENTA RECUERDA CON QUE LISTA SE ESTA COBRANDO
--
-- EL PROBLEMA
--
-- En la caja, elegir tarjeta cambia los precios. Con un solo precio por
-- linea eso se vuelve ambiguo: si el vendedor rebajo un producto y
-- despues el cajero pasa a tarjeta, ¿se pierde la rebaja? ¿se recarga
-- sobre el precio de lista o sobre el rebajado? Y si el cajero cambia de
-- opinion dos veces, los redondeos se van acumulando.
--
-- LA SOLUCION: TRES PRECIOS POR LINEA, CADA UNO CON SU SIGNIFICADO
--
--   precio_original  Lo que dice la lista de contado. No se toca nunca.
--   precio_acordado  Lo que se acordo con el cliente, a nivel contado.
--                    Igual al original salvo que alguien lo haya bajado.
--   precio_unitario  Lo que efectivamente se cobra: el acordado ajustado
--                    por la lista con la que se esta cobrando.
--
-- Con eso, cambiar de medio de pago recalcula SIEMPRE desde el acordado.
-- La rebaja del vendedor sobrevive, el recargo se aplica sobre ella, y
-- cambiar de opinion diez veces da el mismo numero que cambiar una: no
-- hay redondeo acumulado porque nunca se calcula sobre lo ya calculado.
--
-- El comercio cotiza el precio de tarjeta y presenta el efectivo como
-- descuento. Eso es presentacion: por dentro la lista de contado sigue
-- siendo la base, que es como viene el precio desde OBTech.
-- ═══════════════════════════════════════════════════════════════

alter table public.venta
  add column lista_precio_id uuid references public.lista_precio(id) on delete set null;

create index venta_lista_precio_idx on public.venta (lista_precio_id);

comment on column public.venta.lista_precio_id is
  'Lista con la que se esta cobrando. Nula significa la predeterminada. La fija la caja al elegir el medio de pago.';

alter table public.venta_linea
  add column precio_acordado numeric(14,4);

update public.venta_linea set precio_acordado = precio_unitario where precio_acordado is null;

alter table public.venta_linea
  alter column precio_acordado set not null,
  add constraint venta_linea_precio_acordado_positivo check (precio_acordado >= 0);

comment on column public.venta_linea.precio_original is
  'Precio de la lista de contado. Referencia inmutable.';
comment on column public.venta_linea.precio_acordado is
  'Precio acordado con el cliente, a nivel contado. Difiere del original solo si alguien lo modifico, y en ese caso hay motivo y responsable.';
comment on column public.venta_linea.precio_unitario is
  'Precio efectivamente cobrado: el acordado ajustado por la lista de la venta.';

-- La justificacion ahora se exige sobre el precio ACORDADO. Que el
-- unitario difiera del original es normal: significa que se esta
-- cobrando con otra lista, y eso no lo decide una persona.
alter table public.venta_linea drop constraint venta_linea_modificacion_justificada;

alter table public.venta_linea add constraint venta_linea_modificacion_justificada check (
  precio_acordado = precio_original
  or (modificado_por is not null and motivo_modificacion is not null)
);

-- ───────────────────────────────────────────────────────────────
-- Totales
--
-- Se redefinen porque con listas el bruto ya no puede salir del precio
-- original: con tarjeta aplicada el cobro es MAYOR que la lista de
-- contado, y el "descuento" habria quedado negativo.
--
--   subtotal        lo que se cobra
--   descuento_total lo que se resigno respecto de la lista, a nivel
--                   contado, que es lo unico que un humano decidio
--   total           lo que se cobra
-- ───────────────────────────────────────────────────────────────
create or replace function app.recalcular_totales_venta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta uuid := coalesce(new.venta_id, old.venta_id);
begin
  update public.venta v
  set subtotal        = coalesce(t.cobrado, 0),
      descuento_total = coalesce(t.resignado, 0),
      total           = coalesce(t.cobrado, 0)
  from (
    select
      sum(l.cantidad * l.precio_unitario) as cobrado,
      sum(l.cantidad * (l.precio_original - l.precio_acordado)) as resignado
    from public.venta_linea l
    where l.venta_id = v_venta
  ) t
  where v.id = v_venta;

  return null;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- Aplicar una lista a la venta
--
-- Recalcula todas las lineas desde el precio acordado. Es lo que corre
-- la caja cuando el cajero elige con que se paga.
-- ───────────────────────────────────────────────────────────────
create or replace function public.aplicar_lista_a_venta(
  p_venta_id uuid,
  p_lista_id uuid default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
  v_ajuste numeric := 0;
  v_total  numeric;
begin
  select estado into v_estado from public.venta where id = p_venta_id for update;

  if v_estado is null then
    raise exception 'La venta no existe.';
  end if;
  if v_estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % y ya no admite cambios de precio.', v_estado;
  end if;

  if p_lista_id is not null then
    select coalesce(ajuste_porcentaje, 0) into v_ajuste
    from public.lista_precio
    where id = p_lista_id and activo and eliminado_en is null;

    if v_ajuste is null then
      raise exception 'La lista de precios no existe o esta inactiva.';
    end if;
  end if;

  -- Siempre desde el acordado, nunca desde el ultimo calculado.
  update public.venta_linea
  set precio_unitario = round(precio_acordado * (1 + v_ajuste / 100), 2)
  where venta_id = p_venta_id;

  update public.venta set lista_precio_id = p_lista_id where id = p_venta_id;

  select total into v_total from public.venta where id = p_venta_id;
  return v_total;
end;
$$;

comment on function public.aplicar_lista_a_venta(uuid, uuid) is
  'Recalcula las lineas de una venta con la lista indicada, siempre desde el precio acordado. Nula aplica la lista predeterminada.';

grant execute on function public.aplicar_lista_a_venta(uuid, uuid) to authenticated;
