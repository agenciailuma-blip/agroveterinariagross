/*
  ─────────────────────────────────────────────────────────────
  Proforma y comprobante de entrega

  Propuesta aprobada por Lucas el 13/11
  (docs/propuesta-proformas-y-remitos.md).

  · El comprobante interno pasa a llamarse proforma. Misma clave
    (comprobante_interno) y mismo contador: la numeración sigue, como
    pidió Lucas. Cambian el nombre y la sigla que se imprime.
  · El remito que queda es el logístico (la hoja R).
  · Tipo nuevo: el comprobante de entrega. Sale después de la factura o
    la proforma en cada venta a cuenta corriente o fiada, sin precios,
    para que firme quien retira. No mueve stock: lo movió la venta.

  Compatible con la app publicada: no cambia ninguna firma.
  ─────────────────────────────────────────────────────────────
*/

alter table public.tipo_comprobante_no_fiscal
  drop constraint tipo_comprobante_no_fiscal_clave_check;
alter table public.tipo_comprobante_no_fiscal
  add constraint tipo_comprobante_no_fiscal_clave_check
  check (clave in ('presupuesto', 'remito', 'comprobante_interno', 'comprobante_entrega'));

update public.tipo_comprobante_no_fiscal
set descripcion = 'Proforma', sigla = 'PRO'
where clave = 'comprobante_interno';

update public.tipo_comprobante_no_fiscal
set descripcion = 'Remito logístico'
where clave = 'remito';

insert into public.tipo_comprobante_no_fiscal (clave, descripcion, sigla, mueve_stock, orden)
values ('comprobante_entrega', 'Comprobante de entrega', 'ENT', false, 40)
on conflict (clave) do nothing;

comment on table public.tipo_comprobante_no_fiscal is
  'Los documentos que numera Gross, no ARCA: presupuesto, remito logístico, proforma y comprobante de entrega. Ninguno lleva CAE ni discrimina IVA.';

-- La hoja R nombra la proforma por su nombre nuevo.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.remito_r_de_remito'::regproc) into v_def;
  v_def := replace(v_def, '''Comprobante interno '' ||', '''Proforma '' ||');
  execute v_def;
end;
$$;
