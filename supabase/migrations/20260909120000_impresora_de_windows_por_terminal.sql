-- ═══════════════════════════════════════════════════════════════
-- LA IMPRESORA DEL MOSTRADOR ES DE LA MÁQUINA, NO DEL COMERCIO
--
-- Punto 1 de la reunión del 07/09: la impresión por impresora de
-- Windows, que es lo único que traba el mostrador.
--
-- ─── POR QUÉ NO PODÍA QUEDAR EN 'configuracion' ───
--
-- Hasta ahora el sistema guardaba UNA impresora para todo el comercio,
-- en `comercio.impresora_host`. El relevamiento del 07/09 mostró que eso
-- no puede funcionar: la MISMA impresora se llama distinto en cada PC.
-- En la caja es «POS80 Printer», conectada por USB. En los mostradores
-- es «POS80 Printer(2)», la misma compartida desde el equipo de la caja.
-- Un solo nombre para las cuatro PC significa que tres imprimen a una
-- impresora que en su lista no existe.
--
-- El nombre es un dato de la máquina, y la terminal YA es la máquina: se
-- elige una vez por PC y define el prefijo de numeración. Además la fila
-- entera viaja al almacenamiento local cuando se elige, así que el
-- nombre está disponible sin internet — que es justo cuando el mostrador
-- más necesita entregar un ticket.
--
-- ─── POR QUÉ NO SE ESCRIBE A MANO ───
--
-- Se elige de la lista que informa Windows. Los nombres reales no se
-- adivinan: llevan «(2)», el nombre del equipo, o un espacio de más. Un
-- nombre mal tipeado no avisa nada al guardarse: falla recién el día que
-- hay que entregarle un comprobante a un cliente.
--
-- Vacío significa «esta PC no imprime tickets», y el comprobante sale
-- por el diálogo de impresión de Windows como hasta ahora. Nunca puede
-- pasar que no haya forma de entregarle algo al cliente.
-- ═══════════════════════════════════════════════════════════════

alter table public.terminal
  add column if not exists impresora_windows text;

comment on column public.terminal.impresora_windows is
  'Nombre exacto de la impresora instalada en Windows en esa PC (por ejemplo «POS80 Printer»). Se elige de la lista que informa Windows, no se escribe a mano. Vacío = esa terminal no imprime tickets.';
