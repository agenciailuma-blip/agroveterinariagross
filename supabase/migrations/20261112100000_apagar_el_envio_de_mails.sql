/*
  ─────────────────────────────────────────────────────────────
  Apagar el envío de mails

  Pedido del 12/11: un interruptor en Configuración que corta todos los
  mails del sistema —facturas, recibos y pedidos mayoristas—, los que
  salen solos y los del botón.

  Lo respeta el servidor, no la app: la función enviar-factura lo mira
  antes de llamar a Resend, así que no importa qué versión tenga cada PC
  ni desde dónde se mande.

  Y la base deja de proponer la factura a cuenta corriente que sale sola
  (mail_automatico_de_factura devuelve null): con el envío apagado, la
  caja no muestra un cartel de error en cada venta a cuenta corriente.

  Arranca prendido, como estaba.
  ─────────────────────────────────────────────────────────────
*/

insert into public.configuracion (clave, valor, descripcion, grupo)
select 'correo.envio_activo',
       'true'::jsonb,
       'Si el sistema manda mails (facturas, recibos y pedidos). Apagado, no sale ninguno, ni solo ni con el botón.',
       'correo'
where not exists (select 1 from public.configuracion where clave = 'correo.envio_activo');

create or replace function app.envio_de_mails_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select not (c.valor = 'false'::jsonb or c.valor = '"false"'::jsonb)
       from public.configuracion c
      where c.clave = 'correo.envio_activo'),
    true);
$$;

revoke all on function app.envio_de_mails_activo() from public, anon;
grant execute on function app.envio_de_mails_activo() to authenticated;

create or replace function public.mail_automatico_de_factura(p_comprobante_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_comprobante record;
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

  if not exists (
    select 1
    from public.venta_pago vp
    join public.medio_pago mp on mp.id = vp.medio_pago_id
    where mp.tipo = 'cuenta_corriente'
      and vp.importe > 0
      and (vp.venta_id = v_comprobante.venta_id
           or vp.venta_id in (select cv.venta_id from public.comprobante_venta cv
                              where cv.comprobante_id = p_comprobante_id))
  ) then
    return null;
  end if;

  if exists (select 1 from public.comprobante_envio e
             where e.comprobante_id = p_comprobante_id and e.estado = 'enviado') then
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
  'El mail del cliente si a esta factura le toca salir sola: envío de mails prendido, autorizada, a cuenta corriente, con mail, y todavía no enviada. Si no, null.';

revoke all on function public.mail_automatico_de_factura(uuid) from public, anon;
grant execute on function public.mail_automatico_de_factura(uuid) to authenticated;
