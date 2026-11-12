/*
  La factura asociada, con su nombre completo en la hoja R.

  Pedido del 12/11: al pie de la hoja salía sólo «0001-00000006» y no se
  veía de un vistazo que era la factura de ese pedido. Ahora sale
  «Factura A 0001-00000006» (o el comprobante interno, si no se
  facturó).
*/
create or replace function public.remito_r_de_remito(p_no_fiscal uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venta uuid;
begin
  if not app.tiene_permiso('facturacion.no_fiscal_emitir') then
    raise exception 'No tenés permiso para imprimir el remito R.';
  end if;
  select n.venta_id into v_venta from public.comprobante_no_fiscal n where n.id = p_no_fiscal;

  return json_build_object(
    'hojas', coalesce((
      select json_agg(json_build_object(
               'id', h.id, 'numero', h.numero, 'punto_venta', t.punto_venta,
               'cai', t.cai, 'vencimiento', t.vencimiento)
             order by h.creado_en, h.numero)
      from public.remito_r_hoja h
      join public.remito_r_tanda t on t.id = h.tanda_id
      where h.no_fiscal_id = p_no_fiscal and h.estado = 'usada'
    ), '[]'::json),
    'pedido_numero', (
      select pm.numero from public.pedido_mayorista pm
      where v_venta is not null and pm.venta_id = v_venta
      order by pm.recibido_en desc limit 1
    ),
    -- La factura de esa venta o, si no hay, su proforma.
    'asociado', coalesce((
      select coalesce(tc.descripcion || ' ', '') || lpad(pv.numero::text, 4, '0') || '-' || lpad(co.numero::text, 8, '0')
      from public.comprobante co
      left join public.punto_venta pv on pv.id = co.punto_venta_id
      left join public.tipo_comprobante tc on tc.id = co.tipo_comprobante_id
      where v_venta is not null and co.venta_id = v_venta and co.estado <> 'anulado'
      order by co.creado_en desc limit 1
    ), (
      select 'Comprobante interno ' || n.serie || '-' || lpad(n.numero::text, 8, '0')
      from public.comprobante_no_fiscal n
      where v_venta is not null and n.venta_id = v_venta
        and n.tipo_clave = 'comprobante_interno' and n.anulado_en is null
      order by n.creado_en desc limit 1
    ))
  );
end;
$$;
