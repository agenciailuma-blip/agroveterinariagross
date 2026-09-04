-- ═══════════════════════════════════════════════════════════════
-- EL REMITO MUEVE EL STOCK
--
-- Confirmado con Lucas el 04/09: a veces la mercaderia sale con remito
-- ANTES de que la venta este cobrada. Eso rompe el supuesto que tenia
-- el sistema hasta hoy, que era uno solo y comodo: el stock sale cuando
-- corre cobrar_venta().
--
-- LA REGLA, EN UNA LINEA
--
--   El stock sigue al hecho fisico, no al comercial.
--   Sale cuando sale la mercaderia, y UNA SOLA VEZ.
--
-- El error que esta migracion existe para evitar es descontar en los
-- dos momentos. El reparto de los martes dejaria el inventario cada vez
-- mas equivocado, y se descubriria recien en la proxima toma, cuando ya
-- nadie se acuerda de nada. Es la misma forma del error que tenia
-- cerrar_inventario() y que se corrigio el 24/08.
--
-- COMO QUEDA EL CIRCUITO
--
-- 1) El remito descarga el stock al emitirse, SOLO si la venta todavia
--    no lo descargo. El caso de todos los dias en Gross —venta cobrada
--    y despues entregada— no cambia en nada: el stock ya salio al
--    cobrar y el remito solo documenta el traslado.
--
-- 2) cobrar_venta() ya no descuenta a ciegas: reconcilia. Compara lo
--    que realmente se vendio contra lo que ya salio por remito, y
--    emite la diferencia. Si el remito llevo 3 bolsas y el cliente se
--    quedo con 2, la que volvio en la camioneta reingresa sola.
--
-- 3) anular_venta() deja de mirar el estado y pasa a mirar el libro de
--    movimientos. Antes solo reingresaba stock si la venta estaba
--    cobrada; con remitos eso deja mercaderia afuera para siempre.
--
-- LA PROPIEDAD QUE HACE SEGURO TOCAR cobrar_venta()
--
-- Sin remitos de por medio, la reconciliacion da exactamente lo mismo
-- que la resta anterior. Una venta comun se cobra igual que ayer. Eso
-- es lo que permite tocar la funcion que es la unica autoridad del
-- cobro sin reescribir su contrato.
--
-- UNICA DIFERENCIA VISIBLE en el libro de stock: antes se anotaba un
-- movimiento por linea de venta; ahora uno por producto. El saldo es
-- identico. Se agrupa por producto porque la reconciliacion es
-- inherentemente por producto —el stock no sabe de precios— y tener
-- dos criterios en la misma funcion es donde se esconde el proximo
-- error.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Dos tipos de movimiento nuevos
--
-- Nombrados por lo que realmente paso, no por lo que se le parece.
-- Quien mire el historial de un producto tiene que poder leer
-- "salio en el reparto del martes, volvio una bolsa" sin traducir.
-- ───────────────────────────────────────────────────────────────
alter table public.movimiento_stock
  drop constraint if exists movimiento_stock_tipo_check;
alter table public.movimiento_stock
  add constraint movimiento_stock_tipo_check check (tipo in (
    'carga_inicial',   -- alta del inventario inicial
    'compra',          -- ingreso por compra a proveedor
    'venta',           -- salida por venta
    'devolucion',      -- reingreso por devolución del cliente
    'ajuste',          -- corrección manual
    'inventario',      -- diferencia detectada en una toma
    'apertura',        -- se abre una bolsa para fraccionar
    'merma',           -- rotura, vencimiento, pérdida
    'remito',          -- salió con remito, antes de cobrarse
    'retorno_remito'   -- volvió del reparto sin entregarse
  ));

alter table public.movimiento_stock
  drop constraint if exists movimiento_stock_referencia_tipo_check;
alter table public.movimiento_stock
  add constraint movimiento_stock_referencia_tipo_check check (
    referencia_tipo in ('venta', 'compra', 'inventario', 'fraccionamiento', 'manual', 'remito'));

alter table public.movimiento_stock
  drop constraint if exists movimiento_signo_coherente;
