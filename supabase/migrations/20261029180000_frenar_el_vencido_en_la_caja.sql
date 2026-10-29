-- ═══════════════════════════════════════════════════════════════
-- FRENAR EN LA CAJA LA VENTA A CUENTA CORRIENTE DE QUIEN DEBE VENCIDO
--
-- Respuesta 7 de Lucas, la parte del local: al elegir un cliente con
-- comprobantes vencidos, la venta a cuenta corriente no avanza hasta
-- que un encargado la autoriza con su PIN, y queda anotado quién la
-- dejó pasar. En el mayorista ya frena desde el 29/10 (ver
-- 20261029160000); esto es lo mismo para el mostrador y la caja.
--
-- El freno va en cobrar_venta(), que es la puerta de toda venta a
-- cuenta corriente: la caja, el pedido mayorista y la tienda pasan por
-- ahí. Pagar en efectivo o con tarjeta no se frena: el que debe puede
-- seguir comprando, lo que no puede es sumar deuda.
--
-- SIN CONEXIÓN. La caja cobra igual sin internet y el cobro sube
-- después. Para que frene también ahí, la terminal tiene que saber qué
-- cargos siguen impagos y cuándo vencen: se guardan en el saldo de cada
-- cliente, que ya baja a las PC. La cuenta es la misma de la deuda
-- vencida (lo pagado salda lo más viejo primero) y no depende del día,
-- así que alcanza con rehacerla cuando entra un movimiento.
--
-- EL DÍA ES EL DE LA VENTA. Un cobro hecho sin conexión que sube a la
-- mañana siguiente se juzga con la deuda vencida el día que se vendió,
-- que es lo que vio la caja; no con la de cuando llegó.
-- ═══════════════════════════════════════════════════════════════

-- ── Los cargos impagos, en el saldo ─────────────────────────────
alter table public.cuenta_corriente_saldo
  -- [{"v": vencimiento, "i": lo que falta pagar}], el más viejo primero.
  add column if not exists pendientes jsonb not null default '[]'::jsonb;

