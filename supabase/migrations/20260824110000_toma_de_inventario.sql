-- ═══════════════════════════════════════════════════════════════
-- 029 — TOMA DE INVENTARIO POR SECTORES
--
-- Las tablas ya existían desde la migración de stock. Esto agrega lo
-- que hace falta para operarlas desde una pantalla, y corrige cómo se
-- calcula el ajuste al cerrar.
--
-- ── EL ARREGLO QUE IMPORTA ──
--
-- cerrar_inventario() forzaba el saldo al número contado:
--
--     ajuste = contada - saldo_al_momento_de_cerrar
--
-- Eso está bien si el local está cerrado mientras se cuenta. Gross va a
-- contar con el local abierto, de a sectores, en los ratos tranquilos
-- (así se acordó en el alcance). Y ahí ese cálculo borra las ventas que
-- pasaron entre el conteo y el cierre:
--
--     Se cuentan 10 unidades a las 10:00 (el sistema decía 12).
--     A las 11:00 se vende 1 → el sistema queda en 11.
--     Al cerrar a las 12:00 se fuerza a 10.
--     Pero físicamente quedan 9: se contaron 10 y se vendió 1.
--
-- La unidad vendida reaparece en el stock. Se descubre en el próximo
-- conteo, cuando ya nadie se acuerda.
--
-- El cálculo correcto usa la diferencia detectada AL CONTAR, no el
-- saldo final:
--
--     ajuste = contada - cantidad_sistema (la foto del momento del conteo)
--
-- Con el ejemplo: ajuste = 10 - 12 = -2. Saldo final = 11 - 2 = 9. ✓
--
-- Por eso cantidad_sistema tiene que quedar bien grabada al contar, y
-- por eso registrar_conteo() la toma sola en vez de confiar en que la
-- pantalla la mande.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Registrar el conteo de un producto
--
-- Recontar el mismo producto pisa el conteo anterior en vez de sumar
-- otra línea: en el mostrador se recuenta cuando se duda, y dos líneas
-- para el mismo artículo harían un ajuste del doble.
-- ───────────────────────────────────────────────────────────────
create or replace function public.registrar_conteo(
  p_inventario_id uuid,
  p_producto_id   uuid,
  p_cantidad      numeric
)
returns numeric   -- el saldo que el sistema tenía, para mostrar la diferencia
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sistema numeric;
  v_usuario uuid;
begin
  if not exists (select 1 from public.inventario i
                 where i.id = p_inventario_id and i.estado = 'abierto') then
    raise exception 'La toma de inventario no está abierta.';
  end if;

  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad contada no puede ser negativa.';
  end if;

  select coalesce(s.cantidad, 0) into v_sistema
  from public.stock_saldo s where s.producto_id = p_producto_id;
  v_sistema := coalesce(v_sistema, 0);

  select app.usuario_actual_id() into v_usuario;

  insert into public.inventario_linea
    (inventario_id, producto_id, cantidad_sistema, cantidad_contada, contado_por, contado_en)
  values
    (p_inventario_id, p_producto_id, v_sistema, p_cantidad, v_usuario, now())
  on conflict (inventario_id, producto_id) do update
    set cantidad_contada = excluded.cantidad_contada,
        -- La foto del sistema se refresca también: vale la del último
        -- conteo, que es contra la que se va a ajustar.
        cantidad_sistema = excluded.cantidad_sistema,
        contado_por      = excluded.contado_por,
        contado_en       = excluded.contado_en;

  return v_sistema;
end;
$$;

comment on function public.registrar_conteo(uuid, uuid, numeric) is
  'Registra o corrige el conteo de un producto en una toma abierta. Guarda el saldo del sistema al momento de contar, que es contra el que se calcula el ajuste al cerrar.';

