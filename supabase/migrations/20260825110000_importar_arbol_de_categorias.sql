-- ═══════════════════════════════════════════════════════════════
-- 040 — LA PLANILLA DE LUCAS ENTRA ENTERA
--
-- El 25/08 Lucas mando los primeros 86 productos categorizados. Los
-- clasifico en cuatro niveles —Rubro, Subrubro, Grupo, Subgrupo— mas
-- Marca, Animal y tres banderas de SI/NO.
--
-- El importador solo sabia de UNA categoria plana y de la marca. Todo
-- lo demas se hubiera perdido en silencio, que es la peor forma de
-- perderlo: Lucas iba a seguir clasificando 2.261 productos contra una
-- estructura que el sistema no guardaba.
--
-- La tabla categoria ya era un arbol (padre_id) desde el principio; lo
-- que faltaba era que el importador supiera caminarlo.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Resolver una ruta de categorias, creando lo que falte
--
-- El slug lleva la ruta entera y no solo el ultimo nombre porque es
-- unico en toda la tabla: "Adulto" cuelga de Alimentos Secos y podria
-- colgar tambien de Alimentos Humedos, y dos "adulto" no pueden
-- convivir. Con la ruta adentro quedan
-- 'alimentos-alimentos-secos-adulto' y
-- 'alimentos-alimentos-humedos-adulto', que ademas es la direccion que
-- va a necesitar la tienda.
--
-- La busqueda es por nombre normalizado Y padre: "Medicamentos" bajo
-- Farmacia no es el mismo nodo que "Medicamentos" bajo otro rubro.
-- ───────────────────────────────────────────────────────────────
create or replace function app.categoria_de_ruta(
  p_ruta  text[],
  p_crear boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_padre  uuid := null;
  v_actual uuid;
  v_nombre text;
  v_slug   text := '';
  v_orden  integer := 0;
begin
  if p_ruta is null or array_length(p_ruta, 1) is null then
    return null;
  end if;

  foreach v_nombre in array p_ruta
  loop
    v_nombre := nullif(trim(v_nombre), '');
    -- Un hueco en el medio (Rubro y Grupo cargados, Subrubro vacio) no
    -- corta la ruta: se saltea el nivel y se sigue colgando del ultimo
    -- que existia. Obligar a llenar los cuatro seria pedirle a Lucas
    -- que invente niveles para que el importador no se queje.
    continue when v_nombre is null;

    v_orden := v_orden + 1;
    v_slug  := case when v_slug = '' then app.a_slug(v_nombre)
                    else v_slug || '-' || app.a_slug(v_nombre) end;

    select c.id into v_actual
    from public.categoria c
    where app.normalizar_nombre(c.nombre) = app.normalizar_nombre(v_nombre)
      and c.padre_id is not distinct from v_padre
      and c.eliminado_en is null
    limit 1;

    if v_actual is null then
      if not p_crear then
        return v_padre;
      end if;

      insert into public.categoria (nombre, slug, padre_id, orden)
      values (v_nombre, v_slug, v_padre, v_orden)
      returning id into v_actual;
    end if;

    v_padre := v_actual;
  end loop;

  return v_padre;
end;
$$;

comment on function app.categoria_de_ruta(text[], boolean) is
  'Resuelve una ruta de categorías (Rubro > Subrubro > Grupo > Subgrupo) creando los niveles que falten. El slug lleva la ruta completa porque es único en toda la tabla.';

revoke all on function app.categoria_de_ruta(text[], boolean) from public, anon;
grant execute on function app.categoria_de_ruta(text[], boolean) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- SI / NO como los escribe una persona
--
-- La planilla trae "SI", "Si", "sí", "S", "X", "TRUE", "1". Todo eso
-- es lo mismo. Lo que no se reconoce devuelve null y no toca el dato
-- que ya estaba: una celda que nadie entendio no puede volver
-- "requiere receta" en NO, que es como se termina vendiendo un
-- antibiotico sin receta.
-- ───────────────────────────────────────────────────────────────
create or replace function app.a_booleano(p_texto text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_texto is null then null
    when app.normalizar_nombre(p_texto) in ('si', 's', 'x', 'true', 'verdadero', '1') then true
    when app.normalizar_nombre(p_texto) in ('no', 'n', 'false', 'falso', '0') then false
    else null
  end;
$$;

revoke all on function app.a_booleano(text) from public, anon;
grant execute on function app.a_booleano(text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Importador: ruta de categorías y las tres banderas
-- ───────────────────────────────────────────────────────────────
create or replace function public.importar_productos(
  p_filas             jsonb,
  p_crear_referencias boolean default true
)
returns table (
  fila       integer,
  codigo     text,
  resultado  text,   -- creado | actualizado | error
  detalle    text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fila            jsonb;
  v_indice          integer := 0;
  v_codigo          text;
  v_nombre          text;
  v_producto_id     uuid;
  v_categoria_id    uuid;
  v_marca_id        uuid;
  v_alicuota_id     smallint;
  v_texto           text;
  v_codigo_barra    text;
  v_ruta            text[];
  v_veterinario     boolean;
  v_receta          boolean;
  v_fitosanitario   boolean;
begin
  if not (select app.tiene_permiso('productos.crear')) then
    raise exception 'No tenés permiso para importar productos.';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas)
  loop
    v_indice := v_indice + 1;
    v_codigo := nullif(trim(v_fila->>'codigo'), '');
    v_nombre := nullif(trim(v_fila->>'nombre_interno'), '');

    begin
      if v_codigo is null then
        fila := v_indice; codigo := null; resultado := 'error';
        detalle := 'Falta el código del producto.';
        return next; continue;
      end if;

      -- Se alias-a la tabla: sin eso, 'codigo' es a la vez la columna y
      -- el parámetro de salida de esta función, y Postgres no adivina.
      select p.id into v_producto_id
      from public.producto p
      where upper(p.codigo) = upper(v_codigo) and p.eliminado_en is null;

      if v_producto_id is null and v_nombre is null then
        fila := v_indice; codigo := v_codigo; resultado := 'error';
        detalle := 'Producto nuevo sin nombre: no se puede crear.';
        return next; continue;
      end if;

      /*
        Categoría. Puede venir como una ruta de hasta cuatro niveles
        (Rubro > Subrubro > Grupo > Subgrupo) o como un solo nombre,
        que es como venía antes. Las dos formas conviven: la planilla
        vieja sigue entrando igual.
      */
      v_categoria_id := null;
      if v_fila ? 'categoria_ruta' then
        select array_agg(x order by orden) into v_ruta
        from jsonb_array_elements_text(v_fila->'categoria_ruta')
             with ordinality as t(x, orden)
        where nullif(trim(x), '') is not null;

        v_categoria_id := app.categoria_de_ruta(v_ruta, p_crear_referencias);
      else
        v_texto := nullif(trim(v_fila->>'categoria'), '');
        if v_texto is not null then
          v_categoria_id := app.categoria_de_ruta(array[v_texto], p_crear_referencias);
        end if;
      end if;

      v_marca_id := null;
      v_texto := nullif(trim(v_fila->>'marca'), '');
      if v_texto is not null then
        select id into v_marca_id from public.marca
        where app.normalizar_nombre(nombre) = app.normalizar_nombre(v_texto)
          and eliminado_en is null
        limit 1;

        if v_marca_id is null and p_crear_referencias then
          insert into public.marca (nombre, slug)
          values (v_texto, app.a_slug(v_texto))
          returning id into v_marca_id;
        end if;
      end if;

      -- ── Alícuota: llega como porcentaje (21, 10.5) y se traduce al
      -- código de ARCA. Si no coincide con ninguna, se avisa en vez de
      -- adivinar: una alícuota mal puesta se descubre cuando ARCA
      -- rechaza la factura.
      v_alicuota_id := null;
      if v_fila ? 'alicuota_porcentaje' and v_fila->>'alicuota_porcentaje' is not null then
        select id into v_alicuota_id from public.alicuota_iva
        where porcentaje = (v_fila->>'alicuota_porcentaje')::numeric;

        if v_alicuota_id is null then
          fila := v_indice; codigo := v_codigo; resultado := 'error';
          detalle := format('La alícuota %s%% no es una de las que acepta ARCA.',
                            v_fila->>'alicuota_porcentaje');
          return next; continue;
        end if;
      end if;

      v_veterinario   := app.a_booleano(v_fila->>'es_veterinario');
      v_receta        := app.a_booleano(v_fila->>'requiere_receta');
      v_fitosanitario := app.a_booleano(v_fila->>'es_fitosanitario');

      if v_producto_id is null then
        insert into public.producto (
          codigo, nombre_interno, nombre_publico, precio_venta, costo,
          categoria_id, marca_id, alicuota_iva_id, unidad_medida, condicion_iva,
          es_producto_veterinario, requiere_receta, es_fitosanitario
        ) values (
          v_codigo,
          v_nombre,
          nullif(trim(v_fila->>'nombre_publico'), ''),
          coalesce((v_fila->>'precio_venta')::numeric, 0),
          (v_fila->>'costo')::numeric,
          v_categoria_id,
          v_marca_id,
          coalesce(v_alicuota_id, 5),
          coalesce(nullif(trim(v_fila->>'unidad_medida'), ''), 'unidad'),
          coalesce(nullif(trim(v_fila->>'condicion_iva'), ''), 'gravado'),
          coalesce(v_veterinario, false),
          coalesce(v_receta, false),
          coalesce(v_fitosanitario, false)
        ) returning id into v_producto_id;

        resultado := 'creado';
      else
        -- coalesce contra el valor actual: lo que la planilla no trae,
        -- no se toca.
        update public.producto set
          nombre_interno  = coalesce(v_nombre, nombre_interno),
          nombre_publico  = coalesce(nullif(trim(v_fila->>'nombre_publico'), ''), nombre_publico),
          precio_venta    = coalesce((v_fila->>'precio_venta')::numeric, precio_venta),
          costo           = coalesce((v_fila->>'costo')::numeric, costo),
          categoria_id    = coalesce(v_categoria_id, categoria_id),
          marca_id        = coalesce(v_marca_id, marca_id),
          alicuota_iva_id = coalesce(v_alicuota_id, alicuota_iva_id),
          unidad_medida   = coalesce(nullif(trim(v_fila->>'unidad_medida'), ''), unidad_medida),
          condicion_iva   = coalesce(nullif(trim(v_fila->>'condicion_iva'), ''), condicion_iva),
          es_producto_veterinario = coalesce(v_veterinario, es_producto_veterinario),
          requiere_receta         = coalesce(v_receta, requiere_receta),
          es_fitosanitario        = coalesce(v_fitosanitario, es_fitosanitario)
        where id = v_producto_id;

        resultado := 'actualizado';
      end if;

      -- ── Código de barra, si vino. Se ignora si ya lo tiene otro
      -- producto: reasignarlo en silencio haría que el lector cargue el
      -- artículo equivocado en el mostrador.
      v_codigo_barra := nullif(trim(v_fila->>'codigo_barra'), '');
      if v_codigo_barra is not null then
        if exists (select 1 from public.producto_codigo_barra cb
                   where cb.codigo = v_codigo_barra and cb.producto_id <> v_producto_id
                     and cb.eliminado_en is null) then
          fila := v_indice; codigo := v_codigo;
          detalle := format('Importado, pero el código de barra %s ya es de otro producto.', v_codigo_barra);
          return next; continue;
        end if;

        insert into public.producto_codigo_barra (producto_id, codigo, es_principal)
        values (v_producto_id, v_codigo_barra, true)
        on conflict do nothing;
      end if;

      fila := v_indice; codigo := v_codigo; detalle := null;
      return next;

    exception when others then
      fila := v_indice; codigo := v_codigo; resultado := 'error';
      detalle := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

comment on function public.importar_productos(jsonb, boolean) is
  'Importa o actualiza productos desde una planilla, identificándolos por código. Acepta la categoría como ruta de hasta cuatro niveles. Idempotente: reimportar el mismo archivo no duplica. Una celda vacía no borra el dato que ya estaba. No marca los productos como revisados.';

grant execute on function public.importar_productos(jsonb, boolean) to authenticated;
