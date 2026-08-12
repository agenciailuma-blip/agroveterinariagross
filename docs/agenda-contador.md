# Consulta al contador — Sistema de gestión Agroveterinaria Gross

**Para:** Armando Monje — Contador de Agroveterinaria Gross
**De:** ILUMA (desarrollo del nuevo sistema de gestión)
**Fecha:** agosto de 2026
**Duración estimada:** 30 a 40 minutos

---

## Contexto

Agroveterinaria Gross (CUIT 20146369767 — ERNESTO HUGO GROSS) está reemplazando su sistema de gestión actual (OBTech) por un sistema propio a medida. El nuevo sistema va a emitir la facturación electrónica directamente contra los web services de ARCA.

**Fecha objetivo de corte:** 26 de octubre de 2026.

Necesitamos su validación en los puntos de abajo antes de construir el módulo fiscal. Todo lo que se defina mal acá se descubre recién cuando ARCA rechaza un comprobante, así que preferimos consultarlo antes.

---

## 1. Puntos de venta 🔴

Este es el punto más importante y el que más suele trabar los proyectos.

En el sistema de ARCA, los puntos de venta tienen una **modalidad** asociada, y no son intercambiables entre sí. Un punto de venta habilitado para *Comprobantes en línea* o para *Controlador Fiscal* **no sirve** para emitir por web service.

Necesitamos:

- **¿Qué puntos de venta tiene habilitados hoy Gross, y con qué modalidad cada uno?**
- **¿Alguno está habilitado para "Factura Electrónica – Web Service (RECE)"?**
- Si no hay ninguno, hay que dar de alta uno con esa modalidad desde *Administración de puntos de venta y domicilios*. ¿Lo gestiona usted o lo hacemos con Lucas?

**Nota sobre la cantidad:** en el nuevo sistema los vendedores arman la venta pero **solo la caja emite comprobantes**, así que en principio alcanza con un único punto de venta. Sugerimos dar de alta **un segundo punto de venta de respaldo**, sin uso habitual, para poder seguir facturando si falla la PC de la caja.

## 2. Comprobantes y alícuotas

- **¿Qué tipos de comprobante emite Gross hoy?** (Factura A, B, C, notas de crédito y débito, recibos)
- **¿Emite comprobantes clase M o con leyenda de retención?**
- **¿Qué alícuotas de IVA maneja?** Entendemos que conviven 21% y 10,5% (varios productos veterinarios y agropecuarios van al reducido). ¿Hay exentos o no gravados?
- **¿Existe algún criterio o listado para saber qué producto va a qué alícuota?** El archivo de productos que exportamos de OBTech puede no traer ese dato, y son unos 3.000 artículos.

## 3. Ingresos Brutos — Misiones 🔴

Nos informaron que Gross es **agente de retención y de percepción** de Ingresos Brutos en Misiones. Esto impacta directamente en cómo se arma cada factura, así que necesitamos el detalle:

- ¿Bajo qué régimen y con qué número de agente?
- **Percepciones:** ¿qué alícuota se aplica, sobre qué base, a qué sujetos? ¿Hay mínimo no sujeto?
- ¿Hay padrón de contribuyentes a consultar, o alícuotas fijas? Si hay padrón, ¿con qué frecuencia se actualiza y en qué formato se descarga?
- ¿Qué sujetos quedan excluidos y cómo se acredita la exclusión?
- **Retenciones:** ¿en qué operaciones corresponde practicarlas?
- ¿Cómo se declaran hoy y qué información necesita usted del sistema para hacerlo?

## 4. Régimen de Transparencia Fiscal (Ley 27.743)

- ¿Confirma que a Gross le corresponde discriminar IVA y la leyenda en los comprobantes a consumidor final?
- ¿Hay alguna particularidad de formato que quiera que respetemos?

## 5. Libro IVA Digital

- ¿Quién lo presenta actualmente, usted o el comercio?
- ¿Qué información necesita recibir del sistema, en qué formato y con qué periodicidad?
- ¿Prefiere un archivo con el formato oficial de ARCA, o una exportación en Excel que usted procesa?

El sistema va a incorporar el registro de compras a proveedores. Queremos que la salida le sirva tal cual, sin retrabajo de su parte.

## 6. Precios según medio de pago

Gross maneja dos precios: **contado** y **tarjeta de crédito** (hasta dos cuotas, con un porcentaje de recargo).

- ¿Cómo corresponde reflejarlo en el comprobante? ¿El recargo va como mayor precio unitario, como concepto aparte, o como interés de financiación?
- ¿Hay que exponer el costo financiero en la factura o en el ticket?
- ¿Alguna precaución respecto de la normativa de defensa del consumidor sobre diferencia de precio por medio de pago?

## 7. Cuentas corrientes y cobranzas

- ¿Qué comprobante corresponde emitir al recibir un pago de cuenta corriente? ¿Recibo oficial, recibo X?
- ¿Hay que numerarlo y declararlo?
- ¿Cómo se documentan las devoluciones? ¿Nota de crédito siempre?

## 8. 🔴 Resguardo de la información de OBTech

Un tema que queremos plantear con tiempo.

La relación comercial con el proveedor del sistema actual está deteriorada: no responden llamados ni correos, aunque el software sigue funcionando mientras se abone. Cuando se corte el servicio en octubre, **es posible que se pierda el acceso al historial de ventas y comprobantes emitidos**.

ARCA exige conservar la documentación respaldatoria por **10 años**.

Nuestras preguntas:

- ¿El sistema de OBTech corre en una máquina del local o en un servidor del proveedor? *(esto define si los datos quedan o desaparecen)*
- ¿Qué considera usted que hay que exportar, imprimir o resguardar **antes** de dar de baja el servicio?
- ¿Alcanza con los libros y comprobantes que ya tiene usted, o hay que recuperar algo del sistema?

**Nuestra recomendación:** hacer ese resguardo ahora, mientras el sistema todavía funciona, y no en octubre.

## 9. Otros

- ¿Gross emite o recibe **facturas de crédito electrónicas MiPyME**?
- ¿Practica o sufre retenciones nacionales de IVA o Ganancias que el sistema deba contemplar?
- ¿Hay algún régimen de información adicional que hoy cumpla y que debamos replicar?

---

## Lo que necesitamos de usted

| # | Punto | Prioridad |
|---|---|---|
| 1 | Estado y modalidad de los puntos de venta | 🔴 Bloqueante |
| 2 | Detalle del régimen de percepciones y retenciones de IIBB Misiones | 🔴 Bloqueante |
| 3 | Criterio de alícuotas de IVA por producto | 🔴 Bloqueante |
| 4 | Formato requerido para el Libro IVA Digital | Alta |
| 5 | Tratamiento del recargo por tarjeta | Alta |
| 6 | Definición del resguardo de datos de OBTech | Alta |
| 7 | El resto | Media |

Los tres primeros condicionan el desarrollo del módulo de facturación. El resto se puede definir en paralelo.

---

## Nuestro compromiso

- El certificado digital de ARCA se emite **a nombre del CUIT de Gross**. ILUMA no accede a la clave fiscal ni opera el sitio de ARCA en ningún momento.
- El sistema queda a nombre de Gross, con los datos exportables en formato estándar en cualquier momento.
- Cualquier salida que usted necesite para su trabajo, la construimos con el formato que nos indique.

**Contacto:** ILUMA — agencia.iluma@gmail.com