grant execute on function public.registrar_conteo(uuid, uuid, numeric) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Cerrar la toma — ahora ajustando por la diferencia del conteo
-- ───────────────────────────────────────────────────────────────
create or replace function public.cerrar_inventario(p_inventario_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ajustes integer := 0;
  v_usuario uuid;
begin
  if not exists (select 1 from public.inventario
                 where id = p_inventario_id and estado = 'abierto') then
    raise exception 'El inventario no existe o ya no está abierto.';
  end if;

  select app.usuario_actual_id() into v_usuario;

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id, operador_id)
  select
    l.producto_id,
    'inventario',
    -- La diferencia encontrada al contar, no contra el saldo de ahora.
    -- Así lo que se vendió mientras se contaba sigue descontado.
    l.cantidad_contada - l.cantidad_sistema,
    'Ajuste por toma de inventario',
    'inventario',
    p_inventario_id,
    v_usuario,
    l.contado_por
  from public.inventario_linea l
  where l.inventario_id = p_inventario_id
    and not l.aplicado
    and l.cantidad_contada <> l.cantidad_sistema;

  get diagnostics v_ajustes = row_count;

  update public.inventario_linea
    set aplicado = true
    where inventario_id = p_inventario_id and not aplicado;

  update public.inventario
    set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_usuario
    where id = p_inventario_id;

  return v_ajustes;
end;
$$;

comment on function public.cerrar_inventario(uuid) is
  'Cierra una toma y genera un ajuste por cada diferencia encontrada AL CONTAR (contada - cantidad_sistema). No usa el saldo del momento del cierre, para no borrar las ventas ocurridas mientras se contaba.';

-- ───────────────────────────────────────────────────────────────
-- Lo que el cajero ve mientras cuenta y antes de cerrar
--
-- security_invoker: sin esto la vista ignora las políticas RLS de las
-- tablas que consulta y se convierte en una puerta lateral.
-- ───────────────────────────────────────────────────────────────
create or replace view public.vista_inventario_linea
with (security_invoker = true) as
select
  l.id,
  l.inventario_id,
  l.producto_id,
  p.codigo,
  p.nombre_interno,
  p.unidad_medida,
  l.cantidad_sistema,
  l.cantidad_contada,
  l.cantidad_contada - l.cantidad_sistema as diferencia,
  l.contado_en,
  u.nombre                                as contado_por_nombre,
  l.aplicado,
  -- Para valorizar el faltante: lo que cuesta reponer lo que no está.
  p.costo,
  round((l.cantidad_contada - l.cantidad_sistema) * coalesce(p.costo, 0), 2) as diferencia_valorizada
from public.inventario_linea l
join public.producto p on p.id = l.producto_id
left join public.usuario u on u.id = l.contado_por;

comment on view public.vista_inventario_linea is
  'Líneas de una toma de inventario con la diferencia calculada y valorizada al costo.';

grant select on public.vista_inventario_linea to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Resumen por toma, para el listado
-- ───────────────────────────────────────────────────────────────
create or replace view public.vista_inventario
with (security_invoker = true) as
select
  i.id,
  i.nombre,
  i.sector,
  i.estado,
  i.abierto_en,
  i.cerrado_en,
  i.observaciones,
  ua.nombre as abierto_por_nombre,
  uc.nombre as cerrado_por_nombre,
  (select count(*) from public.inventario_linea l where l.inventario_id = i.id) as contados,
  (select count(*) from public.inventario_linea l
    where l.inventario_id = i.id and l.cantidad_contada <> l.cantidad_sistema) as con_diferencia,
  (select coalesce(sum(round((l.cantidad_contada - l.cantidad_sistema) * coalesce(p.costo, 0), 2)), 0)
     from public.inventario_linea l
     join public.producto p on p.id = l.producto_id
    where l.inventario_id = i.id) as diferencia_valorizada
from public.inventario i
left join public.usuario ua on ua.id = i.abierto_por
left join public.usuario uc on uc.id = i.cerrado_por;

comment on view public.vista_inventario is
  'Tomas de inventario con cuántos productos se contaron, cuántos dieron diferencia y cuánto representa esa diferencia al costo.';

grant select on public.vista_inventario to authenticated;
