-- ═══════════════════════════════════════════════════════════════
-- LA CAJA COBRA LA PERCEPCIÓN DE IIBB
--
-- Desde agosto la factura a un Responsable Inscripto suma la percepción
-- (preparar_comprobante: total = venta + percepción), pero la caja
-- cobraba la venta sin ella. La factura decía un número y la plata que
-- entraba —o la deuda que quedaba— era otro.
--
-- ─── LA REGLA, CONFIRMADA EL 28/09 ───
--
-- La percepción va con la factura, a donde vaya la plata. En la caja:
-- al elegir un cliente Responsable Inscripto, el total que se muestra
-- ya tiene la percepción; si el cliente dice que sí a facturar, ése es
-- el precio final. Si paga en el momento, se cobra entera; si va a
-- cuenta corriente, la deuda es la factura entera.
--
-- ─── DÓNDE QUEDA ───
--
-- En la venta, en una columna aparte: `percepcion_iibb`. El total de la
-- venta sigue siendo lo vendido —es lo que miran los reportes y las
-- métricas, y la percepción no es venta: es plata de Rentas que Gross
-- recauda—. Lo que se cobra es total + percepción.
--
-- ─── POR QUÉ EL COBRO ACEPTA LAS DOS FORMAS ───
--
-- cobrar_venta() acepta pagos que cierren con el total con percepción
-- (lo que manda la caja nueva) o sin ella. Lo segundo no es un descuido:
-- lo usan los pedidos de la tienda pagados en la web, donde nadie cobró
-- percepción —y ahí ya hay un freno antes de facturar—, y las cajas que
-- todavía tienen instalada una versión anterior. Rechazarlos dejaría
-- pedidos pagados sin poder entrar y ventas cobradas sin poder subir.
-- ═══════════════════════════════════════════════════════════════

alter table public.venta
  add column percepcion_iibb numeric(14,2) not null default 0
    check (percepcion_iibb >= 0);

comment on column public.venta.percepcion_iibb is
  'Percepción de IIBB cobrada con la venta. No forma parte del total —que es lo vendido—: lo cobrado es total + percepción.';

