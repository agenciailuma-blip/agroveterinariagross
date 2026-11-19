/*
  ─────────────────────────────────────────────────────────────
  Registro de auditoría, parte 2: todo junto en una lista

  Administración → Registro de auditoría lee esta función. Junta los
  cambios de fichas y configuración (tabla auditoria, desde el 19/11) con
  los rastros que cada operación ya guardaba en su tabla, así que lo que
  ya tenía rastro aparece con su historia completa:

  - anulaciones: ventas, proformas y demás papeles, recibos, movimientos
    de caja, entradas y salidas, transferencias, pagos a proveedores,
    fiados y pedidos mayoristas cancelados;
  - devoluciones y notas de crédito;
  - precios cambiados en un renglón de la venta, y aumentos masivos;
  - ventas a clientes con deuda vencida, con quién las autorizó;
  - aperturas y cierres de caja, con la diferencia;
  - entradas y salidas de stock y cierres de inventario.

  Tipos para filtrar: anulacion, devolucion, precio, autorizacion, caja,
  stock, ficha, permisos, configuracion.

  Los cambios de precio que hace un aumento masivo no se repiten producto
  por producto: el aumento ya figura como un solo renglón (se reconoce
  porque el disparador y el aumento comparten el momento de la
  transacción).
  ─────────────────────────────────────────────────────────────
*/

