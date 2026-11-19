/*
  ─────────────────────────────────────────────────────────────
  Registro de auditoría, parte 1: fichas y configuración dejan rastro

  El alcance de la Fase 1 compromete un «registro de auditoría de toda
  operación sensible». Las operaciones ya dejaban su rastro, cada una en
  su tabla (quién anuló, quién cambió un precio en la venta, quién
  autorizó a un cliente con deuda). Lo que no dejaba nada eran los
  cambios en fichas y configuración: el 17/09 alguien tildó «Entra al
  arqueo de caja» en Tarjeta de crédito, el cierre dio diferencias un
  mes, y se supo cuándo pero no quién.

  Ahora cada alta, cambio o baja en esas tablas queda en `auditoria`
  (que existía desde agosto, vacía) con quién, cuándo, desde qué puesto
  y sólo lo que cambió: el valor de antes y el de después.

  - El puesto llega en el encabezado `x-gross-terminal` que manda la app
    (19/11). Sin él —una versión anterior, la consola— queda vacío.
  - Las claves secretas de la configuración no se copian: quedan como
    «oculto».
  - Nadie lo puede corregir ni borrar: no hay política de escritura y se
    quitan los permisos de escritura directa (incluso TRUNCATE, que
    salta RLS). Sólo escribe el disparador, como dueño.
  - Propuesta: docs/propuesta-registro-de-auditoria.md
  ─────────────────────────────────────────────────────────────
*/

revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;

-- Arranca sólo en el Administrador; Lucas se lo puede dar al Encargado.
delete from public.rol_permiso rp
 using public.rol r
 where r.id = rp.rol_id and r.nombre = 'Encargado' and rp.permiso_clave = 'auditoria.ver';

update public.permiso set descripcion = 'Ver el registro de auditoría' where clave = 'auditoria.ver';

/*
  El puesto desde el que se hizo el pedido. Un encabezado mal formado o
  de un puesto que no existe no es un error de quien edita: queda vacío.
*/
create or replace function app.terminal_del_pedido()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-gross-terminal';
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return (select t.id from public.terminal t where t.id = v::uuid);
exception when others then
  return null;
end;
$$;

/* El nombre con el que se reconoce el registro en la lista. */
create or replace function app.nombre_para_auditoria(p_tabla text, f jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_tabla
    when 'producto' then concat_ws(' · ', f->>'codigo', f->>'nombre_interno')
    when 'cliente' then concat_ws(' · ', f->>'codigo', f->>'nombre')
    when 'punto_venta' then 'Punto de venta ' || lpad(f->>'numero', 4, '0')
    when 'configuracion' then coalesce(nullif(f->>'descripcion', ''), f->>'clave')
    when 'remito_r_tanda' then format('CAI %s · %s a %s', f->>'cai', f->>'desde', f->>'hasta')
    when 'producto_precio_lista' then
      (select concat_ws(' · ', p.codigo, p.nombre_interno) from public.producto p where p.id = (f->>'producto_id')::uuid)
      || ' · lista ' ||
      coalesce((select l.nombre from public.lista_precio l where l.id = (f->>'lista_precio_id')::uuid), '?')
    when 'rol_permiso' then
      coalesce((select r.nombre from public.rol r where r.id = (f->>'rol_id')::uuid), 'Rol')
      || ': ' ||
      coalesce((select p.descripcion from public.permiso p where p.clave = f->>'permiso_clave'), f->>'permiso_clave')
    else f->>'nombre'
  end
$$;

/*
  El disparador. TG_ARGV[0] es la columna que identifica al registro
  ('id', 'producto_id', 'rol_id'), o nada si no hay una (configuración).
  En un cambio guarda sólo las columnas que cambiaron; si lo único que
  cambió es una columna de servicio (las fechas, lo que la PC informa
  sola), no anota nada.
*/
create or replace function app.auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viejo   jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  v_nuevo   jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
  v_fila    jsonb;
  v_ignorar text[] := array[
    'creado_en', 'actualizado_en', 'revisado_en', 'revisado_por',
    'ultima_sincronizacion', 'version_app', 'ultimo_error_sync', 'impresora_windows',
    'equipo_id', 'equipo_visto_en', 'estado_pc', 'estado_informado_en'
  ];
  v_antes   jsonb := '{}';
  v_despues jsonb := '{}';
  k         text;
  v_id      uuid;
begin
  v_fila := coalesce(v_nuevo, v_viejo);

  if TG_OP = 'UPDATE' then
    for k in select jsonb_object_keys(v_nuevo) loop
      continue when k = any(v_ignorar);
      if v_viejo -> k is distinct from v_nuevo -> k then
        v_antes   := v_antes   || jsonb_build_object(k, v_viejo -> k);
        v_despues := v_despues || jsonb_build_object(k, v_nuevo -> k);
      end if;
    end loop;
    if v_despues = '{}' then
      return null;
    end if;
  elsif TG_OP = 'INSERT' then
    v_despues := v_nuevo - v_ignorar;
  else
    v_antes := v_viejo - v_ignorar;
  end if;

  if TG_TABLE_NAME = 'configuracion'
     and (v_fila ->> 'clave') ~* '(clave|token|secret|password|contrasena|api_key)' then
    if v_antes ? 'valor' then v_antes := jsonb_set(v_antes, '{valor}', '"oculto"'); end if;
    if v_despues ? 'valor' then v_despues := jsonb_set(v_despues, '{valor}', '"oculto"'); end if;
  end if;

  if TG_NARGS > 0 and TG_ARGV[0] <> '-' then
    v_id := (v_fila ->> TG_ARGV[0])::uuid;
  end if;

  insert into public.auditoria
    (tabla, registro_id, accion, usuario_id, terminal_id, datos_antes, datos_despues, contexto)
  values (
    TG_TABLE_NAME,
    v_id,
    lower(TG_OP),
    app.usuario_actual_id(),
    app.terminal_del_pedido(),
    nullif(v_antes, '{}'),
    nullif(v_despues, '{}'),
    jsonb_strip_nulls(jsonb_build_object(
      'nombre', app.nombre_para_auditoria(TG_TABLE_NAME, v_fila),
      'clave', case when TG_TABLE_NAME = 'configuracion' then v_fila ->> 'clave' end,
      'lista_precio_id', case when TG_TABLE_NAME = 'producto_precio_lista' then v_fila ->> 'lista_precio_id' end,
      'permiso_clave', case when TG_TABLE_NAME = 'rol_permiso' then v_fila ->> 'permiso_clave' end
    ))
  );
  return null;
end;
$$;

comment on function app.auditar_cambio() is
  'Anota en auditoria cada alta, cambio o baja de fichas y configuración: quién, cuándo, desde qué puesto, y sólo lo que cambió.';

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('producto', 'id'), ('producto_precio_lista', 'producto_id'), ('cliente', 'id'),
      ('usuario', 'id'), ('rol', 'id'), ('rol_permiso', 'rol_id'), ('configuracion', '-'),
      ('medio_pago', 'id'), ('lista_precio', 'id'), ('punto_venta', 'id'), ('terminal', 'id'),
      ('deposito', 'id'), ('remito_r_tanda', 'id')
    ) as x(tabla, columna)
  loop
    execute format('drop trigger if exists %I on public.%I', t.tabla || '_auditoria', t.tabla);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.auditar_cambio(%L)',
      t.tabla || '_auditoria', t.tabla, t.columna);
  end loop;
end $$;
