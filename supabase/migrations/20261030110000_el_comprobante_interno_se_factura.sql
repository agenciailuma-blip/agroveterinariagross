/*
  ─────────────────────────────────────────────────────────────
  El comprobante interno que después se factura

  Fase 03, punto 8 (lámina 07, punto 4). Salió con comprobante interno
  —una proforma— y después el cliente pide la factura. Hasta ahora había
  que rehacer la venta. Con esto, un botón: la factura sale con los
  mismos renglones, y el comprobante interno queda «convertido» y
  enlazado a ella. Las columnas para ese enlace existen desde el 04/09.

  ─── LO QUE NO SE TOCA ───

  El stock y la caja: la venta ya está cobrada, y eso ya descontó y ya
  entró la plata o la deuda. La factura sólo documenta.

  ─── CÓMO ───

  Por el mismo camino que *Por facturar*: facturar_ventas_pendientes()
  ya arma la factura con fecha de hoy —la venta puede ser de hace un
  mes—, calcula la percepción de IIBB y, si corresponde, se la carga a
  la cuenta del cliente, que en el comprobante interno no se le cobró.
  Para entrar por ahí la venta pasa un instante por «a facturar», y
  queda en «fiscal»: desde ahora es una venta con factura.

  Si le corresponde percepción y no tiene cuenta corriente, no hay
  dónde cargársela: no se factura desde acá.
  ─────────────────────────────────────────────────────────────
*/

create function public.facturar_comprobante_interno(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interno    public.comprobante_no_fiscal;
  v_venta      public.venta;
  v_cliente    public.cliente;
  v_neto       numeric;
  v_percepcion numeric;
  v_comp_id    uuid;
begin
  if not app.tiene_permiso('facturacion.emitir') then
    raise exception 'No tenés permiso para facturar.';
  end if;

  select * into v_interno from public.comprobante_no_fiscal where id = p_id for update;
  if v_interno.id is null or v_interno.tipo_clave <> 'comprobante_interno' then
    raise exception 'No se encontró el comprobante interno.';
  end if;
  if v_interno.estado = 'convertido' then
    raise exception 'Este comprobante interno ya está facturado.';
  end if;
  if v_interno.estado <> 'emitido' then
    raise exception 'El comprobante interno está anulado.';
  end if;
  if v_interno.venta_id is null then
    raise exception 'Este comprobante interno no tiene una venta para facturar.';
  end if;

  select * into v_venta from public.venta where id = v_interno.venta_id for update;
  if v_venta.estado <> 'cobrada' then
    raise exception 'La venta del comprobante interno está %: se factura una venta cobrada.', v_venta.estado;
  end if;
  if v_venta.documentacion <> 'no_fiscal' then
    raise exception 'La venta de este comprobante interno ya tiene o espera su factura.';
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;

  select coalesce(sum(neto), 0) into v_neto from public.vista_venta_iva where venta_id = v_venta.id;
  v_percepcion := public.calcular_percepcion_iibb(v_cliente.id, v_neto);
  if v_percepcion > 0 and not coalesce(v_cliente.cuenta_corriente, false) then
    raise exception '% no tiene cuenta corriente para cargarle la percepción de IIBB ($ %).',
      v_cliente.nombre,
      translate(to_char(v_percepcion, 'FM999,999,990.00'), ',.', '.,');
  end if;

  update public.venta set documentacion = 'a_facturar' where id = v_venta.id;
  v_comp_id := public.facturar_ventas_pendientes(array[v_venta.id]);
  update public.venta set documentacion = 'fiscal' where id = v_venta.id;

  update public.comprobante_no_fiscal
  set estado                       = 'convertido',
      convertido_en_comprobante_id = v_comp_id,
      convertido_en                = now()
  where id = p_id;

  return v_comp_id;
end;
$$;

comment on function public.facturar_comprobante_interno(uuid) is
  'Factura la venta de un comprobante interno, con fecha de hoy, sin tocar stock ni caja. Deja el interno convertido y enlazado a la factura. Devuelve la factura armada: el CAE lo pide la app.';

revoke all on function public.facturar_comprobante_interno(uuid) from public, anon;
grant execute on function public.facturar_comprobante_interno(uuid) to authenticated;
