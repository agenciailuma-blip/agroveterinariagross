-- ═══════════════════════════════════════════════════════════════
-- Recibir un comprobante que la terminal emitió sin conexión
--
-- Es la otra mitad del CAEA sin internet. Durante un corte la terminal
-- arma la factura sola —numero, IVA, percepcion— la imprime y se la
-- entrega al cliente. Cuando vuelve la conexion, esa factura tiene que
-- llegar al servidor TAL COMO SE ENTREGO: no se renumera, no se
-- recalcula, no se vuelve a decidir nada. El papel ya esta en la calle.
--
-- Por eso entra por una funcion y no por inserts sueltos desde la
-- pantalla:
--
--   · Es una sola transaccion. Un comprobante a medias —la cabecera sin
--     sus alicuotas— es un comprobante que ARCA rechaza al informarlo.
--   · Se puede reintentar sin miedo. La cola reenvia hasta que entra, y
--     un id repetido no duplica nada.
--   · Lo que la terminal decidio se VERIFICA. La terminal es de
--     confianza, pero un numero repetido o un CAEA que no existe tienen
--     que aparecer acá y no tres semanas despues, cuando ARCA rechace
--     la rendicion de la quincena entera.
--
-- Lo que NO hace: pedirle nada a ARCA. El comprobante queda en
-- 'contingencia' y la tarea diaria lo informa con FECAEARegInformativo,
-- que es el camino que ya existe.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.registrar_comprobante_caea(p_datos jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id        uuid := (p_datos->>'id')::uuid;
  v_venta_id  uuid := (p_datos->>'venta_id')::uuid;
  v_pv        uuid := (p_datos->>'punto_venta_id')::uuid;
  v_tipo      smallint := (p_datos->>'tipo_comprobante_id')::smallint;
  v_numero    bigint := (p_datos->>'numero')::bigint;
  v_caea_id   uuid := (p_datos->>'caea_id')::uuid;
  v_estado    text;
  v_item      jsonb;
begin
  if not (select app.tiene_permiso('facturacion.emitir')) then
    raise exception 'No tenés permiso para emitir comprobantes.';
  end if;

  /*
    Reenviar es inofensivo y tiene que serlo: la cola reintenta hasta
    que entra, y una terminal que se apaga a mitad de camino vuelve a
    mandar lo mismo. El id lo genero la terminal, asi que si ya esta,
    ya esta.
  */
  if exists (select 1 from public.comprobante c where c.id = v_id) then
    return v_id;
  end if;

  select v.estado into v_estado from public.venta v where v.id = v_venta_id;
  if v_estado is null then
    raise exception 'La venta del comprobante no existe.';
  end if;
  if v_estado <> 'cobrada' then
    raise exception 'La venta esta % y no corresponde facturarla.', v_estado;
  end if;

  if exists (select 1 from public.comprobante c
             where c.venta_id = v_venta_id and c.estado <> 'anulado') then
    raise exception 'La venta ya tiene un comprobante emitido.';
  end if;

  /*
    El numero ya esta impreso y entregado, asi que acá no se corrige: se
    verifica. Si otro comprobante ocupa ese lugar hay dos papeles con el
    mismo numero en la calle, y eso hay que saberlo hoy.
  */
  if exists (select 1 from public.comprobante c
             where c.punto_venta_id = v_pv
               and c.tipo_comprobante_id = v_tipo
               and c.numero = v_numero
               and c.estado <> 'anulado') then
    raise exception
      'Ya existe un comprobante % en ese punto de venta. El que se emitio sin conexion quedo con un numero repetido y hay que resolverlo con ARCA.',
      v_numero;
  end if;

  if not exists (select 1 from public.punto_venta p
                 where p.id = v_pv and p.regimen_caea and p.activo and p.eliminado_en is null) then
    raise exception 'El punto de venta del comprobante no esta habilitado bajo el regimen CAEA.';
  end if;

  if not exists (select 1 from public.caea k where k.id = v_caea_id) then
    raise exception 'El CAEA con el que se emitio no existe en el servidor.';
  end if;

  insert into public.comprobante (
    id, tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, neto_no_gravado, exento, iva_total, tributos_total, total,
    moneda, cotizacion,
    modalidad, estado, caea_id, cae, cae_vencimiento,
    arca_observaciones, autorizado_en, usuario_id, terminal_id
  ) values (
    v_id, v_tipo, v_pv, v_numero, v_venta_id, (p_datos->>'cliente_id')::uuid,
    p_datos->>'receptor_nombre', (p_datos->>'receptor_tipo_documento_id')::smallint,
    p_datos->>'receptor_documento', (p_datos->>'receptor_condicion_iva_id')::smallint,
    p_datos->>'receptor_domicilio',
    (p_datos->>'fecha')::date, coalesce((p_datos->>'concepto')::smallint, 1),
    (p_datos->>'neto_gravado')::numeric, coalesce((p_datos->>'neto_no_gravado')::numeric, 0),
    (p_datos->>'exento')::numeric, (p_datos->>'iva_total')::numeric,
    (p_datos->>'tributos_total')::numeric, (p_datos->>'total')::numeric,
    coalesce(p_datos->>'moneda', 'PES'), coalesce((p_datos->>'cotizacion')::numeric, 1),
    'caea', 'contingencia', v_caea_id, p_datos->>'cae', (p_datos->>'cae_vencimiento')::date,
    jsonb_build_array(jsonb_build_object(
      'codigo', 'CAEA',
      'mensaje', coalesce(nullif(trim(p_datos->>'motivo'), ''), 'Sin conexion') ||
                 ' — emitido por contingencia en la terminal el ' ||
                 to_char(coalesce((p_datos->>'creado_en')::timestamptz, now()), 'DD/MM/YYYY HH24:MI')
    )),
    coalesce((p_datos->>'creado_en')::timestamptz, now()),
    (p_datos->>'usuario_id')::uuid, (p_datos->>'terminal_id')::uuid
  );

  for v_item in select * from jsonb_array_elements(coalesce(p_datos->'alicuotas', '[]'::jsonb))
  loop
    insert into public.comprobante_alicuota
      (comprobante_id, alicuota_iva_id, base_imponible, importe)
    values (v_id, (v_item->>'alicuota_iva_id')::smallint,
            (v_item->>'base_imponible')::numeric, (v_item->>'importe')::numeric);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_datos->'tributos', '[]'::jsonb))
  loop
    insert into public.comprobante_tributo
      (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
    values (v_id, (v_item->>'tributo_id')::smallint, v_item->>'descripcion',
            (v_item->>'base_imponible')::numeric, (v_item->>'alicuota')::numeric,
            (v_item->>'importe')::numeric);
  end loop;

  /*
    La serie sube hasta acá. Sin esto, el primer comprobante que se
    emita con internet volveria a tomar un numero ya entregado.
  */
  insert into public.secuencia_comprobante
    (punto_venta_id, tipo_comprobante_id, ultimo_numero, actualizado_en)
  values (v_pv, v_tipo, v_numero, now())
  on conflict (punto_venta_id, tipo_comprobante_id) do update
    set ultimo_numero  = greatest(public.secuencia_comprobante.ultimo_numero, v_numero),
        actualizado_en = now();

  /*
    El registro que exige la RG 5852/2026: por que se uso la
    contingencia. Acá la indisponibilidad es la propia falta de
    conexion, y queda anotada con su hora.
  */
  insert into public.intento_arca
    (comprobante_id, punto_venta_id, operacion, resultado, error_mensaje, usuario_id, terminal_id, creado_en)
  values (v_id, v_pv, 'FECAESolicitar', 'error',
          coalesce(nullif(trim(p_datos->>'motivo'), ''), 'Sin conexion') ||
          ': la terminal no pudo llegar a ARCA y emitio con CAEA.',
          (p_datos->>'usuario_id')::uuid, (p_datos->>'terminal_id')::uuid,
          coalesce((p_datos->>'creado_en')::timestamptz, now()));

  return v_id;
end;
$$;

comment on function public.registrar_comprobante_caea(jsonb) is
  'Recibe un comprobante que una terminal emitió con CAEA durante un corte de internet. No renumera ni recalcula: verifica y guarda, en una sola transacción y sin duplicar si se reenvía.';
