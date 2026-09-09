-- Pedir la cantidad al agregar un producto a la venta.
--
-- POR QUE ES UNA CONFIGURACION Y NO UNA DECISION FIJA.
-- Sugerencia 18 de Lucas. Cambia el ritmo de la venta entera: hoy
-- escanear un producto lo agrega con cantidad 1 y el vendedor sigue
-- escaneando; con esto, cada producto abre una pregunta.
--
-- Para el que vende cinco bolsas de alimento es un ahorro enorme. Para
-- el que pasa doce collares distintos es un paso de mas por cada uno.
-- Cual de los dos es el mostrador de Gross no lo sabemos todavia, y la
-- unica forma honesta de averiguarlo es que lo prueben una semana y lo
-- apaguen si molesta — no que nos llamen para que lo cambiemos.
--
-- Arranca ENCENDIDO porque es lo que Lucas pidio. Si el mostrador dice
-- otra cosa, se apaga desde Configuracion sin tocar codigo.

insert into public.configuracion (clave, valor, descripcion, grupo)
values (
  'ventas.pedir_cantidad_al_agregar',
  '1'::jsonb,
  'Al agregar un producto a la venta, preguntar cuantos. Apagado, entra de a uno y se corrige en la lista.',
  'ventas'
)
on conflict (clave) do nothing;