-- ───────────────────────────────────────────────────────────────
-- Cuánto le corresponde a una venta, si se factura
-- ───────────────────────────────────────────────────────────────
/*
  La misma cuenta que hace la factura: la percepción sobre el neto
  gravado de la venta, según el cliente. Una venta sin factura no lleva
  percepción, porque la percepción viaja en la factura.

  La caja la pregunta para mostrar el total antes de cobrar.
*/
create or replace function public.percepcion_de_venta(p_venta_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when v.documentacion <> 'fiscal' then 0
    else public.calcular_percepcion_iibb(
           v.cliente_id,
           coalesce((select sum(i.neto) from public.vista_venta_iva i where i.venta_id = v.id), 0))
  end
  from public.venta v
  where v.id = p_venta_id
$$;

comment on function public.percepcion_de_venta(uuid) is
  'Percepción de IIBB que le corresponde a una venta si se factura. Cero si va sin factura o si el cliente no está alcanzado.';

grant execute on function public.percepcion_de_venta(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- El cobro
-- ───────────────────────────────────────────────────────────────
create or replace function public.cobrar_venta(
  p_venta_id  uuid,
  p_caja_id   uuid default null,
  p_cajero_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_venta        public.venta;
  v_pagado       numeric;
  v_percepcion   numeric;
  v_cobrada      numeric := 0;
  v_cta_cte      numeric;
  v_cliente      public.cliente;
  v_saldo        numeric;
  v_cajero       uuid;
  v_terminal     uuid;
begin
  select * into v_venta from public.venta where id = p_venta_id for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % y no se puede cobrar.', v_venta.estado;
  end if;
  if not exists (select 1 from public.venta_linea where venta_id = p_venta_id) then
    raise exception 'La venta no tiene productos.';
  end if;

  v_cajero := coalesce(p_cajero_id, app.usuario_actual_id());

  select coalesce(sum(importe), 0) into v_pagado
  from public.venta_pago where venta_id = p_venta_id;

  /*
    Con percepción, que es lo que manda la caja; o sin ella, que es lo
    que mandan la tienda web y las cajas con una versión anterior (ver
    arriba). Lo que cierra decide cuánta percepción se cobró.
  */
  v_percepcion := public.percepcion_de_venta(p_venta_id);

  if v_percepcion > 0 and abs(v_pagado - (v_venta.total + v_percepcion)) <= 0.01 then
    v_cobrada := v_percepcion;
  elsif abs(v_pagado - v_venta.total) > 0.01 then
    if v_percepcion > 0 then
      raise exception 'Los pagos suman % y hay que cobrar % (% de la venta más % de percepción de IIBB).',
        app.pesos(v_pagado), app.pesos(v_venta.total + v_percepcion),
        app.pesos(v_venta.total), app.pesos(v_percepcion);
    end if;
    raise exception 'Los pagos suman % y el total es %.', app.pesos(v_pagado), app.pesos(v_venta.total);
  end if;

  select coalesce(sum(vp.importe), 0) into v_cta_cte
  from public.venta_pago vp
  join public.medio_pago mp on mp.id = vp.medio_pago_id
  where vp.venta_id = p_venta_id and mp.tipo = 'cuenta_corriente';

  if v_cta_cte > 0 then
    select * into v_cliente from public.cliente where id = v_venta.cliente_id;

    if not v_cliente.cuenta_corriente then
      raise exception 'El cliente % no tiene cuenta corriente habilitada.', v_cliente.nombre;
    end if;

    if v_cliente.limite_credito is not null then
      select coalesce(saldo, 0) into v_saldo
      from public.cuenta_corriente_saldo where cliente_id = v_cliente.id;

      if coalesce(v_saldo, 0) + v_cta_cte > v_cliente.limite_credito then
        raise exception 'Excede el limite de credito: saldo %, esta venta %, limite %.',
          app.pesos(coalesce(v_saldo, 0)), app.pesos(v_cta_cte), app.pesos(v_cliente.limite_credito);
      end if;
    end if;
  end if;

  select terminal_id into v_terminal from public.caja where id = p_caja_id;

  -- Stock: la diferencia entre lo vendido y lo que ya salio.
  --  - Sin remitos, remitido viene vacio y descuenta lo vendido, igual
  --    que siempre.
  --  - Con remito por la venta entera, la diferencia da cero: la
  --    mercaderia ya habia salido.
  --  - Si el remito llevo de mas —el cliente devolvio en la puerta y el
  --    cajero corrigio la venta— lo que volvio reingresa solo.
  -- Se lee del libro y no de las lineas del remito: un remito anulado
  -- tiene su salida y su retorno anotados, el neto da cero, y esta
  -- cuenta lo toma bien sin saber nada de estados.
  with vendido as (
    select l.producto_id, sum(l.cantidad) as cantidad
    from public.venta_linea l
    where l.venta_id = p_venta_id and l.producto_id is not null
    group by l.producto_id
  ),
  remitido as (
    select m.producto_id, -sum(m.cantidad) as cantidad
    from public.movimiento_stock m
    where m.referencia_tipo = 'remito'
      and m.referencia_id in (
        select cnf.id from public.comprobante_no_fiscal cnf
        where cnf.venta_id = p_venta_id)
    group by m.producto_id
  ),
  neto as (
    select coalesce(v.producto_id, r.producto_id) as producto_id,
           coalesce(v.cantidad, 0) - coalesce(r.cantidad, 0) as falta
    from vendido v
    full outer join remitido r on r.producto_id = v.producto_id
  )
  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
     usuario_id, operador_id, terminal_id, ocurrido_en)
  select n.producto_id,
         case when n.falta > 0 then 'venta' else 'retorno_remito' end,
         -n.falta,
         case when n.falta > 0
              then 'Venta ' || v_venta.codigo
              else 'Volvio del reparto - venta ' || v_venta.codigo end,
         'venta', v_venta.id,
         v_cajero, v_venta.vendedor_id,
         coalesce(v_terminal, v_venta.terminal_origen_id), v_venta.ocurrido_en
  from neto n
  where n.falta <> 0 and n.producto_id is not null;

  -- La deuda es lo que se puso en cuenta corriente, y si la venta lleva
  -- percepción, la incluye: es la factura entera.
  if v_cta_cte > 0 then
    insert into public.movimiento_cuenta_corriente
      (cliente_id, tipo, importe, concepto, vencimiento,
       referencia_tipo, referencia_id, usuario_id, operador_id, ocurrido_en)
    values
      (v_venta.cliente_id, 'venta', v_cta_cte, 'Venta ' || v_venta.codigo,
       current_date + coalesce(v_cliente.dias_vencimiento, 30),
       'venta', v_venta.id, v_cajero, v_venta.vendedor_id, v_venta.ocurrido_en);
  end if;

  update public.venta
  set estado          = 'cobrada',
      cobrada_en      = now(),
      cajero_id       = v_cajero,
      caja_id         = coalesce(p_caja_id, caja_id),
      percepcion_iibb = v_cobrada
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- La factura dice lo que se cobró
-- ───────────────────────────────────────────────────────────────
/*
  Si la venta se cobró con percepción, la factura lleva ESA percepción y
  no una recalculada: si entre el cobro y la factura cambió la alícuota
  en Configuración, la factura tiene que decir lo que el cliente pagó.
  Si se cobró sin ella —la web, una caja vieja— se calcula como siempre,
  y el freno de los pedidos web sigue actuando.
*/
create or replace function public.preparar_comprobante(
  p_venta_id       uuid,
  p_punto_venta_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta      public.venta;
  v_cliente    public.cliente;
  v_clase      char(1);
  v_tipo       smallint;
  v_pv         uuid;
  v_numero     bigint;
  v_comp_id    uuid;
  v_neto       numeric := 0;
  v_iva        numeric := 0;
  v_exento     numeric := 0;
  v_percepcion numeric := 0;
  v_alicuota   numeric := 0;
begin
  select * into v_venta from public.venta where id = p_venta_id;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se factura una venta cobrada. Esta esta %.', v_venta.estado;
  end if;
  if exists (select 1 from public.comprobante
             where venta_id = p_venta_id and estado <> 'anulado') then
    raise exception 'La venta ya tiene un comprobante emitido.';
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;

  -- A un Responsable Inscripto le corresponde A; al resto B
  v_clase := public.tipo_comprobante_para(v_venta.cliente_id);
  select id into v_tipo from public.tipo_comprobante
  where clase = v_clase and familia = 'factura' and activo;

  -- Punto de venta: el explicito, o el de la caja donde se cobro
  v_pv := p_punto_venta_id;
  if v_pv is null then
    select t.punto_venta_id into v_pv
    from public.caja c join public.terminal t on t.id = c.terminal_id
    where c.id = v_venta.caja_id;
  end if;
  if v_pv is null then
    select id into v_pv from public.punto_venta
    where activo and not es_respaldo and eliminado_en is null
    order by numero limit 1;
  end if;
  if v_pv is null then
    raise exception 'No hay punto de venta configurado para facturar.';
  end if;

  v_numero := app.siguiente_numero_comprobante(v_pv, v_tipo);

  select
    coalesce(sum(neto), 0),
    coalesce(sum(iva), 0)
  into v_neto, v_iva
  from public.vista_venta_iva where venta_id = p_venta_id;

  select coalesce(sum(l.importe), 0) into v_exento
  from public.venta_linea l
  where l.venta_id = p_venta_id and l.condicion_iva = 'exento';

  v_percepcion := case
    when v_venta.percepcion_iibb > 0 then v_venta.percepcion_iibb
    else public.calcular_percepcion_iibb(v_cliente.id, v_neto)
  end;
  if v_percepcion > 0 then
    select (valor #>> '{}')::numeric into v_alicuota
    from public.configuracion where clave = 'arca.iibb_percepcion_alicuota';
  end if;

  insert into public.comprobante (
    tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, exento, iva_total, tributos_total, total,
    estado, usuario_id, terminal_id
  ) values (
    v_tipo, v_pv, v_numero, p_venta_id, v_cliente.id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.localidad)), ''),
    v_venta.ocurrido_en::date, 1,
    v_neto, v_exento, v_iva, v_percepcion, v_venta.total + v_percepcion,
    'pendiente', v_venta.cajero_id, v_venta.terminal_origen_id
  ) returning id into v_comp_id;

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_comp_id, alicuota_iva_id, neto, iva
  from public.vista_venta_iva where venta_id = p_venta_id;

  -- Tributo 2 = Impuestos provinciales, el código de ARCA para IIBB.
  if v_percepcion > 0 then
    insert into public.comprobante_tributo
      (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
    values
      (v_comp_id, 2, 'Percepción IIBB Misiones', v_neto, v_alicuota, v_percepcion);
  end if;

  return v_comp_id;
end;
$$;
