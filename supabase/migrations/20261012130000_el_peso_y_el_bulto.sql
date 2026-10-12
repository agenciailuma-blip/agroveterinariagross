-- ═══════════════════════════════════════════════════════════════
-- El peso y el bulto de cada producto, para el pedido al proveedor
--
-- El mínimo que acepta cada proveedor es variado (respuesta del
-- 12/10): hay directos y otros que revenden varias marcas, y unos
-- piden un monto, otros bultos y otros kilos. Para que el pedido diga
-- cuánto falta hace falta saber, de cada producto, cuánto pesa y
-- cuántas unidades trae el bulto en que se compra. Se suman ahora para
-- que entren con la planilla del catálogo, antes de que llegue.
--
-- Columnas nuevas y no `contenido`/`contenido_unidad` —la reserva del
-- 12/08, sin uso—: el contenido puede estar en mililitros o gramos, y
-- el pedido tendría que convertir unidades para sumar kilos. El peso va
-- siempre en kilos.
--
-- No bajan a la copia local de las PC: el pedido se arma con internet,
-- y sumarlas obligaría a volver a bajar los productos en cada máquina.
-- ═══════════════════════════════════════════════════════════════

alter table public.producto
  add column peso_kg numeric(14,4),
  add column unidades_por_bulto numeric(14,4);

alter table public.producto
  add constraint producto_peso_positivo
    check (peso_kg is null or peso_kg > 0),
  add constraint producto_unidades_por_bulto_positivas
    check (unidades_por_bulto is null or unidades_por_bulto > 0);

comment on column public.producto.peso_kg is
  'Cuántos kilos pesa una unidad de este producto. Para el pedido al proveedor que pide un mínimo en kilos.';
comment on column public.producto.unidades_por_bulto is
  'Cuántas unidades de este producto trae el bulto en que se le compra al proveedor. Para el pedido al proveedor que pide un mínimo en bultos. No es la suelta: eso es cantidad_por_envase.';

-- ── La planilla los trae ────────────────────────────────────────
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
  v_avisos          text[];
  v_bajo            numeric;
  v_critico         numeric;
  v_bajo_actual     numeric;
  v_critico_actual  numeric;
  v_sale_de         text;
  v_trae            numeric;
  v_envase_id       uuid;
  v_otra_suelta     text;
  v_puede_avisos    boolean;
  v_peso            numeric;
  v_por_bulto       numeric;