create or replace function public.registro_de_auditoria(
  p_desde   timestamptz default null,
  p_hasta   timestamptz default null,
  p_usuario uuid default null,
  p_tipo    text default null,
  p_texto   text default null,
  p_limite  integer default 500
)
returns table (
  momento        timestamptz,
  tipo           text,
  que            text,
  detalle        text,
  usuario_id     uuid,
  usuario        text,
  puesto         text,
  referencia     text,
  referencia_id  uuid,
  antes          jsonb,
  despues        jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('auditoria.ver') then
    raise exception 'No tenés permiso para ver el registro de auditoría';
  end if;

  return query
  with eventos as (
    -- Fichas y configuración.
    select a.creado_en as momento,
           case
             when a.tabla in ('usuario', 'rol', 'rol_permiso') then 'permisos'
             when a.tabla = 'producto_precio_lista'
               or (a.tabla = 'producto' and coalesce(a.datos_despues, a.datos_antes, '{}') ?| array['precio_venta', 'costo', 'margen_sobre_costo'])
               or (a.tabla = 'lista_precio' and coalesce(a.datos_despues, '{}') ? 'ajuste_porcentaje') then 'precio'
             when a.tabla in ('producto', 'cliente') then 'ficha'
             else 'configuracion'
           end as tipo,
           (case a.tabla
              when 'producto' then 'Producto'
              when 'producto_precio_lista' then 'Precio por lista'
              when 'cliente' then 'Cliente'
              when 'usuario' then 'Usuario'
              when 'rol' then 'Rol'
              when 'rol_permiso' then 'Permiso'
              when 'configuracion' then 'Configuración'
              when 'medio_pago' then 'Medio de pago'
              when 'lista_precio' then 'Lista de precios'
              when 'punto_venta' then 'Punto de venta'
              when 'terminal' then 'Puesto'
              when 'deposito' then 'Depósito'
              when 'remito_r_tanda' then 'Tanda del remito R'
              else a.tabla
            end)
           || case a.accion
                when 'insert' then case when a.tabla = 'rol_permiso' then ' dado' else ': alta' end
                when 'delete' then case when a.tabla = 'rol_permiso' then ' quitado' else ': borrado' end
                else ' cambiado'
              end as que,
           a.contexto ->> 'nombre' as detalle,
           a.usuario_id, a.terminal_id,
           a.tabla as referencia, a.registro_id as referencia_id,
           a.datos_antes as antes, a.datos_despues as despues
      from public.auditoria a
     where not (a.tabla in ('producto', 'producto_precio_lista')
                and exists (select 1 from public.aumento_precio ap
                             where ap.aplicado_en = a.creado_en or ap.revertido_en = a.creado_en))

    union all  -- Ventas anuladas.
    select v.anulada_en, 'anulacion', 'Venta anulada',
           concat_ws(' · ', v.codigo, app.pesos(v.total), c.nombre, v.motivo_anulacion),
           v.anulada_por, v.terminal_origen_id, 'venta', v.id, null, null
      from public.venta v left join public.cliente c on c.id = v.cliente_id
     where v.anulada_en is not null

    union all  -- Proformas, presupuestos, remitos y comprobantes de entrega anulados.
    select nf.anulado_en, 'anulacion',
           case nf.tipo_clave
             when 'comprobante_interno' then 'Proforma anulada'
             when 'presupuesto' then 'Presupuesto anulado'
             when 'remito' then 'Remito anulado'
             when 'comprobante_entrega' then 'Comprobante de entrega anulado'
             else 'Papel anulado'
           end,
           concat_ws(' · ',
             case nf.tipo_clave when 'comprobante_interno' then 'PRO' when 'presupuesto' then 'PRE'
                                when 'remito' then 'REM' when 'comprobante_entrega' then 'ENT' else '' end
               || ' ' || nf.serie || '-' || lpad(nf.numero::text, 8, '0'),
             app.pesos(nf.total), coalesce(c.nombre, nf.receptor_nombre), nf.motivo_anulacion),
           nf.anulado_por, nf.terminal_id, 'comprobante_no_fiscal', nf.id, null, null
      from public.comprobante_no_fiscal nf left join public.cliente c on c.id = nf.cliente_id
     where nf.anulado_en is not null

    union all  -- Recibos anulados.
    select r.anulado_en, 'anulacion', 'Recibo anulado',
           concat_ws(' · ', r.serie || '-' || lpad(r.numero::text, 8, '0'), app.pesos(r.total), c.nombre, r.motivo_anulacion),
           r.anulado_por, null::uuid, 'recibo', r.id, null, null
      from public.recibo r left join public.cliente c on c.id = r.cliente_id
     where r.anulado_en is not null

    union all  -- Ingresos y egresos de caja anulados.
    select cm.anulado_en, 'anulacion',
           case when cm.tipo = 'ingreso' then 'Ingreso de caja anulado' else 'Egreso de caja anulado' end,
           concat_ws(' · ', cm.concepto, app.pesos(cm.importe), cm.motivo_anulacion),
           cm.anulado_por, cj.terminal_id, 'caja', cm.caja_id, null, null
      from public.caja_movimiento cm join public.caja cj on cj.id = cm.caja_id
     where cm.anulado_en is not null

    union all  -- Entradas y salidas de stock anuladas.
    select es.anulada_en, 'anulacion',
           case when es.sentido = 'entrada' then 'Entrada de stock anulada' else 'Salida de stock anulada' end,
           concat_ws(' · ', 'N° ' || es.numero, replace(es.motivo, '_', ' '), es.motivo_anulacion),
           es.anulada_por, null::uuid, 'entrada_salida', es.id, null, null
      from public.entrada_salida es
     where es.anulada_en is not null

    union all  -- Transferencias anuladas.
    select tr.anulada_en, 'anulacion', 'Transferencia anulada',
           concat_ws(' · ', 'N° ' || tr.numero, o.nombre || ' → ' || d.nombre, tr.motivo_anulacion),
           tr.anulada_por, null::uuid, 'transferencia', tr.id, null, null
      from public.transferencia tr
      left join public.deposito o on o.id = tr.origen_id
      left join public.deposito d on d.id = tr.destino_id
     where tr.anulada_en is not null

    union all  -- Pagos a proveedores anulados.
    select pp.anulado_en, 'anulacion', 'Pago a proveedor anulado',
           concat_ws(' · ', pr.nombre, app.pesos(pp.importe), pp.motivo_anulacion),
           pp.anulado_por, null::uuid, 'pago_proveedor', pp.id, null, null
      from public.pago_proveedor pp left join public.proveedor pr on pr.id = pp.proveedor_id
     where pp.anulado_en is not null

    union all  -- Fiados anulados (no guardan quién: va con la venta anulada).
    select f.anulado_en, 'anulacion', 'Fiado anulado',
           concat_ws(' · ', fp.nombre, app.pesos(f.importe), f.motivo_anulacion),
           null::uuid, null::uuid, 'fiado', f.persona_id, null, null
      from public.fiado f left join public.fiado_persona fp on fp.id = f.persona_id
     where f.anulado_en is not null

    union all  -- Pedidos mayoristas cancelados.
    select pm.cancelado_en, 'anulacion', 'Pedido mayorista cancelado',
           concat_ws(' · ', 'Pedido ' || pm.numero, c.nombre, pm.motivo_cancelacion),
           pm.cancelado_por, null::uuid, 'pedido_mayorista', pm.id, null, null
      from public.pedido_mayorista pm left join public.cliente c on c.id = pm.cliente_id
     where pm.cancelado_en is not null

    union all  -- Devoluciones.
    select dv.ocurrido_en, 'devolucion', 'Devolución',
           concat_ws(' · ', vt.codigo, app.pesos(dv.total), c.nombre, dv.motivo),
           dv.usuario_id, dv.terminal_id, 'venta', dv.venta_id, null, null
      from public.devolucion dv
      left join public.venta vt on vt.id = dv.venta_id
      left join public.cliente c on c.id = vt.cliente_id

    union all  -- Notas de crédito que no salieron de una devolución.
    select cp.creado_en, 'devolucion', 'Nota de crédito',
           concat_ws(' · ', tc.descripcion || ' ' || lpad(pv.numero::text, 4, '0') || '-' || lpad(cp.numero::text, 8, '0'),
                     app.pesos(cp.total), coalesce(c.nombre, cp.receptor_nombre)),
           cp.usuario_id, cp.terminal_id, 'comprobante', cp.id, null, null
      from public.comprobante cp
      join public.tipo_comprobante tc on tc.id = cp.tipo_comprobante_id and tc.familia = 'nota_credito'
      left join public.punto_venta pv on pv.id = cp.punto_venta_id
      left join public.cliente c on c.id = cp.cliente_id
     where cp.estado in ('autorizado', 'informado', 'contingencia')
       and not exists (select 1 from public.devolucion dv where dv.comprobante_id = cp.id)

    union all  -- Precio cambiado en un renglón de la venta.
    select coalesce(vl.actualizado_en, vl.creado_en), 'precio', 'Precio cambiado en la venta',
           concat_ws(' · ', vt.codigo, vl.descripcion,
                     app.pesos(vl.precio_original) || ' → ' || app.pesos(vl.precio_unitario), vl.motivo_modificacion),
           vl.modificado_por, vt.terminal_origen_id, 'venta', vt.id, null, null
      from public.venta_linea vl join public.venta vt on vt.id = vl.venta_id
     where vl.modificado_por is not null
       and vl.precio_original is not null
       and vl.precio_unitario is distinct from vl.precio_original

    union all  -- Aumentos masivos.
    select ap.aplicado_en, 'precio',
           case when ap.porcentaje >= 0 then 'Aumento de precios' else 'Baja de precios' end,
           concat_ws(' · ', ap.porcentaje || ' %', ap.productos || ' productos', pr.nombre, ca.nombre, ap.motivo),
           ap.aplicado_por, null::uuid, 'aumento_precio', ap.id, null, null
      from public.aumento_precio ap
      left join public.proveedor pr on pr.id = ap.proveedor_id
      left join public.categoria ca on ca.id = ap.categoria_id
    union all
    select ap.revertido_en, 'precio', 'Aumento de precios deshecho',
           concat_ws(' · ', ap.porcentaje || ' %', ap.productos || ' productos', pr.nombre, ca.nombre),
           ap.revertido_por, null::uuid, 'aumento_precio', ap.id, null, null
      from public.aumento_precio ap
      left join public.proveedor pr on pr.id = ap.proveedor_id
      left join public.categoria ca on ca.id = ap.categoria_id
     where ap.revertido_en is not null

    union all  -- Venta a un cliente con deuda vencida, autorizada.
    select v.vencido_autorizado_en, 'autorizacion', 'Venta con deuda vencida autorizada',
           concat_ws(' · ', v.codigo, c.nombre, app.pesos(v.total)),
           v.vencido_autorizado_por, v.terminal_origen_id, 'venta', v.id, null, null
      from public.venta v left join public.cliente c on c.id = v.cliente_id
     where v.vencido_autorizado_por is not null
    union all
    select nf.creado_en, 'autorizacion', 'Proforma con deuda vencida autorizada',
           concat_ws(' · ', 'PRO ' || nf.serie || '-' || lpad(nf.numero::text, 8, '0'), coalesce(c.nombre, nf.receptor_nombre)),
           nf.vencido_autorizado_por, nf.terminal_id, 'comprobante_no_fiscal', nf.id, null, null
      from public.comprobante_no_fiscal nf left join public.cliente c on c.id = nf.cliente_id
     where nf.vencido_autorizado_por is not null
    union all
    select pm.vencido_autorizado_en, 'autorizacion', 'Pedido mayorista con deuda vencida autorizado',
           concat_ws(' · ', 'Pedido ' || pm.numero, c.nombre, 'debía ' || app.pesos(pm.vencido_autorizado_monto)),
           pm.vencido_autorizado_por, null::uuid, 'pedido_mayorista', pm.id, null, null
      from public.pedido_mayorista pm left join public.cliente c on c.id = pm.cliente_id
     where pm.vencido_autorizado_por is not null

    union all  -- Caja: apertura y cierre.
    select cj.abierta_en, 'caja', 'Caja abierta',
           'Inicial ' || app.pesos(cj.monto_inicial),
           cj.cajero_id, cj.terminal_id, 'caja', cj.id, null, null
      from public.caja cj
    union all
    select cj.cerrada_en, 'caja', 'Caja cerrada',
           concat_ws(' · ', 'Contado ' || app.pesos(cj.monto_declarado),
                     'Diferencia ' || app.pesos(cj.diferencia)),
           coalesce(cj.cerrada_por, cj.cajero_id), cj.terminal_id, 'caja', cj.id, null, null
      from public.caja cj
     where cj.cerrada_en is not null

    union all  -- Entradas y salidas de stock.
    select es.ocurrido_en, 'stock',
           case when es.sentido = 'entrada' then 'Entrada de stock' else 'Salida de stock' end,
           concat_ws(' · ', 'N° ' || es.numero, replace(es.motivo, '_', ' '), es.observacion),
           es.usuario_id, null::uuid, 'entrada_salida', es.id, null, null
      from public.entrada_salida es

    union all  -- Inventarios cerrados.
    select inv.cerrado_en, 'stock', 'Inventario cerrado',
           concat_ws(' · ', inv.nombre, inv.sector),
           inv.cerrado_por, null::uuid, 'inventario', inv.id, null, null
      from public.inventario inv
     where inv.cerrado_en is not null
  )
  select e.momento, e.tipo, e.que, e.detalle, e.usuario_id, u.nombre, t.nombre,
         e.referencia, e.referencia_id, e.antes, e.despues
    from eventos e
    left join public.usuario u on u.id = e.usuario_id
    left join public.terminal t on t.id = e.terminal_id
   where e.momento is not null
     and (p_desde is null or e.momento >= p_desde)
     and (p_hasta is null or e.momento < p_hasta)
     and (p_usuario is null or e.usuario_id = p_usuario)
     and (p_tipo is null or e.tipo = p_tipo)
     and (p_texto is null or p_texto = ''
          or app.texto_para_comparar(concat_ws(' ', e.que, e.detalle, u.nombre, t.nombre, e.antes::text, e.despues::text))
             like '%' || app.texto_para_comparar(p_texto) || '%')
   order by e.momento desc
   limit least(greatest(coalesce(p_limite, 500), 1), 5000);
end;
$$;

comment on function public.registro_de_auditoria(timestamptz, timestamptz, uuid, text, text, integer) is
  'Administración → Registro de auditoría: fichas, configuración y los rastros de cada operación, juntos. Pide auditoria.ver.';

revoke all on function public.registro_de_auditoria(timestamptz, timestamptz, uuid, text, text, integer) from public, anon;
grant execute on function public.registro_de_auditoria(timestamptz, timestamptz, uuid, text, text, integer) to authenticated;
