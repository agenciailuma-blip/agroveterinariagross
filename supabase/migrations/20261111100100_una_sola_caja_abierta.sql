-- ═══════════════════════════════════════════════════════════════
-- UNA SOLA CAJA ABIERTA A LA VEZ
--
-- Va con la versión que cobra desde el mostrador (ver
-- 20261111100000_una_sola_caja_para_el_local.sql). Se aplica el día que
-- se publica esa versión, no antes: con la versión anterior cada caja
-- abre la suya, y con esto la Caja 2 no podría abrir.
--
-- Antes de aplicar, tiene que haber como mucho una caja abierta:
--   select id, terminal_id, abierta_en from public.caja where estado = 'abierta';
-- ═══════════════════════════════════════════════════════════════

drop index if exists public.caja_abierta_unica;
create unique index caja_abierta_unica on public.caja ((true)) where estado = 'abierta';
