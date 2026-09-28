-- ═══════════════════════════════════════════════════════════════
-- RECEPCIÓN DE MERCADERÍA
--
-- La factura de compra se carga desde el 10/09, pero sin líneas: la
-- mercadería entraba por Stock → ajuste, a mano y sin costo. Esto le
-- agrega a una factura ya cargada lo que trajo el proveedor, y con eso
-- entra el stock y se actualiza el costo.
--
-- ─── LAS DECISIONES, TOMADAS EL 28/09 ───
--
-- · El costo de la factura PISA el costo del producto. Es el último
--   costo, no un promedio: es lo que usa OBTech y lo que se explica en
--   una frase.
-- · El precio de venta NO se toca solo. Se PROPONE —el que corresponde
--   por el margen del producto— y alguien lo aplica. Es la misma regla
--   que ya tenía la ficha desde el 14/08: cambiar un costo no puede
--   mover un precio sin que nadie lo vea.
-- · Un producto que no está en el catálogo se da de alta ahí mismo,
--   desde la pantalla, con lo mínimo. Eso usa el alta de siempre y no
--   necesita nada de acá.
--
-- ─── LA CONDICIÓN DE LUCAS (audio 3 del 10/09) ───
--
-- La factura y la mercadería a veces las carga la misma persona de una
-- vez y a veces dos personas por separado. Por eso la recepción es un
-- paso APARTE sobre una factura que ya existe: se puede hacer en el
-- momento o al otro día, desde otra máquina.
--
-- ─── EL COSTO SE GUARDA CON IVA ───
--
-- El precio de venta del producto es con IVA, y la ficha calcula el
-- margen comparando precio contra costo. Si el costo quedara sin IVA,
-- un producto al 21% mostraría 21 puntos de margen que no existen, y
-- el precio sugerido saldría 21% abajo. Así que:
--   · Factura A (o M): el papel trae el unitario sin IVA → se le suma la
--     alícuota del producto.
--   · Factura B o C: el papel ya trae el precio final → va como está.
-- Se guardan los dos, el del papel y el que queda en el producto, para
-- que siempre se pueda explicar de dónde salió el número.
-- ═══════════════════════════════════════════════════════════════

alter table public.compra
  add column recibida_en  timestamptz,
  add column recibida_por uuid references public.usuario(id) on delete set null;

comment on column public.compra.recibida_en is
  'Cuándo entró al stock la mercadería de esta factura. Nulo: la factura está cargada pero la mercadería no.';

create table public.compra_linea (
  id              uuid primary key default gen_random_uuid(),
  compra_id       uuid not null references public.compra(id) on delete restrict,
  producto_id     uuid not null references public.producto(id) on delete restrict,
  cantidad        numeric(14,4) not null check (cantidad > 0),

  -- Como está impreso: sin IVA en una A, con IVA en una B o C.
  costo_unitario  numeric(14,4) not null check (costo_unitario >= 0),
  -- Lo que quedó en el producto: siempre con IVA.
  costo_con_iva   numeric(14,4) not null check (costo_con_iva >= 0),
  -- Lo que había antes, para poder decir «subió un 8%».
  costo_anterior  numeric(14,4),

  creado_en       timestamptz not null default now()
);

create index compra_linea_compra_idx   on public.compra_linea (compra_id);
create index compra_linea_producto_idx on public.compra_linea (producto_id, creado_en desc);

comment on table public.compra_linea is
  'Lo que trajo una factura de compra. Se escribe una sola vez, al recibir la mercadería, y no se edita: el stock ya se movió.';

alter table public.compra_linea enable row level security;

create policy compra_linea_select on public.compra_linea
  for select to authenticated
  using ((select app.tiene_permiso('compras.ver')));

-- Sin políticas de alta, cambio ni baja: sólo entra por
-- recibir_mercaderia, que controla el permiso ella misma.
grant select on public.compra_linea to authenticated;

