-- ═══════════════════════════════════════════════════════════════
-- 031 — DAR DE BAJA PRODUCTOS
--
-- Faltaba entero: existía el permiso 'productos.eliminar' y una
-- política de RLS, pero ninguna pantalla lo usaba y —peor— el camino
-- que estaba habilitado era el equivocado.
--
-- ── POR QUÉ SE REVOCA EL BORRADO FÍSICO ──
--
-- 'authenticated' tenía DELETE sobre producto. Un borrado físico rompe
-- dos cosas:
--
-- 1) La sincronización con las terminales. El motor baja "lo que cambió
--    desde la última vez"; una fila borrada no cambió, simplemente ya no
--    está. La terminal del mostrador nunca se entera y el producto le
--    queda para siempre en su copia local, vendible. Es exactamente lo
--    que la baja lógica viene a evitar, y está escrito como decisión de
--    arquitectura en docs/ESTADO.md.
--
-- 2) El historial. venta_linea.producto_id está en SET NULL: borrar un
--    producto le saca la referencia a las ventas viejas. El movimiento
--    de stock lo impide (RESTRICT), pero un producto sin movimientos y
--    con ventas quedaría con el historial mutilado.
--
-- La baja lógica no tiene ninguno de los dos problemas: la fila cambia,
-- viaja a las terminales, y el historial queda intacto.
-- ═══════════════════════════════════════════════════════════════

revoke delete on public.producto from authenticated;

drop policy if exists producto_delete on public.producto;

-- ───────────────────────────────────────────────────────────────
-- Dar de baja
--
-- Recibe una lista para poder hacerlo de a uno o en masa con el mismo
-- camino. Devuelve una fila por producto: sobre una selección de
-- doscientos, que uno falle no puede tirar abajo los otros ciento
-- noventa y nueve.
--
-- El stock NO se toca. Si el producto tenía cinco unidades, esas cinco
-- siguen existiendo en el historial: dar de baja es sacarlo del
-- catálogo, no declarar que se evaporó la mercadería. Si de verdad no
-- está, eso es un ajuste de stock y se hace aparte, con su motivo.
-- Pero se avisa, porque dar de baja algo que todavía figura en góndola
-- casi siempre es un error de quien lo está haciendo.
-- ───────────────────────────────────────────────────────────────
create or replace function public.dar_de_baja_productos(p_ids uuid[])
returns table (
  id        uuid,
  codigo    text,
  resultado text,   -- baja | omitido
  detalle   text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     uuid;
  v_prod   public.producto;
  v_stock  numeric;
begin
  if not (select app.tiene_permiso('productos.eliminar')) then
    raise exception 'No tenes permiso para dar de baja productos.';
  end if;

  foreach v_id in array coalesce(p_ids, '{}')
  loop
    select * into v_prod from public.producto p where p.id = v_id;

    if v_prod.id is null then
      id := v_id; codigo := null; resultado := 'omitido';
      detalle := 'El producto no existe.';
      return next; continue;
    end if;

    if v_prod.eliminado_en is not null then
      id := v_id; codigo := v_prod.codigo; resultado := 'omitido';
      detalle := 'Ya estaba dado de baja.';
      return next; continue;
    end if;

    select coalesce(s.cantidad, 0) into v_stock
    from public.stock_saldo s where s.producto_id = v_id;

    update public.producto
       set eliminado_en = now(),
           activo       = false
     where public.producto.id = v_id;

    id := v_id; codigo := v_prod.codigo; resultado := 'baja';
    detalle := case
      when coalesce(v_stock, 0) <> 0
        then format('Se dio de baja con %s de stock todavia registrado.', v_stock)
      else null
    end;
    return next;
  end loop;
end;
$$;

comment on function public.dar_de_baja_productos(uuid[]) is
  'Da de baja productos (baja logica). Nunca borra: la fila cambia y viaja a las terminales, y el historial de ventas y movimientos queda intacto. Avisa si el producto todavia tenia stock.';

grant execute on function public.dar_de_baja_productos(uuid[]) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Restaurar
--
-- Dar de baja de a doscientos con un clic pide poder deshacerlo. Sin
-- esto, un filtro mal puesto obligaría a cargar los productos de nuevo
-- a mano.
-- ───────────────────────────────────────────────────────────────
create or replace function public.restaurar_productos(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_restaurados integer;
begin
  if not (select app.tiene_permiso('productos.eliminar')) then
    raise exception 'No tenes permiso para restaurar productos.';
  end if;

  update public.producto
     set eliminado_en = null,
         activo       = true
   where id = any(coalesce(p_ids, '{}'))
     and eliminado_en is not null;

  get diagnostics v_restaurados = row_count;
  return v_restaurados;
end;
$$;

comment on function public.restaurar_productos(uuid[]) is
  'Deshace la baja de productos. Los vuelve a poner activos y visibles en el catalogo.';

grant execute on function public.restaurar_productos(uuid[]) to authenticated;
