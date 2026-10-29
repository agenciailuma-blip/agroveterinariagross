/*
  ─────────────────────────────────────────────────────────────
  La factura a cuenta corriente sale sola por mail

  Fase 03, punto 1, ④: al facturar a cuenta corriente, si el cliente
  tiene mail, la factura le llega sin que nadie apriete nada. El PDF lo
  arma la app y lo manda enviar-factura, como con el botón; lo que decide
  acá la base es si a esa factura le toca, y a quién.

  ─── CUÁNDO LE TOCA ───

  - Tiene CAE (o CAEA): sin autorización no se manda.
  - Es una factura: A, B, C, M o de crédito MiPyME. Las notas no.
  - Alguna de sus ventas —una sola, o las del mes juntas— se llevó, en
    todo o en parte, a cuenta corriente.
  - El cliente tiene mail.
  - Todavía no salió: si ya hay un envío que llegó a destino, no se
    repite. Así no importa desde dónde se llame —la caja, Facturación,
    Por facturar— ni cuántas veces.

  Devuelve el mail, o null si no le toca.
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
  v_email text;
begin
  if not app.tiene_permiso('facturacion.ver') then
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
  'El mail del cliente si a esta factura le toca salir sola: autorizada, a cuenta corriente, con mail, y todavía no enviada. Si no, null.';

revoke all on function public.mail_automatico_de_factura(uuid) from public, anon;
grant execute on function public.mail_automatico_de_factura(uuid) to authenticated;
