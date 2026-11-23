/*
  La proforma a convenir y su comprobante de entrega, que la base
  rechazaba (pruebas del 19/11).

  Dos reglas de la tabla, de cuando el único papel sin venta era el
  remito, los dejaban afuera:

  - «el domicilio de entrega es sólo del remito»: emitir_remito_directo()
    completaba el domicilio del cliente en cualquier papel, también en la
    proforma.
  - «sólo el remito puede no descontar stock»: el comprobante de entrega
    de la proforma no descuenta —ya lo hizo la proforma—.

  Arreglo: el domicilio del cliente se completa sólo en el remito, y el
  comprobante de entrega puede salir sin mover stock.
*/

alter table public.comprobante_no_fiscal drop constraint no_fiscal_descuenta_solo_remito;
alter table public.comprobante_no_fiscal add constraint no_fiscal_descuenta_solo_remito
  check (descuenta_stock or tipo_clave in ('remito', 'comprobante_entrega'));

do $$
declare
  v_def   text;
  v_viejo text := $a$    coalesce(p_entrega_domicilio,
             nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.piso_depto)), '')),
    coalesce(p_entrega_localidad, v_cliente.localidad),
    coalesce(p_entrega_contacto, v_cliente.telefono),
    p_transportista,$a$;
  v_nuevo text := $a$    -- Los datos de entrega son del remito (regla de la tabla).
    case when v_tipo.clave = 'remito' then coalesce(p_entrega_domicilio,
             nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.piso_depto)), '')) end,
    case when v_tipo.clave = 'remito' then coalesce(p_entrega_localidad, v_cliente.localidad) end,
    case when v_tipo.clave = 'remito' then coalesce(p_entrega_contacto, v_cliente.telefono) end,
    case when v_tipo.clave = 'remito' then p_transportista end,$a$;
begin
  v_def := pg_get_functiondef('public.emitir_remito_directo(uuid, jsonb, boolean, uuid, text, text, text, text, text, uuid, text, bigint, timestamptz, boolean, uuid, text)'::regprocedure);
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'No se encontró dónde completar los datos de entrega en emitir_remito_directo.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$$;
