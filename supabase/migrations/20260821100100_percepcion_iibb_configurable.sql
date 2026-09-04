-- ═══════════════════════════════════════════════════════════════
-- 023 — PERCEPCIÓN DE IIBB MISIONES, CONFIGURABLE
--
-- El contador (Armando Monje, respuesta escrita) confirmó: Gross es
-- agente de PERCEPCIÓN de Ingresos Brutos en Misiones, régimen 14
-- (RG DGR 012/93 y modificatorias), número de agente = el CUIT. NO es
-- agente de retención de IIBB.
--
-- La alícuota (3,31% hoy) y el mínimo no sujeto a percepción los fija
-- la DGR por resolución y pueden cambiar sin aviso. Por eso no se
-- hardcodean: viven en 'configuracion', editables por un
-- administrador desde el sistema, para no depender de una
-- actualización del desarrollador cada vez que cambia la norma.
--
-- Importante: el mínimo es sobre el IMPORTE DE LA PERCEPCIÓN YA
-- CALCULADA, no sobre el monto de la venta. Así lo puso el contador
-- por escrito.
--
-- Regla acordada con Lucas y el contador para el sistema nuevo: se
-- aplica la percepción a TODA Factura A (receptor Responsable
-- Inscripto) cuya percepción calculada supere el mínimo, salvo que el
-- cliente tenga certificado de exclusión/no percepción de la DGR.
--
-- El cálculo en sí (la función que arma comprobante_tributo al emitir)
-- no se escribe en esta migración: es parte del servicio de
-- facturación, todavía bloqueado por el certificado de ARCA. Acá solo
-- queda listo lo que Lucas pidió que fuera configurable desde ya.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- ⚠️ Dato pendiente de confirmar: el contador puso $14.000 por
-- escrito en el cuestionario; Lucas dijo $24.000 en una reunión
-- posterior (2026-08-21). Se carga $24.000 porque es el dato más
-- reciente, pero hay que confirmarlo con el contador antes de la
-- primera factura real y corregirlo acá si hace falta.
-- ───────────────────────────────────────────────────────────────
insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('arca.iibb_percepcion_alicuota', '3.31',
   'Porcentaje de percepción de IIBB Misiones (régimen 14) sobre Factura A. Lo fija la DGR y puede cambiar; no requiere una actualización del sistema.', 'arca'),
  ('arca.iibb_percepcion_minimo', '24000',
   'Percepción de IIBB no practicada si el importe calculado (no el de la venta) no supera este monto. Confirmar con el contador antes de la primera factura: su respuesta escrita decía $14.000.', 'arca');

-- ───────────────────────────────────────────────────────────────
-- Exclusión de percepción de IIBB por cliente
--
-- Un Responsable Inscripto puede tener certificado de exclusión o no
-- percepción de la DGR Misiones. Mientras esté vigente, no se le
-- practica la percepción aunque el cálculo supere el mínimo.
-- ───────────────────────────────────────────────────────────────
alter table public.cliente
  add column iibb_percepcion_excluido        boolean not null default false,
  add column iibb_certificado_numero         text,
  add column iibb_certificado_vigencia_hasta date;

comment on column public.cliente.iibb_percepcion_excluido is
  'Certificado de exclusión/no percepción de IIBB Misiones vigente: no se le practica la percepción aunque la Factura A la supere.';
comment on column public.cliente.iibb_certificado_vigencia_hasta is
  'Hasta cuándo vale el certificado de exclusión. Informativo por ahora: el sistema todavía no vence la exclusión automáticamente al pasar la fecha.';