alter table public.movimiento_stock
  add constraint movimiento_signo_coherente check (
    case tipo
      when 'venta'          then cantidad < 0
      when 'apertura'       then cantidad < 0
      when 'merma'          then cantidad < 0
      when 'remito'         then cantidad < 0
      when 'compra'         then cantidad > 0
      when 'devolucion'     then cantidad > 0
      when 'retorno_remito' then cantidad > 0
      else true
    end
  );

comment on column public.movimiento_stock.tipo is
  'Que paso fisicamente. remito y retorno_remito existen porque la mercaderia puede salir antes de cobrarse y volver sin entregarse.';

-- ───────────────────────────────────────────────────────────────
-- Emitir — ahora con la salida de stock del remito
--
-- Es la misma funcion de la migracion anterior mas el bloque final.
-- Se reemplaza entera y no por partes para que quien lea esta
-- migracion vea la version que efectivamente corre.
-- ───────────────────────────────────────────────────────────────
create or replace function public.emitir_comprobante_no_fiscal(
  p_venta_id     uuid,
  p_tipo_clave   text,
  p_terminal_id  uuid    default null,
  p_lineas       jsonb   default null,
  p_observaciones text   default null,
  p_valido_hasta date    default null,
  p_entrega_domicilio text default null,
  p_entrega_localidad text default null,
  p_entrega_contacto  text default null,
  p_transportista     text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta    public.venta;
  v_cliente  public.cliente;
  v_tipo     public.tipo_comprobante_no_fiscal;
  v_serie    text;
  v_numero   bigint;
  v_id       uuid;
  v_usuario  uuid;
  v_total    numeric;
begin
  select * into v_tipo from public.tipo_comprobante_no_fiscal
  where clave = p_tipo_clave and activo;
  if v_tipo.clave is null then
    raise exception 'No existe el tipo de comprobante no fiscal "%".', p_tipo_clave;
  end if;

  -- El bloqueo de fila serializa contra cobrar_venta(), que toma el
  -- mismo. Sin eso, un remito y un cobro simultaneos podrian no verse
  -- las salidas entre si y descontar dos veces.
  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta esta anulada: no se puede emitir documentacion sobre ella.';
  end if;
  if not exists (select 1 from public.venta_linea where venta_id = p_venta_id) then
    raise exception 'La venta no tiene productos.';
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;
  v_usuario := app.usuario_actual_id();

  select coalesce(t.prefijo, 'T') into v_serie
  from public.terminal t
  where t.id = coalesce(p_terminal_id, v_venta.terminal_origen_id);
  v_serie := coalesce(v_serie, 'T');

  v_numero := app.siguiente_numero_no_fiscal(p_tipo_clave, v_serie);

  insert into public.comprobante_no_fiscal (
    tipo_clave, serie, numero, terminal_id, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, observaciones, valido_hasta,
    entrega_domicilio, entrega_localidad, entrega_contacto, transportista,
    emitido_por
  ) values (
    p_tipo_clave, v_serie, v_numero,
    coalesce(p_terminal_id, v_venta.terminal_origen_id),
    p_venta_id, v_venta.cliente_id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero,
                          v_cliente.piso_depto, v_cliente.localidad)), ''),
    current_date, p_observaciones,
    case when p_tipo_clave = 'presupuesto' then p_valido_hasta end,
    case when p_tipo_clave = 'remito' then coalesce(
      p_entrega_domicilio,
      nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.piso_depto)), '')) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_localidad, v_cliente.localidad) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_contacto, v_cliente.telefono) end,
    case when p_tipo_clave = 'remito' then p_transportista end,
    v_usuario
  )
  returning id into v_id;

  if p_lineas is null then
    insert into public.comprobante_no_fiscal_linea
      (comprobante_no_fiscal_id, orden, producto_id, codigo_producto,
       descripcion, cantidad, precio_unitario, venta_linea_id)
    select v_id, l.orden, l.producto_id, l.codigo_producto,
           l.descripcion, l.cantidad, l.precio_unitario, l.id
    from public.venta_linea l
    where l.venta_id = p_venta_id;
  else
    insert into public.comprobante_no_fiscal_linea
      (comprobante_no_fiscal_id, orden, producto_id, codigo_producto,
       descripcion, cantidad, precio_unitario, venta_linea_id)
    select v_id, l.orden, l.producto_id, l.codigo_producto,
           l.descripcion, (e->>'cantidad')::numeric, l.precio_unitario, l.id
    from jsonb_array_elements(p_lineas) e
    join public.venta_linea l on l.id = (e->>'venta_linea_id')::uuid
    where l.venta_id = p_venta_id
      and (e->>'cantidad')::numeric > 0;

    if not exists (select 1 from public.comprobante_no_fiscal_linea
                   where comprobante_no_fiscal_id = v_id) then
      raise exception 'Ninguna de las lineas indicadas pertenece a esta venta.';
    end if;
  end if;

  select coalesce(sum(importe), 0) into v_total
  from public.comprobante_no_fiscal_linea where comprobante_no_fiscal_id = v_id;

  update public.comprobante_no_fiscal set total = round(v_total, 2) where id = v_id;

  /*
    La salida de stock del remito.

    Solo si la venta todavia no lo descargo. El caso de todos los dias
    en Gross —cobran y despues reparten— entra por aca sin mover nada:
    el stock ya salio al cobrar y este remito solamente documenta que
    la mercaderia viajo.
  */
  if v_tipo.mueve_stock and v_venta.estado in ('borrador', 'en_caja') then
    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
       usuario_id, operador_id, terminal_id, ocurrido_en)
    select cl.producto_id, 'remito', -sum(cl.cantidad),
           'Remito ' || v_tipo.sigla || ' ' || v_serie || '-' || lpad(v_numero::text, 8, '0'),
           'remito', v_id,
           v_usuario, v_venta.vendedor_id,
           coalesce(p_terminal_id, v_venta.terminal_origen_id), now()
    from public.comprobante_no_fiscal_linea cl
    where cl.comprobante_no_fiscal_id = v_id and cl.producto_id is not null
    group by cl.producto_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.emitir_comprobante_no_fiscal(
  uuid, text, uuid, jsonb, text, date, text, text, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Anular el remito devuelve la mercaderia
--
-- Se reingresa el neto de lo que ese remito saco, leido del libro de
-- movimientos y no de las lineas. El libro es la verdad: si por lo que
-- sea el remito no llego a descontar, no hay nada que devolver y el
-- neto da cero solo.
-- ───────────────────────────────────────────────────────────────
create or replace function public.anular_comprobante_no_fiscal(
  p_id     uuid,
  p_motivo text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc     public.comprobante_no_fiscal;
  v_usuario uuid;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la anulacion.';
  end if;

  if not app.tiene_permiso('facturacion.no_fiscal_anular') then
    raise exception 'No tenes permiso para anular comprobantes no fiscales.';
  end if;

  select * into v_doc from public.comprobante_no_fiscal where id = p_id for update;
  if v_doc.id is null then
    raise exception 'El comprobante no existe.';
  end if;
  if v_doc.estado = 'anulado' then
    raise exception 'El comprobante ya estaba anulado.';
  end if;
  if v_doc.estado = 'convertido' then
    raise exception 'Este comprobante ya se convirtio en factura. Para revertirlo hay que anular la factura.';
  end if;

  v_usuario := app.usuario_actual_id();

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id)
  select m.producto_id, 'retorno_remito', -sum(m.cantidad),
         'Anulacion remito ' || v_doc.serie || '-' || lpad(v_doc.numero::text, 8, '0'),
         'remito', v_doc.id, v_usuario
  from public.movimiento_stock m
  where m.referencia_tipo = 'remito' and m.referencia_id = v_doc.id
  group by m.producto_id
  having sum(m.cantidad) < 0;

  update public.comprobante_no_fiscal
  set estado           = 'anulado',
      anulado_en       = now(),
      anulado_por      = v_usuario,
      motivo_anulacion = p_motivo
  where id = p_id;

  return p_id;
end;
$$;

grant execute on function public.anular_comprobante_no_fiscal(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- COBRAR — ahora reconcilia contra lo que ya salio
--
-- Lo unico que cambia respecto de la version anterior es el bloque de
-- stock. Las validaciones de pagos, cuenta corriente y limite de
-- credito quedan intactas, palabra por palabra: son las mismas cuatro
-- condiciones que la terminal valida localmente antes de encolar, y
-- separarlas seria volver a tener dos versiones de la misma regla.
-- ───────────────────────────────────────────────────────────────
create or replace function public.cobrar_venta(
  p_venta_id  uuid,
  p_caja_id   uuid default null,
  p_cajero_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta        public.venta;
  v_pagado       numeric;
  v_cta_cte      numeric;
  v_cliente      public.cliente;
  v_saldo        numeric;
  v_cajero       uuid;
  v_terminal     uuid;
begin
  -- Bloqueo de fila: dos cajas no pueden cobrar la misma venta a la vez,
  -- y ademas serializa contra emitir_comprobante_no_fiscal().
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

  -- Tolerancia de un centavo por redondeo
  if abs(v_pagado - v_venta.total) > 0.01 then
    raise exception 'Los pagos suman % y el total es %.', v_pagado, v_venta.total;
  end if;

  -- Parte financiada en cuenta corriente
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
          coalesce(v_saldo, 0), v_cta_cte, v_cliente.limite_credito;
      end if;
    end if;
  end if;

  select terminal_id into v_terminal from public.caja where id = p_caja_id;

  /*
    Stock: la diferencia entre lo que se vendio y lo que ya salio.

    - Sin remitos, "remitido" viene vacio y esto descuenta exactamente
      lo vendido, igual que siempre.
    - Con un remito por la venta entera, la diferencia da cero y no se
      anota nada: la mercaderia ya habia salido.
    - Si el remito llevo de mas —el cliente devolvio en la puerta y el
      cajero corrigio la venta— la diferencia es negativa y lo que
      volvio en la camioneta reingresa solo.

    "Remitido" se lee del libro de movimientos y no de las lineas del
    remito, y eso importa: un remito anulado tiene su salida y su
    retorno anotados, el neto da cero, y esta cuenta lo toma bien sin
    tener que saber nada de estados.
  */
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
              else 'Volvio del reparto — venta ' || v_venta.codigo end,
         'venta', v_venta.id,
         v_cajero, v_venta.vendedor_id,
         coalesce(v_terminal, v_venta.terminal_origen_id), v_venta.ocurrido_en
  from neto n
  where n.falta <> 0 and n.producto_id is not null;

  -- Deuda, si se financio
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
  set estado     = 'cobrada',
      cobrada_en = now(),
      cajero_id  = v_cajero,
      caja_id    = coalesce(p_caja_id, caja_id)
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

comment on function public.cobrar_venta(uuid, uuid, uuid) is
  'Cobra una venta de forma atomica: valida pagos y limite de credito, reconcilia el stock contra lo que ya salio por remito, y registra la deuda. Todo o nada.';

grant execute on function public.cobrar_venta(uuid, uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Arrastrar los remitos cuando se anula la venta
--
-- Va en el esquema app y con privilegios propios por una razon
-- concreta: quien anula una venta esta autorizado por ventas.anular, y
-- no tiene por que tener ademas el permiso de emitir no fiscales. Sin
-- esto, un encargado con ventas.anular pero sin facturacion.no_fiscal_*
-- chocaria contra RLS DESPUES de haber pasado todos los controles de la
-- funcion, con un error de politica que no explica nada.
--
-- NO reingresa stock: eso ya lo hizo anular_venta() leyendo el libro.
-- Si esta funcion tambien lo hiciera, la mercaderia volveria dos veces.
-- ───────────────────────────────────────────────────────────────
create or replace function app.anular_remitos_de_venta(
  p_venta_id     uuid,
  p_motivo       text,
  p_usuario_id   uuid,
  p_venta_codigo text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cantidad integer;
begin
  update public.comprobante_no_fiscal
  set estado           = 'anulado',
      anulado_en       = now(),
      anulado_por      = p_usuario_id,
      motivo_anulacion = 'Anulacion de la venta ' || p_venta_codigo || ': ' || p_motivo
  where venta_id = p_venta_id and estado = 'emitido';

  get diagnostics v_cantidad = row_count;
  return v_cantidad;
end;
$$;

revoke all on function app.anular_remitos_de_venta(uuid, text, uuid, text) from public, anon;
grant execute on function app.anular_remitos_de_venta(uuid, text, uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- ANULAR — deja de mirar el estado y mira el libro
--
-- Antes reingresaba stock solo si la venta estaba cobrada, porque hasta
-- hoy esa era la unica forma de que hubiera salido mercaderia. Con
-- remitos eso deja mercaderia afuera para siempre: una venta que quedo
-- en_caja, se remitio y despues se anulo perdia el stock sin que nadie
-- lo notara hasta la proxima toma de inventario.
--
-- Ahora reingresa el neto de todo lo que efectivamente salio referido a
-- esta venta, directa o por sus remitos. Para una venta comun sin
-- remitos el resultado es identico al de antes.
-- ───────────────────────────────────────────────────────────────
create or replace function public.anular_venta(
  p_venta_id uuid,
  p_motivo   text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta   public.venta;
  v_cta_cte numeric;
  v_usuario uuid;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la anulacion.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta ya estaba anulada.';
  end if;

  v_usuario := app.usuario_actual_id();

  /*
    Reingreso de stock: el neto de lo que salio, venga de donde venga.

    El "having sum < 0" es lo que lo hace correcto en todos los casos:
    una venta que nunca descargo stock no genera ningun movimiento, que
    es exactamente lo que hacia la version anterior con su "if estado =
    cobrada". Y una venta ya compensada tampoco, porque su neto es cero.
  */
  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id)
  select m.producto_id, 'devolucion', -sum(m.cantidad),
         'Anulacion venta ' || v_venta.codigo, 'venta', v_venta.id, v_usuario
  from public.movimiento_stock m
  where m.producto_id is not null
    and ((m.referencia_tipo = 'venta' and m.referencia_id = v_venta.id)
      or (m.referencia_tipo = 'remito' and m.referencia_id in (
            select cnf.id from public.comprobante_no_fiscal cnf
            where cnf.venta_id = v_venta.id)))
  group by m.producto_id
  having sum(m.cantidad) < 0;

  -- Reversa de la deuda: sigue siendo cosa de una venta cobrada, porque
  -- una que no se cobro nunca genero deuda.
  if v_venta.estado = 'cobrada' then
    select coalesce(sum(vp.importe), 0) into v_cta_cte
    from public.venta_pago vp
    join public.medio_pago mp on mp.id = vp.medio_pago_id
    where vp.venta_id = p_venta_id and mp.tipo = 'cuenta_corriente';

    if v_cta_cte > 0 then
      insert into public.movimiento_cuenta_corriente
        (cliente_id, tipo, importe, concepto, referencia_tipo, referencia_id, usuario_id)
      values
        (v_venta.cliente_id, 'nota_credito', -v_cta_cte,
         'Anulacion venta ' || v_venta.codigo, 'venta', v_venta.id, v_usuario);
    end if;
  end if;

  -- Los remitos de una venta anulada quedan anulados tambien.
  perform app.anular_remitos_de_venta(p_venta_id, p_motivo, v_usuario, v_venta.codigo);

  update public.venta
  set estado           = 'anulada',
      anulada_en       = now(),
      anulada_por      = v_usuario,
      motivo_anulacion = p_motivo
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

comment on function public.anular_venta(uuid, text) is
  'Anula una venta generando los movimientos que compensan stock y cuenta corriente, incluido lo que salio por remito. No borra nada.';

grant execute on function public.anular_venta(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Entregado y sin cobrar
--
-- Stock que legitimamente no esta en el local, pero que nadie esta
-- mirando. Sin esta vista un remito olvidado es mercaderia que se fue y
-- plata que no entro, y no aparece en ninguna pantalla.
-- ───────────────────────────────────────────────────────────────
create or replace view public.remito_sin_cobrar
with (security_invoker = true)
as
select
  cnf.id,
  cnf.serie,
  cnf.numero,
  cnf.fecha,
  cnf.receptor_nombre,
  cnf.total,
  cnf.entrega_domicilio,
  cnf.entrega_localidad,
  cnf.transportista,
  v.id     as venta_id,
  v.codigo as venta_codigo,
  v.estado as venta_estado,
  current_date - cnf.fecha as dias
from public.comprobante_no_fiscal cnf
join public.venta v on v.id = cnf.venta_id
where cnf.tipo_clave = 'remito'
  and cnf.estado = 'emitido'
  and v.estado in ('borrador', 'en_caja');

comment on view public.remito_sin_cobrar is
  'Remitos entregados cuya venta todavia no se cobro. Es stock que salio del local y plata que no entro.';
