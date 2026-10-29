-- ═══════════════════════════════════════════════════════════════
-- FRENAR EL PEDIDO DE QUIEN TIENE DEUDA VENCIDA
--
-- Respuesta 7 de Lucas: al cliente con comprobantes vencidos el sistema
-- avisa y frena; un encargado autoriza con su PIN y queda anotado quién
-- lo dejó pasar.
--
-- En el mayorista el freno va al facturar, no al armar: Facundo está
-- parado frente al cliente, a veces sin señal, y el pedido todavía no es
-- una venta. Lo arma igual, con el aviso a la vista; en el local, el
-- pedido de un cliente con vencido no se factura —ni sale con
-- comprobante interno— hasta que un encargado lo autoriza.
--
-- Autoriza quien tiene el permiso nuevo: con un clic si es el que está
-- en la computadora, o con su PIN si se acerca. El PIN se verifica acá,
-- en la base, con la misma función del mostrador y su límite de
-- intentos por terminal.
-- ═══════════════════════════════════════════════════════════════

-- ── El permiso ──────────────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('cuentacorriente.autorizar_vencido', 'Cuenta cte.', 'Autorizar la venta a cuenta corriente de un cliente con deuda vencida', 540)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'cuentacorriente.autorizar_vencido'
from public.rol r
where r.nombre in ('Administrador', 'Encargado') and r.eliminado_en is null
on conflict do nothing;

-- ── Lo que queda anotado en el pedido ───────────────────────────
alter table public.pedido_mayorista
  add column if not exists vencido_autorizado_por   uuid references public.usuario(id) on delete set null,
  add column if not exists vencido_autorizado_en    timestamptz,
  -- Cuánto debía vencido cuando lo autorizaron.
  add column if not exists vencido_autorizado_monto numeric(14,2);

-- ── Ayudas ──────────────────────────────────────────────────────
create or replace function app.vencido_de(p_cliente_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select d.vencido_30 + d.vencido_60 + d.vencido_mas_60
                   from public.vista_deuda_antiguedad d where d.cliente_id = p_cliente_id), 0)
$$;

/* El permiso de otro usuario: el que puso el PIN, no el de la sesión. */
create or replace function app.usuario_tiene_permiso(p_usuario_id uuid, p_clave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario u
    join public.rol_permiso rp on rp.rol_id = u.rol_id
    where u.id = p_usuario_id
      and u.activo
      and u.eliminado_en is null
      and rp.permiso_clave = p_clave
  )
$$;

revoke all on function app.vencido_de(uuid) from public, anon;
revoke all on function app.usuario_tiene_permiso(uuid, text) from public, anon;
grant execute on function app.vencido_de(uuid) to authenticated;
grant execute on function app.usuario_tiene_permiso(uuid, text) to authenticated;

