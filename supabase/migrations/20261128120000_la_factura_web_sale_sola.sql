/*
  ─────────────────────────────────────────────────────────────
  La factura de un pedido web sale sola, se facture donde se facture

  Hasta ahora salía sola sólo al facturar desde Pedidos web. El que paga
  por transferencia o en el local pasa por la caja, y ahí no salía
  (GR-MWZBZN03210, 27/11).

  La caja, Facturación, Por facturar y Proformas ya le preguntan a
  mail_automatico_de_factura a quién mandarla: alcanza con que la función
  conteste también el mail que el comprador dejó en la tienda. Anda con
  la versión que ya tienen las PC.

  Valen los mismos frenos: envío prendido, autorizada, sólo facturas y
  nunca dos veces. Una factura que junta varias ventas sale por acá sólo
  si todas son pedidos web del mismo mail: si no, no hay a quién mandarla
  sin mostrarle a uno las compras de otro.
  ─────────────────────────────────────────────────────────────
*/

create or replace function public.mail_automatico_de_factura(p_comprobante_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_comprobante record;
  v_ventas uuid[];
  v_web integer;
  v_mails text[];
  v_email text;
begin
  if not app.tiene_permiso('facturacion.ver') then
    return null;
  end if;

  -- Con el envío apagado en Configuración, no le toca a ninguna.
  if not app.envio_de_mails_activo() then
    return null;
  end if;

  select c.id, c.cae, c.venta_id, c.cliente_id, c.tipo_comprobante_id
    into v_comprobante
  from public.comprobante c
  where c.id = p_comprobante_id;

  if v_comprobante.id is null
     or v_comprobante.cae is null
     or v_comprobante.tipo_comprobante_id not in (1, 6, 11, 51, 201, 206) then
    return null;
  end if;

  if exists (select 1 from public.comprobante_envio e
             where e.comprobante_id = p_comprobante_id and e.estado = 'enviado') then
    return null;
  end if;

  -- Las ventas de la factura: la suya y las que junta.
  select array_agg(distinct x.venta_id)
    into v_ventas
  from (
    select v_comprobante.venta_id as venta_id
    union all
    select cv.venta_id from public.comprobante_venta cv
    where cv.comprobante_id = p_comprobante_id
  ) x
  where x.venta_id is not null;

  -- El pedido web: al mail que el comprador dejó en la tienda.
  -- Sólo cuentan los que dejaron mail: uno sin mail es de alguien que no se sabe quién es.
  select count(distinct p.venta_id),
         array_agg(distinct lower(btrim(p.email))),
         max(btrim(p.email))
    into v_web, v_mails, v_email
  from public.pedido_tienda p
  where p.venta_id = any (v_ventas)
    and nullif(btrim(p.email), '') is not null;

  if v_web > 0 and v_web = cardinality(v_ventas) and cardinality(v_mails) = 1 then
    return v_email;
  end if;

  -- A cuenta corriente: al mail de la ficha del cliente.
  if not exists (
    select 1
    from public.venta_pago vp
    join public.medio_pago mp on mp.id = vp.medio_pago_id
    where mp.tipo = 'cuenta_corriente'
      and vp.importe > 0
      and vp.venta_id = any (v_ventas)
  ) then
    return null;
  end if;

  select nullif(btrim(cl.email), '') into v_email
  from public.cliente cl
  where cl.id = coalesce(v_comprobante.cliente_id,
                         (select v.cliente_id from public.venta v where v.id = v_comprobante.venta_id));

  return v_email;
end;
$$;

comment on function public.mail_automatico_de_factura(uuid) is
  'A quién le sale sola esta factura: envío de mails prendido, autorizada y todavía no enviada; si es de un pedido web, el mail del comprador, y si es a cuenta corriente, el del cliente. Si no, null.';

revoke all on function public.mail_automatico_de_factura(uuid) from public, anon;
grant execute on function public.mail_automatico_de_factura(uuid) to authenticated;
