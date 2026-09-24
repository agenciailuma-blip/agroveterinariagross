-- ═══════════════════════════════════════════════════════════════
-- EL CAEA SE PUEDE BAJAR A LA TERMINAL
--
-- 🔴 Esto estaba roto desde el 18/09 y no se veía.
--
-- La terminal baja cada tabla maestra filtrando por actualizado_en, que
-- es el cursor. La tabla `caea` no tiene esa columna, así que el pedido
-- volvía con «column caea.actualizado_en does not exist» y la bajada
-- se cortaba ahí.
--
-- Lo que eso rompía, en orden de gravedad:
--
--   · El CAEA no llegaba nunca a la máquina. Es lo único que permite
--     facturar durante un corte de internet, y tiene que estar ANTES
--     del corte: pedirlo también necesita internet.
--   · Lo que viene después en la lista tampoco bajaba: la numeración
--     desde la que emite la terminal sin conexión, y los saldos de
--     cuenta corriente.
--   · Y no se veía, porque el aviso al servidor sólo se manda cuando la
--     sincronización termina bien. Desde el servidor, la terminal
--     parecía simplemente «sin sincronizar hace rato».
--
-- La columna se agrega como en todas las demás tablas maestras, con el
-- disparador que la mantiene. Las filas que ya existen arrancan con la
-- fecha en que se pidió el CAEA, no con `now()`: así una terminal que
-- ya bajó hasta cierto cursor no se lo trae de nuevo por nada. (fecha_proceso
-- no sirve para esto: es texto, el formato de fecha de ARCA.)
-- ═══════════════════════════════════════════════════════════════
alter table public.caea
  add column actualizado_en timestamptz not null default now();

update public.caea
set actualizado_en = coalesce(informado_en, solicitado_en, now());

create trigger caea_actualizado_en
  before update on public.caea
  for each row execute function app.set_actualizado_en();

comment on column public.caea.actualizado_en is
  'Cursor de bajada a las terminales. Sin esta columna, la terminal no puede bajar el CAEA y no puede facturar durante un corte.';
