-- Un nombre para llamar al cliente en la caja.
--
-- POR QUE.
-- Sugerencia 15 de Lucas, repetida en la visita del 07/09 despues de
-- verlo funcionar: hoy la cola de la caja muestra "CAJA1-000011 ·
-- Consumidor Final" y el cajero termina cantando un numero.
--
-- POR QUE UNA COLUMNA PROPIA Y NO `observaciones`.
-- Es lo mas corto y seria un error. `observaciones` es lo que se anota
-- SOBRE la venta —"el cliente pasa a buscar el jueves"— y viaja al
-- comprobante. Esto es como se llama a una persona en voz alta durante
-- los diez minutos que la venta espera en la caja: no va impreso en
-- ningun papel, no es un dato del cliente, y deja de importar apenas se
-- cobra. Metidos en el mismo campo, el primero que se use pisa al otro.
--
-- POR QUE NO ES EL NOMBRE DEL CLIENTE DE LA FICHA.
-- Casi todas las ventas del mostrador son a Consumidor Final, que no
-- tiene ficha. Y aun con ficha, "Juan el de la veterinaria" no es el
-- nombre que dice la razon social. Es un apodo de turno, escrito por el
-- vendedor para que el cajero pueda llamarlo.

alter table public.venta
  add column if not exists nombre_para_llamar text;

comment on column public.venta.nombre_para_llamar is
  'Como llamar al cliente en la caja mientras espera. Lo escribe el vendedor al enviar la venta. No se imprime en ningun comprobante.';

-- Se limita el largo por la misma razon por la que existe: entra en un
-- renglon de la cola. Un parrafo ahi no se lee, y el lugar de un
-- parrafo es `observaciones`.
alter table public.venta
  drop constraint if exists venta_nombre_para_llamar_corto;
alter table public.venta
  add constraint venta_nombre_para_llamar_corto
  check (nombre_para_llamar is null or length(nombre_para_llamar) <= 60);