-- ───────────────────────────────────────────────────────────────
-- El costo con IVA, en un solo lugar
-- ───────────────────────────────────────────────────────────────
create or replace function app.costo_con_iva(
  p_costo_unitario numeric,
  p_clase          text,
  p_producto_id    uuid
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    -- Sólo la A y la M discriminan el IVA en el papel.
    when p_clase in ('A', 'M') and p.condicion_iva = 'gravado'
      then round(p_costo_unitario * (1 + a.porcentaje / 100), 4)
    else round(p_costo_unitario, 4)
  end
  from public.producto p
  join public.alicuota_iva a on a.id = p.alicuota_iva_id
  where p.id = p_producto_id
$$;

-- ───────────────────────────────────────────────────────────────
-- Recibir la mercadería de una factura
-- ───────────────────────────────────────────────────────────────
/*
  Todo en una transacción: las líneas, el stock y el costo. Si se
  cortara a la mitad, quedaría mercadería en el stock sin la línea que
  la justifica, o un costo cambiado sin mercadería.

  security definer con el control de permisos adentro, y no invoker:
  escribe en tres tablas con tres permisos distintos (compras, stock y
  productos), y quien recibe mercadería no tiene por qué poder editar
  cualquier campo de un producto. Acá sólo se toca el costo.

  Devuelve, por producto, lo que la pantalla necesita para proponer el
  precio: el costo de antes y el de ahora, el precio actual, el margen
  objetivo y el precio que correspondería.
*/
create or replace function public.recibir_mercaderia(
  p_compra_id uuid,
  p_lineas    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra   public.compra;
  v_clase    text;
  v_signo    smallint;
  v_usuario  uuid;
  v_linea    jsonb;
  v_producto public.producto;
  v_cantidad numeric;
  v_costo    numeric;
  v_con_iva  numeric;
  v_numero   text;
  v_salida   jsonb := '[]'::jsonb;
begin
  if not (app.tiene_permiso('compras.registrar') and app.tiene_permiso('stock.ajustar')) then
    raise exception 'No tenés permiso para recibir mercadería.';
  end if;

  select * into v_compra from public.compra where id = p_compra_id for update;

  if v_compra.id is null or v_compra.eliminado_en is not null then
    raise exception 'Esa factura de compra no existe o está dada de baja.';
  end if;

  if v_compra.recibida_en is not null then
    raise exception 'La mercadería de esa factura ya se recibió. Si faltó algo, cargalo por Stock.';
  end if;

  select t.clase, t.signo into v_clase, v_signo
  from public.tipo_comprobante t where t.id = v_compra.tipo_comprobante_id;

  -- Una nota de crédito es mercadería que VUELVE al proveedor, no que
  -- entra. Recibirla sumaría stock que se fue.
  if v_signo < 0 then
    raise exception 'Una nota de crédito no trae mercadería: lo que se le devuelve al proveedor sale por Stock.';
  end if;

  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay nada para recibir.';
  end if;

  -- El mismo producto dos veces es casi siempre un doble clic. Si de
  -- verdad vino en dos renglones, se suma antes de mandar.
  if (select count(*) <> count(distinct x->>'producto_id')
        from jsonb_array_elements(p_lineas) x) then
    raise exception 'Hay un producto repetido. Si vino en dos renglones, sumá las cantidades en uno.';
  end if;

  v_usuario := app.usuario_actual_id();
  v_numero  := lpad(v_compra.punto_venta::text, 4, '0') || '-' || lpad(v_compra.numero::text, 8, '0');

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_costo    := (v_linea->>'costo_unitario')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada renglón tiene que tener una cantidad mayor que cero.';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'Cada renglón tiene que tener su costo.';
    end if;

    select * into v_producto from public.producto
    where id = (v_linea->>'producto_id')::uuid and eliminado_en is null
    for update;

    if v_producto.id is null then
      raise exception 'Uno de los productos no existe o está dado de baja.';
    end if;

    v_con_iva := app.costo_con_iva(v_costo, v_clase, v_producto.id);

    insert into public.compra_linea
      (compra_id, producto_id, cantidad, costo_unitario, costo_con_iva, costo_anterior)
    values
      (v_compra.id, v_producto.id, v_cantidad, v_costo, v_con_iva, v_producto.costo);

    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id, operador_id)
    values
      (v_producto.id, 'compra', v_cantidad, 'Factura de compra ' || v_numero,
       'compra', v_compra.id, v_usuario, v_usuario);

    -- Decidido: el último costo pisa. Un costo en cero es un regalo o
    -- una bonificación, y no puede dejar al producto con margen infinito.
    if v_con_iva > 0 then
      update public.producto set costo = v_con_iva where id = v_producto.id;
    end if;

    v_salida := v_salida || jsonb_build_object(
      'producto_id',       v_producto.id,
      'codigo',            v_producto.codigo,
      'nombre',            v_producto.nombre_interno,
      'cantidad',          v_cantidad,
      'costo_anterior',    v_producto.costo,
      'costo_nuevo',       case when v_con_iva > 0 then v_con_iva else v_producto.costo end,
      'precio_actual',     v_producto.precio_venta,
      'margen_objetivo',   v_producto.margen_sobre_costo,
      'precio_sugerido',   case
                             when v_con_iva > 0 and v_producto.margen_sobre_costo is not null
                             then round(v_con_iva * (1 + v_producto.margen_sobre_costo / 100), 2)
                           end
    );
  end loop;

  update public.compra
     set recibida_en = now(), recibida_por = v_usuario
   where id = v_compra.id;

  return v_salida;
end;
$$;

comment on function public.recibir_mercaderia is
  'Recibe la mercadería de una factura de compra ya cargada: líneas, ingreso de stock y último costo, en una transacción. No toca precios: devuelve el sugerido para que alguien lo aplique.';

revoke all on function public.recibir_mercaderia(uuid, jsonb) from public, anon;
grant execute on function public.recibir_mercaderia(uuid, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Aplicar el precio sugerido, a los que alguien eligió
-- ───────────────────────────────────────────────────────────────
/*
  La cuenta la hace la base con el costo y el margen que tiene el
  producto EN ESTE MOMENTO, no con un número que manda la pantalla: si
  entre medio alguien cambió el margen en la ficha, se aplica el nuevo.

  Invoker: cambiar un precio es editar un producto, y eso ya lo controla
  la política de la tabla con 'productos.editar'.
*/
create or replace function public.aplicar_precio_sugerido(p_producto_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not app.tiene_permiso('productos.editar') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;

  update public.producto
     set precio_venta = round(costo * (1 + margen_sobre_costo / 100), 2)
   where id = any(p_producto_ids)
     and eliminado_en is null
     and costo > 0
     and margen_sobre_costo is not null;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.aplicar_precio_sugerido is
  'Lleva el precio de los productos elegidos al que corresponde por su costo y su margen objetivo. Devuelve cuántos cambió.';

revoke all on function public.aplicar_precio_sugerido(uuid[]) from public, anon;
grant execute on function public.aplicar_precio_sugerido(uuid[]) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Dar de baja una factura que ya entró al stock
-- ───────────────────────────────────────────────────────────────
/*
  Hasta hoy la baja de una factura no tocaba nada más, porque no había
  nada más. Ahora puede tener mercadería recibida, y darla de baja sin
  sacarla dejaría en el stock unidades que ningún papel justifica.

  Se saca con un movimiento de ajuste que compensa, porque el libro de
  stock no se edita. El costo NO vuelve atrás: puede haber entrado otra
  factura después, y «el costo de antes» dejó de ser un dato confiable.
  El mensaje de la pantalla lo dice.
*/
create or replace function public.anular_compra(p_compra_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_numero  text;
  v_recibida boolean;
begin
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Para dar de baja una factura de compra hay que decir por qué.';
  end if;

  update public.compra
     set eliminado_en  = now(),
         observaciones = btrim(coalesce(observaciones || ' · ', '') || 'Baja: ' || btrim(p_motivo))
   where id = p_compra_id
     and eliminado_en is null
  returning lpad(punto_venta::text, 4, '0') || '-' || lpad(numero::text, 8, '0'),
            recibida_en is not null
       into v_numero, v_recibida;

  if v_numero is null then
    raise exception 'Esa factura de compra no existe o ya estaba dada de baja.';
  end if;

  if v_recibida then
    if not app.tiene_permiso('stock.ajustar') then
      raise exception 'Esa factura ya entró al stock, y darla de baja lo saca. Hace falta permiso para ajustar stock.';
    end if;

    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id, operador_id)
    select l.producto_id, 'ajuste', -l.cantidad,
           'Baja de la factura de compra ' || v_numero,
           'compra', p_compra_id, app.usuario_actual_id(), app.usuario_actual_id()
    from public.compra_linea l
    where l.compra_id = p_compra_id;
  end if;
end;
$$;

comment on function public.anular_compra is
  'Baja lógica de una factura de compra, con motivo obligatorio. Si su mercadería ya se había recibido, la saca del stock con un ajuste; el costo no vuelve atrás.';

grant execute on function public.anular_compra(uuid, text) to authenticated;
