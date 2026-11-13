/*
  El comprobante de entrega de la proforma a convenir (13/11).

  La proforma a convenir no tiene venta hasta que se define el precio,
  así que su comprobante de entrega no puede copiar los renglones de
  una venta, como en la caja. Sale por emitir_remito_directo(), con los
  mismos renglones que la proforma, sin mover stock: el stock ya lo
  descontó la proforma.
*/
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.emitir_remito_directo(uuid, jsonb, boolean, uuid, text, text, text, text, text, uuid, text, bigint, timestamptz, boolean, uuid, text)'::regprocedure);
  if position('''comprobante_entrega''' in v_def) > 0 then
    return;
  end if;
  v_def := replace(v_def,
    $a$if coalesce(p_tipo, 'remito') not in ('remito', 'comprobante_interno') then$a$,
    $a$if coalesce(p_tipo, 'remito') not in ('remito', 'comprobante_interno', 'comprobante_entrega') then$a$);
  -- La entrega nunca mueve stock ni es «a facturar».
  v_def := replace(v_def,
    $a$  select * into v_tipo from public.tipo_comprobante_no_fiscal
  where clave = coalesce(p_tipo, 'remito') and activo;$a$,
    $a$  if p_tipo = 'comprobante_entrega' and (coalesce(p_descuenta_stock, true) or coalesce(p_facturar_despues, false)) then
    raise exception 'El comprobante de entrega no mueve stock.';
  end if;

  select * into v_tipo from public.tipo_comprobante_no_fiscal
  where clave = coalesce(p_tipo, 'remito') and activo;$a$);
  if position('''comprobante_entrega''' in v_def) = 0 then
    raise exception 'No se pudo actualizar emitir_remito_directo.';
  end if;
  execute v_def;
end;
$$;
