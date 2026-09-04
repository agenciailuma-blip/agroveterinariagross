-- ═══════════════════════════════════════════════════════════════
-- 028 — IMPORTADOR DE PRODUCTOS
--
-- Trae el catálogo desde la planilla que exporta Lucas de OBTech.
-- Son unos 3.000 artículos y la carga no se hace una sola vez: se
-- importa, alguien mira, se corrige la planilla y se vuelve a importar.
-- Por eso la operación tiene que ser IDEMPOTENTE: importar dos veces el
-- mismo archivo no puede duplicar nada.
--
-- La clave es el código del producto. Si ya existe, se actualiza; si no,
-- se crea.
--
-- DOS DECISIONES QUE PARECEN DETALLES Y NO LO SON
--
-- 1) Una celda vacía NO borra lo que ya había. Si la planilla no trae
--    costo y el producto ya tenía uno cargado a mano, se respeta. Al
--    revés —dejar que un archivo incompleto vacíe el trabajo de una
--    semana del personal de carga— es irreversible.
--
-- 2) La importación NO marca los productos como revisados. Que un dato
--    haya entrado por planilla no significa que alguien lo haya mirado.
--    El operativo de carga se sigue midiendo contra lo que una persona
--    verificó de verdad.
--
-- Devuelve una fila por producto con lo que pasó, para poder mostrar el
-- resultado y que el error de una fila no tire abajo el archivo entero.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Auxiliares para emparejar nombres escritos a mano
--
-- La planilla trae "Bagó", "BAGO" y "bago" para la misma marca. Sin
-- normalizar, la importación crearía tres marcas distintas y el
-- catálogo quedaría con basura desde el día uno.
-- ───────────────────────────────────────────────────────────────
create or replace function app.normalizar_nombre(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(trim(extensions.unaccent(coalesce(p_texto, ''))))
$$;

create or replace function app.a_slug(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from
    regexp_replace(app.normalizar_nombre(p_texto), '[^a-z0-9]+', '-', 'g'))
$$;

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

      -- ── Categoría y marca: se buscan por nombre, sin distinguir
      -- mayúsculas ni acentos, porque la planilla los escribe a mano.
      v_categoria_id := null;
      v_texto := nullif(trim(v_fila->>'categoria'), '');
      if v_texto is not null then
        select id into v_categoria_id from public.categoria
        where app.normalizar_nombre(nombre) = app.normalizar_nombre(v_texto)
          and eliminado_en is null
        limit 1;

        if v_categoria_id is null and p_crear_referencias then
          insert into public.categoria (nombre, slug)
          values (v_texto, app.a_slug(v_texto))
          returning id into v_categoria_id;
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

      if v_producto_id is null then
        insert into public.producto (
          codigo, nombre_interno, nombre_publico, precio_venta, costo,
          categoria_id, marca_id, alicuota_iva_id, unidad_medida, condicion_iva
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
          coalesce(nullif(trim(v_fila->>'condicion_iva'), ''), 'gravado')
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
          condicion_iva   = coalesce(nullif(trim(v_fila->>'condicion_iva'), ''), condicion_iva)
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
  'Importa o actualiza productos desde una planilla, identificándolos por código. Idempotente: reimportar el mismo archivo no duplica. Una celda vacía no borra el dato que ya estaba. No marca los productos como revisados.';

grant execute on function public.importar_productos(jsonb, boolean) to authenticated;
