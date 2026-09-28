-- ═══════════════════════════════════════════════════════════════
-- FACTURAR DESPUÉS: A CUENTA CORRIENTE, Y LA FACTURA CUANDO EL ENCARGADO
-- DECIDA
--
-- Pedido el 28/09, después de hablarlo con Lucas y con otros
-- comerciantes: muchas veces el cliente no quiere la factura en el
-- momento. Se lleva la mercadería, queda en su cuenta corriente, y el
-- encargado factura después — de a una venta, o juntando varias (lo del
-- mes de ese cliente) en una sola factura.
--
-- ─── CÓMO QUEDA ───
--
-- · En la caja, una tercera forma de documentar la venta: 'a_facturar'.
--   Va entera a cuenta corriente y sale un comprobante interno, como
--   decidió Francisco: las compras grandes llegan como pedido o con la
--   orden de compra de la muni o de la empresa; en el mostrador son
--   compras chicas.
-- · En Facturación, la lista «Por facturar», por cliente. Se eligen las
--   ventas y sale UNA factura con todas.
-- · La factura agrupada no tiene una venta: tiene varias, en
--   comprobante_venta. Si es de una sola venta, además la lleva en
--   comprobante.venta_id, como cualquier factura, y todo lo que ya
--   funciona con una factura por venta sigue funcionando igual.
--
-- ─── LA PERCEPCIÓN ───
--
-- Una venta 'a_facturar' se cobra sin percepción: todavía no hay
-- factura. Cuando se factura, la percepción entra a la cuenta corriente
-- como nota de débito: la deuda termina siendo la factura entera, que es
-- la regla del 28/09.
--
-- ⚠️ Sobre una factura agrupada hay dos lecturas, y la decide el
-- contador (pregunta abierta): calcularla sobre el total de la factura
-- —el comprobante es uno solo— o venta por venta. No da lo mismo: juntar
-- el mes hace que se pase el mínimo más seguido. Queda en Configuración,
-- 'arca.iibb_percepcion_factura_agrupada', con 'por_factura' mientras
-- tanto.
-- ═══════════════════════════════════════════════════════════════

alter table public.venta drop constraint venta_documentacion_check;
alter table public.venta add constraint venta_documentacion_check
  check (documentacion in ('fiscal', 'no_fiscal', 'a_facturar'));

comment on column public.venta.documentacion is
  'fiscal: factura al cobrar. no_fiscal: comprobante interno, sin factura. a_facturar: a cuenta corriente, se factura después desde «Por facturar».';

insert into public.configuracion (clave, valor, grupo, descripcion)
select 'arca.iibb_percepcion_factura_agrupada', '"por_factura"'::jsonb, 'arca',
       'Cómo se calcula la percepción de IIBB de una factura que agrupa varias ventas: por_factura (sobre el total) o por_venta (cada venta por separado). Lo define el contador.'
where not exists (select 1 from public.configuracion where clave = 'arca.iibb_percepcion_factura_agrupada');

-- ───────────────────────────────────────────────────────────────
-- Qué ventas cubre una factura
-- ───────────────────────────────────────────────────────────────
create table public.comprobante_venta (
  comprobante_id uuid not null references public.comprobante(id) on delete cascade,
  venta_id       uuid not null references public.venta(id) on delete restrict,
  primary key (comprobante_id, venta_id)
);

create index comprobante_venta_venta_idx on public.comprobante_venta (venta_id);

comment on table public.comprobante_venta is
  'Las ventas que cubre una factura emitida desde «Por facturar». Una factura agrupada tiene varias y comprobante.venta_id vacío.';

alter table public.comprobante_venta enable row level security;

create policy comprobante_venta_select on public.comprobante_venta
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));

grant select on public.comprobante_venta to authenticated;

/*
  La factura vigente de una venta, venga de donde venga: la suya propia
  o una agrupada que la incluye. Es la pregunta que se hacen la
  devolución y la anulación, y antes sólo miraban la propia.
*/
create or replace function app.factura_de_venta(p_venta_id uuid)
returns public.comprobante
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.comprobante c
  join public.tipo_comprobante t on t.id = c.tipo_comprobante_id and t.familia = 'factura'
  where c.estado in ('autorizado', 'informado', 'contingencia')
    and (c.venta_id = p_venta_id
         or exists (select 1 from public.comprobante_venta cv
                    where cv.comprobante_id = c.id and cv.venta_id = p_venta_id))
  order by c.creado_en desc
  limit 1
