-- ═══════════════════════════════════════════════════════════════
-- LA CAJA EDITA LA VENTA
--
-- Puntos 13 y 14 de Lucas: "la caja puede editar la venta, cambiar la
-- cantidad, eliminar o agregar un producto. Porque el cliente a veces
-- cambia las decisiones en la caja."
--
-- Y desde el 04/09 es algo mas que comodidad: con el remito descargando
-- stock antes del cobro, esta es la unica forma de que el stock aterrice
-- bien cuando el repartidor vuelve con mercaderia que el cliente no
-- quiso. cobrar_venta() ya reconcilia solo; lo que faltaba era el camino
-- para corregir la venta.
--
-- ─── SE DECLARA EL RESULTADO, NO SE APLICAN CAMBIOS ───
--
-- La funcion no recibe "sacale una unidad al renglon 3". Recibe la lista
-- COMPLETA de lo que la venta tiene que tener ahora.
--
-- Es por la bandeja de salida. Una operacion que no llego a confirmarse
-- se reintenta, y "sacale una unidad" aplicado dos veces saca dos. "La
-- venta ahora tiene estas lineas" aplicado dos veces deja lo mismo. Es
-- la misma leccion que dejo la numeracion: declarar el estado final es
-- a prueba de reintentos, aplicar deltas no.
--
-- ─── LOS PRECIOS ACORDADOS NO SE TOCAN ───
--
-- El limite que puso la decision B1. Aca no es una validacion: es que
-- LA FUNCION NO RECIBE PRECIOS. Para una linea que ya existia, el precio
-- sale de la base; lo unico que el cajero puede cambiar es la cantidad.
-- Para una linea nueva, el precio lo calcula el servidor.
--
-- Si el cajero necesita cambiar un precio, para eso esta el camino que
-- ya existe y deja quien y por que. Este no.
--
-- ─── TODO CAMBIO QUEDA CON NOMBRE ───
--
-- Las lineas que se quitan se borran de verdad —son un borrador de lo
-- que el cliente se lleva, no un hecho consumado— asi que el rastro no
-- puede vivir en ellas. Vive en venta_edicion, que guarda que habia
-- antes, que quedo, y quien lo hizo. Es lo que permite contestar
-- despues "el vendedor armo una cosa y se cobro otra".
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- El registro de ediciones
-- ───────────────────────────────────────────────────────────────
create table public.venta_edicion (
  id             uuid primary key default gen_random_uuid(),
  venta_id       uuid not null references public.venta(id) on delete cascade,
  cajero_id      uuid references public.usuario(id) on delete set null,
  terminal_id    uuid references public.terminal(id) on delete set null,

  total_anterior numeric(14,4) not null,
  total_nuevo    numeric(14,4) not null,
  -- Que cambio, en castellano y con las cantidades. No es un diff
  -- tecnico: tiene que poder leerlo alguien que no programa.
  cambios        jsonb not null,

  creado_en      timestamptz not null default now()
);

create index venta_edicion_venta_idx   on public.venta_edicion (venta_id, creado_en desc);
create index venta_edicion_cajero_idx  on public.venta_edicion (cajero_id, creado_en desc);
create index venta_edicion_creado_idx  on public.venta_edicion (creado_en desc);

comment on table public.venta_edicion is
  'Que cambio la caja sobre lo que armo el vendedor, y quien. Las lineas quitadas se borran, asi que el rastro tiene que vivir afuera de ellas.';

alter table public.venta_edicion enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Permiso propio
--
-- Un cajero tiene ventas.crear, pero armar una venta propia y corregir
-- la que armo otro son autoridades distintas. El vendedor no lo lleva:
-- el corrige la suya antes de mandarla.
-- ───────────────────────────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('ventas.editar_en_caja', 'Ventas', 'Corregir en la caja una venta que armó el vendedor', 235);

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'ventas.editar_en_caja'
from public.rol r
where r.nombre in ('Administrador', 'Encargado', 'Cajero')
on conflict do nothing;

create policy venta_edicion_select on public.venta_edicion
  for select to authenticated using ((select app.tiene_permiso('ventas.ver_todas')));
create policy venta_edicion_insert on public.venta_edicion
  for insert to authenticated with check ((select app.tiene_permiso('ventas.editar_en_caja')));

