# Proformas, remito logístico y comprobante de entrega — propuesta aprobada

## Qué cambia

Cuatro cosas, que corrigen cómo están armados hoy los comprobantes que no son factura:

1. **El comprobante interno pasa a llamarse proforma.** Es el mismo papel que sale cuando se cobra sin factura, con otro nombre en todo el sistema. La numeración sigue la de los comprobantes internos.
2. **El único remito que queda es el remito logístico**: la hoja R preimpresa, con CAI. Sale sólo de una factura. Los demás remitos desaparecen.
3. **Nace el comprobante de entrega**: en cada venta a cuenta corriente y en cada fiado sale solo, después de la factura o la proforma, y lo firma quien retira la mercadería.
4. **El precio a convenir sale con una proforma**, que avisa que los precios pueden cambiar, y el precio se define después.

## Al cobrar

La pantalla de cobro queda con dos opciones y un botón:

- **Factura** (F9)
- **Proforma** (F11)
- **Cobrar** (F10)

En una venta a **cuenta corriente** o **fiada**, al cobrar se imprime la factura o la proforma y, a continuación, el **comprobante de entrega**. En el ticket de 80 mm sale seguido, en el mismo corte; en hoja A4, en la hoja de atrás.

## El comprobante de entrega

Es la constancia de que la mercadería, o el servicio, se entregó. Lo firma quien vino a buscarla, el empleado o el enviado del cliente, y **queda en el local**. Sale **una copia**; si el cliente pide la suya, se reimprime.

Lleva:

- número propio y fecha;
- el cliente;
- la factura o proforma a la que corresponde, con su nombre completo (por ejemplo «Factura A 0001-00000006»);
- los productos y las cantidades, sin precios;
- firma, aclaración y DNI de quien retira.

Queda registrado en **Comprobantes → Comprobantes de entrega**: se busca por cliente, fecha o número, se reimprime y se le puede adjuntar la foto del papel firmado.

## El remito logístico

Es la hoja R, la que se imprime sobre el formulario de la imprenta con su CAI. Acompaña a la mercadería cuando viaja.

- **Sale sólo de una factura.** Un remito con CAI no puede acompañar mercadería sin factura, así que la proforma no lo ofrece.
- En **cualquier factura** hay un botón **Remito logístico**; en los pedidos mayoristas se ofrece solo, al facturarlos.
- Lleva la **factura asociada con su nombre completo**, para que se vea de un vistazo a qué venta corresponde.
- Queda registrado en **Comprobantes → Remito logístico**, con las hojas usadas, las arruinadas y las que quedan.

## El precio a convenir

Para el cliente al que el precio se le define después.

- En el mostrador, **Precio a convenir** arma una **proforma** con el precio de lista y, al pie, la leyenda **«Los precios están sujetos a modificación»**. Descuenta el stock, va a la cuenta corriente por ese importe y sale con su comprobante de entrega.
- Esas proformas esperan en **Comprobantes → Proformas → A convenir**. Ahí se ponen los precios definitivos, de una o de varias del mismo cliente.
- Al confirmar, la cuenta corriente se corrige por la diferencia y la proforma queda **con precio definido**: se reimprime sin la leyenda. Si en cambio hay que facturarla, desde la misma pantalla sale la factura con esos precios.
- Reemplaza al remito interno, que hoy hace lo mismo pero sale sin precio.

## Lo que desaparece

- **El remito de ticket** («REM …») que hoy sale del reparto y de los pedidos mayoristas. Lo reemplazan el remito logístico y el comprobante de entrega.
- **El remito interno**. Lo reemplaza la proforma a convenir.
- **La pantalla «Comprobantes no fiscales»**, que mezclaba presupuestos, remitos e internos. Se separa en Proformas y Presupuestos.

**No se borra nada de lo ya emitido.** Los remitos y comprobantes internos que ya existen se siguen viendo, buscando y reimprimiendo como estaban.

## Cómo queda el menú Comprobantes

- Facturación (la configuración)
- Facturas emitidas
- Proformas emitidas, con *A convenir*
- Percepciones
- Remito logístico
- Comprobantes de entrega
- Presupuestos

## Lo que se decidió

1. **Precio a convenir:** sigue, con una proforma que lleva la leyenda «Los precios están sujetos a modificación» y un apartado para definir el precio después.
2. **Comprobante de entrega:** en cuenta corriente y también en los fiados.
3. **Copias:** una. Si el cliente pide la suya, se reimprime desde Comprobantes de entrega.
4. **Remito logístico:** en cualquier factura, y solo en los pedidos mayoristas al facturarlos. Nunca desde una proforma.
5. **Numeración de las proformas:** sigue la de los comprobantes internos.

## Tiempos

- **Dos semanas de trabajo.** La mayor parte es el comprobante de entrega (numeración, impresión en ticket y A4, registro), el precio a convenir sobre la proforma, y sacar los remitos viejos sin perder lo ya emitido.
- Las PC reciben el cambio con una actualización, como siempre.
