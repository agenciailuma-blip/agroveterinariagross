-- ═══════════════════════════════════════════════════════════════
-- EL COBRO QUE LLEGA TARDE Y EL STOCK DE CADA PUESTO
--
-- Con una sola caja para el local (20261111100000) quedaban dos cosas:
--
-- · Un puesto cobra sin internet contra la caja abierta. Mientras tanto
--   el encargado la cierra desde otra PC. Cuando vuelve la conexión, el
--   cobro sube contra una caja cerrada: no estaba en el arqueo que se
--   hizo, y tampoco va a estar en el próximo.
--
--   Ahora, si la caja del cobro ya está cerrada, la venta va a la caja
--   abierta. Si no hay ninguna abierta, queda esperando y la toma la
--   próxima que se abra. En los dos casos queda anotada la caja contra
--   la que se cobró (caja_original_id), y el resumen dice cuántas
--   ventas llegaron así, para que el encargado sepa que esa plata
--   entró antes de abrir o después de cerrar.
--
-- · El stock de una venta se anotaba con la PC de la caja. Con una sola
--   caja para todos, una venta cobrada en el Mostrador 2 quedaba como
--   salida de la PC donde se abrió la caja. Ahora va con la PC donde se
--   armó la venta.
-- ═══════════════════════════════════════════════════════════════

alter table public.venta
  add column if not exists caja_original_id uuid references public.caja(id) on delete set null;

comment on column public.venta.caja_original_id is
  'La caja contra la que se cobró sin conexión, si cuando el cobro llegó al servidor ya estaba cerrada. La venta pasa a la caja abierta, o a la próxima que se abra.';

create index if not exists venta_esperando_caja
  on public.venta (caja_original_id) where caja_id is null and caja_original_id is not null;

-- ── Cobrar ─────────────────────────────────────────────────────────

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

-- ── Abrir: toma los cobros que llegaron con la caja cerrada ────────

create or replace function public.abrir_caja(
  p_terminal_id   uuid,
  p_monto_inicial numeric,
  p_pin           text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op      record;
  v_abierta public.caja;
  v_caja    public.caja;
  v_tomadas integer;
begin
  if not app.tiene_permiso('ventas.cobrar') then
    return json_build_object('ok', false, 'error', 'Este usuario no puede cobrar, y por eso no puede abrir la caja.');
  end if;

  select o.usuario_id, o.nombre into v_op from public.verificar_pin(btrim(coalesce(p_pin, ''))) o;
  if v_op.usuario_id is null then
    return json_build_object('ok', false, 'error', 'El PIN no es correcto.');
  end if;
  if not app.usuario_tiene_permiso(v_op.usuario_id, 'caja.abrir') then
    return json_build_object('ok', false, 'error', 'Ese PIN es de alguien que no puede abrir la caja.');
  end if;
  if coalesce(p_monto_inicial, 0) < 0 then
    return json_build_object('ok', false, 'error', 'El monto inicial no puede ser negativo.');
  end if;

  select * into v_abierta from public.caja where estado = 'abierta' limit 1;
  if v_abierta.id is not null then
    return json_build_object('ok', false, 'error',
      format('La caja ya está abierta: la abrió %s el %s.',
        coalesce((select nombre from public.usuario where id = v_abierta.cajero_id), 'alguien'),
        to_char(v_abierta.abierta_en at time zone 'America/Argentina/Buenos_Aires', 'DD/MM "a las" HH24:MI')));
  end if;

  insert into public.caja (terminal_id, cajero_id, monto_inicial)
  values (p_terminal_id, v_op.usuario_id, coalesce(p_monto_inicial, 0))
  returning * into v_caja;

  -- Los cobros sin conexión que subieron con la caja cerrada y ninguna
  -- abierta: entran en esta.
  update public.venta set caja_id = v_caja.id
  where caja_id is null and caja_original_id is not null and estado = 'cobrada';
  get diagnostics v_tomadas = row_count;

  return json_build_object('ok', true, 'ventas_tomadas', v_tomadas, 'caja', json_build_object(
    'id', v_caja.id, 'terminal_id', v_caja.terminal_id, 'cajero_id', v_caja.cajero_id,
    'estado', v_caja.estado, 'monto_inicial', v_caja.monto_inicial, 'abierta_en', v_caja.abierta_en));
exception
  when unique_violation then
    return json_build_object('ok', false, 'error', 'La caja ya está abierta: la acaba de abrir otro puesto.');
end;
$$;

-- ── El resumen dice cuántas llegaron de una caja ya cerrada ────────

create or replace function public.resumen_de_caja(p_caja_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caja public.caja;
  v_res  jsonb;
begin
  -- Quien cobra también lo ve: el local entra con un solo usuario y el
  -- cierre lo hace el encargado con su PIN. Con la caja abierta no dice
  -- el efectivo esperado.
  if not (app.tiene_permiso('caja.cerrar') or app.tiene_permiso('caja.movimientos')
          or app.tiene_permiso('ventas.cobrar')) then
    raise exception 'No tenés permiso para ver el cierre de caja.';
  end if;

  select * into v_caja from public.caja where id = p_caja_id;
  if v_caja.id is null then
    raise exception 'La caja no existe.';
  end if;

  if v_caja.estado = 'cerrada' and v_caja.resumen_al_cerrar is not null then
    v_res := v_caja.resumen_al_cerrar;
  else
    v_res := app.armar_resumen_de_caja(p_caja_id);
  end if;

  if v_caja.estado = 'abierta' then
    -- El arqueo es a ciegas, y este resumen también se ve antes de contar.
    v_res := jsonb_set(v_res, '{efectivo,esperado}', 'null'::jsonb);
  else
    -- Cerrada sin resumen guardado (de antes de esto): el esperado es el
    -- del arqueo, no uno recalculado.
    if v_caja.resumen_al_cerrar is null then
      v_res := jsonb_set(v_res, '{efectivo,esperado}', to_jsonb(v_caja.monto_esperado));
    end if;
    v_res := v_res || jsonb_build_object(
      'despues_del_cierre', app.cambios_despues_del_cierre(v_caja),
      'guardado_al_cerrar', v_caja.resumen_al_cerrar is not null);
  end if;

  -- Cobradas sin conexión contra una caja que ya se había cerrado, y
  -- que entraron en esta. El efectivo está en el cajón de esta caja.
  v_res := jsonb_set(v_res, '{ventas,de_una_caja_cerrada}', (
    select jsonb_build_object('cantidad', count(*), 'total', coalesce(sum(total), 0))
    from public.venta
    where caja_id = p_caja_id and caja_original_id is not null and estado = 'cobrada'));

  return v_res;
end;
$$;

-- ── La venta que se iba a cobrar en el mostrador y no se cobró ─────
--
-- El mostrador arma la venta en borrador para cobrarla ahí mismo, así
-- no aparece en la cola de la Caja mientras tanto. Si el cobro se
-- cancela, pasa a la cola. Es una función y no un update porque viaja
-- por la bandeja de salida, también sin conexión, detrás de la venta.

create or replace function public.mandar_venta_a_caja(p_venta_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.venta
  set estado = 'en_caja', enviada_caja_en = now()
  where id = p_venta_id and estado = 'borrador';
$$;

revoke all on function public.mandar_venta_a_caja(uuid) from public, anon;
grant execute on function public.mandar_venta_a_caja(uuid) to authenticated;