-- ── Autorizar ───────────────────────────────────────────────────
/*
  Sin PIN, autoriza el usuario de la sesión, si tiene el permiso. Con
  PIN, el dueño del PIN, si lo tiene.

  Un PIN equivocado no corta con un error: devuelve ok = false. Si
  cortara, la base desharía también el intento fallido que anotó
  verificar_pin, y el límite de intentos no frenaría a nadie.
*/
create or replace function public.mayorista_autorizar_vencido(p_id uuid, p_pin text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido   public.pedido_mayorista;
  v_vencido  numeric;
  v_autoriza uuid;
  v_nombre   text;
begin
  if not app.tiene_permiso('mayorista.atender') then
    raise exception 'No tenés permiso para atender los pedidos mayoristas.';
  end if;

  select * into v_pedido from public.pedido_mayorista where id = p_id for update;
  if v_pedido.id is null then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado not in ('pendiente', 'confirmado') then
    raise exception 'El pedido ya no está en curso.';
  end if;
  if v_pedido.vencido_autorizado_en is not null then
    return json_build_object('ok', true, 'repetido', true);
  end if;

  v_vencido := app.vencido_de(v_pedido.cliente_id);
  if v_vencido <= 0 then
    raise exception 'El cliente no tiene deuda vencida: no hace falta autorizar.';
  end if;

  if nullif(btrim(coalesce(p_pin, '')), '') is null then
    if not app.tiene_permiso('cuentacorriente.autorizar_vencido') then
      raise exception 'Lo tiene que autorizar un encargado, con su PIN.';
    end if;
    v_autoriza := app.usuario_actual_id();
  else
    select o.usuario_id into v_autoriza from public.verificar_pin(btrim(p_pin)) o;
    if v_autoriza is null then
      return json_build_object('ok', false, 'error', 'El PIN no es correcto.');
    end if;
    if not app.usuario_tiene_permiso(v_autoriza, 'cuentacorriente.autorizar_vencido') then
      return json_build_object('ok', false, 'error', 'Ese PIN es de alguien que no puede autorizar a un cliente con deuda vencida.');
    end if;
  end if;

  update public.pedido_mayorista
  set vencido_autorizado_por = v_autoriza, vencido_autorizado_en = now(), vencido_autorizado_monto = v_vencido
  where id = p_id;

  select u.nombre into v_nombre from public.usuario u where u.id = v_autoriza;
  return json_build_object('ok', true, 'nombre', v_nombre);
end;
$$;

revoke all on function public.mayorista_autorizar_vencido(uuid, text) from public, anon;
grant execute on function public.mayorista_autorizar_vencido(uuid, text) to authenticated;

-- ── Facturar: el freno ──────────────────────────────────────────
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

  perform public.cobrar_venta(v_venta_id, null, null);

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

-- ── La lista de pedidos, con el vencido y quién lo autorizó ─────
drop function if exists public.mayorista_pedidos(text);

create function public.mayorista_pedidos(p_vista text)
returns table (
  id                  uuid,
  numero              bigint,
  estado              text,
  cliente_id          uuid,
  cliente_nombre      text,
  cliente_localidad   text,
  cliente_ruta        text,
  cliente_domicilio   text,
  cliente_telefono    text,
  cliente_email       text,
  cliente_condicion_iva_id smallint,
  vendedor_nombre     text,
  observaciones       text,
  armado_en           timestamptz,
  recibido_en         timestamptz,
  confirmado_en       timestamptz,
  confirmado_por_nombre text,
  facturado_en        timestamptz,
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  total               numeric,
  lineas              jsonb,
  venta_id            uuid,
  venta_codigo        text,
  documentacion       text,
  comprobante_id      uuid,
  comprobante_numero  text,
  comprobante_cae     text,
  interno_id          uuid,
  interno_numero      text,
  remito_id           uuid,
  remito_numero       text,
  mail_destinatario   text,
  mail_estado         text,
  mail_error          text,
  mail_en             timestamptz,
  cliente_vencido     numeric,
  cliente_vencido_desde date,
  vencido_autorizado_en timestamptz,
  vencido_autorizado_por_nombre text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_todo boolean := app.tiene_permiso('mayorista.atender');
  v_yo   uuid := app.usuario_actual_id();
  v_ve_deuda boolean := v_todo or app.tiene_permiso('mayorista.ver_deuda');
begin
  if not app.puede_ver_mayorista() then
    raise exception 'No tenés permiso para la venta mayorista.';
  end if;

  return query
  select pm.id, pm.numero, pm.estado, c.id, c.nombre, c.localidad, c.ruta,
         nullif(concat_ws(' ', c.calle, c.numero), ''), c.telefono, c.email, c.condicion_iva_id,
         vend.nombre, pm.observaciones, pm.armado_en, pm.recibido_en, pm.confirmado_en, conf.nombre,
         pm.facturado_en, pm.cancelado_en, pm.motivo_cancelacion,
         coalesce((select sum(round(l.cantidad * l.precio, 2)) from public.pedido_mayorista_linea l where l.pedido_id = pm.id), 0),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'producto_id', l.producto_id, 'codigo', p.codigo, 'nombre', p.nombre_interno,
                    'cantidad', l.cantidad, 'precio', l.precio, 'precio_lista', l.precio_lista,
                    'stock', case when v_todo or app.tiene_permiso('mayorista.ver_stock') then coalesce(s.cantidad, 0) end)
                  order by l.orden)
           from public.pedido_mayorista_linea l
           join public.producto p on p.id = l.producto_id
           left join public.stock_saldo s on s.producto_id = l.producto_id
           where l.pedido_id = pm.id), '[]'::jsonb),
         v.id, v.codigo, v.documentacion,
         comp.id, comp.numero_texto, comp.cae,
         interno.id, interno.numero_texto,
         rem.id, rem.numero_texto,
         pm.mail_destinatario, pm.mail_estado, pm.mail_error, pm.mail_en,
         case when v_ve_deuda then coalesce(d.vencido_30 + d.vencido_60 + d.vencido_mas_60, 0) end,
         case when v_ve_deuda then d.vencimiento_mas_antiguo end,
         pm.vencido_autorizado_en, aut.nombre
  from public.pedido_mayorista pm
  join public.cliente c on c.id = pm.cliente_id
  left join public.usuario vend on vend.id = pm.vendedor_id
  left join public.usuario conf on conf.id = pm.confirmado_por
  left join public.usuario aut on aut.id = pm.vencido_autorizado_por
  left join public.vista_deuda_antiguedad d on d.cliente_id = c.id
  left join public.venta v on v.id = pm.venta_id
  left join lateral (
    select co.id,
           lpad(pv.numero::text, 4, '0') || '-' || lpad(co.numero::text, 8, '0') as numero_texto,
           co.cae
    from public.comprobante co
    left join public.punto_venta pv on pv.id = co.punto_venta_id
    where co.venta_id = pm.venta_id and co.estado <> 'anulado'
    order by co.creado_en desc limit 1
  ) comp on true
  left join lateral (
    select n.id, n.serie || '-' || lpad(n.numero::text, 8, '0') as numero_texto
    from public.comprobante_no_fiscal n
    where n.venta_id = pm.venta_id and n.tipo_clave = 'comprobante_interno' and n.anulado_en is null
    order by n.creado_en desc limit 1
  ) interno on true
  left join lateral (
    select n.id, n.serie || '-' || lpad(n.numero::text, 8, '0') as numero_texto
    from public.comprobante_no_fiscal n
    where n.venta_id = pm.venta_id and n.tipo_clave = 'remito' and n.anulado_en is null
    order by n.creado_en desc limit 1
  ) rem on true
  where (v_todo or pm.vendedor_id = v_yo)
    and case p_vista
          when 'pendientes' then pm.estado in ('pendiente', 'confirmado')
          when 'facturados' then pm.estado = 'facturado' and pm.facturado_en > now() - interval '60 days'
          when 'cancelados' then pm.estado = 'cancelado' and pm.cancelado_en > now() - interval '60 days'
          else true
        end
  order by pm.recibido_en desc
  limit 300;
end;
$$;

revoke execute on function public.mayorista_pedidos(text) from public, anon;
grant execute on function public.mayorista_pedidos(text) to authenticated;