begin
  if not (select app.tiene_permiso('productos.crear')) then
    raise exception 'No tenés permiso para importar productos.';
  end if;

  v_puede_avisos := (select app.tiene_permiso('stock.configurar_umbrales'));

  for v_fila in select * from jsonb_array_elements(p_filas)
  loop
    v_indice := v_indice + 1;
    v_codigo := nullif(trim(v_fila->>'codigo'), '');
    v_nombre := nullif(trim(v_fila->>'nombre_interno'), '');
    v_avisos := '{}';

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

      /*
        El aviso de stock y la suelta se revisan ANTES de crear nada.
        Lo que está mal escrito en la fila la frena entera, como un
        precio que no se entiende: un crítico mayor que el bajo o una
        suelta que no dice cuántas trae no son algo que se pueda
        completar después sin volver a la planilla.
      */
      v_bajo    := (v_fila->>'stock_bajo')::numeric;
      v_critico := (v_fila->>'stock_critico')::numeric;
      if v_bajo < 0 or v_critico < 0 then
        fila := v_indice; codigo := v_codigo; resultado := 'error';
        detalle := 'El aviso de stock no puede ser negativo.';
        return next; continue;
      end if;
      if v_critico > v_bajo then
        fila := v_indice; codigo := v_codigo; resultado := 'error';
        detalle := 'El stock crítico no puede ser mayor que el bajo.';
        return next; continue;
      end if;

      v_sale_de := nullif(trim(v_fila->>'sale_de'), '');
      v_trae    := (v_fila->>'cantidad_por_envase')::numeric;
      if (v_sale_de is null) <> (v_trae is null) then
        fila := v_indice; codigo := v_codigo; resultado := 'error';
        detalle := case when v_sale_de is null
                        then 'Dice cuántas trae, pero no de qué envase sale.'
                        else format('Sale de %s, pero falta cuántas trae.', v_sale_de) end;
        return next; continue;
      end if;
      if v_trae <= 0 then
        fila := v_indice; codigo := v_codigo; resultado := 'error';
        detalle := 'Cuántas trae el envase tiene que ser más que cero.';
        return next; continue;
      end if;
      if upper(v_sale_de) = upper(v_codigo) then
        fila := v_indice; codigo := v_codigo; resultado := 'error';
        detalle := 'Un producto no puede salir de adentro de sí mismo.';
        return next; continue;
      end if;

      -- El peso y el bulto: cero no es un dato, es una celda mal llenada.
      v_peso      := (v_fila->>'peso_kg')::numeric;
      v_por_bulto := (v_fila->>'unidades_por_bulto')::numeric;
      if v_peso <= 0 then
        fila := v_indice; codigo := v_codigo; resultado := 'error';
        detalle := 'El peso tiene que ser más que cero.';
        return next; continue;
      end if;
      if v_por_bulto <= 0 then
        fila := v_indice; codigo := v_codigo; resultado := 'error';
        detalle := 'Las unidades por bulto tienen que ser más que cero.';
        return next; continue;
      end if;

      v_veterinario   := app.a_booleano(v_fila->>'es_veterinario');
      v_receta        := app.a_booleano(v_fila->>'requiere_receta');
      v_fitosanitario := app.a_booleano(v_fila->>'es_fitosanitario');

      if v_producto_id is null then
        insert into public.producto (
          codigo, nombre_interno, nombre_publico, precio_venta, costo,
          categoria_id, marca_id, alicuota_iva_id, unidad_medida, condicion_iva,
          es_producto_veterinario, requiere_receta, es_fitosanitario,
          peso_kg, unidades_por_bulto
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
          coalesce(v_fitosanitario, false),
          v_peso,
          v_por_bulto
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
          es_fitosanitario        = coalesce(v_fitosanitario, es_fitosanitario),
          peso_kg                 = coalesce(v_peso, peso_kg),
          unidades_por_bulto      = coalesce(v_por_bulto, unidades_por_bulto)
        where id = v_producto_id;

        resultado := 'actualizado';
      end if;

      /*
        ── El aviso de stock propio del producto.

        Pasa por definir_umbral_producto(), igual que la ficha: es la que
        sabe revivir un aviso quitado y la que deja la marca que viaja a
        las PC del local.

        Si viene uno solo de los dos números, el otro queda como estaba;
        si el producto no tenía aviso propio, el otro toma el mismo
        número —«avisame con dos» pasa a rojo con dos, sin amarillo
        antes—. Y si el que vino choca con el que estaba (crítico 5 con
        un bajo de 3), se acomoda el que no vino: lo que dice la planilla
        es lo último que alguien decidió.
      */
      if v_bajo is not null or v_critico is not null then
        if not v_puede_avisos then
          v_avisos := array_append(v_avisos,
            'El aviso de stock no se cargó: hace falta el permiso para definir avisos.');
        else
          select u.bajo, u.critico into v_bajo_actual, v_critico_actual
            from public.umbral_stock u
           where u.producto_id = v_producto_id and u.ambito = 'producto' and u.eliminado_en is null;

          if v_bajo is null then
            v_bajo := greatest(coalesce(v_bajo_actual, v_critico), v_critico);
          elsif v_critico is null then
            v_critico := least(coalesce(v_critico_actual, v_bajo), v_bajo);
          end if;

          if v_bajo is distinct from v_bajo_actual or v_critico is distinct from v_critico_actual then
            perform public.definir_umbral_producto(v_producto_id, v_bajo, v_critico);
          end if;
        end if;
      end if;

      /*
        ── La suelta: de qué envase sale y cuántas trae.

        El envase se busca por su código entre los productos que ya
        están, contando los que entraron más arriba en esta misma
        planilla. Si no está, o ya se abre en otro producto, o atarlo
        armaría una vuelta (la caja saliendo de su propia pastilla), el
        producto entra igual y la fila lo dice: es lo mismo que pasa en
        la ficha, donde la suelta se ata después de crearla.
      */
      if v_sale_de is not null then
        select e.id into v_envase_id
          from public.producto e
         where upper(e.codigo) = upper(v_sale_de) and e.eliminado_en is null
         limit 1;

        if v_envase_id is null then
          v_avisos := array_append(v_avisos, format(
            'No se ató a su envase: no hay ningún producto con el código %s.', v_sale_de));
        else
          select o.codigo into v_otra_suelta
            from public.producto o
           where o.envase_id = v_envase_id and o.id <> v_producto_id and o.eliminado_en is null
           limit 1;

          if v_otra_suelta is not null then
            v_avisos := array_append(v_avisos, format(
              'No se ató a su envase: %s ya se abre en %s, y un envase se abre en una sola cosa.',
              v_sale_de, v_otra_suelta));
          else
            begin
              update public.producto p
                 set envase_id = v_envase_id, cantidad_por_envase = v_trae
               where p.id = v_producto_id
                 and (p.envase_id is distinct from v_envase_id
                      or p.cantidad_por_envase is distinct from v_trae);
            exception when check_violation then
              -- El disparador de la cadena explica el motivo con palabras.
              v_avisos := array_append(v_avisos, 'No se ató a su envase: ' || sqlerrm);
            end;
          end if;
        end if;
      end if;

      /*
        ── El costo de una suelta sale de su envase.

        El disparador lo calcula cuando se ata o cambia cuántas trae.
        Pero si la suelta ya estaba atada y la planilla le trae un costo
        propio, el update de arriba lo acaba de pisar: se vuelve a sacar
        del envase, que es lo que se compra y lo que actualiza la
        recepción de mercadería.
      */
      update public.producto h
         set costo = round(e.costo / h.cantidad_por_envase, 4)
        from public.producto e
       where h.id = v_producto_id
         and e.id = h.envase_id
         and e.eliminado_en is null
         and e.costo is not null
         and h.costo is distinct from round(e.costo / h.cantidad_por_envase, 4);

      -- ── Código de barra, si vino. Se ignora si ya lo tiene otro
      -- producto: reasignarlo en silencio haría que el lector cargue el
      -- artículo equivocado en el mostrador.
      v_codigo_barra := nullif(trim(v_fila->>'codigo_barra'), '');
      if v_codigo_barra is not null then
        if exists (select 1 from public.producto_codigo_barra cb
                   where cb.codigo = v_codigo_barra and cb.producto_id <> v_producto_id
                     and cb.eliminado_en is null) then
          v_avisos := array_append(v_avisos, format(
            'Importado, pero el código de barra %s ya es de otro producto.', v_codigo_barra));
        else
          insert into public.producto_codigo_barra (producto_id, codigo, es_principal)
          values (v_producto_id, v_codigo_barra, true)
          on conflict do nothing;
        end if;
      end if;

      fila := v_indice; codigo := v_codigo;
      detalle := nullif(array_to_string(v_avisos, ' '), '');
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
  'Importa o actualiza productos desde una planilla, identificándolos por código. Acepta la categoría como ruta de hasta cuatro niveles, el aviso de stock propio (bajo y crítico), de qué envase sale una suelta y cuántas trae, y el peso y las unidades por bulto para el pedido al proveedor. Idempotente: reimportar el mismo archivo no duplica. Una celda vacía no borra el dato que ya estaba. No marca los productos como revisados.';

grant execute on function public.importar_productos(jsonb, boolean) to authenticated;
