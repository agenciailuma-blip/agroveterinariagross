-- ═══════════════════════════════════════════════════════════════
-- El Responsable Inscripto también puede llevarse comprobante interno
--
-- Hasta acá, a un Responsable Inscripto la caja le hacía siempre
-- Factura A: «sin factura» se rechazaba, porque compra para descargar
-- el IVA. Lucas lo pidió distinto el 20/10: en la caja tienen que estar
-- siempre las dos opciones, factura o comprobante interno, también para
-- el inscripto.
--
-- Lo demás no cambia:
--   · Sin factura sigue pidiendo el permiso propio
--     (facturacion.vender_sin_factura): es una decisión del dueño.
--   · Sin factura no lleva percepción de IIBB: la percepción va con la
--     factura, y acá no hay factura.
--   · Facturar después sigue siendo para quien tiene cuenta corriente.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.marcar_documentacion_venta(p_venta_id uuid, p_documentacion text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_venta   public.venta;
  v_cliente public.cliente;
begin
  if p_documentacion not in ('fiscal', 'no_fiscal', 'a_facturar') then
    raise exception 'Documentacion invalida: "%". Solo fiscal, no_fiscal o a_facturar.', p_documentacion;
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % : la documentacion se elige antes de cobrar.', v_venta.estado;
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;

  if p_documentacion = 'no_fiscal' and not app.tiene_permiso('facturacion.vender_sin_factura') then
    raise exception 'No tenes permiso para cobrar una venta sin factura.';
  end if;

  /*
    Facturar después es para quien tiene cuenta corriente: la venta
    queda en su cuenta hasta que se factura. A un Responsable Inscripto
    también — la factura A sale igual, más tarde.
  */
  if p_documentacion = 'a_facturar' and not coalesce(v_cliente.cuenta_corriente, false) then
    raise exception '% no tiene cuenta corriente: no se puede dejar para facturar después.', v_cliente.nombre;
  end if;

  update public.venta
  set documentacion = p_documentacion
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

comment on function public.marcar_documentacion_venta(uuid, text) is
  'Marca si la venta se cobra con factura de ARCA, con comprobante interno o para facturar después. Sin factura exige permiso propio, a cualquier cliente. Solo antes de cobrar.';