-- ───────────────────────────────────────────────────────────────
-- Editar
--
-- p_lineas es la venta entera como tiene que quedar:
--   [{"venta_linea_id": "...", "cantidad": 2},      -- la que ya estaba
--    {"producto_id": "...",    "cantidad": 1}]      -- una nueva
--
-- Lo que no aparece en la lista, se quita.
-- ───────────────────────────────────────────────────────────────
create or replace function public.editar_venta_en_caja(
  p_venta_id   uuid,
  p_lineas     jsonb,
  p_cajero_id  uuid default null,
  p_terminal_id uuid default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta    public.venta;
  v_cliente  public.cliente;
  v_ajuste   numeric := 0;
  v_cajero   uuid;
  v_anterior numeric;
  v_cambios  jsonb := '[]'::jsonb;
  v_orden    integer := 0;
  v_item     jsonb;
  v_linea    public.venta_linea;
  v_prod     public.producto;
  v_base     numeric;
  v_cant     numeric;
  v_quedan   uuid[] := '{}';
  v_total    numeric;
begin
  if not app.tiene_permiso('ventas.editar_en_caja') then
    raise exception 'No tenes permiso para corregir ventas en la caja.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % y ya no se puede corregir.', v_venta.estado;
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La venta tiene que quedar con al menos un producto. Si no va nada, anulala.';
  end if;

  v_cajero  := coalesce(p_cajero_id, app.usuario_actual_id());
  v_anterior := v_venta.total;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;

  -- El ajuste de la lista que la venta ya tiene aplicada. Una linea
  -- nueva tiene que entrar con el mismo criterio que las demas, o el
  -- renglon agregado en la caja saldria a un precio distinto del resto.
  if v_venta.lista_precio_id is not null then
    select coalesce(ajuste_porcentaje, 0) into v_ajuste
    from public.lista_precio
    where id = v_venta.lista_precio_id and activo and eliminado_en is null;
    v_ajuste := coalesce(v_ajuste, 0);
  end if;

  for v_item in select * from jsonb_array_elements(p_lineas)
  loop
    v_orden := v_orden + 1;
    v_cant  := (v_item->>'cantidad')::numeric;

    if v_cant is null or v_cant <= 0 then
      raise exception 'Una cantidad tiene que ser mayor que cero. Para sacar el producto, quitalo.';
    end if;

    if v_item ? 'venta_linea_id' and v_item->>'venta_linea_id' is not null then
      -- ── Linea que ya existia: SOLO cambia la cantidad ──
      select * into v_linea from public.venta_linea
      where id = (v_item->>'venta_linea_id')::uuid and venta_id = p_venta_id;

      if v_linea.id is null then
        raise exception 'Una de las lineas no pertenece a esta venta.';
      end if;

      if v_linea.cantidad <> v_cant then
        v_cambios := v_cambios || jsonb_build_object(
          'accion', 'cantidad',
          'descripcion', v_linea.descripcion,
          'antes', v_linea.cantidad,
          'despues', v_cant);
      end if;

      update public.venta_linea
      set cantidad = v_cant, orden = v_orden
      where id = v_linea.id;

      v_quedan := v_quedan || v_linea.id;

    else
      -- ── Linea nueva: el precio lo pone el servidor ──
      select * into v_prod from public.producto
      where id = (v_item->>'producto_id')::uuid and activo and eliminado_en is null;

      if v_prod.id is null then
        raise exception 'El producto que se quiere agregar no existe o esta dado de baja.';
      end if;

      select precio_final into v_base
      from public.calcular_precio(v_prod.id, null, 1, coalesce(v_cliente.descuento_porcentaje, 0));

      insert into public.venta_linea (
        venta_id, orden, producto_id, codigo_producto, descripcion, cantidad,
        precio_original, precio_acordado, precio_unitario, alicuota_iva_id, condicion_iva
      ) values (
        p_venta_id, v_orden, v_prod.id, v_prod.codigo, v_prod.nombre_interno, v_cant,
        v_base, v_base, round(v_base * (1 + v_ajuste / 100), 4),
        v_prod.alicuota_iva_id, 'gravado'
      )
      returning id into v_linea.id;

      v_cambios := v_cambios || jsonb_build_object(
        'accion', 'agregar',
        'descripcion', v_prod.nombre_interno,
        'antes', 0,
        'despues', v_cant);

      v_quedan := v_quedan || v_linea.id;
    end if;
  end loop;

  -- ── Lo que no vino en la lista, se quita ──
  for v_linea in
    select * from public.venta_linea
    where venta_id = p_venta_id and not (id = any(v_quedan))
  loop
    v_cambios := v_cambios || jsonb_build_object(
      'accion', 'quitar',
      'descripcion', v_linea.descripcion,
      'antes', v_linea.cantidad,
      'despues', 0);
  end loop;

  delete from public.venta_linea
  where venta_id = p_venta_id and not (id = any(v_quedan));

  select total into v_total from public.venta where id = p_venta_id;

  /*
    Sin cambios no se anota nada.

    La bandeja de salida reintenta lo que no llego a confirmarse, y esta
    funcion esta hecha para que reintentarla sea inofensivo. Si igual
    dejara un registro por intento, el historial mostraria tres
    ediciones donde hubo una, que es peor que no tenerlo.
  */
  if jsonb_array_length(v_cambios) > 0 then
    insert into public.venta_edicion
      (venta_id, cajero_id, terminal_id, total_anterior, total_nuevo, cambios)
    values (p_venta_id, v_cajero, p_terminal_id, v_anterior, v_total, v_cambios);
  end if;

  return v_total;
end;
$$;

comment on function public.editar_venta_en_caja(uuid, jsonb, uuid, uuid) is
  'Deja la venta con las lineas indicadas. Declarativa para que reintentarla sea inofensiva. No recibe precios: los acordados no se tocan por este camino.';

grant execute on function public.editar_venta_en_caja(uuid, jsonb, uuid, uuid) to authenticated;