$$;

-- ───────────────────────────────────────────────────────────────
-- Elegir la documentación en la caja
-- ───────────────────────────────────────────────────────────────
create or replace function public.marcar_documentacion_venta(p_venta_id uuid, p_documentacion text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_venta   public.venta;
  v_cliente public.cliente;
begin
  if p_documentacion not in ('fiscal', 'no_fiscal', 'a_facturar') then
    raise exception 'Documentacion invalida: "%". Solo fiscal, no_fiscal o a_facturar.', p_documentacion;
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % : la documentacion se elige antes de cobrar.', v_venta.estado;
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;

  if p_documentacion = 'no_fiscal' then
    if not app.tiene_permiso('facturacion.vender_sin_factura') then
      raise exception 'No tenes permiso para cobrar una venta sin factura.';
    end if;

    if v_cliente.condicion_iva_id = 1 then
      raise exception
        'A % (Responsable Inscripto) le corresponde Factura A: no se puede cobrar sin factura.',
        v_cliente.nombre;
    end if;
  end if;

  /*
    Facturar después es para quien tiene cuenta corriente: la venta
    queda en su cuenta hasta que se factura. A un Responsable Inscripto
    también — la factura A sale igual, más tarde.
  */
  if p_documentacion = 'a_facturar' and not coalesce(v_cliente.cuenta_corriente, false) then
    raise exception '% no tiene cuenta corriente: no se puede dejar para facturar después.', v_cliente.nombre;
  end if;

  update public.venta
  set documentacion = p_documentacion
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- El cobro: una venta para facturar después va entera a la cuenta
-- ───────────────────────────────────────────────────────────────
/*
  Se agrega un solo control al cobro de siempre: si la venta es para
  facturar después, todo lo que se paga tiene que ir a cuenta
  corriente. Con una parte en efectivo, esa plata habría entrado sin
  ningún comprobante y la percepción de la factura futura no tendría
  dónde cargarse.
*/
create or replace function app.a_facturar_va_entera_a_la_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'cobrada' and old.estado <> 'cobrada' and new.documentacion = 'a_facturar'
     and exists (
       select 1 from public.venta_pago vp
       join public.medio_pago mp on mp.id = vp.medio_pago_id
       where vp.venta_id = new.id and mp.tipo <> 'cuenta_corriente'
     ) then
    raise exception 'Una venta para facturar después va entera a cuenta corriente.';
  end if;
  return new;
end;
$$;

create trigger venta_a_facturar_va_entera_a_la_cuenta
  before update of estado on public.venta
  for each row execute function app.a_facturar_va_entera_a_la_cuenta();

-- La factura de una venta para facturar después sale de «Por facturar»,
-- que es la que carga la percepción en la cuenta.
create or replace function app.a_facturar_no_se_factura_suelta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.venta_id is not null
     and not exists (select 1 from public.comprobante_venta cv where cv.venta_id = new.venta_id)
     and (select documentacion from public.venta where id = new.venta_id) = 'a_facturar'
     and (select familia from public.tipo_comprobante where id = new.tipo_comprobante_id) = 'factura'
     and coalesce(current_setting('app.facturando_pendientes', true), '') <> 'si' then
    raise exception 'Esta venta es para facturar después: se factura desde Facturación → Por facturar.';
  end if;
  return new;
end;
$$;

create trigger comprobante_a_facturar_no_se_factura_suelto
  before insert on public.comprobante
  for each row execute function app.a_facturar_no_se_factura_suelta();

-- ───────────────────────────────────────────────────────────────
-- Las ventas que esperan factura
-- ───────────────────────────────────────────────────────────────
create view public.vista_venta_por_facturar
with (security_invoker = true) as
select
  v.id, v.codigo, v.cliente_id, c.nombre as cliente, c.condicion_iva_id,
  v.ocurrido_en, v.total,
  exists (select 1 from public.devolucion d where d.venta_id = v.id) as tiene_devoluciones
from public.venta v
join public.cliente c on c.id = v.cliente_id
where v.estado = 'cobrada'
  and v.documentacion = 'a_facturar'
  and app.factura_de_venta(v.id) is null
  and not exists (
    select 1 from public.comprobante x
    where x.estado in ('pendiente', 'rechazado')
      and (x.venta_id = v.id or exists (select 1 from public.comprobante_venta cv
                                        where cv.comprobante_id = x.id and cv.venta_id = v.id))
  );

comment on view public.vista_venta_por_facturar is
  'Ventas a cuenta corriente que esperan factura. Las que ya tienen una en trámite —esperando CAE— no aparecen: se reintentan desde la lista de comprobantes.';

grant select on public.vista_venta_por_facturar to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Facturar lo pendiente: una o varias ventas, una factura
-- ───────────────────────────────────────────────────────────────
create or replace function public.facturar_ventas_pendientes(
  p_venta_ids      uuid[],
  p_punto_venta_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente    public.cliente;
  v_clientes   integer;
  v_n          integer;
  v_clase      char(1);
  v_tipo       smallint;
  v_pv         uuid;
  v_numero     bigint;
  v_comp_id    uuid;
  v_neto       numeric := 0;
  v_iva        numeric := 0;
  v_exento     numeric := 0;
  v_total      numeric := 0;
  v_percepcion numeric := 0;
  v_alicuota   numeric := 0;
  v_modo       text;
  v_hoy        date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not app.tiene_permiso('facturacion.emitir') then
    raise exception 'No tenés permiso para facturar.';
  end if;

  v_n := coalesce(array_length(p_venta_ids, 1), 0);
  if v_n = 0 then
    raise exception 'No hay ventas elegidas para facturar.';
  end if;

  perform 1 from public.venta where id = any(p_venta_ids) for update;

  if (select count(*) from public.vista_venta_por_facturar where id = any(p_venta_ids)) <> v_n then
    raise exception 'Alguna de las ventas no está para facturar: ya tiene factura, está anulada o no es a cuenta corriente.';
  end if;

  select count(distinct cliente_id) into v_clientes from public.venta where id = any(p_venta_ids);
  if v_clientes <> 1 then
    raise exception 'Una factura es de un solo cliente: las ventas elegidas son de % clientes.', v_clientes;
  end if;

  /*
    Una venta que ya tuvo devoluciones se factura sola, no se mezcla:
    la factura tiene que ser por lo que quedó, y el desglose de IVA sale
    de las líneas vendidas. Mejor frenar que facturar de más.
  */
  if exists (select 1 from public.devolucion where venta_id = any(p_venta_ids)) then
    raise exception 'Una de las ventas tuvo devoluciones antes de facturarse. Por ahora no se puede facturar desde acá: hablalo con nosotros.';
  end if;

  select c.* into v_cliente from public.cliente c
  where c.id = (select cliente_id from public.venta where id = p_venta_ids[1]);

  v_clase := public.tipo_comprobante_para(v_cliente.id);
  select id into v_tipo from public.tipo_comprobante
  where clase = v_clase and familia = 'factura' and activo;

  v_pv := p_punto_venta_id;
  if v_pv is null then
    select id into v_pv from public.punto_venta
    where activo and not es_respaldo and eliminado_en is null
    order by numero limit 1;
  end if;
  if v_pv is null then
    raise exception 'No hay punto de venta configurado para facturar.';
  end if;

  select coalesce(sum(neto), 0), coalesce(sum(iva), 0) into v_neto, v_iva
  from public.vista_venta_iva where venta_id = any(p_venta_ids);

  select coalesce(sum(l.importe), 0) into v_exento
  from public.venta_linea l
  where l.venta_id = any(p_venta_ids) and l.condicion_iva = 'exento';

  select coalesce(sum(total), 0) into v_total from public.venta where id = any(p_venta_ids);

  select coalesce(valor #>> '{}', 'por_factura') into v_modo
  from public.configuracion where clave = 'arca.iibb_percepcion_factura_agrupada';

  if coalesce(v_modo, 'por_factura') = 'por_venta' then
    select coalesce(sum(public.calcular_percepcion_iibb(v_cliente.id, x.neto)), 0) into v_percepcion
    from (select venta_id, sum(neto) as neto from public.vista_venta_iva
          where venta_id = any(p_venta_ids) group by venta_id) x;
  else
    v_percepcion := public.calcular_percepcion_iibb(v_cliente.id, v_neto);
  end if;

  if v_percepcion > 0 then
    select (valor #>> '{}')::numeric into v_alicuota
    from public.configuracion where clave = 'arca.iibb_percepcion_alicuota';
  end if;

  v_numero := app.siguiente_numero_comprobante(v_pv, v_tipo);

  perform set_config('app.facturando_pendientes', 'si', true);

  insert into public.comprobante (
    tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, exento, iva_total, tributos_total, total,
    estado, usuario_id
  ) values (
    v_tipo, v_pv, v_numero,
    case when v_n = 1 then p_venta_ids[1] end,
    v_cliente.id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.localidad)), ''),
    v_hoy, 1,
    v_neto, v_exento, v_iva, v_percepcion, v_total + v_percepcion,
    'pendiente', app.usuario_actual_id()
  ) returning id into v_comp_id;

  perform set_config('app.facturando_pendientes', '', true);

  insert into public.comprobante_venta (comprobante_id, venta_id)
  select v_comp_id, unnest(p_venta_ids);

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_comp_id, alicuota_iva_id, sum(neto), sum(iva)
  from public.vista_venta_iva where venta_id = any(p_venta_ids)
  group by alicuota_iva_id;

  if v_percepcion > 0 then
    insert into public.comprobante_tributo
      (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
    values
      (v_comp_id, 2, 'Percepción IIBB Misiones', v_neto, v_alicuota, v_percepcion);

    -- La percepción, a la cuenta: la deuda es la factura entera.
    insert into public.movimiento_cuenta_corriente
      (cliente_id, tipo, importe, concepto, referencia_tipo, referencia_id, usuario_id)
    values
      (v_cliente.id, 'nota_debito', v_percepcion,
       'Percepción IIBB · factura ' || v_clase || ' ' ||
         lpad((select numero from public.punto_venta where id = v_pv)::text, 5, '0') || '-' || lpad(v_numero::text, 8, '0'),
       'comprobante', v_comp_id, app.usuario_actual_id());
  end if;

  return v_comp_id;
end;
$$;

comment on function public.facturar_ventas_pendientes(uuid[], uuid) is
  'Arma UNA factura con las ventas a cuenta corriente elegidas de un cliente, y carga la percepción en su cuenta. El CAE se pide después, como siempre.';

revoke all on function public.facturar_ventas_pendientes(uuid[], uuid) from public, anon;
grant execute on function public.facturar_ventas_pendientes(uuid[], uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- La devolución encuentra la factura agrupada, y devuelve la
-- percepción también en la cuenta corriente
-- ───────────────────────────────────────────────────────────────
/*
  Dos cambios a la devolución parcial:

  1. La factura de la venta se busca también entre las agrupadas
     (app.factura_de_venta). Sin esto, devolver algo de una venta
     facturada en grupo no emitía nota de crédito.

  2. La cuenta corriente baja también por la percepción devuelta. La
     nota de crédito devuelve la percepción, pero la cuenta bajaba sólo
     lo de los productos: el cliente quedaba debiendo una percepción de
     mercadería que devolvió. Se vio el 28/09, el mismo día que la caja
     empezó a cobrar la percepción.
*/
create or replace function public.devolver_lineas_de_venta(p_venta_id uuid, p_lineas jsonb, p_motivo text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_venta       public.venta;
  v_original    public.comprobante;
  v_usuario     uuid;
  v_devolucion  uuid;
  v_total       numeric := 0;
  v_neto        numeric := 0;
  v_iva         numeric := 0;
  v_exento      numeric := 0;
  v_percepcion  numeric := 0;
  v_alicuota    numeric;
  v_tipo_nc     smallint;
  v_clase       char(1);
  v_numero      bigint;
  v_nc_id       uuid;
  v_pv_numero   integer;
  v_cta_cte     numeric;
  v_proporcion  numeric;
  v_pagado      numeric;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la devolucion.';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Hay que elegir al menos un producto para devolver.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta esta anulada: no hay nada que devolver.';
  end if;
  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se devuelve una venta cobrada. Esta esta %.', v_venta.estado;
  end if;

  v_usuario := app.usuario_actual_id();

  drop table if exists pedido;
  drop table if exists devuelto;

  create temp table pedido on commit drop as
  select
    (x->>'venta_linea_id')::uuid as venta_linea_id,
    (x->>'cantidad')::numeric    as cantidad
  from jsonb_array_elements(p_lineas) x;

  if exists (select 1 from pedido where cantidad is null or cantidad <= 0) then
    raise exception 'Las cantidades a devolver tienen que ser mayores que cero.';
  end if;

  if exists (
    select 1 from pedido p
    left join public.vista_venta_devolvible d
      on d.venta_linea_id = p.venta_linea_id and d.venta_id = p_venta_id
    where d.venta_linea_id is null
  ) then
    raise exception 'Hay un producto que no pertenece a esta venta.';
  end if;

  if exists (
    select 1 from pedido p
    join public.vista_venta_devolvible d on d.venta_linea_id = p.venta_linea_id
    where p.cantidad > d.disponible
  ) then
    raise exception 'No se puede devolver mas de lo que queda sin devolver.';
  end if;

  create temp table devuelto on commit drop as
  select
    p.venta_linea_id,
    p.cantidad,
    d.producto_id,
    d.alicuota_iva_id,
    d.alicuota,
    d.condicion_iva,
    round(d.importe * p.cantidad / d.vendida, 2) as importe
  from pedido p
  join public.vista_venta_devolvible d on d.venta_linea_id = p.venta_linea_id;

  select coalesce(sum(importe), 0) into v_total from devuelto;

  if v_total <= 0 then
    raise exception 'La devolucion no puede ser por cero pesos.';
  end if;

  insert into public.devolucion
    (venta_id, motivo, total, usuario_id, terminal_id)
  values
    (p_venta_id, p_motivo, v_total, v_usuario, v_venta.terminal_origen_id)
  returning id into v_devolucion;

  insert into public.devolucion_linea (devolucion_id, venta_linea_id, cantidad, importe)
  select v_devolucion, venta_linea_id, cantidad, importe from devuelto;

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id)
  select d.producto_id, 'devolucion', d.cantidad,
         'Devolucion parcial venta ' || v_venta.codigo, 'devolucion', v_devolucion, v_usuario
  from devuelto d
  where d.producto_id is not null
    and exists (
      select 1 from public.movimiento_stock m
      where m.producto_id = d.producto_id
        and ((m.referencia_tipo = 'venta' and m.referencia_id = v_venta.id)
          or (m.referencia_tipo = 'remito' and m.referencia_id in (
                select cnf.id from public.comprobante_no_fiscal cnf
                where cnf.venta_id = v_venta.id)))
      group by m.producto_id
      having sum(m.cantidad) < 0
    );

  -- La factura: la propia o la agrupada que incluye esta venta.
  v_original := app.factura_de_venta(p_venta_id);

  select
    coalesce(sum(round(d.importe / (1 + d.alicuota / 100), 2)), 0),
    coalesce(sum(d.importe - round(d.importe / (1 + d.alicuota / 100), 2)), 0)
  into v_neto, v_iva
  from devuelto d where d.condicion_iva = 'gravado';

  select coalesce(sum(d.importe), 0) into v_exento
  from devuelto d where d.condicion_iva = 'exento';

  -- La percepción se prorratea, nunca se recalcula (ver 11/09).
  if v_original.id is not null then
    select ct.importe, ct.alicuota into v_percepcion, v_alicuota
    from public.comprobante_tributo ct
    where ct.comprobante_id = v_original.id and ct.tributo_id = 2
    limit 1;
  end if;

  if v_percepcion is not null and v_percepcion > 0 and v_original.neto_gravado > 0 then
    v_proporcion := v_neto / v_original.neto_gravado;
    v_percepcion := round(v_percepcion * v_proporcion, 2);
  else
    v_percepcion := 0;
  end if;

  -- La cuenta corriente baja por lo devuelto y por su percepción, en la
  -- proporción que se pagó a cuenta.
  select coalesce(sum(vp.importe), 0) into v_cta_cte
  from public.venta_pago vp
  join public.medio_pago mp on mp.id = vp.medio_pago_id
  where vp.venta_id = p_venta_id and mp.tipo = 'cuenta_corriente';

  if v_cta_cte > 0 then
    select coalesce(sum(vp.importe), 0) into v_pagado
    from public.venta_pago vp where vp.venta_id = p_venta_id;

    if v_pagado > 0 then
      insert into public.movimiento_cuenta_corriente
        (cliente_id, tipo, importe, concepto, referencia_tipo, referencia_id, usuario_id)
      values
        (v_venta.cliente_id, 'nota_credito',
         -round((v_total + v_percepcion) * v_cta_cte / v_pagado, 2),
         'Devolucion parcial venta ' || v_venta.codigo, 'devolucion', v_devolucion, v_usuario);
    end if;
  end if;

  if v_original.id is null then
    return v_devolucion;
  end if;

  select tc.clase into v_clase
  from public.tipo_comprobante tc where tc.id = v_original.tipo_comprobante_id;

  select tc.id into v_tipo_nc
  from public.tipo_comprobante tc
  where tc.clase = v_clase and tc.familia = 'nota_credito' and tc.activo;

  if v_tipo_nc is null then
    raise exception 'No hay tipo de nota de credito activo para comprobantes clase %.', v_clase;
  end if;

  v_numero := app.siguiente_numero_comprobante(v_original.punto_venta_id, v_tipo_nc);

  insert into public.comprobante (
    tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, neto_no_gravado, exento, iva_total, tributos_total, total,
    moneda, cotizacion, estado, usuario_id
  ) values (
    v_tipo_nc, v_original.punto_venta_id, v_numero, p_venta_id, v_original.cliente_id,
    v_original.receptor_nombre, v_original.receptor_tipo_documento_id, v_original.receptor_documento,
    v_original.receptor_condicion_iva_id, v_original.receptor_domicilio,
    current_date, v_original.concepto,
    v_neto, 0, v_exento, v_iva, v_percepcion, v_total + v_percepcion,
    v_original.moneda, v_original.cotizacion, 'pendiente',
    v_usuario
  ) returning id into v_nc_id;

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_nc_id, d.alicuota_iva_id,
         sum(round(d.importe / (1 + d.alicuota / 100), 2)),
         sum(d.importe - round(d.importe / (1 + d.alicuota / 100), 2))
  from devuelto d
  where d.condicion_iva = 'gravado'
  group by d.alicuota_iva_id;

  if v_percepcion > 0 then
    insert into public.comprobante_tributo
      (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
    values
      (v_nc_id, 2, 'Percepción IIBB Misiones', v_neto, v_alicuota, v_percepcion);
  end if;

  select pv.numero into v_pv_numero
  from public.punto_venta pv where pv.id = v_original.punto_venta_id;

  insert into public.comprobante_asociado
    (comprobante_id, asociado_id, tipo_comprobante_id, punto_venta_numero, numero, fecha)
  values
    (v_nc_id, v_original.id, v_original.tipo_comprobante_id, v_pv_numero,
     v_original.numero, v_original.fecha);

  update public.devolucion set comprobante_id = v_nc_id where id = v_devolucion;

  return v_devolucion;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- La venta entera de una factura agrupada se devuelve por partes
-- ───────────────────────────────────────────────────────────────
/*
  «Devolver» copia la factura entera en una nota de crédito. Con una
  factura que cubre varias ventas, devolvería también las otras. Para
  una venta de una factura agrupada se usa «Devolver parte» marcando
  todo, que arma la nota por esa venta sola.
*/
create or replace function app.venta_de_factura_agrupada_se_devuelve_por_partes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'anulada' and old.estado = 'cobrada' and exists (
    select 1 from public.comprobante_venta cv
    join public.comprobante c on c.id = cv.comprobante_id
    where cv.venta_id = new.id and c.venta_id is null and c.estado <> 'anulado'
  ) then
    raise exception 'Esta venta está en una factura que agrupa varias: devolvela con «Devolver parte», marcando todo.';
  end if;
  return new;
end;
$$;

create trigger venta_de_factura_agrupada_se_devuelve_por_partes
  before update of estado on public.venta
  for each row execute function app.venta_de_factura_agrupada_se_devuelve_por_partes();

-- ───────────────────────────────────────────────────────────────
-- Devolver entera una venta facturada después: la percepción también
-- sale de la cuenta
-- ───────────────────────────────────────────────────────────────
/*
  La anulación saca de la cuenta lo que la venta puso en ella, pero la
  percepción de una venta facturada después entró aparte, como nota de
  débito de la factura. Si no se saca también, el cliente queda debiendo
  la percepción de una factura que se anuló con nota de crédito.
*/
create or replace function public.anular_venta_con_nota_credito(p_venta_id uuid, p_motivo text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_venta      public.venta;
  v_original   public.comprobante;
  v_tipo_nc    smallint;
  v_clase      char(1);
  v_numero     bigint;
  v_nc_id      uuid;
  v_pv_numero  integer;
  v_debito     numeric;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la anulacion.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;

  if exists (select 1 from public.devolucion where venta_id = p_venta_id) then
    raise exception 'Esta venta ya tiene devoluciones parciales: devolve lo que queda por partes, no la venta entera.';
  end if;

  perform public.anular_venta(p_venta_id, p_motivo);

  select * into v_original
  from public.comprobante
  where venta_id = p_venta_id and estado in ('autorizado', 'informado', 'contingencia')
  order by creado_en desc
  limit 1;

  if v_original.id is null then
    update public.comprobante
       set estado = 'anulado'
     where venta_id = p_venta_id and estado in ('pendiente', 'rechazado');
    return null;
  end if;

  if exists (
    select 1 from public.comprobante_asociado ca
    join public.comprobante c on c.id = ca.comprobante_id
    where ca.asociado_id = v_original.id and c.estado <> 'anulado'
  ) then
    raise exception 'Esa factura ya tiene una nota de credito.';
  end if;

  select tc.clase into v_clase
  from public.tipo_comprobante tc where tc.id = v_original.tipo_comprobante_id;

  select tc.id into v_tipo_nc
  from public.tipo_comprobante tc
  where tc.clase = v_clase and tc.familia = 'nota_credito' and tc.activo;

  if v_tipo_nc is null then
    raise exception 'No hay tipo de nota de credito activo para comprobantes clase %.', v_clase;
  end if;

  v_numero := app.siguiente_numero_comprobante(v_original.punto_venta_id, v_tipo_nc);

  insert into public.comprobante (
    tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, neto_no_gravado, exento, iva_total, tributos_total, total,
    moneda, cotizacion, estado, usuario_id
  ) values (
    v_tipo_nc, v_original.punto_venta_id, v_numero, p_venta_id, v_original.cliente_id,
    v_original.receptor_nombre, v_original.receptor_tipo_documento_id, v_original.receptor_documento,
    v_original.receptor_condicion_iva_id, v_original.receptor_domicilio,
    current_date, v_original.concepto,
    v_original.neto_gravado, v_original.neto_no_gravado, v_original.exento,
    v_original.iva_total, v_original.tributos_total, v_original.total,
    v_original.moneda, v_original.cotizacion, 'pendiente',
    app.usuario_actual_id()
  ) returning id into v_nc_id;

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_nc_id, ca.alicuota_iva_id, ca.base_imponible, ca.importe
  from public.comprobante_alicuota ca
  where ca.comprobante_id = v_original.id;

  insert into public.comprobante_tributo
    (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
  select v_nc_id, ct.tributo_id, ct.descripcion, ct.base_imponible, ct.alicuota, ct.importe
  from public.comprobante_tributo ct
  where ct.comprobante_id = v_original.id;

  select pv.numero into v_pv_numero
  from public.punto_venta pv where pv.id = v_original.punto_venta_id;

  insert into public.comprobante_asociado
    (comprobante_id, asociado_id, tipo_comprobante_id, punto_venta_numero, numero, fecha)
  values
    (v_nc_id, v_original.id, v_original.tipo_comprobante_id, v_pv_numero,
     v_original.numero, v_original.fecha);

  -- La percepción que la factura cargó aparte en la cuenta, se saca.
  select coalesce(sum(m.importe), 0) into v_debito
  from public.movimiento_cuenta_corriente m
  where m.referencia_tipo = 'comprobante' and m.referencia_id = v_original.id and m.tipo = 'nota_debito';

  if v_debito > 0 then
    insert into public.movimiento_cuenta_corriente
      (cliente_id, tipo, importe, concepto, referencia_tipo, referencia_id, usuario_id)
    values
      (v_original.cliente_id, 'nota_credito', -v_debito,
       'Percepción IIBB devuelta · anulación venta ' || v_venta.codigo,
       'comprobante', v_nc_id, app.usuario_actual_id());
  end if;

  return v_nc_id;
end;
$$;
