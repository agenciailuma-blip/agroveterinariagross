/*
  ─────────────────────────────────────────────────────────────
  Los productos asociados

  Fase 03, punto 3. Un secadero o una empresa de fumigación se lleva
  repuestos, alimento y medicamentos, y quiere una sola factura que diga
  «Repuestos pulverizadora». La venta guarda los productos reales —el
  stock, la caja y el IVA salen de ellos— y cada renglón dice bajo qué
  concepto se muestra. Al imprimir, los renglones del mismo concepto se
  juntan en uno, por el total.

  A ARCA no le van los renglones sino los totales por alícuota, que
  siguen saliendo de los productos reales. Si un concepto junta
  productos de distinta alícuota, la factura muestra un renglón por
  alícuota.

  ─── LOS CONCEPTOS ───

  Una lista en la configuración, que el administrador edita. Se guarda
  el nombre en el renglón y no una referencia: si mañana el concepto se
  renombra o se saca de la lista, la factura que ya salió sigue diciendo
  lo que dijo.
  ─────────────────────────────────────────────────────────────
*/

alter table public.venta_linea
  add column concepto text
  constraint venta_linea_concepto_valido check (concepto is null or length(btrim(concepto)) between 1 and 60);

comment on column public.venta_linea.concepto is
  'Productos asociados: el concepto bajo el que se imprime este renglón. Los del mismo concepto salen juntos, por el total.';

insert into public.configuracion (clave, valor, descripcion, grupo)
values (
  'ventas.conceptos_asociados',
  '["Repuestos pulverizadora", "Fumigación", "Veneno"]'::jsonb,
  'Los conceptos bajo los que se pueden asociar productos en el mostrador.',
  'ventas'
)
on conflict (clave) do nothing;
