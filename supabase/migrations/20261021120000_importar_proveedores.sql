-- ═══════════════════════════════════════════════════════════════
-- Importar proveedores con su ficha
--
-- Pedido del 21/10: lo que se baja de un maestro tiene que servir de
-- plantilla para cambiar de a muchos. Con productos y clientes ya había
-- importación; con proveedores sólo la del saldo del día del corte
-- (importar_saldos_proveedores), que crea el proveedor con el nombre, el
-- CUIT, el teléfono y el mail, y nada más.
--
-- Esta trae la ficha entera: código, nombre y nombre de fantasía,
-- condición frente al IVA, CUIT, domicilio, contacto, CBU o alias, el
-- mínimo de compra y las observaciones. Como las otras:
--   · una celda vacía no borra nada;
--   · se reconoce por el código, si no por el CUIT, si no por el nombre
--     cuando es uno solo;
--   · un CUIT que ya es de otro proveedor, con otro código, frena la fila.
-- El saldo no va acá: tiene su importación, con su fecha.
-- ═══════════════════════════════════════════════════════════════

/*
  El mínimo de compra, como lo escribe una persona: «Monto», «$»,
  «pesos»; «Bultos», «cajas»; «Kilos», «kg». Null si no se entiende.
*/
create or replace function app.minimo_desde_texto(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when t in ('monto', 'pesos', 'importe', 'plata', '$') then 'monto'
    when t in ('bultos', 'bulto', 'cajas', 'caja') then 'bultos'
    when t in ('kilos', 'kilo', 'kg', 'kgs') then 'kilos'
    else null
  end
  from (select coalesce(nullif(app.texto_para_comparar(p), ''), btrim(p)) as t) x
$$;

create or replace function public.importar_proveedores(p_filas jsonb)
returns table (
  fila      integer,
  codigo    text,
  resultado text,   -- creado | actualizado | error
  detalle   text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila       jsonb;
  v_indice     integer := 0;
  v_codigo     text;
  v_nombre     text;
  v_doc        text;
  v_condicion  smallint;
  v_cbu        text;
  v_alias      text;
  v_min_tipo   text;
  v_min_valor  numeric;
  v_id         uuid;
  v_n          integer;
  v_otro       public.proveedor;
  v_avisos     text[];
begin
  if not app.tiene_permiso('proveedores.gestionar') then
    raise exception 'No tenés permiso para importar proveedores.';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas)
  loop
    v_indice := v_indice + 1;
    v_avisos := '{}';
    v_codigo := nullif(btrim(v_fila->>'codigo'), '');
    v_nombre := nullif(btrim(v_fila->>'nombre'), '');
    v_id := null;
    v_otro := null;

    begin
      v_doc := nullif(regexp_replace(coalesce(v_fila->>'documento', ''), '\D', '', 'g'), '');
      if v_doc is not null and not app.cuit_valido(v_doc) then
        raise exception 'El CUIT «%» no es válido: el último dígito no cierra.', v_fila->>'documento';
      end if;

      v_condicion := null;
      if nullif(btrim(v_fila->>'condicion_iva'), '') is not null then
        v_condicion := app.condicion_iva_desde_texto(v_fila->>'condicion_iva');
        if v_condicion is null then
          raise exception 'No se entiende la condición frente al IVA «%». Escribí Responsable Inscripto, Monotributo o Exento.', v_fila->>'condicion_iva';
        end if;
      end if;

      v_cbu := nullif(regexp_replace(coalesce(v_fila->>'cbu', ''), '\D', '', 'g'), '');
      if v_cbu is not null and (length(v_cbu) <> 22 or not app.cbu_valido(v_cbu)) then
        raise exception 'El CBU o CVU «%» no es válido: son 22 números y los dígitos de control tienen que cerrar.', v_fila->>'cbu';
      end if;
      v_alias := nullif(btrim(v_fila->>'alias'), '');

      v_min_tipo := null;
      if nullif(btrim(v_fila->>'minimo_tipo'), '') is not null then
        v_min_tipo := app.minimo_desde_texto(v_fila->>'minimo_tipo');
        if v_min_tipo is null then
          raise exception 'El mínimo de compra va en monto, bultos o kilos, y dice «%».', v_fila->>'minimo_tipo';
        end if;
      end if;
      v_min_valor := app.numero_de_planilla(v_fila->>'minimo_valor');
      if v_min_valor is not null and v_min_valor <= 0 then
        raise exception 'El mínimo de compra tiene que ser más que cero.';
      end if;

      -- Quién es: por código, por CUIT, o por el nombre si es uno solo.
      if v_codigo is not null then
        select count(*), min(p.id::text)::uuid into v_n, v_id from public.proveedor p
        where upper(p.codigo) = upper(v_codigo) and p.eliminado_en is null;
        if v_n > 1 then
          raise exception 'Hay % proveedores con el código %: corregí uno desde Proveedores antes de importar.', v_n, v_codigo;
        end if;
      end if;
      if v_id is null and v_doc is not null then
        select * into v_otro from public.proveedor p
        where p.numero_documento = v_doc and p.eliminado_en is null;
        if v_otro.id is not null and v_codigo is not null and v_otro.codigo is not null
           and upper(v_otro.codigo) <> upper(v_codigo) then
          raise exception 'El CUIT % ya es del proveedor % (%). No puede haber dos proveedores con el mismo CUIT.',
            v_doc, v_otro.codigo, v_otro.nombre;
        end if;
        v_id := v_otro.id;
      end if;
      if v_id is null and v_nombre is not null then
        select count(*), min(p.id::text)::uuid into v_n, v_id from public.proveedor p
        where app.texto_para_comparar(p.nombre) = app.texto_para_comparar(v_nombre) and p.eliminado_en is null;
        if v_n <> 1 then
          v_id := null;
        end if;
        if v_codigo is null and v_doc is null then
          v_avisos := array_append(v_avisos, 'Sin código ni CUIT: si se importa otra planilla con otro nombre, puede quedar repetido.');
        end if;
      end if;

      if v_id is null then
        if v_nombre is null then
          raise exception 'Falta el nombre: un proveedor nuevo no se puede crear sin él.';
        end if;
        if (v_min_tipo is null) <> (v_min_valor is null) then
          raise exception 'El mínimo de compra necesita las dos cosas: en qué (monto, bultos o kilos) y cuánto.';
        end if;
        insert into public.proveedor (
          codigo, nombre, nombre_fantasia, condicion_iva_id, tipo_documento_id, numero_documento,
          domicilio, localidad, provincia, telefono, email, contacto, cbu, alias,
          minimo_tipo, minimo_valor, observaciones
        ) values (
          v_codigo, v_nombre, nullif(btrim(v_fila->>'nombre_fantasia'), ''), v_condicion,
          case when v_doc is not null then 80 end, v_doc,
          nullif(btrim(v_fila->>'domicilio'), ''), nullif(btrim(v_fila->>'localidad'), ''),
          nullif(btrim(v_fila->>'provincia'), ''), nullif(btrim(v_fila->>'telefono'), ''),
          nullif(btrim(v_fila->>'email'), ''), nullif(btrim(v_fila->>'contacto'), ''),
          v_cbu, v_alias, v_min_tipo, v_min_valor, nullif(btrim(v_fila->>'observaciones'), '')
        ) returning id into v_id;
        resultado := 'creado';
      else
        update public.proveedor p set
          -- El código que ya tiene se queda: «prueba-1» en la planilla
          -- encuentra a «PRUEBA-1» y no se lo cambia.
          codigo            = coalesce(p.codigo, v_codigo),
          nombre            = coalesce(v_nombre, p.nombre),
          nombre_fantasia   = coalesce(nullif(btrim(v_fila->>'nombre_fantasia'), ''), p.nombre_fantasia),
          condicion_iva_id  = coalesce(v_condicion, p.condicion_iva_id),
          tipo_documento_id = case when v_doc is not null then 80 else p.tipo_documento_id end,
          numero_documento  = coalesce(v_doc, p.numero_documento),
          domicilio         = coalesce(nullif(btrim(v_fila->>'domicilio'), ''), p.domicilio),
          localidad         = coalesce(nullif(btrim(v_fila->>'localidad'), ''), p.localidad),
          provincia         = coalesce(nullif(btrim(v_fila->>'provincia'), ''), p.provincia),
          telefono          = coalesce(nullif(btrim(v_fila->>'telefono'), ''), p.telefono),
          email             = coalesce(nullif(btrim(v_fila->>'email'), ''), p.email),
          contacto          = coalesce(nullif(btrim(v_fila->>'contacto'), ''), p.contacto),
          cbu               = coalesce(v_cbu, p.cbu),
          alias             = coalesce(v_alias, p.alias),
          minimo_tipo       = coalesce(v_min_tipo, p.minimo_tipo),
          minimo_valor      = coalesce(v_min_valor, p.minimo_valor),
          observaciones     = coalesce(nullif(btrim(v_fila->>'observaciones'), ''), p.observaciones)
        where p.id = v_id;
        resultado := 'actualizado';
      end if;

      fila := v_indice; codigo := coalesce(v_codigo, v_doc, v_nombre);
      detalle := nullif(array_to_string(v_avisos, ' '), '');
      return next;

    exception when others then
      fila := v_indice; codigo := coalesce(v_codigo, v_doc, v_nombre); resultado := 'error';
      detalle := case
        when sqlerrm like '%proveedor_documento_unico%' then 'Ese CUIT ya es de otro proveedor.'
        when sqlerrm like '%proveedor_alias_valido%' then 'El alias va de 6 a 20 letras, números, puntos o guiones.'
        when sqlerrm like '%proveedor_minimo_completo%' then 'El mínimo de compra necesita las dos cosas: en qué (monto, bultos o kilos) y cuánto.'
        else sqlerrm
      end;
      return next;
    end;
  end loop;
end;
$$;

comment on function public.importar_proveedores(jsonb) is
  'Importa o actualiza la ficha de los proveedores desde una planilla. Una celda vacía no borra nada. El saldo va por importar_saldos_proveedores.';

revoke all on function public.importar_proveedores(jsonb) from public, anon;
grant execute on function public.importar_proveedores(jsonb) to authenticated;
