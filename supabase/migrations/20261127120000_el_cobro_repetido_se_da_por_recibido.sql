-- ═══════════════════════════════════════════════════════════════
-- EL COBRO QUE LLEGA REPETIDO SE DA POR RECIBIDO
--
-- El 26/11 un mostrador mandó dos veces el mismo cobro (MOS1-000228):
-- entró el primero, el segundo volvió con «La venta esta cobrada» y una
-- copia que había pasado a la caja quedó trabada, reintentando cada
-- minuto.
--
-- Ahora, si la venta ya está cobrada y los pagos cargados suman lo que
-- se cobró (total más la percepción que quedó anotada), es el mismo
-- cobro que llega otra vez: se contesta que está bien y no se toca
-- nada. Si no suman eso —se cobró dos veces desde dos puestos, cada uno
-- con sus pagos— sigue avisando como antes.
--
-- Lo único que cambia de cobrar_venta() es ese bloque. Para volver
-- atrás: correr de nuevo la función de
-- 20261111120000_cobro_tardio_y_stock_por_puesto.sql.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.cobrar_venta(
  p_venta_id uuid,
  p_caja_id uuid default null,
  p_cajero_id uuid default null,
  p_vencido_autorizado_por uuid default null
)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  v_venta        public.venta;
  v_pagado       numeric;
  v_percepcion   numeric;
  v_cobrada      numeric := 0;
  v_cta_cte      numeric;
  v_cliente      public.cliente;
  v_saldo        numeric;
  v_cajero       uuid;
  v_vencido      numeric := 0;
  v_autoriza     uuid;
  v_caja         uuid := p_caja_id;
  v_caja_original uuid;
begin
  select * into v_venta from public.venta where id = p_venta_id for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;

  /*
    El mismo cobro que llega otra vez. Los pagos de un reenvío llevan el
    mismo id y no se cargan dos veces; los de otro cobro sí, y entonces
    la suma deja de dar. La fila está bloqueada, así que dos envíos
    juntos se atienden de a uno y el segundo entra por acá.
  */
  if v_venta.estado = 'cobrada' and abs(
    (select coalesce(sum(importe), 0) from public.venta_pago where venta_id = p_venta_id)
    - (v_venta.total + v_venta.percepcion_iibb)
  ) <= 0.01 then
    return p_venta_id;
  end if;

  if v_venta.estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % y no se puede cobrar.', v_venta.estado;
  end if;
  if not exists (select 1 from public.venta_linea where venta_id = p_venta_id) then
    raise exception 'La venta no tiene productos.';
  end if;

  v_cajero := coalesce(p_cajero_id, app.usuario_actual_id());

  /*
    Un cobro sin conexión que llega cuando su caja ya se cerró: va a la
    caja abierta, o queda esperando a la próxima (la toma abrir_caja).
    El cobro no se rechaza: el cliente ya pagó y se fue.
  */
  if p_caja_id is not null and exists (
    select 1 from public.caja where id = p_caja_id and estado = 'cerrada'
  ) then
    v_caja_original := p_caja_id;
    select id into v_caja from public.caja where estado = 'abierta' order by abierta_en desc limit 1;
  end if;

  select coalesce(sum(importe), 0) into v_pagado
  from public.venta_pago where venta_id = p_venta_id;

  /*
    Con percepción, que es lo que manda la caja; o sin ella, que es lo
    que mandan la tienda web y las cajas con una versión anterior.
    Lo que cierra decide cuánta percepción se cobró.
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

    /*
      Respuesta 7 de Lucas: a quien debe vencido no se le suma deuda sin
      que un encargado lo autorice. Lo vencido el día de la venta y no
      hoy: un cobro sin conexión que sube a la mañana siguiente se juzga
      con lo que vio la caja.
    */
    v_vencido := app.vencido_de(v_cliente.id,
      (v_venta.ocurrido_en at time zone 'America/Argentina/Buenos_Aires')::date);
    if v_vencido > 0 then
      v_autoriza := coalesce(p_vencido_autorizado_por, v_venta.vencido_autorizado_por);
      if v_autoriza is null then
        raise exception '% tiene deuda vencida: para venderle a cuenta corriente, lo tiene que autorizar un encargado con su PIN.', v_cliente.nombre;
      end if;
      if not app.usuario_tiene_permiso(v_autoriza, 'cuentacorriente.autorizar_vencido') then
        raise exception 'Quien autorizó la venta a % no puede autorizar a un cliente con deuda vencida.', v_cliente.nombre;
      end if;
    end if;
  end if;

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
  --
  -- La PC es la del puesto donde se armó la venta: la caja es una sola
  -- para todo el local y su PC no dice desde dónde se vendió.
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
         coalesce(v_venta.terminal_origen_id, (select terminal_id from public.caja where id = coalesce(v_caja, p_caja_id))),
         v_venta.ocurrido_en
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
      caja_id         = case when v_caja_original is not null then v_caja
                             else coalesce(p_caja_id, caja_id) end,
      caja_original_id = coalesce(v_caja_original, caja_original_id),
      percepcion_iibb = v_cobrada,
      vencido_autorizado_por = coalesce(v_autoriza, vencido_autorizado_por),
      vencido_autorizado_en  = case when v_autoriza is not null
                                    then coalesce(vencido_autorizado_en, now())
                                    else vencido_autorizado_en end
  where id = p_venta_id;

  return p_venta_id;
end;
$function$;