/*
  La misma imputación que vista_deuda_antiguedad: los pagos y las notas
  de crédito saldan los cargos más viejos primero.
*/
create or replace function app.pendientes_de(p_cliente_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cargos as (
    select m.vencimiento, m.importe,
           sum(m.importe) over (order by m.vencimiento, m.creado_en
                                rows between unbounded preceding and current row) as acumulado
    from public.movimiento_cuenta_corriente m
    where m.cliente_id = p_cliente_id and m.importe > 0 and m.vencimiento is not null
  ),
  pagado as (
    select coalesce(-sum(importe), 0) as total
    from public.movimiento_cuenta_corriente
    where cliente_id = p_cliente_id and importe < 0
  ),
  vivo as (
    select c.vencimiento, c.acumulado,
           greatest(0::numeric, least(c.importe, c.acumulado - p.total)) as pendiente
    from cargos c cross join pagado p
  )
  select coalesce(jsonb_agg(jsonb_build_object('v', vencimiento, 'i', pendiente)
                            order by vencimiento, acumulado), '[]'::jsonb)
  from vivo
  where pendiente > 0
$$;

create or replace function app.aplicar_movimiento_cuenta_corriente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cuenta_corriente_saldo (cliente_id, saldo, pendientes, actualizado_en)
  values (new.cliente_id, new.importe, app.pendientes_de(new.cliente_id), now())
  on conflict (cliente_id) do update
    set saldo          = public.cuenta_corriente_saldo.saldo + excluded.saldo,
        pendientes     = excluded.pendientes,
        actualizado_en = now();
  return new;
end;
$$;

create or replace function app.recalcular_saldo_cuenta_corriente(p_cliente_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_afectados integer;
begin
  insert into public.cuenta_corriente_saldo (cliente_id, saldo, pendientes, actualizado_en)
  select m.cliente_id, sum(m.importe), app.pendientes_de(m.cliente_id), now()
  from public.movimiento_cuenta_corriente m
  where p_cliente_id is null or m.cliente_id = p_cliente_id
  group by m.cliente_id
  on conflict (cliente_id) do update
    set saldo = excluded.saldo, pendientes = excluded.pendientes, actualizado_en = now();
  get diagnostics v_afectados = row_count;
  return v_afectados;
end;
$$;

-- Los saldos que ya existen. Las PC los vuelven a bajar enteros con la
-- versión que sabe leerlos (ver VERSION_BAJADA en la app).
update public.cuenta_corriente_saldo
set pendientes = app.pendientes_de(cliente_id);

/*
  Lo vencido de un cliente a un día dado; sin día, hoy en Oberá.

  Sale de los pendientes y no de vista_deuda_antiguedad para que la
  base y la caja sin conexión hagan la misma cuenta con el mismo dato.
*/
drop function if exists app.vencido_de(uuid);
create or replace function app.vencido_de(p_cliente_id uuid, p_al date default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((e->>'i')::numeric), 0)
  from public.cuenta_corriente_saldo s
  cross join lateral jsonb_array_elements(s.pendientes) e
  where s.cliente_id = p_cliente_id
    and (e->>'v')::date < coalesce(p_al, (now() at time zone 'America/Argentina/Buenos_Aires')::date)
$$;

revoke all on function app.pendientes_de(uuid) from public, anon;
revoke all on function app.vencido_de(uuid, date) from public, anon;
grant execute on function app.vencido_de(uuid, date) to authenticated;

-- ── Lo que queda anotado en la venta ────────────────────────────
alter table public.venta
  add column if not exists vencido_autorizado_por uuid references public.usuario(id) on delete set null,
  add column if not exists vencido_autorizado_en  timestamptz;

-- ── El PIN que autoriza, en la caja ─────────────────────────────
/*
  La caja pregunta acá, con conexión, si el PIN es de alguien que puede
  autorizar. Igual que en el mayorista, un PIN equivocado devuelve
  ok = false en vez de cortar: si cortara, la base desharía el intento
  fallido que anotó verificar_pin y el límite de intentos no frenaría a
  nadie.

  Sin conexión la caja reconoce el PIN con su verificador local y mira
  el rol (ver app/src/lib/api/caja.ts). Cuando el cobro sube, la base
  vuelve a mirar el permiso de verdad.
*/
create or replace function public.autorizar_vencido_con_pin(p_pin text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op record;
begin
  select o.usuario_id, o.nombre, o.rol into v_op from public.verificar_pin(btrim(coalesce(p_pin, ''))) o;
  if v_op.usuario_id is null then
    return json_build_object('ok', false, 'error', 'El PIN no es correcto.');
  end if;
  if not app.usuario_tiene_permiso(v_op.usuario_id, 'cuentacorriente.autorizar_vencido') then
    return json_build_object('ok', false, 'error', 'Ese PIN es de alguien que no puede autorizar a un cliente con deuda vencida.');
  end if;
  return json_build_object('ok', true, 'usuario_id', v_op.usuario_id, 'nombre', v_op.nombre, 'rol', v_op.rol);
end;
$$;

revoke all on function public.autorizar_vencido_con_pin(text) from public, anon;
grant execute on function public.autorizar_vencido_con_pin(text) to authenticated;

-- ── El cobro: el freno ──────────────────────────────────────────
/*
  Un parámetro más, con valor por omisión: las llamadas de siempre —la
  tienda, el mayorista, las cajas con una versión anterior— siguen
  sirviendo igual. Se borra la versión de tres parámetros para que no
  queden dos funciones con el mismo nombre y la base no sepa cuál usar.

  Quién autorizó llega como dato, igual que el cajero: lo que da fe es
  el PIN que la caja verificó. La base mira que esa persona pueda
  autorizar y lo anota en la venta.
*/
drop function if exists public.cobrar_venta(uuid, uuid, uuid);

create or replace function public.cobrar_venta(
  p_venta_id  uuid,
  p_caja_id   uuid default null,
  p_cajero_id uuid default null,
  p_vencido_autorizado_por uuid default null
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
  v_vencido      numeric := 0;
  v_autoriza     uuid;
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
      percepcion_iibb = v_cobrada,
      vencido_autorizado_por = coalesce(v_autoriza, vencido_autorizado_por),
      vencido_autorizado_en  = case when v_autoriza is not null
                                    then coalesce(vencido_autorizado_en, now())
                                    else vencido_autorizado_en end
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

revoke all on function public.cobrar_venta(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.cobrar_venta(uuid, uuid, uuid, uuid) to authenticated;

-- ── El mayorista le pasa a la venta quién autorizó el pedido ────
create or replace function public.mayorista_facturar_pedido(p_id uuid, p_documentacion text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido   public.pedido_mayorista;
  v_cliente  public.cliente;
  v_venta_id uuid;
  v_total    numeric;
  v_medio    uuid;
  v_comp     uuid;
  v_vencido  numeric;
begin
  if not app.tiene_permiso('mayorista.atender') then
    raise exception 'No tenés permiso para atender los pedidos mayoristas.';
  end if;
  if p_documentacion not in ('fiscal', 'no_fiscal') then
    raise exception 'Se factura o sale con comprobante interno.';
  end if;
  if p_documentacion = 'fiscal' and not app.tiene_permiso('facturacion.emitir') then
    raise exception 'No tenés permiso para facturar.';
  end if;
  if p_documentacion = 'no_fiscal' and not app.tiene_permiso('facturacion.vender_sin_factura') then
    raise exception 'No tenés permiso para cobrar una venta sin factura.';
  end if;

  select * into v_pedido from public.pedido_mayorista where id = p_id for update;
  if v_pedido.id is null then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado = 'facturado' then
    raise exception 'El pedido ya está facturado.';
  end if;
  if v_pedido.estado <> 'confirmado' then
    raise exception 'Primero hay que confirmar el pedido: que el depósito diga que está todo.';
  end if;

  select * into v_cliente from public.cliente where id = v_pedido.cliente_id;
  if not v_cliente.cuenta_corriente then
    raise exception '% no tiene cuenta corriente: habilitala en su ficha para facturarle el pedido.', v_cliente.nombre;
  end if;

  -- Respuesta 7 de Lucas: a quien tiene deuda vencida no se le factura
  -- sin que un encargado lo autorice.
  v_vencido := app.vencido_de(v_pedido.cliente_id);
  if v_vencido > 0 and v_pedido.vencido_autorizado_en is null then
    raise exception '% tiene deuda vencida: para facturarle el pedido, un encargado tiene que autorizarlo.', v_cliente.nombre;
  end if;

  select mp.id into v_medio from public.medio_pago mp
  where mp.tipo = 'cuenta_corriente' and mp.activo and mp.eliminado_en is null
  order by mp.orden limit 1;
  if v_medio is null then
    raise exception 'No hay un medio de pago de cuenta corriente activo.';
  end if;

  insert into public.venta (codigo, estado, cliente_id, vendedor_id, lista_precio_id, documentacion,
                            observaciones, ocurrido_en, enviada_caja_en, medio_pago_previsto_id)
  values ('MAY-' || lpad(v_pedido.numero::text, 6, '0'), 'en_caja', v_pedido.cliente_id, v_pedido.vendedor_id,
          app.lista_mayorista(), p_documentacion,
          'Pedido mayorista ' || v_pedido.numero || coalesce(' · ' || v_pedido.observaciones, ''),
          now(), now(), v_medio)
  returning id into v_venta_id;

  insert into public.venta_linea (venta_id, orden, producto_id, codigo_producto, descripcion,
                                  cantidad, precio_original, precio_unitario, precio_acordado,
                                  motivo_modificacion, modificado_por, alicuota_iva_id, condicion_iva)
  select v_venta_id, l.orden, p.id, p.codigo, p.nombre_interno,
         l.cantidad, l.precio_lista, l.precio, l.precio,
         case when l.precio <> l.precio_lista then 'Precio del pedido mayorista' end,
         case when l.precio <> l.precio_lista then coalesce(v_pedido.vendedor_id, app.usuario_actual_id()) end,
         p.alicuota_iva_id, p.condicion_iva
  from public.pedido_mayorista_linea l
  join public.producto p on p.id = l.producto_id
  where l.pedido_id = p_id;

  select v.total + public.percepcion_de_venta(v.id) into v_total
  from public.venta v where v.id = v_venta_id;

  insert into public.venta_pago (venta_id, medio_pago_id, importe, cuotas, referencia)
  values (v_venta_id, v_medio, v_total, 1, 'Pedido mayorista ' || v_pedido.numero);

  -- El que autorizó el pedido autoriza también la venta.
  perform public.cobrar_venta(v_venta_id, null, null, v_pedido.vencido_autorizado_por);

  if p_documentacion = 'fiscal' then
    v_comp := public.preparar_comprobante(v_venta_id);
  end if;

  update public.pedido_mayorista
  set estado = 'facturado', venta_id = v_venta_id,
      facturado_en = now(), facturado_por = app.usuario_actual_id()
  where id = p_id;

  return json_build_object('venta_id', v_venta_id, 'comprobante_id', v_comp);
end;
$$;

revoke all on function public.mayorista_facturar_pedido(uuid, text) from public, anon;
grant execute on function public.mayorista_facturar_pedido(uuid, text) to authenticated;
