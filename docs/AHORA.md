---
actualizado: 2026-10-29
estado: en curso
---

# AHORA

> **Empezá por acá.** Una página. Todo lo demás se lee **sólo si hace falta**, siguiendo un enlace.
> Corte: **el 26/10 no se llegó**; se pidió **una semana más** (hasta el **2 de noviembre**) para practicar y terminar el proceso. **En noviembre se pasa a soporte** de las fases 1 y 2, y en paralelo la **Fase 03**, que se cobra aparte y **empieza por Mayorista**: [`fase-03.md`](fase-03.md).

---

## Dónde está todo, hoy

**Publicada: 0.19.3** (29/10, 15:39), verificada en Cloudflare: `latest.json` dice 0.19.3, el instalador está publicado y la versión web ya trae la pestaña. **La pestaña *Vencidos* en Clientes**: quién debe algo vencido, cuánto y desde hace cuántos días, con cada comprobante y lo que le queda impago. Tocar el cliente abre su cuenta corriente. Ver *Lo último que pasó*. **770 pruebas verdes en la app.**

**Publicada: 0.19.2** (29/10, 15:15), verificada en Cloudflare: `latest.json` dice 0.19.2, el instalador está publicado y la versión web ya trae el PIN del encargado en la caja. **El freno al vencido, en el mostrador y la caja**: el mostrador avisa al elegir un cliente con deuda vencida, y la caja no le cobra a cuenta corriente hasta que un encargado pone su PIN; con o sin conexión. Ver *Lo último que pasó*. **766 pruebas verdes en la app.**

**Publicada: 0.19.1** (29/10, 12:05), verificada en Cloudflare: `latest.json` dice 0.19.1, el instalador está publicado y la versión web ya trae el freno. **El freno al cliente mayorista con deuda vencida**: su pedido no se factura hasta que un encargado lo autoriza, con un clic o con su PIN. Y **Productos ya no baja hasta una zona vacía** con la ficha abierta. Ver *Lo último que pasó*. **756 pruebas verdes en la app.**

**Publicada: 0.19.0** (29/10, 11:27), verificada en Cloudflare: `latest.json` dice 0.19.0. **La orden de recibo y el recibo numerado**: Facundo anota en el teléfono lo que le pagaron —también sin señal— y en el local, cuando confirman que entró la plata, sale el recibo con número, baja la deuda y se le manda por mail al cliente. El mismo recibo sale en toda cobranza de cuenta corriente, y hay un registro en *Clientes → Recibos*. Y **el mail del pedido**: apenas el pedido de Facundo llega al local, al cliente le llega el detalle. **La base y la función del mail ya están en el servidor.** Ver *Lo último que pasó*. **753 pruebas verdes en la app.**

**Publicada: 0.18.0** (28/10, a la noche), verificada en Cloudflare: `latest.json` dice 0.18.0 y el instalador está publicado. La primera subida falló del lado de Cloudflare («Internal authentication error», y después no podía leer la cuenta al iniciar sesión); se reintentó sólo la subida, sin volver a compilar. — **Mayorista, la primera entrega**, para que Facundo salga a la calle la semana del 2/11: el rol *Vendedor de calle*, los clientes mayoristas por ruta, la lista de precios mayorista y el pedido que se arma en el teléfono —también sin señal— y en el local se corrobora, se factura o sale con comprobante interno, y se remite. **La base ya está aplicada**, y la consulta de CUIT a ARCA ya deja entrar al vendedor de calle; la app ya está publicada. Ver *Lo último que pasó*. **736 pruebas verdes en la app.**

**Publicada: 0.17.2** (22/10) — **la ventana de *Buscar fotos* ya se desplaza**. Visto en el local: con diez fotos por producto la ventana pasaba el alto de la pantalla y no había forma de bajar ni de llegar a *Guardar*. Era cómo se centraba —una grilla, donde el alto máximo no se aplica—; ahora se centra con flex y la lista se desplaza. *Subir fotos* estaba armada igual y quedó igual de arreglada. Medido: en una pantalla de 768 px la ventana medía 1.802; ahora 752, con los botones a la vista, y a 375 px también.

**Publicada: 0.17.1** (22/10, 10:34), verificada en Cloudflare: `latest.json` dice 0.17.1. 🟡 **Falta que cada PC del local se actualice** con *Actualizar ahora* y buscar «cred» en el Mostrador — **a las PC del local les faltaban 351 productos y 384 clientes**, y por eso el mostrador no encontraba Credelio. Con internet o sin él, el mostrador busca en la copia de la PC, y la sincronización perdía filas que habían cambiado en el mismo instante. Arreglado; **al actualizarse, cada PC vuelve a bajar el catálogo y los clientes enteros, sola**. Ver *Lo último que pasó*. **722 pruebas verdes en la app.**

**Publicada: 0.17.0** (21/10, a la noche), verificada en Cloudflare: `latest.json` dice 0.17.0 y el isotipo del mail está publicado. **La factura por mail**: el botón *Mandar por mail* en la factura y el envío solo al facturar un pedido de la tienda, con la factura en PDF y el mail con la marca. **A los clientes empieza a llegar cuando se verifique el dominio en Resend** (ver *Lo último que pasó*). **718 pruebas verdes en la app.**

**Publicada: 0.16.9** (21/10, 17:36), verificada en Cloudflare. *Descargar planilla* en Productos, Clientes y Proveedores, y la importación de la ficha de proveedores.

**Publicada: 0.16.8** (21/10, 16:49), verificada en Cloudflare: `latest.json` dice 0.16.8. **El inscripto también puede salir con comprobante interno** en la Caja, y **Productos → *Buscar fotos***. ✅ Visto en pantalla.

**Publicada: 0.16.7** (19/10, 17:52), verificada en Cloudflare: `latest.json` dice 0.16.7. **Reemplaza a la 0.16.6, que no se publicó**: lleva todo lo de la 0.16.6 más **lo que salió de la reunión con Zubu** —**cómo paga cada pedido de la tienda** (Mercado Pago, transferencia o efectivo), **los productos sólo para consultar** y **las fotos de los productos**— y el arreglo de la foto quitada. **También lleva *empezar de nuevo cuando el servidor lo pide*** ([`sync.ts`](../app/src/lib/local/sync.ts)), que estaba sin guardar en la carpeta cuando se construyó: se guardó después, en un commit aparte, y **`main` quedó igual a lo publicado**. Ver *Lo último que pasó*. **677 pruebas verdes en la app.**

**Construida: 0.16.6** (19/10, a la tarde) — **falta publicarla**. **Facturas emitidas y Percepciones**, dos pestañas nuevas en Comprobantes para buscar por fecha, cliente y número, con el total al pie, el Excel y el listado impreso; **el ticket más corto** —el QR más chico y sin la leyenda de la agencia—; y **el importador que dice antes qué va a hacer** y deja elegir qué tocar. Ver *Lo último que pasó*. **653 pruebas verdes en la app.** Lo que vive en la base (la vista de búsqueda y la importación de clientes) **ya está aplicado y andando**.

✅ **Productos y clientes reales, cargados** (19/10, a la noche): **2.281 productos y 2.494 clientes de OBTech**, con el importador nuevo. Los de prueba quedaron **dados de baja**, no borrados: las ventas y facturas de prueba siguen ahí hasta la limpieza completa, que se hace en otro momento. Ver *Lo último que pasó* y *Lo que sigue*.

**Publicada: 0.16.5** (19/10, 10:17), verificada en Cloudflare: `latest.json` dice 0.16.5. **Sin internet, el sistema ya no se traba**: la venta llega a la caja enseguida y las pantallas aparecen al instante. Era lo que se vio en el local el 16/10 —la venta llegaba diez segundos tarde o más, abrir Caja o Mostrador tardaba, cobrar e imprimir también—. Ver *Lo último que pasó*. **624 pruebas verdes en la app.**

**Publicada: 0.16.4** (15/10, 17:32), verificada en Cloudflare: `latest.json` dice 0.16.4. Es la 0.16.3 más **la Caja y el Mostrador que entran en un teléfono**. Hace falta porque la 0.16.3 **se publicó a las 17:14, mientras esos cambios estaban a medio hacer** en la carpeta: lo instalado no coincide con ningún commit. La 0.16.4 sale de `main` limpio.

**Publicada: 0.16.3** (15/10, 17:14), verificada en Cloudflare. *Tienda online* ya no aparece para elegir al cobrar, la lista de Productos no se aplasta al lado de la ficha, y la tabla del Mostrador se acomoda a su ancho, y en *Precios* la casilla del arqueo de una tarjeta queda apagada. Y **el guion de la prueba del corte suma lo de octubre**. Ver *Lo último que pasó*. **618 pruebas verdes en la app.**

✅ **La Caja y el Mostrador entran en un teléfono** (15/10, después de construir la 0.16.3: va en la próxima). Por debajo de 1024 px se apilan; desde 1024, iguales. Medidas en seis anchos, nada se desplaza. Ver *Lo último que pasó*.

✅ **La *Tarjeta de crédito* ya no entra al arqueo**, y la base no deja volver a tildarlo en una tarjeta (15/10). Está en el servidor: llega a las PC del local con la próxima sincronización, sin actualizar nada. Ver *Lo último que pasó*.

**Publicado: 0.16.2** (15/10, a la tarde). **Una venta ya no puede salir con dos facturas autorizadas en ARCA**: un pedido de CAE por vez en cada serie, y antes de renumerar se le pregunta a ARCA si ese número ya es de esta venta. Eso vive en el servidor y **ya está andando para todas las PC**, sin actualizar nada; la 0.16.2 sólo cambia el botón de la Caja, que mientras espera el CAE dice *Cobrada · facturando…* y no *Cobrando…*. Probado contra ARCA de homologación (ver *Lo último que pasó*). **613 pruebas verdes en la app**, 111 migraciones aplicadas. Verificado en Cloudflare: `latest.json` dice 0.16.2, firmada.

**Publicado: 0.16.1** (14/10, a la tarde). **La factura ya no se corta a los doce segundos** cuando ARCA tarda: la app espera 35 s a las funciones de ARCA y no se da por desconectada mientras tanto. Probado con ARCA de homologación (ver *Lo último que pasó*). Las PC del local la toman con *Actualizar ahora*. **596 pruebas verdes en la app.**

**Publicado: 0.16.0** (12/10, a la noche). **El pedido a proveedor de punta a punta** —Compras → *Pedidos*, con el mínimo de cada proveedor, y la recepción de la factura que trae el pedido y dice qué no vino— **y la planilla de productos con el mínimo, la suelta, el peso y las unidades por bulto** (ver *Lo último que pasó*). Las PC del local la toman con *Actualizar ahora*. **589 pruebas verdes en la app**, 108 migraciones aplicadas.

**Publicado: 0.15.0** (09/10), con **los avisos de stock en sus tres niveles** —una pestaña nueva en Stock, *Avisos*— y **el historial de movimientos de cada producto**, que eran los dos huecos que quedaban del alcance de V1-A, y con **la orden de compra interna** con el modelo de Lucas. Ver *Lo último que pasó*. **552 pruebas verdes en la app**, 101 migraciones aplicadas. Antes, la **0.14.0** (08/10), con **la caja y la suelta**: se carga la caja como llega y, cuando se vende una pastilla y no quedan sueltas, el sistema abre una caja solo —también en tres niveles, caja, tableta y pastilla—. Era el tercer hueco del alcance de V1-A. Ver *Lo último que pasó*. **538 pruebas verdes en la app**, 97 migraciones aplicadas. Antes, la **0.13.4** (05/10), con **los atajos de teclado** —propuesta para que Lucas la revise—, **el Enter del teclado numérico que pasa de campo** en los formularios de carga y **la venta que llega entera y enseguida a la caja sin internet**. Ver *Lo que sigue*, puntos 7 y *Lo primero de todo*. Antes, la **0.13.3** (01/10), con **los datos del cliente traídos de ARCA con el CUIT** —ficha, mostrador, verificación masiva y pedidos web; ver *Lo que sigue*, punto 14— y los arreglos de Cheques y Calendario vistos en pantalla. Antes, ese mismo día, la **0.13.2**, con **la venta que llega a la caja sin internet funcionando en el local** —probada con las dos PC y el módem desenchufado— y los tres arreglos que salieron de esa prueba. Ver *Lo último que pasó*. **527 pruebas verdes en la app**, 96 migraciones aplicadas.

Antes, la **0.13.0** (01/10), con **los cheques y el calendario de recibos** —sección nueva, Tesorería—, **el historial de costos por proveedor** y **el CBU del proveedor**, con el manual en PDF actualizado.

Antes, la 0.12.0 (30/09), con **el menú en nueve secciones**, Configuración en pestañas y ninguna pantalla que se desplace hacia el costado; antes, ese mismo día, la 0.11.0 con **mover mercadería entre depósitos** y el stock de cada uno; antes, la 0.10.0 (28/09), con la importación de clientes con su saldo y de los saldos de proveedores; antes, la 0.9.0 ese mismo día, con *Factura después* y *Cajas y mostradores*; antes, la 0.8.0 ese mismo día, con la recepción de mercadería, las cuentas de proveedores y la percepción en la caja. Antes, la 0.7.0 (25/09), con **la pantalla Pedidos web**: preparar, facturar, entregar y cancelar lo que entra de la tienda. Antes, la 0.6.0 (24/09), con **«Vender online»** —qué productos salen a la tienda web se decide desde Productos— y con **el arreglo de la sincronización que impedía que el CAEA llegara a las máquinas**. Antes, la 0.5.0 con **la factura que sale sin internet** —la caja emite con CAEA y el ticket sale solo—. Antes, la 0.4.4 con la red del local que ahora **dice qué le pasa**, el cortacircuito que hace que la Caja abra rápido sin internet, y la cola de la caja que se actualiza al cambiar el medio de pago. Antes, ese mismo día, la 0.4.2 con el recargo por cuotas arreglado, los acentos del ticket y la impresión automática al cobrar. **La 0.4.1 quedó instalada en el local el 17/09, en todas menos la de Windows 7** — las versiones nuevas entran solas con *Actualizar ahora*. **470 pruebas verdes en la app y 11 en el programa**, 92 migraciones aplicadas.

**Y la API de la tienda online.** Leer el catálogo desde el 18/09; **mandar pedidos desde el 24/09**; **preguntar en qué está cada pedido desde el 25/09**. Zubu ya tiene su clave y su documentación, en la **versión 5** desde el 19/10: fotos, productos sólo para consultar y cómo paga cada pedido. Del lado del local, **la pantalla Pedidos web**, publicada en la 0.7.0 el 25/09. Ver abajo.

⚠️ **Lo que está construido pero NO verificado.** Un chat nuevo no puede darlo por probado:

| Qué | Cómo se verifica |
|---|---|
| **La factura 0009-00000001, emitida con CAEA en el local el 01/10** | 🟡 Quedó en la cola de la caja: el servidor la rechazaba por un permiso que faltaba, **ya agregado**. Sube sola la próxima vez que se abra el sistema en la caja con internet. Se comprueba en Comprobantes → Facturación: deja de decir *Falta subir* |
| **La caja que sigue escuchando después de volver internet** (0.13.2) | 🟡 Arreglado y probado en esta PC, **no en el local**. Se comprueba actualizando la caja y el mostrador a la 0.13.3, abriendo varias pantallas con internet y mirando que *La red del local* siga diciendo **Escuchando ahora: Sí** |
| ~~Cheques: depositar, debitar, devolver y deshacer~~ | ✅ **Vistos en pantalla el 01/10**, los cuatro, y Cheques y Calendario a 375 px. Calendario se desplazaba 13 px a lo ancho en el celular: corregido y publicado en la 0.13.3 |
| ~~La impresión por impresora de Windows~~ | ✅ **Imprimió el 17/09**, y el 01/10 el ticket salió solo al cobrar, con *Régimen* y *Alícuota* bien escritos y sin el `$á` |
| ~~La venta que llega a la caja sin internet~~ | ✅ **Funcionó en el local el 01/10**, con la 0.13.1. Llega lenta, de a partes: para mejorar más adelante |
| ~~El actualizador de punta a punta~~ | ✅ **El 01/10**, caja y mostrador pasaron a la 0.13.1 con *Actualizar ahora*, sin desinstalar nada |
| ~~Facturar sin internet, con CAEA~~ | ✅ **El 01/10**: la caja cobró sin internet y salió el ticket con el CAEA y su vencimiento. Falta que suba (primer renglón) |
| ~~Que la sincronización llegue completa en las PC del local~~ | ✅ **El 01/10**: caja y mostrador con *Copia local lista* y sin errores en el diagnóstico |
| ~~Las pantallas de **La red del local** y **Percepciones**~~ | ✅ **Vistas el 11/09.** Percepciones entera, con datos de agosto y el caso de la nota de crédito. De La red del local sólo se puede ver en el navegador el aviso de que hace falta el programa instalado: es así a propósito |

🟡 **`cargo test` falla en esta máquina, y ya se sabe por qué: hay tres antivirus instalados.** Norton Security y Avast conviven con Windows Defender —que quedó desactivado, porque los otros dos le sacaron el control—. Cada `.exe` que el compilador crea lo intercepta el antivirus antes de que termine de escribirse, y el enlazador falla con `LNK1104`, «no se puede abrir el archivo». El archivo, efectivamente, no está: lo hicieron desaparecer.

> **Por eso engaña:** el mensaje hace pensar que algo tiene tomado el ejecutable, y no hay nada tomado. Se descartaron una por una: espacio en disco, permisos, procesos abiertos, el reparto de trabajo del compilador y el modo release. **Las 9 pruebas pasan** —se corrieron hoy dos veces— pero hay que reintentar hasta que el antivirus deje pasar una.
>
> 🔧 **Se arregla en un minuto y no lo puede hacer el sistema:** agregar `app/src-tauri/target` a las exclusiones de Norton y de Avast. **Y conviene desinstalar dos de los tres**: tres antivirus a la vez se pisan entre ellos, no protegen más y hacen lenta la máquina.

## Lo primero de todo

📋 **El guion de la prueba del corte** está en una página propia: https://claude.ai/artifact/2LjCRbUhEr8RPvmQRG8keD — los doce puntos de terminado del alcance, cinco controles previos y cinco pruebas de lo que se sumó, cada uno con sus pasos, cuándo sale bien, y botones para marcar *Anduvo* / *Falló* con una nota. **Los resultados quedan guardados** y se leen desde acá (colección `resultados`, un documento por punto: `a1`…`a5`, `p01`…`p12`, `e1`…`e5`, y desde el 15/10 `o1`…`o7`). Es privada: para que Lucas marque, se la comparte como *Colaborador*.

✅ **Los tres huecos del alcance de la fase 1-A, cerrados.** Los dos primeros se encontraron al armar el guion (05/10) y se cerraron el 09/10; el tercero, el 08/10. **Ninguno está en el guion de la prueba del corte** —los doce puntos no los nombran o los nombran de pasada—: conviene sumar las tres pruebas.
- ~~**Umbrales de stock por categoría y general — no hay pantalla para cargarlos.**~~ ✅ **Stock → Avisos, en la 0.15.0.** El sistema los usa (hay uno para Antiparasitarios: bajo 5, crítico 2), pero sólo se pueden poner producto por producto, en su ficha. El punto 11 de terminado y el punto 4 del alcance («configurables en tres niveles: general, por categoría y por producto») lo piden.
- ~~**El historial de movimientos de stock de un producto — no hay pantalla.**~~ ✅ **En Stock —tocando el nombre— y en la ficha, en la 0.15.0.** Cada movimiento se guarda con quién y cuándo, pero no se ve en ningún lado. El punto 2 de terminado («el movimiento queda con usuario y hora») y el punto 4 del alcance («con historial de cómo llegó a ese número») lo piden.
- ~~**La venta fraccionada — la caja y la unidad suelta.**~~ ✅ **Hecha el 08/10 y publicada en la 0.14.0.**

🟡 **Actualizar la caja y el mostrador a la 0.13.4** la próxima vez que se vaya al local, y abrir el sistema en la caja con internet para que suba la factura 0009-00000001. Hasta actualizar, **si se corta internet, cerrar y abrir el sistema en la caja** antes de vender: la 0.13.1 puede haber dejado de escuchar sin avisar.

🟡 **Lo que la venta tardaba en llegar a la caja sin internet** — arreglado el 05/10 y publicado en la 0.13.4, **sin probar en el local**. El mostrador le pasaba las ventas a la caja una vez por minuto, y la caja miraba su cola cada ocho segundos: hasta 68 segundos con el cliente esperando. Y llegaba de a partes porque, mientras la cabecera intentaba subir al servidor —hasta doce segundos sin internet—, salían los renglones solos. Ahora la venta sale al segundo y medio de apretar *Enviar a caja* (y otra vez a los catorce, por si el intento de subir tardó), viaja entera o espera entera, y la caja la muestra apenas llega. Se comprueba en el próximo corte: la venta tiene que aparecer en la caja en un par de segundos y completa.

---

## Lo último que pasó — 29 de octubre: la pestaña *Vencidos* en Clientes

**Fase-03, punto 1, ⑤:** el listado de «qué comprobantes vencieron, de quién». Publicada en la 0.19.3.

- **En Clientes, arriba de la búsqueda, *Todos* y *Vencidos*.** En *Vencidos* aparece un bloque por cliente con lo que debe vencido, desde hace cuántos días y el teléfono; debajo, cada comprobante con la fecha en que venció y lo que le queda impago (y de cuánto era, si ya pagó una parte). Primero el que debe desde hace más tiempo; a igual atraso, el que debe más. La búsqueda filtra por nombre.
- **Tocar el cliente abre su cuenta corriente**, que es donde se le cobra. Al cobrar, la lista se actualiza.
- **Los números son los mismos en todo el sistema:** los pagos se descuentan de lo más viejo, igual que en la deuda por antigüedad de Reportes y en el freno de la caja. Probado en la base con un cliente inventado, con todo deshecho al final: tres facturas, una pagada entera y otra a medias por un cobro, una que vence hoy y otra más adelante; la lista, la deuda por antigüedad y el freno dieron los mismos $1.500.
- **Quién la ve:** quien tiene permiso para ver la cuenta corriente; la base lee con los permisos de quien consulta.
- **Visto a 375 px** en un banco de prueba con nombres y comprobantes largos: nada se desplaza hacia el costado. **770 verdes** y los tipos sin errores.

## Lo último que pasó — 29 de octubre: el freno al vencido en el mostrador y la caja

**Respuesta 7 de Lucas, la parte del local** (fase-03, punto 1, ⑤): la venta a cuenta corriente de un cliente con deuda vencida no avanza hasta que un encargado la autoriza con su PIN, y queda anotado quién la dejó pasar. Publicada en la 0.19.2.

- **En el mostrador, el aviso:** apenas se elige un cliente con vencido, debajo de su nombre dice cuánto debe y desde cuándo, y que a cuenta corriente lo tiene que autorizar un encargado en la caja.
- **En la caja, el freno:** si algo de la venta va a cuenta corriente, aparece el recuadro rojo con el PIN del encargado y **Cobrar** no se puede apretar hasta que lo autorizan. Con efectivo o tarjeta se cobra igual: el que debe puede seguir comprando, lo que no puede es sumar deuda.
- **Sin conexión también frena.** El saldo de cada cliente, que ya bajaba a las PC, ahora trae sus cargos impagos con el vencimiento, y la caja hace la misma cuenta que la base. El PIN, sin conexión, lo reconoce el verificador local y alcanza con que sea de un Encargado o Administrador; al subir el cobro, la base mira el permiso de verdad. Las PC vuelven a bajar los saldos enteros una vez, solas, al actualizar.
- **Se juzga con el día de la venta:** un cobro hecho sin conexión que sube a la mañana siguiente no se rechaza por algo que venció esa noche.
- **La base** ([`20261029180000_frenar_el_vencido_en_la_caja.sql`](../supabase/migrations/20261029180000_frenar_el_vencido_en_la_caja.sql), aplicada): el freno vive en `cobrar_venta()`, la puerta de toda venta a cuenta corriente; la venta anota quién autorizó y cuándo. El pedido mayorista autorizado le pasa a su venta quién lo autorizó. **Probada como usuario**, con todo deshecho al final: sin autorizar frena; con el de un vendedor frena; con el de un encargado cobra y lo anota; en efectivo cobra; una venta de hace 20 días no frena por lo que venció después; el PIN equivocado cuenta el intento; el mayorista autorizado sigue facturando.
- **Visto a 375 px** el recuadro en sus tres estados (aviso, PIN, autorizado), con un PIN rechazado: nada se desplaza hacia el costado. **766 verdes** y los tipos sin errores.

## Lo último que pasó — 29 de octubre: Productos bajaba hasta una zona vacía

**Visto por Francisco en Productos**, con la ficha de un producto abierta (nuevo o editando): además de la lista y de la ficha, que se desplazan cada una por su lado, **la página entera bajaba** —el menú incluido— hasta un espacio vacío.

- **La causa:** cada sección de la ficha tiene un título invisible, el que lee el lector de pantalla. Se ubicaba respecto de la página y no de la ficha, así que las secciones de abajo estiraban la página. Medido con los mismos estilos de la app: **2.626 px de página en una ventana de 846**.
- **El arreglo:** las secciones de la ficha de producto y de la de cliente, y la cantidad de *Pedidos* a proveedor, que tenían lo mismo, ahora lo contienen: la página mide lo que la ventana. Y el área de contenido de todas las pantallas también lo contiene, para que una pantalla nueva no vuelva a mover la página entera ni el menú.
- **Verificado en la app**, en Productos con la ficha de *ACEDAN GOTAS* abierta, sin guardar nada: a 1920 × 1000, la página mide **1.000 px**; sacándole el arreglo en el momento, vuelve a **2.613**. A 375 px, la página mide lo que la pantalla y nada se desplaza hacia el costado. **756 verdes** y los tipos sin errores. **Va en la 0.19.1.**

## Lo último que pasó — 29 de octubre: el freno al cliente con deuda vencida

**Respuesta 7 de Lucas, en el mayorista**: al cliente con comprobantes vencidos el sistema avisa y frena, y un encargado autoriza. Va en la 0.19.1. Detalle en [`fase-03.md`](fase-03.md), *Lo que ya está*.

- **El freno va al facturar, no al armar.** Facundo está frente al cliente, a veces sin señal, y el pedido todavía no es una venta: lo arma igual, con el aviso de que en el local lo tiene que autorizar un encargado. En el local, el pedido muestra *Vencido sin autorizar* en la lista y, en la ficha, cuánto debe y desde cuándo; **Facturar** y **Sin factura** no aparecen hasta que lo autorizan. Corroborarlo sí se puede.
- **Quién autoriza:** quien tiene el permiso nuevo —Encargado y Administrador lo traen—. Si es el que está en la computadora, con un clic; si no, con **su PIN**, en la misma ficha. **El PIN se verifica en la base**, con la misma función del mostrador y su límite de intentos por terminal. Queda anotado quién lo autorizó, cuándo y cuánto debía vencido.
- **La base** ([`20261029160000_frenar_el_vencido.sql`](../supabase/migrations/20261029160000_frenar_el_vencido.sql), aplicada). **Probada como usuario**, con todo deshecho al final: sin autorizar no factura; un PIN equivocado dice que no y el intento queda contado; el PIN de un vendedor no alcanza; el de un encargado sí, con su nombre; autorizar dos veces no repite; después de autorizar, factura.
- **La ficha, vista a 375 px** como local (con el PIN), como encargado (con el clic) y como vendedor (ve el aviso, no autoriza): nada se desplaza hacia el costado.
- **En el mostrador y la caja**: hecho el mismo día, va en la 0.19.2 (ver arriba).

## Lo último que pasó — 29 de octubre: el mail del pedido

**Al cliente le llega su pedido por mail** apenas llega al local (fase-03, 5.3). Va en la 0.19.0.

- **El teléfono de Facundo lo pide solo** cuando el pedido llega, también el que esperaba en la cola sin señal. **El mail lo arma el servidor** con lo que quedó en la base: productos, cantidades, precios, total y la nota, sin PDF. Va a la dirección del cliente; si no tiene, no sale. Si el teléfono reintenta un pedido que ya había llegado, el mail no se repite.
- **En la ficha del pedido** se ve si salió, a quién y cuándo, o por qué no salió. *Mandar por mail* lo manda —o *Mandar de nuevo*— a la dirección que se escriba. Lo puede mandar quien atiende los pedidos o el vendedor que lo armó, nadie más.
- **La base** ([`20261029140000_el_mail_del_pedido.sql`](../supabase/migrations/20261029140000_el_mail_del_pedido.sql), aplicada): el pedido anota su mail, y la lista de pedidos lo devuelve. Probada con un usuario del local; sin sesión no se puede llamar.
- **El mail de la factura y el del recibo no cambian**: comparados antes y después, salen idénticos. Los tres comparten la banda con la marca y el pie.
- **La ficha, vista a 375 px** con los tres casos —salió, no salió, cliente sin mail— y como vendedor: nada se desplaza hacia el costado. El pedido que sale de la cola dispara el mail con la dirección del cliente.
- **La función del mail** (`enviar-factura`, versión 4 en el servidor) ya manda el pedido. Llamada sin usuario contesta *No tenés permiso para mandar este pedido* —y lo mismo de antes para recibos y facturas—. Sale de `notificaciones@agroveterinariagross.com.ar`, el dominio verificado desde el 23/10.
- 🟡 **Falta ver un pedido llegar de verdad**: con el usuario de Facundo, armar uno para un cliente con mail.

## Lo último que pasó — 29 de octubre: la orden de recibo y el recibo numerado

**Facundo no emite recibos: arma una orden de recibo**, y la deuda no baja hasta que el local confirma que entró la plata (fase-03, 5.4). Detalle en [`fase-03.md`](fase-03.md), *Lo que ya está*.

- **La base** ([`20261029120000_recibo_y_orden_de_recibo.sql`](../supabase/migrations/20261029120000_recibo_y_orden_de_recibo.sql), aplicada): el recibo con su número (serie 0001), la orden de recibo y el permiso para armarla, que el rol *Vendedor de calle* ya trae. **Emitir el recibo es la cobranza de siempre** (`registrar_cobranza`, o la de cheques): no hay otra manera de bajar una deuda. El recibo mandado dos veces —se corta la conexión y se aprieta de nuevo— es uno solo.
- **El número arranca en 1.** Si Gross viene con un talonario de papel y quiere seguir esa numeración, se cambia `recibo.primer_numero` en la configuración **antes del primer recibo**.
- **Un cliente marcado como mayorista queda con cuenta corriente** a 30 días. Salió probando: ningún cliente cargado tenía cuenta corriente, así que a ninguno se le podía aceptar un cobro. Los que ya estaban marcados no cambian; se arregla al volver a guardarlos o tildándolo en la ficha.
- **Probado contra la base, como usuario**, con todo deshecho al final: el vendedor arma la orden y no la puede aceptar ni rechazar, ni ve los recibos; la orden mandada dos veces no se duplica; al aceptar sale el recibo y baja la deuda; el mismo recibo mandado dos veces es uno solo; una orden aceptada no se acepta otra vez; con cheques, el recibo lleva cada cheque.
- **Las pantallas, vistas a 375 px** con datos inventados: nada se desplaza hacia el costado. Se corrigió que la deuda del cliente se cortaba al armar la orden en el teléfono.
- **La función del mail** ([`enviar-factura`](../supabase/functions/enviar-factura/index.ts), versión 3 en el servidor) ahora también manda recibos. Llamada sin usuario contesta *No tenés permiso para mandar recibos* —o *facturas*—: arranca y distingue los dos casos. **Falta ver un recibo llegar de verdad**, con un cliente que tenga mail. El dominio está verificado desde el 23/10: las facturas ya salen.
- 🟡 **Falta probarlo con el usuario de Facundo**, que Lucas crea esta semana.

## Lo último que pasó — 29 de octubre: Buscar fotos decía «El buscador contestó 400»

**Se terminaron las 2.500 búsquedas gratis de Serper.** El 27/10 Lucas cargó fotos de punta a punta y la última búsqueda buena fue a las 12:01; desde ahí fallaron todas. La cuenta de Serper muestra **−6 créditos**. Para que vuelva a andar, **Gross tiene que cargar saldo en Serper** (recargas desde unos USD 50, unas 50.000 búsquedas): anda sola, sin actualizar nada.

> **Cómo se lo contás a Lucas:** se usaron todas las búsquedas gratis que traía la cuenta. Hay que cargarle saldo a Serper y vuelve a andar igual que antes.

- **El aviso, corregido** ([`buscar-fotos`](../supabase/functions/buscar-fotos/index.ts), versión 3 en el servidor): Serper avisa la falta de saldo con un **400 y «Not enough credits»**, no con el 402 o el 429 que se esperaban. Ahora la pantalla dice *Se terminaron las búsquedas de Serper: hay que cargar más.* Y si contesta otro error, lo que dijo queda en el registro del servidor.
- **Verificado:** **2 pruebas nuevas** en [`buscarFotos.prueba.ts`](../app/src/lib/api/buscarFotos.prueba.ts); rota la regla a propósito, falló. **738 verdes** y los tipos sin errores. La función publicada arranca y contesta. **Falta ver el aviso nuevo con una búsqueda de verdad**: la primera que haga Lucas sin saldo lo muestra, o deja en el registro qué contestó Serper.

## Lo último que pasó — 28 de octubre: Mayorista, la primera entrega

**Se decidió el nombre de las fases:** las fases 1 y 2 son lo construido —el sistema y la tienda online— y en noviembre pasan a soporte. Lo que pidió Lucas el 26/10 es la **Fase 03**. Lo que era V2, V3 y cumplimiento normativo queda como **fases futuras, sin número**, para diciembre o enero. Lucas pidió **empezar urgente por Mayorista**: Facundo es nuevo y sale a vender la semana del 2/11.

**Lo que se construyó** (detalle en [`fase-03.md`](fase-03.md), *Lo que ya está*):
- **La base** ([`20261028120000_mayorista.sql`](../supabase/migrations/20261028120000_mayorista.sql)): seis permisos, el rol *Vendedor de calle*, la marca de mayorista con ruta, zona y ubicación en el cliente, la lista *Mayorista* y el pedido. **Facturar un pedido es la venta de siempre**, cobrada a cuenta corriente con `cobrar_venta()`: no hay una segunda manera de vender.
- **La sección *Mayorista*** con Pedidos, Clientes y Lista de precios. Facundo ve sólo las dos primeras.
- **Probado contra la base, como usuario**: el vendedor no carga precios, no confirma ni ve otros clientes; el pedido mandado dos veces no se duplica; un precio que no puede cambiar se ignora; corroborar con una cantidad corregida; facturar sin factura —la deuda vence a 30 días y el stock baja— y con factura; un pedido facturado no se cancela. Salió un caso real: **un pedido con otro precio no se podía facturar** (la venta exige quién cambió el precio); arreglado. Lo de prueba no quedó grabado y la numeración arranca en 1.
- **Las pantallas, vistas a 375 px** con datos inventados (no se pudo entrar con un usuario real desde acá): nada se desplaza hacia el costado.

🟡 **Para que Facundo arranque** (la 0.18.0 ya está publicada): en *Usuarios*, crearle el usuario con el rol *Vendedor de calle*; **cargar la lista mayorista** (*Mayorista → Lista de precios*), y **marcar a los clientes mayoristas** en su ficha (*Venta mayorista*) o que Facundo los dé de alta desde la ruta. Sin precios en la lista, Facundo no ve productos.

**Lo que falta del mayorista:** la orden de recibo con el recibo numerado (la próxima entrega), el mail del pedido al cliente, frenar al que tiene vencido con la autorización del encargado, el mapa con todos los pines y las estadísticas.

## Lo último que pasó — 26 de octubre: el corte se corre una semana, y la Fase 03

**El corte no se logró el 26/10.** En el local se están dando cuenta de cosas para hacer, desarrollar o definir —no tantas—. Se pidió **una semana más**: esta semana se practica, se avanza con algunas funciones y se termina el proceso. **En noviembre se pasa a soporte**, aunque Lucas puede contratar más desarrollo.

Lucas trajo **ocho pedidos nuevos**, en su cuaderno y explicados en dos audios: venta en cuenta corriente especial con **remito interno** (precios después), **productos asociados** a una factura, **tres tipos de remito** —el logístico con CAI—, **venta mayorista** para el vendedor de calle, **orden de traslado**, **fiado**, la **proforma que se factura desde la misma pantalla** y los **mensajes masivos por WhatsApp**. Pasados en limpio no entran en una semana: van en la **Fase 03** (entonces se llamó *Fase 01 B*), como un mes más que se cobra aparte.

**El análisis, el diseño, las preguntas para Lucas y el orden de construcción:** [`fase-03.md`](fase-03.md). Lo central:
- **Nada es un sistema aparte.** Lo que Lucas llama «módulo» es una sección del menú con alguien que entra sólo ahí: *Mayorista* (con un rol nuevo para el vendedor de calle) y *Fiados*. Lo demás son funciones de pantallas que ya existen.
- **El remito logístico lleva CAI, no CAE.** Decidido el 26/10: **sin talonarios de imprenta**; Gross pide el CAI en ARCA y el sistema imprime el remito entero. El paso a paso para Lucas y Armando: [`tramite-remito-r.md`](tramite-remito-r.md).
- **Siete de las ocho preguntas, contestadas el 26/10** (están en el documento). Falta qué conceptos fijos llevan los productos asociados, y que Armando confirme la modalidad del punto de venta de remitos.
- **Las listas de precios ya admiten un precio fijo por producto** —no sólo porcentaje, como se dijo en el audio—. Falta la pantalla para cargarlo.
- ⚠️ **Los productos asociados** hacen una factura que describe otra cosa de la que salió. Avisado una vez en el documento; conviene que lo mire Armando.
- **Los mensajes masivos van en la fase siguiente**, con el CRM.

**Anotado para hacer aparte: la auditoría de integralidad.** Lucas quiere menos saltos entre pantallas —el pedido llega, depósito da el ok, un clic arma el remito, otro factura, todo en el mismo lugar— y que lo hecho igual se vea desde Remitos o Comprobantes. Pide recorrer el sistema entero con esa vara; está descripto al final de [`fase-03.md`](fase-03.md).

Las fotos, las láminas y la transcripción: [`referencias/pedidos-lucas-2026-10-26/`](referencias/pedidos-lucas-2026-10-26/).

## Lo último que pasó — 23 de octubre: el dominio, en la cuenta de Cloudflare de Gross

**El dominio `agroveterinariagross.com.ar` pasó a la cuenta de Cloudflare que ILUMA le armó a Lucas.** Estaba en la cuenta del desarrollador de la web anterior.

- **La página de siempre sigue en Vercel** (hecha en Next por ese desarrollador). Al mudar, Cloudflare copió como registros las direcciones de su propio proxy y aparecía el *Error 1000*. Quedaron dos registros, en *Solo DNS*: `A @ → 76.76.21.21` y `CNAME www → cname.vercel-dns.com`. **Verificado el 23/10:** la página carga, con certificado válido. El dominio sin «www» redirige a `www.` (lo hace Vercel).
- **Sin mails del dominio:** se borraron los MX y el SPF del reenvío de Cloudflare de la cuenta anterior, y el comodín `*`.
- **Resend, verificado** (23/10). **El remitente del sistema es `Agroveterinaria Gross <notificaciones@agroveterinariagross.com.ar>`** —«notificaciones» y no «facturas», porque va a mandar más que facturas—: desde ahora las facturas por mail **les llegan a los clientes**. 🟡 **Pendiente: `correo.responder_a`**, la casilla del local que recibe las respuestas de los clientes. **Se carga cuando se creen los mails del dominio** (decidido el 23/10). Hasta entonces, si un cliente contesta, la respuesta va a `notificaciones@` y no la lee nadie; el mail no invita a responder.
- ✅ **`https://empresa.agroveterinariagross.com.ar`**: la versión web del sistema, conectada al proyecto `gross-sistema` de Cloudflare Pages (*Custom domains*) y verificada el 23/10: abre el sistema con certificado válido y sirve las actualizaciones. `gross-sistema.pages.dev` sigue andando igual, y es de donde se actualizan las PC. El isotipo de los mails sale ahora de este dominio (`correo.logo`). El sistema no manda enlaces por mail, así que en Supabase no hubo que tocar nada.
- 🟡 **La cuenta vieja de Cloudflare** le factura a Lucas 5 US$ por mes de Cloudflare Images. Conviene pedirle al desarrollador que lo cancele.

## Lo último que pasó — 22 de octubre: el mostrador no encontraba Credelio

**Lo que vio Lucas:** en el Mostrador, buscando «cred», *Sin resultados*, con la 0.17.0 instalada. Credelio está en la base: 11 productos, activos y con precio, cargados el 19/10 con el Excel de OBTech.

> **Cómo se lo contás a Lucas:** a las computadoras del local les faltaba una parte del catálogo y de los clientes desde que cargamos lo de OBTech. No era Credelio solo: eran 351 productos y 384 clientes. Ya está arreglado: cuando se actualiza el programa a la 0.17.1, cada computadora vuelve a bajar todo sola, en un par de minutos, y desde ahí los encuentra.

- **La causa:** el mostrador busca en la copia de la PC, tenga o no internet. Esa copia se baja de a 500 filas, ordenadas por la hora del último cambio, y cada tanda pide «lo que cambió después de la última». La importación del 19/10 guardó los productos y los clientes **de a 200 con exactamente la misma hora**: cuando una tanda de 500 cortaba un grupo por la mitad, el resto del grupo tenía la misma hora que la última fila bajada, y «después» no lo traía nunca.
- **Medido contra la base, con las mismas consultas:** con la forma de bajar de hasta la 0.17.0 llegaban **1.981 de 2.332 productos —ningún Credelio— y 2.136 de 2.520 clientes**. Con el arreglo, **todos**. Los códigos de barra, el stock y los avisos estaban completos: son pocas filas.
- **El arreglo** ([`recorrerPorFecha`](../app/src/lib/local/sync.ts)): cuando una tanda llega llena, antes de seguir se bajan enteras las filas de esa misma hora, de a 500 y ordenadas por su clave, aunque sean miles. Vale para todas las tablas que bajan por fecha y para las clasificaciones.
- **Las PC que ya están mal se arreglan solas:** la 0.17.1 sube el número de la bajada (`VERSION_BAJADA` 4) y vuelve a bajar todo lo que viene por fecha, sin tocar lo que la PC tenga por subir. **Hasta que se actualicen, les siguen faltando esos productos y clientes**; mientras tanto se encuentran en Productos y Clientes, que leen del servidor, pero el mostrador no los vende.

**Verificado:** **4 pruebas nuevas** con un servidor de mentira armado como el de verdad —2.281 productos de a 200 con la misma hora, y 1.700 en un mismo instante—: bajan enteros; con la forma vieja se pierden filas, y rompiendo el arreglo a propósito fallan las dos que importan. **722 verdes** y los tipos sin errores. **Contra la base real**, la misma bajada en SQL: 1.981 contra 2.332 productos y 0 contra 11 Credelio. 🟡 **Falta verlo en una PC del local** después de actualizar: buscar «cred» en el Mostrador.

## Lo último que pasó — 21 de octubre, a la noche: la factura por mail

**El pedido 17 de Lucas, decidido el 21/10.** El servicio es **Resend**; la clave está en los secretos del servidor (`RESEND_API_KEY`, la cargó ILUMA).

> **Cómo se lo contás a Lucas:** en cada factura hay un botón *Mandar por mail*. Propone el mail del cliente —o el que dejó en la tienda— y lo podés cambiar. Le llega un mail corto con la factura en PDF, igual a la que imprimís en A4. Abajo del botón queda a quién se mandó y cuándo. Los pedidos de la tienda no hace falta mandarlos: al facturarlos, la factura le llega sola al comprador.

- **El PDF lo arma la app**, con los mismos datos y las mismas cuentas que la hoja A4 ([`pdf.ts`](../app/src/lib/comprobante/pdf.ts)): letra, encabezado, receptor, detalle —con más hojas si hacen falta—, IVA discriminado en la A, percepción, transparencia fiscal en la B, QR de ARCA y CAE.
- **Lo manda el servidor** ([`enviar-factura`](../supabase/functions/enviar-factura/index.ts)): sólo una factura que existe y tiene CAE, sólo quien ve la facturación, con el asunto y el nombre del archivo sacados de la factura. **Cada envío queda anotado** —a quién, cuándo, quién, si salió— en `comprobante_envio` ([migración](../supabase/migrations/20261021140000_la_factura_por_mail.sql)).
- **Pedidos web:** al facturar, si el comprador dejó mail, se le manda solo. Si el mail no sale, el pedido igual queda facturado y se dice por qué.
- ✅ **Resuelto el 23/10:** dominio verificado en Resend; las facturas salen de `notificaciones@agroveterinariagross.com.ar`. Lo que decía antes: mientras el dominio no esté verificado en Resend, el remitente es el de prueba de Resend (`onboarding@resend.dev`), que **sólo llega a la casilla de la cuenta de Resend**; a cualquier otro, Resend lo frena y la factura lo dice. **El día de la transferencia del dominio:** se agrega `agroveterinariagross.com.ar` en Resend, se cargan en Cloudflare los registros que Resend indica, y se cambia `correo.remitente` en la configuración a `Agroveterinaria Gross <facturas@agroveterinariagross.com.ar>` (y `correo.responder_a`, a la casilla del local). **No hace falta publicar nada.**
- 💡 **El subdominio del sistema:** `empresa.agroveterinariagross.com.ar`, para la versión web —la del celular—. Se configura en Cloudflare Pages el mismo día, y se agrega en la configuración de acceso de Supabase.

**Verificado:** **11 pruebas** del PDF y del mail —una hoja; más hojas con 90 líneas; Factura A con percepción; un emoji en una descripción no la rompe (roto a propósito: falló); el mail dice qué es, de cuánto y de quién, sin dejar pasar HTML; lo que contesta Resend, en palabras—. **5 comprobaciones** en [`factura-por-mail.sql`](../supabase/pruebas/factura-por-mail.sql): el registro lo escribe sólo el servidor y lo ve sólo quien ve la facturación. **717 verdes.** **De punta a punta, con Resend de verdad, sin mandarle nada a nadie:** desde una factura de homologación, a una dirección inventada: Resend aceptó la clave y el PDF y frenó el destinatario por el dominio sin verificar; la factura mostró el motivo y el intento quedó anotado con quién lo hizo (después se borraron esos intentos). La factura propuso sola el mail del cliente. El PDF, mirado como imagen: la A y la B, bien. A 375 px, nada se desplaza. **El mail, con la marca** (21/10, a la noche, porque «se veía muy plano»): banda magenta con el isotipo en blanco y el nombre, la línea verde, el resumen de la factura en un recuadro —comprobante, fecha y el total grande en magenta— y el pie con los datos del local. Hecho con tablas y estilos en cada elemento, como piden Gmail y Outlook; mirado en la pantalla y a 375 px. **El isotipo es un PNG publicado con la web** (`app/public/marca/correo-isotipo-blanco.png`), en línea desde la 0.17.0. **Mandado de prueba con la marca, el 21/10**, a la casilla de la cuenta de Resend: salió en 5,6 s. Se puede cambiar por otra dirección en `correo.logo`. *«Respondé este mail»* aparece sólo cuando hay una casilla en `correo.responder_a`.

✅ **Un envío de verdad, el 21/10:** la Factura B 0001-00000031 de homologación, a la casilla de la cuenta de Resend (`lucasgross.cuentas@gmail.com`): Resend la aceptó en 3,8 s y quedó anotada como enviada. 🟡 Falta ver en esa casilla que llegó y cómo se ve el PDF.

## Lo último que pasó — 21 de octubre, a la tarde: bajar la planilla y volver a subirla

**La idea, dicha por ILUMA:** cada pantalla deja ver, hacer y exportar, y lo que se exporta de un maestro sirve también para importar. **Vale para los maestros** —productos, clientes, proveedores—: se baja, se corrige en Excel y se sube. **No para los movimientos** —ventas, facturas, cobros, cheques, compras—: esos se bajan para mirar o para el contador, pero no se vuelven a subir, porque cada uno pasa por sus reglas (ARCA, stock, caja) y una planilla se las saltearía.

> **Cómo se lo contás a Lucas:** en Productos, Clientes y Proveedores hay un botón *Descargar planilla*. Te baja un Excel con todo lo que hay hoy. Cambiás lo que quieras —precios, teléfonos, el mínimo de un proveedor— y lo subís con *Importar planilla*. El sistema te dice antes qué cambia, renglón por renglón, y elegís qué actualizar. Si la subís sin tocar nada, te dice que está todo igual. Nada se borra: lo que borres del Excel queda como estaba.

- **Productos:** código, nombre, nombre público, precio, costo, IVA, rubro con su rama entera, marca, unidad, código de barra principal, si es veterinario, receta o fitosanitario, aviso de stock propio, de qué envase sale, peso y bulto. **El stock no va**: cambia sólo por movimientos, para que cada unidad tenga su historia.
- **Clientes:** la ficha con la condición frente al IVA en palabras, la cuenta corriente, el límite y los días. **El saldo no va**: tiene su importación, con su fecha. Tampoco el *Consumidor Final* del sistema.
- **Proveedores, nuevo entero:** no había forma de subir la ficha; sólo el saldo. Ahora **Proveedores → *Importar planilla*** trae código, nombre y de fantasía, condición, CUIT, domicilio, teléfono, mail, contacto, CBU o alias, el mínimo de compra y observaciones, con la misma comparación que clientes. Se reconoce por código, por CUIT o por nombre; un CUIT de otro proveedor frena la fila. La base: [`importar_proveedores`](../supabase/migrations/20261021120000_importar_proveedores.sql). **Hoy hay 3 proveedores cargados: los de OBTech todavía no entraron**, y esto sirve también para eso.
- **Es un Excel de verdad (.xlsx), no un CSV:** así los números viajan como números.
- **Dos arreglos al importador que encontró la prueba de ida y vuelta:**
  - 🔴 **Un número con tres decimales de un Excel entraba mil veces más grande:** un peso de 0,125 kg se leía como 125, porque el importador lo pasaba a texto y el punto parecía de miles. Pasaba con cualquier Excel. Ahora un número de Excel se usa tal cual.
  - **El código de barra, el aviso de stock y el envase se cuentan como cambio sólo si cambian.** Antes, si venían en la planilla, salían como cambio siempre: subir la planilla bajada habría dicho que cambiaron los 2.281 productos.

**Verificado:** **la ida y vuelta con los datos reales**: los 2.281 productos y los 2.495 clientes, armados en Excel, leídos por el importador y comparados con la base: **cero cambios y cero errores** (salvo el *Consumidor Final* del sistema, que después se sacó de la planilla). **12 pruebas nuevas** de ida y vuelta para los tres y de la comparación, con un Excel de verdad para el caso del 0,125; se rompió a propósito el reconocimiento de las columnas y fallaron seis. **10 comprobaciones** en [`importar-proveedores.sql`](../supabase/pruebas/importar-proveedores.sql), en seco y después de aplicar —la del código en minúsculas falló antes de arreglarlo—. **706 verdes** y los tipos sin errores. **En pantalla:** la planilla de proveedores subida sin tocar dijo *3 ya están, iguales*; con el contacto de Bagó cambiado, *1 cambia: Contacto*. No se importó nada. A 375 px, nada se desplaza.

## Lo último que pasó — 21 de octubre

### Buscar las fotos en internet

**Lo que eligió Lucas el 20/10, con Serper** —la cuenta es de Gross y la clave quedó en los secretos del servidor, `SERPER_API_KEY`—. Y lo que pidió el 21/10: **que no vengan con marca de agua ni publicidad de otro comercio, y en lo posible con fondo blanco.**

> **Cómo se lo contás a Lucas:** en Productos hay un botón nuevo, *Buscar fotos*. Te muestra los productos que todavía no tienen foto, de a cinco, y para cada uno el sistema busca en internet y te propone cuatro, primero las de fondo blanco. Tocás las que sirven —la primera que tocás queda de principal— y *Guardar y seguir*: se achican, se convierten al formato de la web y quedan en el producto, igual que si las hubieras subido vos. Si el nombre no ayuda —los de OBTech son cortos—, cambiás el texto y *Buscar* otra vez. Arriba podés filtrar, por ejemplo *ROYAL* o *PIPETA*, para trabajar por marca. Mirá bien la presentación: a veces trae el mismo producto en otro tamaño.

- **El fondo blanco:** se le pide a Google con su filtro de color blanco, y además la pantalla mide el borde de cada foto y pone adelante las de fondo blanco, con la marca *Fondo blanco*. Si con el filtro no encuentra nada, busca sin él.
- **Sin marca de agua:** se descartan los bancos de imágenes —que la ponen siempre— y las redes sociales. **La marca de agua chica o el logo de otro comercio dentro de la foto no se detectan solos:** los ve Lucas, y cada foto dice de qué sitio sale.
- **El servidor busca y baja; la app achica y sube.** La función [`buscar-fotos`](../supabase/functions/buscar-fotos/index.ts) sólo la puede usar quien edita productos, baja sólo fotos de sitios comunes —nada de direcciones internas, ni siquiera siguiendo una redirección— y de hasta 10 MB. Las vistas previas viajan adentro de la respuesta, porque el programa instalado sólo deja mostrar imágenes del servidor de Gross.
- **Cuánto cuesta:** una búsqueda por producto, a veces dos. Las primeras 2.500 son gratis; después, unos USD 1 cada 1.000. **Una búsqueda tarda de seis a ocho segundos**, medido: la app le da el mismo margen que a las funciones de ARCA, para no creer que se cortó internet.
- **De paso, arreglado: *Subir fotos* de a muchas leía sólo los primeros 1.000 productos.** El servidor entrega mil filas por pedido y con el catálogo real son 2.281: una foto con el código de un producto de los otros 1.281 decía *«no hay ningún producto»*. Ahora lee de a mil hasta el final.

**Verificado:** **13 pruebas nuevas** de qué fotos se proponen, qué sitios se descartan, adónde puede ir el servidor, el fondo blanco y el filtro; la de las direcciones internas se rompió a propósito y la atrapó. **694 verdes** y los tipos sin errores. **Con productos reales**, en pantalla: los primeros cinco del catálogo —con nombres como *12 P 15*, que traen cualquier cosa: para eso está el texto que se cambia— y con *ROYAL*, 75 productos sin foto con fotos de Royal Canin que coinciden. Tocar dos fotos marcó *Principal* y *2ª*; no se guardó nada en productos reales. **Bajar, convertir y subir** se probó en el producto PRUEBA: la foto bajó por el servidor, se convirtió y subió; la base la rechazó por estar dado de baja, y el archivo se borró solo. **A 375 px**, nada se desplaza, y los cuatro botones de Productos entran.

## Lo último que pasó — 20 de octubre

### El inscripto también puede llevarse comprobante interno

**Pedido de Lucas del 20/10:** en la caja tienen que estar siempre las dos opciones, factura o comprobante interno, también para un Responsable Inscripto. Hasta acá, a un inscripto le salía siempre Factura A y la base rechazaba «sin factura».

> **Cómo se lo contás a Lucas:** cuando cobrás a un inscripto, ahora aparecen *Con factura* y *Sin factura*, igual que con cualquier cliente —y *Factura después*, si tiene cuenta corriente—. Sin factura sale el comprobante interno, **sin percepción**. Sigue haciendo falta el permiso de vender sin factura, que no tienen ni el cajero ni el vendedor.

- La base: [`el_inscripto_tambien_sin_factura`](../supabase/migrations/20261020120000_el_inscripto_tambien_sin_factura.sql), aplicada. Lo único que se sacó es el rechazo al inscripto; el permiso y la regla de *Factura después* siguen igual.
- **Verificado:** **6 comprobaciones** en [`inscripto-sin-factura.sql`](../supabase/pruebas/inscripto-sin-factura.sql) —el inscripto se marca sin factura y se cobra por el total, sin percepción; con factura sigue igual; sin permiso, no—. **Antes del cambio fallaba** con *«le corresponde Factura A»*; después, anda. La app: **677 pruebas verdes** y los tipos sin errores. La guía de pantallas y el manual en PDF, al día. **Visto en pantalla**, también a 375 px: con un cliente de prueba puesto como inscripto un momento, la Caja ofreció *Con factura* y *Sin factura*. No se cobró nada, y el cliente volvió a como estaba. **Sin aclaraciones debajo de *Sin factura*** (pedido del 20/10: Gross ya sabe qué es un comprobante interno).

### Los servicios para buscar las fotos (Lucas eligió el 20/10 que el sistema las busque)

Precios de octubre de 2026, de los sitios de cada servicio y de comparativas; **confirmar en la página de cada uno antes de contratar**. Para unos 2.300 productos, una búsqueda por producto:

| Servicio | Qué es | Precio | Para 2.300 productos |
|---|---|---|---|
| **Serper** | Búsqueda de Google Imágenes | Unos USD 1 cada 1.000, en recargas desde USD 50; 2.500 gratis al empezar, una sola vez | **Entra en lo gratis** |
| **Brave Search** | Buscador propio, con imágenes | USD 5 cada 1.000; trae USD 5 gratis por mes | Unos USD 12, o gratis en tres meses |
| **SerpApi** | Google Imágenes | Desde USD 25 por mes; 250 gratis por mes | Un mes de plan |
| **Go-UPC / UPCitemdb** | Por código de barras: devuelven la ficha y una foto | Desde USD 75 por 5.000, o USD 99 por mes | Uno de esos planes |

**La recomendación:** buscar por **código de barras y nombre en Google Imágenes con Serper**. Las bases de códigos de barras cubren poco lo veterinario y lo argentino; Google encuentra la foto del fabricante o de otro comercio. La primera carga entera entra en lo gratis, y después cada producto nuevo cuesta menos de un peso. Falta que Gross cree la cuenta y se carga la clave en el servidor.

## Lo último que pasó — 19 de octubre, a la noche: lo que salió de la reunión con Zubu

**Tres cosas para la tienda, acordadas con Zubu y Lucas.** La página de la API para Zubu se publicó como **versión 5**, en la misma dirección de siempre (https://claude.ai/artifact/VXHehNGKU5HF9Ltbbe7LgB), y la copia del repositorio, [`api-tienda.md`](api-tienda.md), dice lo mismo. Los tres son agregados: lo que la tienda ya hacía sigue igual.

### Cómo paga cada pedido

> **Cómo se lo contás a Lucas:** cada pedido de la web ahora dice cómo se paga. En *Pedidos web* lo ves en la lista y en el detalle: *Pagó con Mercado Pago*, *Paga con transferencia*, *Paga en el local*. Si es transferencia o efectivo, el pedido llega a la caja con ese medio ya elegido: cuando entra la plata, se cobra sin buscar nada. Y si alguna vez llega uno que dice Mercado Pago pero sin pagar, queda marcado para que lo mires antes de entregarlo.

- La tienda manda `medio_pago`: `mercado_pago`, `transferencia`, `efectivo` u `otro`. Uno que no sea esos se rechaza con `medio_pago_invalido`.
- **Zubu ya sabe que el pedido de Mercado Pago se manda recién cuando Mercado Pago confirma el pago** (se lo dijo ILUMA en la reunión). Los pedidos WEB-000009 y 10 del 19/10 ya llegaron así, pagados.
- La base: [`como_paga_y_que_es_para_consultar`](../supabase/migrations/20261019140000_como_paga_y_que_es_para_consultar.sql). La API, desplegada (versión 5 de la función).

### Productos sólo para consultar

> **Cómo se lo contás a Lucas:** hay productos que querés que se vean en la web pero que no se puedan comprar —farmacia, lo que lleva receta—. En la ficha, debajo de *Vender online*, tildás *Sólo para consultar*: la tienda lo muestra con un botón *Consultar* que manda a WhatsApp, en lugar de *Agregar al carrito*. También se puede hacer de a muchos, marcándolos en la lista o para toda una categoría o marca. En la lista aparece la marca *Consultar*.

- Si igual llega un pedido con un producto así, **entra** —puede estar pagado— y queda marcado para revisar.

### Las fotos de los productos

> **Cómo se lo contás a Lucas:** las fotos de la tienda se cargan acá, en la ficha de cada producto, en *Tienda online* → *Sumar fotos*. Hasta ocho por producto; la primera es la que se ve en la lista de la tienda, y cualquiera se puede hacer principal. No importa el tamaño de la foto: el sistema la achica y la convierte al formato liviano de la web solo. Para cargar muchas de una, en Productos está *Subir fotos*: nombrás cada foto con el código del producto o el código de barras —*DEMO-002.jpg*— y el sistema te muestra a qué producto va cada una antes de subirlas.

- **WebP de hasta 1200 px**, convertida en la computadora que la sube: una foto de celular de 4 MB queda en unos 100 KB. Mil productos con dos fotos entran holgados en el plan gratis.
- Viven en el depósito público `productos` del servidor; la base anota cada una recién cuando el archivo está, y si la base no la acepta, el archivo se borra. **Necesita internet**: las fotos no bajan a la copia local.
- La API las da en `imagenes`, la principal primero, con su ancho y alto. Cambiar las fotos cuenta como un cambio del producto: la tienda lo ve en la próxima consulta.
- La base: [`las_imagenes_de_los_productos`](../supabase/migrations/20261019150000_las_imagenes_de_los_productos.sql). El código, en [`imagenes.ts`](../app/src/lib/api/imagenes.ts), [`FotosDelProducto.tsx`](../app/src/components/FotosDelProducto.tsx) y [`SubirFotos.tsx`](../app/src/components/SubirFotos.tsx).
- 🔴 **El programa instalado no muestra las fotos hasta la 0.16.7**: la regla de seguridad del programa sólo dejaba ver imágenes propias. Se suben igual; se ven después de actualizar.

**Verificado:** **20 comprobaciones** en [`como-paga-y-para-consultar.sql`](../supabase/pruebas/como-paga-y-para-consultar.sql) y **16** en [`imagenes-de-productos.sql`](../supabase/pruebas/imagenes-de-productos.sql), en seco con la migración, después de aplicar, y rotas a propósito —marcar sin el permiso, subir una foto sin el permiso— y atrapadas. En la app, pruebas nuevas de cómo se describe el pago (6), de la marca para consultar y de a qué producto va cada foto (10), rotas a propósito y atrapadas: **677 verdes**, y los tipos sin errores. La API publicada contesta 401 sin clave, como siempre.

**Visto en pantalla**, con el producto PRUEBA-CHQ y a 375 px —nada se desplaza hacia el costado—: tildar *Sólo para consultar* y guardar; sumar dos fotos de 2000×1500, que quedaron en WebP de 1200×900 y unos 6 KB; *Hacer principal*; *Quitar*, con su confirmación; la subida de a muchas, que emparejó por código, por código de barras y con *(2)*, y avisó del nombre que no coincide; y en *Pedidos web*, un pedido PRUEBA con transferencia, en la lista y en el detalle. Después se dejó todo como estaba. La marca *Consultar* de la lista no se vio: sale sólo en lo que se vende online, y no se publicó un PRUEBA en la tienda.

Y salieron dos cosas, arregladas:
- 🔴 **La foto quitada dejaba el archivo en el servidor.** Para borrar, el almacenamiento tiene que poder ver el archivo, y esa regla faltaba: no borraba nada y no avisaba. Arreglado en [`borrar_el_archivo_de_la_foto`](../supabase/migrations/20261019160000_borrar_el_archivo_de_la_foto.sql), con una comprobación nueva que **sin el arreglo fallaba** (borraba 0) y con él anda. Vuelto a probar en pantalla: la foto quitada ya no deja archivo. El que había quedado suelto se borró.
- **Tildar *Sólo para consultar* sin *Vender online* no muestra nada en la tienda**, y la ficha decía sólo *No se vende online*. Ahora dice *Marcado para consultar, pero no se muestra: falta prender «Vender online»*.

### Lo que quedó de la reunión

- 🟡 **Envío y descuentos**: pendiente, hasta saber cómo lo maneja Andreani.
- 🟡 **La dirección desde la que sale el mail de la factura**: la consigue ILUMA.
- 💡 **Lucas preguntó por traer las fotos solas de internet**, buscándolas por la descripción, para corregirlas antes de lanzar. **ILUMA le propuso tres pasos (19/10). ✅ Lucas eligió el 2 (20/10): que el sistema las busque.**
  1. **Que pase las fotos que tenga y se hace la primera carga** con *Subir fotos*, nombradas con el código o el código de barras. Es lo que ya está hecho y probado.
  2. **Después, o como otro camino: que el sistema las busque.** Por código de barras o por nombre, en un servicio pago de búsqueda de imágenes; propone una o dos por producto, Lucas acepta o descarta cada una, y las aceptadas se guardan igual que una subida a mano. Riesgos: fotos parecidas que no son el producto —otra presentación, 7,5 kg contra 15 kg—, por eso la revisión de Lucas no se saltea; y fotos con derechos de otro comercio. ✅ **Construido el 21/10, con Serper**: ver *Lo último que pasó — 21 de octubre*.
  3. **Más adelante, con el cerebro de Gross:** que el sistema busque, edite o cree las imágenes —el producto solo, o puesto en un contexto de uso—. Idea anotada; todavía no tiene alcance.

## Lo último que pasó — 19 de octubre, a la noche

### Productos y clientes reales, cargados

**Con los dos Excel de OBTech y el importador de la 0.16.6.** Lo demás de la limpieza —ventas, facturas de homologación, stock, cuentas corrientes, cheques— queda para otro momento, por decisión de la persona.

> **Cómo se lo contás a Lucas:** ya están en el sistema todos los productos y todos los clientes que exportaste de OBTech. Los de prueba no aparecen más. Los precios son los de la lista 1, con IVA; la de tarjeta la calcula el sistema. Quedaron 41 clientes afuera porque en OBTech comparten el CUIT con otro cliente —te paso la lista—: decime en cada caso si son el mismo o si hay un CUIT mal escrito.

- **Antes, un respaldo**: `respaldo_20261019.producto` y `respaldo_20261019.cliente`, un esquema aparte en la misma base que la app no ve. Se puede borrar cuando la carga esté mirada.
- **Los de prueba, dados de baja y no borrados**: 38 productos (con `dar_de_baja_productos`, la misma que usa la app) y 16 clientes; queda *Consumidor Final*. La baja **llega sola a las PC** —sube la fecha de cambio— y **libera los códigos y CUIT**, que sólo valen entre los que no están de baja. Borrarlos de verdad no se podía sin borrar antes las ventas que los usan, y lo borrado no llega a las PC.
- **Productos: 2.281, todos al 21 %**, sin errores. **40 tienen precio $0**: OBTech no les tiene *Precio 1*. **17 empiezan con «zz»**: en OBTech suele ser lo discontinuado; entraron igual, se dan de baja desde Productos si no van. Sin categoría ni marca: el Excel no las trae.
- **Clientes: 2.494** —1.056 inscriptos, 55 monotributistas, 93 exentos y 1.291 consumidores finales; 1.211 con CUIT— más el genérico, que no se importó. **41 filas frenadas, todas por CUIT repetido**: entró el primero de cada CUIT y los demás no. La lista, con quién quedó y quién no, está en `D:\Descargas\clientes-frenados-obtech.csv` (afuera del repositorio: tiene datos de clientes).
- **Visto en la base después de cargar**: los totales de arriba, el IVA de cada producto, y dos ejemplos de cada lado con sus datos completos.

⚠️ **Lo que queda a la vista hasta la limpieza completa:** **4 ventas de prueba en la cola de la caja**, con productos ya dados de baja —no cobrarlas—, la caja abierta desde el 13/08 y los comprobantes de homologación en Facturación.

## Lo último que pasó — 19 de octubre, a la tarde

**Cuatro pedidos de Lucas, con la pantalla de Proformas de OBTech y una factura con percepción como ejemplo.** El código, en [`buscarComprobantes.ts`](../app/src/lib/api/buscarComprobantes.ts), [`BuscadorDeComprobantes.tsx`](../app/src/components/BuscadorDeComprobantes.tsx) y [`comparar.ts`](../app/src/lib/importacion/comparar.ts).

### «Comprobantes de percepción»: era una pantalla

✅ **Respondida la pregunta abierta desde el 03/09.** Lo que Lucas quiere es ver las facturas que llevaron percepción, con el total percibido, por mes, por semana o entre dos fechas, y por cliente; reimprimirlas, bajarlas, y exportar número, neto, IVA y percepción con la fila del total.

> **Cómo se lo contás a Lucas:** en Comprobantes hay dos pestañas nuevas. *Percepciones* muestra sólo las facturas que llevaron percepción, con el neto, el IVA y lo percibido, y abajo el total. Elegís el mes, la semana o las fechas que quieras, y si querés, el cliente o el número. *Clasificar* las separa por semana o por mes, cada una con su subtotal. *Bajar Excel* te da lo mismo para el contador, con los totales; *Imprimir el listado* lo saca en una hoja. Y *Ver* abre la factura para reimprimirla o bajarla en PDF. *Facturas emitidas* es lo mismo con todas las facturas y notas de crédito, y con más filtros: tipo, letra y estado.

- **Los filtros se combinan** —en OBTech eran pestañas, una búsqueda por vez—: las facturas de HIMPA de agosto se buscan de una. El número se escribe como sale impreso o como se dice: *29*, *1-29* o *0001-00000029*.
- **Las notas de crédito restan**, también la percepción que devuelven. Es la misma regla que el archivo del contador.
- **Los filtros quedan en la dirección de la página**: al abrir una factura y volver, la búsqueda sigue igual.
- **Bajar PDF**, en la factura: el diálogo de imprimir con *Guardar como PDF*, con el nombre del comprobante como nombre del archivo. No cuenta como impresión.
- Es una vista aparte, [`vista_comprobante_busqueda`](../supabase/migrations/20261019120000_buscar_comprobantes.sql), y no la de Facturación: aquella calcula renglón por renglón los intentos a ARCA y lo devuelto, que para recorrer un mes entero no hace falta.
- **De paso:** los tres archivos del contador (ventas, percepciones y compras) **no llevaban el BOM** que hace que Excel lea los acentos; el comentario decía que sí. «Alícuota %» abría rota. Corregido.

**Verificado:** **9 comprobaciones** en [`buscar-comprobantes.sql`](../supabase/pruebas/buscar-comprobantes.sql), en seco y después de aplicar, rota a propósito —las notas de crédito con signo +1— y atrapada. **12 pruebas** de períodos, número, totales, grupos y archivo, rotas a propósito dos veces —la semana empezando el domingo y la percepción sin signo— y atrapadas. En pantalla, con los datos de prueba: Percepciones de todo el año (4, que se compensan con sus notas de crédito), Facturas emitidas filtrada por cliente y por mes, el listado impreso con su subtotal, y la factura abierta desde la búsqueda vuelve a la búsqueda. **A 375 px, nada se desplaza hacia el costado.**

### El ticket, más corto

El QR pasa de unos 43 mm a unos **28 mm** (el punto de la impresora, de 6 a 4) y **sale la leyenda** *«Esta Agencia no se responsabiliza…»*, en el ticket que imprime la caja, en el de 80 mm del navegador y en la hoja A4. Una prueba nueva lo controla, rota a propósito y atrapada. 🟡 **Falta ver en papel que el QR chico se lea con el celular**: en la pantalla mide 26 mm.

### El importador dice antes qué va a hacer

> **Cómo se lo contás a Lucas:** cuando subís una planilla, antes de importar el sistema te dice cuántos productos son nuevos, cuántos ya están y cambian, y cuántos están iguales. De los que cambian te muestra qué: *Precio de venta: $98.000 → $104.000*. Vos elegís con casillas: crear los nuevos o no, y con los que ya están, no tocarlos o actualizar sólo lo que tildes —por ejemplo, sólo el precio—. Nada se borra nunca: lo que no está en la planilla queda como está, y una celda vacía no borra nada. Así se puede exportar, corregir en Excel y volver a subir sin miedo.

- **Con los que ya están no hay respuesta por defecto**: hay que elegir *Actualizar* o *No tocarlos*, o el botón no anda.
- **Los iguales no viajan**, y de los que cambian viaja **sólo lo elegido**: la base no toca lo que no viene.
- **Productos y clientes.** Los saldos de proveedores siguen como estaban: es un número por proveedor y la base ya lo deja igual al de la planilla.
- **Lee los listados de OBTech sin mapear nada a mano**: *Precio 1 C/IVA* es el precio de venta, y con *Precio 1 S/IVA* al lado **saca el IVA de cada producto**, redondeado a la alícuota de ARCA más cercana (en un precio de $1, la cuenta da 20,5 %). Del de clientes toma *Nombre Localidad* y no el número de *Localidad*, *Condición de Iva* y *Tel/Fax*, y deja afuera el CUIT 0, el teléfono de ceros, el «n/n» y el *Consumidor final* genérico.
- **Para clientes, la base cambió dos veces** ([`importar_clientes_sin_pisar_el_nombre`](../supabase/migrations/20261019130000_importar_clientes_sin_pisar_el_nombre.sql) y [`un_cuit_un_cliente`](../supabase/migrations/20261019131000_un_cuit_un_cliente.sql)): el nombre hace falta para crear un cliente, no para actualizarlo; y 🔴 **encontrado con el Excel real: un CUIT repetido fundía dos clientes en uno.** OBTech tiene **36 CUIT en dos o más clientes** —cinco dependencias de la Universidad, el mismo cliente cargado dos veces, un CUIT mal tipeado—. El sistema no admite dos clientes con el mismo documento, y la importación encontraba al primero por el CUIT y le pisaba el código y el nombre. Ahora el segundo se frena y dice de quién es el CUIT; la pantalla lo avisa antes de importar.

**Verificado:** **10 comprobaciones** en [`importar-sin-pisar-el-nombre.sql`](../supabase/pruebas/importar-sin-pisar-el-nombre.sql): **contra la función vieja fallaban** —«Falta el nombre» y el cliente A convertido en B—, en seco con la nueva anduvieron, y después se aplicó. La parte de clientes de [`importar-clientes-y-saldos.sql`](../supabase/pruebas/importar-clientes-y-saldos.sql) (19) anduvo con la función nueva aplicada. **15 pruebas** del comparador y de la lectura de los listados de OBTech, rotas a propósito dos veces y atrapadas; **una encontró que *Condición de Iva* no se reconocía**. Los dos Excel reales leídos con el código del importador: **2.281 productos sin errores** —2.241 con IVA 21 % deducido; 40 no tienen precio 1 y entran al 21 %— y **2.535 clientes**, más el genérico frenado. En pantalla, sin importar: el Excel de productos (2.281 nuevos), el de clientes (los 36 CUIT avisados) y una planilla chica con dos productos que ya estaban, que mostró el precio, el nombre y el IVA que cambiaban.

⚠️ **Todo OBTech está al 21 %.** Incluso *ALIM BAL ROYAL GATO*, que en el sistema estaba al 10,5 %. Si algo lleva 10,5 % —alimento para ganado, por ejemplo—, conviene que el contador lo confirme antes de cargar.

## Lo último que pasó — 19 de octubre

### Sin internet, nada espera al servidor

**Lo que se vio en el local el 16/10**, con internet cortado: la venta llegaba a la caja **diez segundos tarde o más**, abrir *Caja* o *Mostrador* tardaba, y cobrar e imprimir también. Todo lo demás anduvo bien.

> **Cómo se lo contás a Lucas:** cuando se cortaba internet, el sistema cada tanto volvía a probar si había vuelto, y lo probaba con lo que estuviera haciendo el vendedor o el cajero en ese momento: esa persona se quedaba esperando. Y además, cada pantalla insistía tres veces antes de leer lo que tiene guardado. Ahora la prueba la hace el sistema solo, de fondo, sin que nadie espere, y las pantallas leen lo guardado en el acto.

Eran **dos causas**, las dos en cómo la app habla con el servidor:

1. **El cortacircuito probaba con la consulta de alguien.** Desde el 17/09, después del primer fallo las consultas fallan en el acto y se lee la copia local. Pero cada quince segundos dejaba pasar la primera consulta que llegaba, para ver si internet había vuelto, y esa consulta esperaba hasta doce segundos. Si era la de mandar la venta, la venta recién salía en el segundo intento, a los catorce: es lo que se vio. **Ahora prueba una consulta propia, de fondo**, cada diez segundos y con seis de espera como máximo; mientras no vuelve, **ninguna consulta de la gente sale a la red**. Ver [`cortacircuito.ts`](../app/src/lib/cortacircuito.ts) y [`supabase.ts`](../app/src/lib/supabase.ts).
2. **La biblioteca de Supabase reintentaba sola.** Cada lectura que fallaba por red se reintentaba tres veces, con pausas: unos siete segundos antes de pasar a la copia local, aunque el cortacircuito ya la hubiera cortado. **Apagado** (`db: { retry: false }`). Y el reintento propio de las pantallas (uno, a un segundo) se saltea con el servidor dado por caído.

De paso, el aviso de conexión revisa cada quince segundos y no treinta —así el corte lo descubre él y no alguien cobrando— y se entera en el acto cuando el cortacircuito se abre o se cierra.

**Verificado en el navegador**, simulando un corte como el del local: cada pedido al servidor quedaba colgado, como con el módem sin salida.
- El sistema **descubrió el corte solo**, en 7 a 15 segundos, sin que nadie tocara nada; desde ahí **lo único que salió a la red fue la prueba de fondo**.
- **Ir de *Inicio* a Mostrador, Caja, Productos y Stock**: antes del arreglo, el Mostrador tardaba **7 a 9 segundos** en aparecer sin servidor; con el primer arreglo, 1 segundo; con los dos, **30 milisegundos**, en las cuatro.
- Al volver el servidor: a los 3 segundos estaba sincronizando y a los 7, *Al día*.
- **8 pruebas** del cortacircuito, reescritas para lo nuevo; rota a propósito —volver a dejar pasar consultas de la gente— y atrapada.

🟡 **No se pudo ver en el navegador**: la venta que viaja a la caja por la red del local, cobrar e imprimir, porque eso necesita el programa instalado. Se comprueba en el local con la 0.16.5: la venta tiene que llegar en un par de segundos y cobrar e imprimir no tienen que trabarse. **Lo que queda inevitable:** si se actúa en los primeros segundos después del corte, antes de que el sistema lo descubra, esa acción espera los doce segundos una vez.

**Qué es «7 en espera»**, en el aviso de arriba sin internet: son las operaciones hechas sin conexión —ventas, cobros, facturas con CAEA— que esperan subir al servidor. Cuando vuelve internet suben solas y el número baja a cero.

**Y un resguardo, visto de paso:** la PC no olvida su terminal si el servidor contesta con una lista vacía, que es lo que pasa con una consulta sin sesión. Una terminal dada de baja de verdad sí se olvida. 4 pruebas en [`terminal.prueba.ts`](../app/src/lib/terminal.prueba.ts), rota a propósito y atrapada.

## Lo último que pasó — 15 de octubre, a la tarde

**Los puntos 3 y 4 de lo pendiente.** El 2 —limpiar los datos de prueba— se dejó a propósito: mañana hay otra prueba en el local.

### El guion de la prueba del corte, con lo de octubre

[El guion](https://claude.ai/artifact/2LjCRbUhEr8RPvmQRG8keD) pasó de 22 a **29 puntos**: un grupo nuevo, *Lo que se sumó en octubre* (`o1`…`o7`). Son la primera factura del día (el botón *Cobrada · facturando…*), los avisos de stock en tres niveles, el historial de un producto, la caja y la suelta, la orden de compra interna, el pedido a un proveedor y recibir lo que se pidió. Y el punto `e4` ahora pide que una factura devuelta entera diga *Devuelta*. Los resultados que ya estaban marcados se conservan.

### «Tienda online» ya no se ofrece al cobrar

Está inactivo a propósito —es con lo que queda registrado lo que se cobró por la web—, pero aparecía para elegir en el **Mostrador, la Caja y la cobranza de cuenta corriente**: se cargan todos los medios, también los inactivos, porque Precios los necesita y una venta que ya lo trae tiene que encontrarlo. Ahora el filtro va en lo que se ofrece (`mediosParaElegir`, en [`precios.ts`](../app/src/lib/api/precios.ts)), no al cargar. **3 pruebas**, rotas a propósito y atrapadas.

### Productos y el Mostrador en una pantalla mediana

- **Productos, con la ficha abierta:** a 1024 px la lista quedaba de **114 px** para un contenido de 588 y se desplazaba hacia el costado. Ahora la lista y la ficha van juntas **desde 1280 px** (por debajo, la ficha reemplaza a la lista, como en una tablet), y al lado de la ficha la lista se achica a nombre con código, precio y stock. **Medido con la ficha abierta en 375, 768, 1024, 1280, 1366 y 1440 px: nada se desplaza**; la lista queda de 370 px a 1280 y de 456 a 1366. La lista sola, sin cambios en 375, 640 y 1024.
- **La tabla del Mostrador:** al lado del panel de 20 rem, a 1024 px le quedaban unos 400 px para 408 de columnas fijas más el nombre. Ahora mira el ancho que tiene, no el de la pantalla: con menos de 32 rem, el importe deja de ser columna y pasa debajo del precio (cuando la cantidad no es 1), y la cantidad es más angosta. ✅ **Medido el 15/10 a 1024 px** con dos líneas cargadas —una de 50 unidades, con $ 1.000.000,00 debajo del precio—: la tabla queda de 385 px y nada se desplaza.
- ~~⚠️ **Visto de paso:** la **Caja y el Mostrador no entran en un teléfono**.~~ ✅ **Corregido el 15/10.** Las dos tenían una columna fija de 20 rem —la cola en la Caja; el panel del cliente, el pago y el total en el Mostrador— y a 375 px a la otra parte le quedaban unos pocos píxeles. La medición del 30/09 miró la página y, sin PIN, vio la pantalla del PIN. Ahora, **por debajo de 1024 px se apilan**: en la Caja, la cola arriba —con su propio alto, para no tapar el cobro— y el cobro debajo; en el Mostrador, la tabla arriba y el panel debajo, a todo el ancho. La página se desplaza hacia abajo. **Desde 1024 px quedan exactamente como estaban**, que es como se usan en las PC del local. **La Caja, medida** con un pedido web elegido en la cola y el cobro abierto, sin cobrar, en 375, 640, 768, 1024, 1280 y 1440 px: **nada se desplaza hacia el costado**; a 375 la cola y el cobro miden 343 px de ancho, uno debajo del otro, y a 1440 siguen lado a lado, la cola de 320 y el cobro de 816. **El Mostrador, medido** en los mismos seis anchos con una venta cargada sin mandarla a caja; a 375 la tabla todavía se pasaba **6 px**, así que, cuando le quedan menos de 24 rem, se ajusta más: márgenes chicos, el título *Cant.*, el % arriba del precio y el nombre que puede cortarse en cualquier letra. **Medido otra vez a 375 y 1024 px** con *ALIMENTO BALANCEADO A GRANEL* y una línea de 50 unidades ($ 1.000.000,00): **nada se desplaza**. El PIN lo puso la persona. ⚠️ **Va en la próxima versión que se construya**: la 0.16.3 ya estaba construida.

### La tarjeta de crédito entraba al arqueo

✅ **Corregido el 15/10**, con el visto bueno de la persona. En la base, *Tarjeta de crédito* tiene tildado **«Entra al arqueo de caja»**. Se sembró sin tildar; quedó tildado el **17/09 a las 17:02**, en el local, en la misma edición que le cambió la lista a Contado y las cuotas a tres —lo del recargo por cuotas de ese día—. La auditoría no registra quién. **La consecuencia:** el cierre suma al efectivo que espera en el cajón todo lo cobrado con un medio que entra al arqueo, así que cada venta con tarjeta agranda una diferencia que no existe. **Lo que se hizo:** [`la_tarjeta_no_va_al_cajon`](../supabase/migrations/20261015140000_la_tarjeta_no_va_al_cajon.sql) la destilda —a las dos tarjetas, también a la dada de baja— y agrega una regla en la base, igual que la del cheque: **una tarjeta no puede entrar al arqueo**. Sin la regla, el error vuelve con la próxima edición distraída. En *Precios*, la casilla de una tarjeta queda apagada con la explicación (`esTarjeta`, en [`precios.ts`](../app/src/lib/api/precios.ts)); eso va en la 0.16.3. La tarjeta conserva sus tres cuotas y la lista Contado. El cambio de la base sube la fecha del medio, así que **baja solo a la copia local de cada PC**.

**Verificado:** **7 comprobaciones** en [`supabase/pruebas/la-tarjeta-no-va-al-cajon.sql`](../supabase/pruebas/la-tarjeta-no-va-al-cajon.sql), como un Administrador y por la misma función que usa Precios, en seco y después de aplicar. **Rota a propósito** —corregir el dato sin la regla— y atrapada: Precios la dejaba volver a tildar. **618 pruebas** en la app, 2 nuevas. En pantalla, *Precios* dice «Tarjeta de crédito · Contado · no entra al arqueo» y, al editarla, la casilla está apagada y sin tildar.

## Lo último que pasó — 15 de octubre

### Una venta, una sola factura en ARCA

**Los dos riesgos que quedaron anotados el 14/10, cerrados.** El detalle está en [`un_pedido_de_cae_por_vez`](../supabase/migrations/20261015120000_un_pedido_de_cae_por_vez.sql) y en [`consulta.ts`](../supabase/functions/arca-wsfe-solicitar-cae/consulta.ts).

> **Cómo se lo contás a Lucas:** si el cajero aprieta *Reintentar* mientras la factura todavía se está pidiendo, o si ARCA autoriza la factura y la respuesta se pierde en el camino, antes el sistema podía pedir otro número y quedaban dos facturas en ARCA para una sola venta. Ahora el segundo pedido espera al primero y devuelve la misma factura; y antes de pedir un número nuevo, el sistema le pregunta a ARCA si ya tiene esa factura, y si la tiene, la toma.

- **Un pedido de CAE por vez en cada serie** (punto de venta y tipo de comprobante). Es un turno anotado en la base, con vencimiento: la función habla con la base en llamadas sueltas, y un bloqueo común se soltaría en la primera. Si la función se muere a mitad de camino, el turno vence solo, a los treinta segundos.
- **El que llega segundo espera** y, si era para la misma venta, devuelve el CAE que sacó el primero. Si el turno no se libera a tiempo —unos trece segundos—, no manda nada y lo dice. **Eso no se anota como caída de ARCA**: no habilita la contingencia.
- **Si el último número de ARCA ya alcanzó al del comprobante, primero se le pregunta qué tiene** (`FECompConsultar`). Si es esta venta —mismo receptor, fecha y total, autorizada con CAE—, se guarda ese CAE. Si es otra, se renumera como antes, y queda anotado el motivo. Si ARCA no puede decir qué tiene, no se renumera sobre la duda: se devuelve el error.
- **La Caja**: mientras espera el CAE, el botón dice *Cobrada · facturando…* (o *sacando el comprobante…*): la plata ya entró y el cajero no tiene que dudar.

**Verificado:** **15 comprobaciones** del turno en [`supabase/pruebas/turno-del-pedido-de-cae.sql`](../supabase/pruebas/turno-del-pedido-de-cae.sql), en seco junto con la migración y otra vez después de aplicarla; **rota a propósito** —tomar el turno sin mirar el vencimiento— y atrapada. **17 pruebas** nuevas de cómo se lee la consulta y cuándo es el mismo comprobante, **rotas a propósito dos veces** —aceptar lo emitido con CAEA y tomar cualquier error como «no tiene nada»— y las dos atrapadas. Una tercera rotura no la atrapó nada y mostró que ese código sobraba: se sacó. **613 pruebas** en la app. Y **contra ARCA de homologación, con la función v9**:
- **Dos pedidos a la vez** para la venta CAJA1-000011: los dos devolvieron el mismo CAE; a ARCA llegó un solo pedido, con el número 29.
- **La respuesta perdida**: la factura B 0001-00000028 se dejó a mano como pendiente y sin CAE, y se reintentó. Una sola consulta a ARCA (148 ms) recuperó el mismo CAE y vencimiento, con el mismo número, sin pedir otro.
- **El turno que no se libera**: con uno tomado a mano, el pedido esperó catorce segundos, contestó con el motivo, no llegó a ARCA y no dejó ningún intento anotado.

✅ **El botón, visto en pantalla el 15/10**: se cobró en la Caja una venta de prueba con factura, y el botón pasó de *Cobrando…* (un segundo, mientras entraba la plata) a *Cobrada · facturando…* (cinco segundos, mientras se pedía el CAE) y terminó en *cobrada y facturada*. Después se la devolvió desde Facturación: la nota de crédito salió con CAE y el stock volvió.

🟡 **Falta publicar la 0.16.2.** Y el caso «el número es de otra venta» se probó en las pruebas, no contra ARCA: armarlo pide un número ocupado en ARCA por otra cosa.

⚠️ **Datos de prueba que cambiaron:** la venta de prueba CAJA1-000011 quedó facturada en homologación, B 0001-00000029, con fecha del 15/10; para eso, la alineación corrió al 37 la factura rechazada de *Granja Tres Colonias* (CAJA1-000010), que tenía el 29. La factura 28 volvió a quedar autorizada, con el mismo CAE. Y la venta **CAJA1-000033** (*PRUEBA boton facturando*, una unidad de PRUEBA-CHQ) quedó cobrada en la caja del servidor, facturada (B 0001-00000030) y devuelta (nota de crédito B 0001-00000004), todo en homologación.

### Y la factura devuelta entera ya no ofrece «Devolver parte»

**Visto al devolver la venta de prueba.** En Facturación, una factura devuelta entera seguía ofreciendo *Devolver parte* y no mostraba *Devuelta*. Pasaba con **cuatro facturas**, desde septiembre. La devolución entera anula la venta, pero no anota renglón por renglón qué volvió, y la vista sólo miraba eso. **No había riesgo**: la base ya frenaba la devolución con «La venta está anulada: no hay nada que devolver». Ahora, en [`vista_comprobante_estado`](../supabase/migrations/20261015130000_la_devuelta_entera_no_ofrece_partes.sql), una venta anulada no tiene nada por devolver. No hizo falta tocar la app.

**Verificado:** **10 comprobaciones** en [`supabase/pruebas/lo-que-queda-por-devolver.sql`](../supabase/pruebas/lo-que-queda-por-devolver.sql), como un Administrador. Contra la vista vieja **fallaba**, con las cuatro facturas; en seco junto con la migración y después de aplicarla, **anduvo**. **Rota a propósito** con un arreglo de más —cortarle el botón a toda factura con nota de crédito—: **la primera versión de la prueba no lo atrapó**, porque la única venta con devoluciones parciales ya había vuelto entera. Se le sumó una devolución parcial de una unidad, armada adentro de la prueba y deshecha al terminar, y ahí la atrapó. **En pantalla:** la factura 30 muestra *Devuelta* y sólo *Ver / imprimir*; la 29, sin devolver, sigue con *Devolver* y *Devolver parte*.

## Lo último que pasó — 14 de octubre

### La factura ya no se corta a los doce segundos

**El pedido de CAE espera lo que tarda ARCA, y la app no se da por desconectada mientras tanto.** Lo pidió la sesión de la consulta de CUIT el 01/10; se construyó ese día y se terminó, probó y publicó el 14/10.

> **Cómo se lo contás a Lucas:** la primera factura del día le pide a ARCA un permiso nuevo, y ARCA a veces tarda más de diez segundos en darlo. El sistema cortaba a los doce: el cajero veía «la factura quedó pendiente» mientras la factura salía igual, y encima el sistema creía que se había cortado internet, así que la venta siguiente se facturaba por contingencia con internet andando. Ahora espera lo que haga falta —hasta treinta y cinco segundos— y lo que muestra la pantalla es lo que pasó.

- **La app espera 35 s a las funciones que hablan con ARCA** —CAE, CAEA y la consulta de CUIT— y 12 a todo lo demás, como siempre. Están en [`funcionesDeArca.ts`](../app/src/lib/funcionesDeArca.ts).
- **Las funciones de factura contestan siempre antes de los 25 s** (`PLAZO_ARCA_MS`), aunque ARCA no conteste. El permiso de WSAA no tenía tiempo máximo y la del CAEA no tenía ninguno: ahora todo cuelga del mismo plazo. Si ARCA tardó tanto que quedan menos de cinco segundos, **el CAE no se pide** —cortarlo a mitad de camino podría dejarlo autorizado allá y pendiente acá— y se anota como demora de ARCA.
- **«Ya posee un TA valido»**: ARCA no entrega dos permisos juntos. El 01/10 la tarea diaria mandó dos pedidos a la vez y uno falló así; ahora el segundo usa el que guardó el primero.
- **El resultado de ARCA se escribe sólo si el comprobante sigue esperando ese pedido**: si mientras tanto se lo emitió con CAEA o lo autorizó otro pedido, no se lo pisa y se avisa.
- **Informar CAEA** corta a tiempo si ARCA viene lenta: lo que no entró queda para el próximo intento.

**Verificado contra la base real y ARCA de homologación, el 14/10:** la venta CAJA1-000026 (del 17/09, en el panel rojo) se facturó desde Facturación con el permiso forzado a renovarse: **WSAA tardó doce segundos** en contestar, el pedido entero dieciséis, salió con CAE —factura B 00001-00000028— y el indicador siguió en *Al día*. Con el límite viejo se cortaba. Un reintento con CUIT inventado volvió rechazado con el motivo a la vista. La tarea diaria, con dos pedidos juntos y el permiso a punto de vencer, contestó bien las dos veces. **Ese dato de los doce segundos subió el plazo de 20 a 25** y la espera de la app de 30 a 35: con 20, el CAE se había pedido con cinco segundos justos. **596 pruebas** en la app, 7 nuevas; se rompió a propósito el reconocimiento de las funciones y la prueba lo atrapó.

✅ **Publicado el 14/10**: las funciones (CAE v8, CAEA v7) y **la 0.16.1**, con la espera de 35 s. Verificado en Cloudflare: `actualizaciones/latest.json` dice 0.16.1, firmada. La publicó la persona desde `cmd`, sin tropiezos. **Hasta que cada PC haga *Actualizar ahora*, esa PC sigue cortando a los doce.**

⚠️ **No apretar *Facturar* en la venta MOS1-000014** ($68.000, del 01/10), que aparece en el panel rojo de Facturación. Casi seguro es la venta de la prueba sin internet: se cobró en el local ese día a las 12:46, fiscal y en efectivo, y en el servidor no tiene factura; su factura con CAEA sería la 0009-00000001, que quedó en la cola de la caja. Facturarla de nuevo dejaría dos facturas para la misma venta. **Se confirma en la caja**, en Facturación, entre las emitidas en el corte que dicen *Falta subir*; y se resuelve abriendo el sistema ahí con internet.

✅ ~~**Quedan dos cosas del mismo tema, para decidir:**~~ **Cerradas el 15/10**, arriba. Lo que decía: (1) **dos pedidos de CAE para el mismo comprobante a la vez** —un reintento apretado mientras el primero sigue— pueden sacar dos números autorizados para una sola venta; ahora es mucho menos probable porque la pantalla ya no se rinde antes, pero cerrarlo del todo pide un candado en la base. (2) **Si ARCA corta la respuesta de un CAE que sí autorizó**, el reintento lo renumera y pide otro; lo correcto es preguntarle primero por ese número (`FECompConsultar`). Y uno chico de pantalla: mientras espera el CAE, el botón de la Caja dice *Cobrando…* cuando la venta ya está cobrada.

## Lo último que pasó — 12 de octubre

### El pedido a proveedor, entero

**Compras → *Pedidos*, nueva.** Se elige el proveedor y aparecen todos sus productos —sin las sueltas: se compra la caja—, con cuánto hay, con cuánto avisa, el último costo, el bulto, el peso y **lo que pidieron las órdenes internas**. *Pedir* arranca con lo de las órdenes y se completa a mano; arriba, **el mínimo del proveedor y cuánto falta**, en su unidad. El pedido sale numerado, se imprime **sin precios** o se copia para WhatsApp, y **las órdenes internas que entraron quedan pedidas solas**. El detalle, en [[Lo construido, en detalle]], §11c.

> **Cómo se lo contás a Lucas:** en la ficha de cada proveedor ponés su pedido mínimo —en pesos, en bultos o en kilos—. Cuando vas a pedir, entrás a Compras → Pedidos, elegís el proveedor y ves todo lo que le comprás: lo que está en rojo arriba, y al lado lo que te pidió el de depósito en sus órdenes, que ya viene puesto. Sumás un poco de cada cosa y arriba te va diciendo «faltan 55 kg» hasta que llegás. Lo imprimís o lo copiás y se lo mandás por WhatsApp. Las órdenes del depósito quedan como pedidas.

- **Una orden con renglones de dos proveedores** queda pedida recién cuando se pidieron los dos; cada renglón dice *En el pedido 000012*. **Anular el pedido** la devuelve a pendiente.
- **Un pedido armado sobre una orden que cambió no sale**, y un reintento por un corte de conexión no lo hace dos veces.
- **El pedido se va guardando en esa computadora** mientras se arma: se puede salir a mirar otra cosa y volver.
- 🔴 **Encontrado al armarlo: corregir una orden interna con renglones ya pedidos les borraba el pedido**, y volvían a aparecer para pedir. Ahora no se puede corregir; primero se anula el pedido. Visto con la función de antes y con el arreglo.
- **De paso, por el revisor de seguridad de Supabase:** las funciones con permiso de dueño ya no se pueden llamar sin iniciar sesión (salvo la API de la tienda, que entra con su clave), y los avisos de stock fijan su `search_path`. No eran una puerta abierta: todas controlan el permiso de la persona adentro.

**Verificado:** **39 comprobaciones** en [`supabase/pruebas/pedido-a-proveedor.sql`](../supabase/pruebas/pedido-a-proveedor.sql), en seco y después de aplicar; **rota a propósito cinco veces** —tres en la base, dos en la pantalla— y las cinco atrapadas. **585 pruebas** en la app, 14 nuevas. Y en pantalla, en escritorio y a 375 px sin nada que se desplace: un pedido con los guantes de una orden, 7 bolsas y 24 pipetas llegó al mínimo de 100 kg; el borrador volvió después de ir a Stock; la orden quedó pedida; se copió, se imprimió y se anuló, y la orden volvió a pendiente. La ficha del proveedor no deja guardar un mínimo sin número.

⚠️ **Datos de prueba que quedaron:** el pedido **000008**, anulado, y la orden interna **000015**, anulada; el proveedor *PRUEBA PEDIDOS SRL* y sus productos *PRUEBA-PP-…*, dados de baja. **La numeración de pedidos arranca en el 8**: las corridas de prueba gastan números aunque se deshagan.

### Y la recepción, desde el pedido

**Al recibir la mercadería de una factura, si hay pedidos a ese proveedor esperando, se ofrecen: *Traer el pedido* carga sus productos con lo que falta llegar.** Al terminar dice si llegó completo o qué no vino, y si algo de lo que llegó lo había pedido un cliente, a quién avisarle. El detalle, en [[Lo construido, en detalle]], §11c.

> **Cómo se lo contás a Lucas:** cuando llega la factura del proveedor y vas a recibir la mercadería, arriba te aparece el pedido que le hiciste. Tocás *Traer el pedido* y ya están los productos con las cantidades: corregís lo que vino distinto y copiás los costos del papel. Al final te dice qué no vino. Si el resto llega en otra factura, traés el mismo pedido; si no va a venir, en Pedidos tocás *Dar por terminado*. Y si algo era para un cliente, te avisa a quién llamar.

- **El pedido queda recibido solo cuando llegó todo**; si llegó una parte, dice *Llegó en parte* y, en cada renglón, cuánto llegó y cuánto falta.
- **Dar de baja una factura que había completado un pedido lo vuelve a dejar por recibir.** Uno cerrado a mano no se reabre.
- **Con mercadería recibida, el pedido ya no se anula**: se da por terminado. Anularlo devolvería las órdenes a pendiente y se pediría dos veces lo mismo.
- **El aviso al cliente sale sólo cuando llega algo suyo**: visto en pantalla, salía también en la segunda factura, que traía sólo lo de otro.
- **`recibir_mercaderia` no se tocó**: la factura se ata al pedido antes de recibir, y un disparador mira cuánto llegó.
- **De paso, la recepción ya no se desplaza a lo ancho en el celular**: la tabla se pasaba 9 px —«Quitar» quedaba cortado— y el resultado, 94. Estaba así desde el 28/09.

**Verificado:** **26 comprobaciones** en [`supabase/pruebas/recepcion-desde-el-pedido.sql`](../supabase/pruebas/recepcion-desde-el-pedido.sql), en seco y después de aplicar; **rota a propósito tres veces** —anular con mercadería recibida, reabrir uno cerrado a mano, y el disparador sin mirar las bajas de factura— y las tres atrapadas. **589 pruebas** en la app. Y en pantalla: una factura con las 6 bolsas y 10 de las 24 pipetas dejó el pedido *Llegó en parte* con «faltan 14» y el aviso al cliente; dar de baja la segunda factura lo volvió a *por recibir*; una tercera con las 14 lo completó sin repetir el aviso. A 375 px, nada se desplaza.

⚠️ **Datos de prueba que quedaron:** el pedido **000021** y la orden interna **000021**, anulados; las facturas *0009-00777001* a *00777003* de *PRUEBA RECEPCION SRL*, dadas de baja (su mercadería salió del stock); el proveedor, sus productos *PRUEBA-RP-…* y el cliente *PRUEBA CLIENTE RECEPCION*, dados de baja.


**La planilla de productos trae el mínimo y la suelta.** Lucas dijo el 07/10 que el mínimo lo va a cargar al dar de alta los productos, y conviene que esté listo antes de que llegue su Excel. **Construido, verificado y aplicado en la base; la pantalla falta publicarla (0.15.1).** El detalle, en [[Lo construido, en detalle]], §4.

> **Cómo se lo contás a Lucas:** en el Excel del catálogo sumá una columna *Stock mínimo*: con ese número el producto se pone en rojo. Si querés también el amarillo —«hay que ir pidiendo»—, otra columna *Stock bajo*. Para lo que se vende suelto, dos columnas más: *Sale de*, con el código de la caja, y *Cuántas trae*. La caja puede estar en cualquier fila.

- **«Stock mínimo» es el crítico**, como lo dijo Lucas: «cuando tenga dos bolsas, avisame que estoy en crítico». Si viene sólo el mínimo, el amarillo queda con el mismo número; si el producto ya tenía un aviso propio, se cambia sólo el número que vino.
- **Es el mismo aviso de la ficha**, y pasa por la misma función: lo que se quitó se puede volver a poner, y el cambio llega a las PC del local.
- **La suelta se ata por el código de su caja.** La pantalla manda primero las cajas y después lo que sale de ellas, aunque en el Excel estén al revés, y los mensajes siguen nombrando la fila del Excel, ahora en orden. Si la caja no existe, ya se abre en otra cosa o atarla armaría una vuelta, el producto entra igual y la fila lo dice.
- **El costo de una suelta sigue saliendo de su caja**, aunque la planilla le traiga uno propio. Lo mostró la prueba rota a propósito: sin eso, la pastilla quedaba con el costo del Excel.
- **Lo mal escrito no crea nada y se avisa antes de importar:** un mínimo mayor que el bajo, un número negativo, una suelta sin cuántas trae (o al revés), «trae 0», un producto que sale de sí mismo.
- **Las columnas *Envase* y *Unidades por caja* no se toman como suelta:** en una planilla de agroveterinaria dicen «Bidón» o cuánto trae el bulto del proveedor, y frenarían todas esas filas.

**Verificado:** **29 comprobaciones** en [`supabase/pruebas/importar-minimo-y-suelta.sql`](../supabase/pruebas/importar-minimo-y-suelta.sql), como un Administrador, corridas en seco junto con la migración antes de aplicarla y otra vez después. **Se rompió a propósito tres veces en la base** —sin volver a sacar el costo de la caja, sin mirar si la caja ya se abre en otra cosa, y dejando que el número que estaba le gane al que vino— **y cuatro en la pantalla**: las siete fueron atrapadas. **566 pruebas** en la app, 14 nuevas. Y en pantalla: una planilla con la pastilla arriba de su tableta y la tableta arriba de su caja reconoció las siete columnas sin ayuda, frenó antes de importar la fila del mínimo mal escrito, entraron las otras cinco y la cadena quedó atada; el único aviso nombró la fila 7 del Excel, que era la correcta. La ficha de la caja mostró su aviso (3 y 1) y los tres niveles. Nada se desplaza a lo ancho en 375 px. **Los productos de prueba quedaron dados de baja** (*PRUEBA-PLAN-…*). El manual ya lo explica, en Productos.

**Llegó la respuesta del mínimo de los proveedores:** es variado. Hay proveedores directos y otros que revenden varias marcas, y cada uno se maneja distinto: unos piden un monto, otros bultos, otros kilos. Ver *Lo que sigue*, punto 16.

### Y el peso y el bulto de cada producto

Para que el pedido al proveedor pueda decir «faltan 40 kilos» o «faltan 2 bultos», cada producto tiene que saber cuánto pesa y cuántas unidades trae el bulto en que se compra. **Se sumaron como dos columnas más de la planilla**, para que entren con el Excel del catálogo, y **en la ficha, sección Proveedor**, donde se ven y se corrigen.

> **Cómo se lo contás a Lucas:** en el Excel sumá *Peso (kg)* —cuánto pesa una unidad: la bolsa de 15 kg, 15— y *Unidades por bulto* —cuántas trae la caja en que se la comprás al proveedor—. No hace falta para todo: el peso, para lo que se le pide a un proveedor que cuenta en kilos; el bulto, para el que cuenta en bultos.

- **Columnas nuevas, no las de «contenido»** que estaban sin uso: el contenido puede estar en mililitros o gramos, y el pedido tendría que convertir para sumar kilos. El peso va siempre en kilos.
- **No bajan a las PC del local:** el pedido se arma con internet, y sumarlas a la copia local obligaría a volver a bajar los productos en cada máquina.
- **«Unidades por caja» se lee como bulto**, no como suelta: en una planilla de compras es lo que trae el bulto del proveedor.
- **Cero no se acepta** —ni en la planilla ni en la ficha—; vacío sí, y quiere decir «no se sabe».

**Verificado:** la misma prueba suma 4 comprobaciones (**33**), en seco y después de aplicar. Rota a propósito dos veces en la base —sin frenar el cero y borrando lo que la planilla no trae— y dos en la pantalla: las cuatro atrapadas. **571 pruebas** en la app. En pantalla, a 375 px: la planilla reconoció *Peso (kg)* y *Unidades por caja* sin ayuda y frenó un peso en cero; el producto entró con 15 kg y 1 por bulto, la ficha los mostró en Proveedor, y guardar un peso en cero dijo *«El peso tiene que ser más que cero. Si no se sabe, dejalo vacío.»* sin guardar nada. El producto de prueba (*PRUEBA-PESO-1*) quedó dado de baja. De paso, el botón dice *Importar 1 producto* y no *1 productos*.

✅ **Publicada la 0.16.0 el 12/10** —lleva todo lo del 12/10; la 0.15.1 no llegó a salir—. Verificado en Cloudflare: `actualizaciones/latest.json` dice 0.16.0, el instalador se descarga y la web es la nueva. **El manual nuevo ya se puede mandar.** Publicarla costó tres vueltas, anotadas en *Cómo arrancar* → *Publicar una corrección*: PowerShell no deja correr `npm`, el antivirus corta la conexión de wrangler, y el control de permisos de las sesiones no deja publicar desde el chat.

---

## Lo último que pasó — 9 de octubre

**Los dos huecos que quedaban del alcance de V1-A, cerrados, y la orden de compra interna. Publicado en la 0.15.0.** El detalle, en [[Lo construido, en detalle]], §3f, §3g y §11b.

### 1. Los avisos de stock, en sus tres niveles

**Una pestaña nueva en Stock: *Avisos*.** El general y el de cada categoría —con cuántos productos tiene cada una—, y la lista de los productos que tienen uno propio. El del producto se sigue cambiando en su ficha.

> **Cómo se lo contás a Lucas:** en Stock → Avisos ponés con cuánto avisa todo el local, y si una categoría necesita otro número —Alimentos, que se pide por bolsa—, se lo ponés a la categoría y vale para todos sus productos. Un producto que necesita uno propio, en su ficha. Gana el más específico.

- **El general lo cambia quien configura avisos** (Administrador y Encargado), con una función propia: vivía en Configuración, que el Encargado no puede tocar.
- 🔴 **Encontrado de paso: quitar un aviso no llegaba a las PC del local.** Se borraba la fila, y la sincronización baja «lo que cambió», no lo borrado: el mostrador seguía pintando Crítico con un aviso que ya no existía. Ahora quitar marca la fila (`eliminado_en`) y la marca viaja. Pasaba también con el aviso del producto, desde el 08/09.

### 2. El historial de movimientos de cada producto

**En Stock, tocando el nombre de un producto, y en su ficha, en el desplegable *Movimientos de stock*.** Cada movimiento con cuándo pasó, qué fue, el documento, quién lo hizo y en qué computadora, cuánto movió y **cuánto quedó después**. Lo que se hizo sin internet va a la hora en que pasó y lleva la marca *sin internet*. Era el punto 2 de terminado: «el movimiento queda con usuario y hora».

- 🔴 **Encontrado mirándolo en pantalla:** la venta de una suelta y la apertura de la caja pasan en el mismo instante, y el orden entre las dos quedaba al azar. La mitad de las veces el historial habría dicho «Venta −1, queda −1». Ahora la apertura va siempre antes. Migración aparte, con una prueba que lo arma a propósito con el desempate en contra: sin el arreglo da `{9, −1}`.

### 3. La orden de compra interna

**Compras → *Órdenes internas*, como el dibujo de Lucas.** Emite y recibe de una lista de sectores (se suman ahí mismo), renglones con código, descripción, el proveedor de la ficha ya puesto y cantidad, renglones libres para lo que no está en el catálogo, observación y el cliente con su contacto. Se imprime en A4 con la firma del responsable. Ver [`pedidos-lucas-2026-10-07.md`](pedidos-lucas-2026-10-07.md), punto 2.

> **Cómo se lo contás a Lucas:** el de depósito entra a Compras → Órdenes internas, toca *Nueva orden*, elige «Depósito» y «Compras», pasa el lector por lo que falta y pone cuánto. Al lado de cada producto ya aparece a quién se le compra. La imprime, la firma y te la da. Vos la marcás *pedida* cuando la pediste. Las pendientes quedan a la vista hasta que alguien las resuelve.

- **La hace cualquier puesto** (permiso nuevo, *compras.solicitar*, para todos) **sin ver costos ni cuentas**; **marcarla pedida es de quien compra** (*compras.ver*).
- **Se corrige mientras está pendiente**; pedida o anulada, ya no. Se anula con motivo.
- **No mueve stock ni plata**: tablas y funciones nuevas, al costado de lo que anda.
- **Lo que no está todavía: el pedido al proveedor** —elegir un proveedor y ver todos sus productos con stock, mínimo y lo que pidieron las órdenes—. Espera una respuesta de Lucas: el mínimo que le acepta un proveedor, ¿es en plata, en bultos o en kilos?

### 4. Lo que faltaba de la 0.14.0

**La copia local de las PC ahora baja los productos enteros una vez.** El proyecto lo exige cada vez que se suman columnas a lo que baja la copia local, y la 0.14.0 —la caja y la suelta— no lo hizo: una suelta armada mientras una PC seguía con la versión anterior habría quedado, en esa PC, sin saber de qué caja sale. Sólo afectaba lo que muestra el mostrador, no lo que se descuenta. Con la 0.15.0 cada PC vuelve a bajar los productos y los avisos una vez.

**Verificado contra la base real:** **27 comprobaciones** en [`supabase/pruebas/avisos-y-movimientos.sql`](../supabase/pruebas/avisos-y-movimientos.sql) y **31** en [`supabase/pruebas/orden-de-compra-interna.sql`](../supabase/pruebas/orden-de-compra-interna.sql) —la orden también como Vendedor y sin cuenta—, corridas en seco junto con las migraciones. **Se rompió a propósito cuatro veces** —quitar un aviso borrando la fila, el historial ordenado por cuándo llegó, la apertura después de la venta, y el vendedor marcando pedida— y **las cuatro fueron atrapadas**. **552 pruebas** en la app, 14 nuevas. Y en pantalla: un aviso de 20/8 a Alimentos pasó de 2 a 4 sus críticos y quitarlo llegó a la copia local marcado; el general a 12/4 y de vuelta a 10/3, y un crítico mayor que el bajo apaga el botón; el historial de la suelta de prueba; una orden con dos productos —con su proveedor puesto— y un renglón libre, corregida, marcada pedida, vuelta a pendiente y anulada, y su hoja impresa. Nada se desplaza hacia el costado en 375, 640, 768 ni 1024 px —la hoja de la orden se pisaba en el celular, corregida—.

⚠️ **Datos de prueba que quedaron:** la orden interna **000002**, anulada («Prueba del sistema, 09/10») —la 000001 se la llevó una corrida de prueba que se deshizo—, y el aviso de Alimentos, quitado. Siguen los de la caja y la suelta (*PRUEBA-CAJA10* y su suelta).

---

## Lo último que pasó — 8 de octubre

**La caja y la suelta, construida, verificada y publicada en la 0.14.0.** Lucas la pidió el 07/10 y el 08/10 contestó que le parecía bien, y que hay unos cinco productos que se venden por caja, por tableta y por pastilla. Era el tercer hueco del alcance de V1-A. El detalle, en [`pedidos-lucas-2026-10-07.md`](pedidos-lucas-2026-10-07.md) y en [[Lo construido, en detalle]], §3e.

> **Cómo se lo contás a Lucas:** cargás la caja como te llega. En la ficha de la caja tocás *Crear la suelta*, ponés cuántas trae y el precio de la pastilla, y listo; si hay tres niveles, a la tableta le creás su suelta, la pastilla. Cuando el vendedor vende una pastilla y no quedan sueltas, el sistema abre una tableta, y si no quedan tabletas, abre una caja. Te va a mostrar *0 cajas, 9 tabletas, 9 pastillas*: nunca una caja que ya no está. El aviso de stock bajo lo da la caja, que es lo que pedís; nueve pastillas sueltas con la caja llena no te aparecen como faltante.

- **Cada nivel es un producto**, con su precio y su código; la suelta dice de qué envase sale y cuántas trae. Por eso la venta, la factura, el trabajo sin internet, las devoluciones y la tienda no cambiaron.
- **La caja la abre la base, en la misma venta**, también para las PC que todavía no se actualizaron. Queda en el libro como apertura, con la venta que la provocó, quién y cuándo.
- **Lo que vuelve, vuelve suelto**: la caja ya está abierta.
- **El costo de la suelta sale de la caja** y se actualiza solo con cada recepción; **el precio lo pone Lucas**, y la ficha sugiere la división.
- **En pantalla:** la sección *Caja y suelto* en la ficha, *«9 sueltas · 19 abriendo lo cerrado»* en Stock y en Productos, y en el mostrador lo disponible con las sueltas debajo, con y sin internet.

Verificado contra la base real: **26 comprobaciones** en [`supabase/pruebas/caja-y-suelta.sql`](../supabase/pruebas/caja-y-suelta.sql), con ventas cobradas y anuladas como un Administrador, corridas en seco junto con la migración antes de aplicarla. **La corrida encontró un error real** —«trae 0» daba una división por cero en vez del mensaje de la base— y se corrigió antes de aplicar. Se rompió a propósito sacándole al disparador la reacción a la apertura, y la prueba lo atrapó. **538 pruebas** en la app, 11 nuevas. Y en pantalla: se creó la suelta desde la ficha de una caja, se simuló la venta de una y quedaron 1 caja y 9 sueltas; la copia local del mostrador contó lo mismo que el servidor; nada se desplaza hacia el costado en 375, 640 ni 768 px —la lista de Productos se pasaba 45 px con la línea nueva, corregido—.

⚠️ **Quedaron como datos de prueba** los productos *PRUEBA-CAJA10* (1 caja) y *PRUEBA-CAJA10-S* (9 sueltas), con una venta simulada en el libro. Sirven para mostrárselo a Lucas; después, darlos de baja.

**Y la consulta de CUIT a ARCA ya anda contra ARCA de pruebas**: Lucas creó la autorización el 08/10. Con su CUIT devolvió el nombre y el aviso de que le falta el domicilio fiscal electrónico —la pantalla lo muestra y deja elegir la condición a mano—; con el de una empresa, la constancia completa; y con otro, *«ARCA no devolvió los datos»* con el motivo. Los datos de pruebas de ARCA son inventados, así que no sirven para controlar contenidos, sólo que se lean bien. **Falta lo mismo para producción**, con el certificado de producción.

**Lucas mandó el modelo de la orden de compra interna**: un dibujo como una factura, con *Emite* y *Recibe* desplegables, código, descripción, proveedor y cantidad, observación, el contacto del cliente si es para uno, y la firma del responsable. Ver *Lo que sigue*, punto 16.

---

## Lo último que pasó — 1 de octubre, en el local y a la tarde

**La venta llegó a la caja sin internet.** Era la promesa grande —el punto 2-bis— y lo único de V1-A que se había probado y fallado. Con el módem desenchufado, el mostrador mandó la venta, la caja la cobró, emitió con el CAEA y el ticket salió solo, con los acentos bien.

> **Cómo se lo contás a Lucas:** si se corta internet, el vendedor manda la venta a la caja igual que siempre, por el cable del local, y la caja la cobra y le da el ticket al cliente. Cuando vuelve internet, todo sube solo.

**Por qué no andaba el 17/09:** el mostrador buscaba a la caja por su nombre, y Windows contesta primero con la dirección nueva (IPv6, `fe80::…`), donde la caja no escuchaba. `ping DESKTOP-O4R9STD` lo mostró en el local. Arreglado en la 0.13.1: el mostrador prueba todas las direcciones, primero las IPv4, y la caja escucha también en IPv6. *Probar la conexión* ahora dice el motivo real cuando falla —antes se perdía y decía sólo «No se pudo hablar con el punto de encuentro»—.

**Lo que salió de la prueba, ya arreglado:**
- 🔴 **La factura emitida con CAEA no subía.** El servidor contestaba *«new row violates row-level security policy for table secuencia_comprobante»*: la función que la recibe corre como el usuario, y había permiso para leer y actualizar la serie pero no para crearla. La 0009-00000001 era la primera de su serie. Migración `permiso_crear_secuencia`, aplicada; **7 comprobaciones** en [`supabase/pruebas/factura-caea-sin-conexion.sql`](../supabase/pruebas/factura-caea-sin-conexion.sql), como usuario, que antes de la migración daban el mismo error del local. Las pruebas viejas corrían como dueño de la base y no lo veían.
- 🔴 **La caja dejaba de escuchar al volver internet.** Cada pantalla que consulta la terminal la refresca, y eso reiniciaba la escucha; al reabrir, el puerto seguía tomado unos milisegundos y Windows lo negaba. Ahora la escucha depende sólo de si la terminal es la que escucha, y al reabrir espera a que se libere el puerto. Probado en esta PC: sin la espera, «dirección en uso»; con ella, reabre. En la 0.13.2.
- 🟡 **«$ NaN» en la cola de la caja** mientras llegaba la venta: la cabecera viaja sin total, porque con internet lo calcula el servidor. Ahora la caja lo suma de los renglones. En la 0.13.2.

**Y a la tarde, los cheques en pantalla:** depositar, deshacer el depósito, devolver al cliente y marcar un propio como debitado, con los datos de prueba. Los cuatro anduvieron. A 375 px, Cheques y sus ventanas entran; **Calendario se desplazaba 13 px a lo ancho** —la grilla de Entra / Sale no tenía columna para el celular—, corregido. También el texto de debitar un solo cheque, que decía *«Marcar debitados»*. Los dos arreglos salieron en la 0.13.3.

⚠️ **Los datos de prueba de cheques quedaron cambiados:** el e-cheq Nación N° 12345 quedó *devuelto* y el Galicia N° 90001, *debitado*. Siguen pendientes de borrar el cliente PRUEBA CHEQUES, los proveedores PRUEBA CHEQUES SRL y PRUEBA COSTOS DOS, y el producto PRUEBA-CHQ.

---

## Lo último que pasó — 30 de septiembre, a la tarde

Los tres pedidos que seguían, en el orden de Francisco: **cheques, historial de costos y datos bancarios del proveedor.** Las cuatro respuestas de Lucas sobre cheques llegaron ese día.

### 1. Los cheques, y el calendario de recibos

**Una sección nueva, Tesorería, con dos pestañas: Cheques y Calendario.** Lo que antes iba al cuaderno. El detalle completo está en [`cheques.md`](cheques.md).

> **Cómo se lo contás a Lucas:** cuando un cliente paga con cheque —en la caja o en su cuenta corriente— se anotan banco, número, fecha de pago y quién lo firmó, y el cheque queda en la **cartera**, ordenado por la fecha en que se puede cobrar, con cuántos días quedan para depositarlo. Desde ahí se depositan de a varios. Para **hacerlo correr**, al pagarle a un proveedor se elige «Cheque de la cartera». Los **propios**, de chequera o e-cheq, se cargan en el mismo pago. Si uno vuelve **rechazado**, se marca y la deuda vuelve sola: al proveedor se le vuelve a deber, y al cliente se le puede cargar con los gastos del banco. El **Calendario** muestra, día por día, qué entra —cheques, cuentas de clientes— y qué sale —facturas de proveedores, cheques propios—.

- **Lucas contestó las cuatro:** depositan y endosan, emiten propios (cada vez más e-cheq), hay diferidos y al día, y el «calendario de recibos» de agosto es esto. Por eso entraron las tres piezas juntas.
- **El cheque nunca va al arqueo.** Al cerrar la caja se listan los cheques del turno para entregarlos.
- **En la caja funciona sin internet**, como todo: el cheque entra a la cartera cuando el cobro sube.
- **El de tercero se endosa entero y se elige de la cartera**, no se tipea.
- **Permisos nuevos:** *cheques.ver* y *cheques.gestionar*, para Administrador y Encargado. El cajero recibe cheques pero no ve la cartera.
- **El medio «Cheque» usa la lista de contado**, como la transferencia. Si a un diferido se le cobra distinto, se cambia en Precios.

Verificado contra la base real: **62 comprobaciones** en [`supabase/pruebas/cheques.sql`](../supabase/pruebas/cheques.sql), como usuario, corridas en seco antes de aplicar. **La corrida encontró un error real**, ya corregido: anular un pago a proveedor le sacaba el proveedor al cheque antes de devolverlo a la cartera. Las 31 de la cuenta de proveedores y las 14 de la percepción en la caja siguen verdes. Se rompió a propósito de tres maneras y **las tres fueron atrapadas**.

### 2. El historial de costos por proveedor

**En la ficha del producto, un desplegable «Historial de costos», y en Compras una pestaña nueva, Costos.** Pedido de Lucas del 14/08: saber si la última compra vino más cara o más barata que la anterior, y de quién.

> **Cómo se lo contás a Lucas:** en la ficha de cada producto, debajo del costo, se abre la lista de cada vez que se compró: fecha, proveedor, factura, costo y cuánto cambió contra la anterior, con una línea chica que muestra cómo vino subiendo. Y en Compras → Costos se elige un proveedor y se ve todo lo que se le compró: el último costo, el anterior, cuánto aumentó y **si otro proveedor lo vendió más barato**.

- **Los costos se comparan con IVA**, como quedan en el producto: una factura A y una B del mismo producto no pueden dar un 21% de diferencia que no existe.
- **Se arma solo con cada mercadería recibida.** No se cargó nada nuevo: los datos estaban desde el 28/09. Hoy no hay ninguna recepción real, así que las pantallas dicen eso.
- **Una factura dada de baja no cuenta.**
- Lo ve quien ve las compras (*compras.ver*).

Verificado contra la base real: **12 comprobaciones** en [`supabase/pruebas/historial-de-costos.sql`](../supabase/pruebas/historial-de-costos.sql); se rompió a propósito que cuente la factura dada de baja, y la prueba lo atrapó.

### 3. El CBU, CVU o alias del proveedor

**En la ficha del proveedor, «Para transferirle»: CBU o CVU y alias.** Al registrar un pago por transferencia aparecen listos para copiar, con el banco y el CUIT.

- **La base controla los dos dígitos verificadores del CBU**, igual que los bancos: un número cambiado es una transferencia a otra persona. La pantalla lo avisa mientras se escribe y dice de qué banco es.
- Se puede pegar con espacios o guiones: se guardan los 22 dígitos.

Verificado contra la base real: **8 comprobaciones** en [`supabase/pruebas/datos-bancarios-del-proveedor.sql`](../supabase/pruebas/datos-bancarios-del-proveedor.sql); se rompió a propósito el segundo dígito verificador y la prueba lo atrapó.

**En la app: 508 pruebas**, 38 nuevas —el plazo de depósito, lo que le falta a un cheque, el calendario por día, el cheque que viaja desde la caja sin internet, las variaciones de costo, el CBU—.

✅ **Publicada en la 0.13.0 el 01/10**, con el manual en PDF actualizado (Caja, Clientes, Productos, Cuentas de proveedores, Proveedores, y Costos, Cheques y Calendario nuevos). Lo de la base **no rompe las PC con la versión anterior**: una caja vieja que cobre con «Cheque» lo manda igual a la cartera, marcado para completar los datos.

**Visto en pantalla el 01/10**, con datos de prueba (cliente *PRUEBA CHEQUES*, proveedores *PRUEBA CHEQUES SRL* y *PRUEBA COSTOS DOS*, producto *PRUEBA-CHQ*): una venta de $80.000 cobrada en la caja con **dos cheques** —un Macro a 30 días y un e-cheq Nación al día— y el resto a cuenta corriente; los dos aparecieron en la cartera y en el cierre de caja. Una **cobranza con cheque** Credicoop a 60 días: frenó un CUIT mal escrito y bajó la cuenta a cero. Un **pago al proveedor** con transferencia —el CBU, el alias y el CUIT aparecieron listos para copiar—, el Macro endosado y un e-cheq propio. El Macro marcado **rechazado** con $1.500 de gastos: volvió a la cuenta del proveedor y se le cargó al cliente. El **historial de costos** en la ficha y en Compras → Costos, y la **ficha del proveedor** con el CBU, frenando uno con un número cambiado. Y el **Calendario** con todo eso, cada cosa en su día.

**Salieron tres cosas que las pruebas no veían**, ya corregidas: los datos del cheque se apretaban en el panel angosto de la caja —ahora se acomodan al ancho del panel, no al de la pantalla—; **la cuenta corriente del cliente se desplazaba hacia el costado** (ya pasaba antes; ahora cada movimiento es un renglón); y Costos decía «2 productos» de uno solo comprado a dos proveedores. Además, **las pruebas del CAEA empezaron a fallar solas el 1/10**: cargaban un CAEA de la segunda quincena de septiembre y lo comparaban con el reloj de verdad. Ahora tienen el reloj quieto en su fecha.

⚠️ **Visto de paso, sin tocar, para otro momento:** la lista de Productos con la ficha abierta y la tabla del Mostrador **se desplazan hacia el costado** en una pantalla mediana; y el medio de pago **«Tienda online»**, que está inactivo, aparece para elegir en el Mostrador, la Caja y la cobranza.

⚠️ **Visto de paso, para revisar:** el medio *Tarjeta de crédito* figura en la base como que **entra al arqueo de caja** (se sembró que no). Si nadie lo cambió a propósito, la caja espera en el cajón la plata de las tarjetas y el cierre da diferencia. Se corrige en Precios → Medios de pago, destildando «Entra al arqueo de caja».

## Lo que pasó a la mañana del 30 de septiembre

**El sistema, ordenado: un menú de nueve secciones, Configuración en pestañas y ninguna pantalla que se desplace hacia el costado.** Pedido por Francisco ese mismo día, mirando cómo lo resuelve OBTech: pocas secciones y, adentro, varias opciones.

> **Cómo se lo contás a Lucas:** el menú de la izquierda pasó de dieciocho entradas a nueve: Inicio, Ventas, Clientes, Productos, Stock, Compras, Comprobantes, Reportes y Administración. Adentro de cada una, las pantallas que se usan juntas quedan como pestañas arriba —en Ventas están el Mostrador, la Caja y los Pedidos web—. Tocar una sección vuelve a la última pestaña que se usó en esa PC: en la caja, «Ventas» abre directo la Caja. Configuración ahora tiene tres pestañas: Facturación, El local y Esta computadora.

| Sección | Pestañas |
|---|---|
| Ventas | Mostrador · Caja · Pedidos web (con el contador de pedidos, que también se ve en la sección) |
| Productos | Productos · Precios |
| Stock | Stock · Inventario · Transferencias (ésta, sólo con más de un depósito) |
| Compras | Compras · Cuentas proveedores · Proveedores |
| Comprobantes | Facturación · Remitos · Presupuestos |
| Administración | Usuarios · Configuración |

- **Cada uno ve lo suyo**, igual que antes: una pestaña aparece si la persona tiene su permiso, y una sección si le queda alguna. Un vendedor ve Ventas sin pestañas, sólo con el Mostrador.
- **Las direcciones de las pantallas no cambiaron**, así que ningún enlace se rompió. Las secciones viven en un solo lugar, [`lib/menu.ts`](../app/src/lib/menu.ts), con sus pruebas.
- **Las pestañas van en la franja de arriba, al lado del indicador de conexión**, y no adentro de la pantalla: la Caja, el Mostrador, Productos y Clientes ocupan justo el alto disponible, y una barra más adentro los empujaba. En el celular van en una franja propia.
- **El menú lateral aparece desde 1024 píxeles, no desde 768.** Ése era el motivo de fondo de varias tablas que se desplazaban: con el menú a los 768, una tablet le dejaba a la página 480 píxeles, menos que un celular acostado, justo cuando las tablas empezaban a mostrar más columnas. Ahora el ancho del contenido sólo crece con la pantalla. En una tablet, el menú se abre con el botón de arriba, como en el celular.
- **Ninguna pantalla se desplaza hacia el costado**, en ningún ancho: en pantallas chicas lo secundario pasa a un renglón debajo del nombre y los botones se apilan. Se arreglaron Compras, Facturación, Presupuestos, Remitos, Precios, Proveedores, Cuentas proveedores y Usuarios.
- Stock perdió el botón «Contar inventario», y Transferencias su «← Stock»: son las pestañas de al lado. El texto de Proveedores que decía que las compras y la cuenta corriente «llegan en V1-B» también se corrigió.

Verificado **midiendo todas las pantallas** —las veinte del menú, las tres pestañas de Configuración, el detalle de un proveedor, un cliente y la ficha de un producto— **en cinco anchos: 375, 640, 768, 1024 y 1280 píxeles**, que son los bordes donde cambia qué columnas se muestran. En ninguna queda algo que se desplace hacia el costado. **470 pruebas** en la app, con 13 nuevas del menú; se rompió a propósito que gane la dirección más larga —si no, Cuentas proveedores se confunde con Proveedores— y la prueba lo atrapó. Y en pantalla: el menú abierto, achicado a íconos y en el panel del celular; Ventas → Caja → Stock → Ventas volvió a la Caja; Configuración abrió en cada pestaña y el enlace de Transferencias lleva directo a *El local*.

✅ **Publicada en la 0.12.0 el 30/09**, con el manual en PDF reordenado según las secciones del menú. **Para capacitar:** cambia dónde está cada cosa, no cómo se usa; conviene mostrarle a cada puesto su sección la primera vez —a la caja, que «Ventas» abre la Caja—.

### También el 30/09

**Mover mercadería entre depósitos, y el stock de cada uno.** Era lo que faltaba para el segundo local: los depósitos se podían nombrar desde el 10/09, pero no usar. Ahora cada producto tiene su saldo en cada depósito, y la mercadería pasa de uno a otro con una **transferencia**. El total no cambia: sale de un lado y entra en el otro.

> **Cómo se lo contás a Lucas:** en Stock, cuando haya dos depósitos, arriba se elige cuál mirar; con *Todos* se ve el total —lo que hay que pedir al proveedor— y una columna por local al lado, que es lo que dice qué hay que llevar de uno al otro. El botón *Transferir* abre la pantalla para mandar mercadería: se elige de dónde a dónde, se pasa el lector por cada bolsa con su cantidad, y se confirma. Queda numerada y se puede anular con motivo. **Cada computadora vende del depósito de su local**, y eso se elige una vez en Configuración → Cajas y mostradores.

- **La transferencia es de un solo paso**, como en OBTech: sale y entra en el mismo momento. Un envío con «en camino» y confirmación de llegada controla mejor lo que se pierde en el viaje, pero pide que alguien confirme cada envío en el destino. Si Lucas lo quiere, se agrega arriba de esto sin tocar nada.
- **Si en el origen no alcanza, avisa y deja transferir igual.** El stock de los primeros días puede estar mal, y la bolsa que está en el estante se tiene que poder llevar.
- **Lo que vuelve, vuelve adonde salió.** Anular una venta del segundo local reingresa en el segundo local; dar de baja una factura de compra saca de donde entró. Lo decide la base, en el mismo disparador que ya completaba el depósito: **ninguno de los dieciséis lugares que escriben en el libro de stock cambió.**
- **La toma de inventario es de un depósito.** Contar el segundo local contra el total de los dos daría diferencias que no existen, y cerrar la toma las «corregiría» borrando la mercadería del otro local.
- **La recepción de mercadería pregunta en qué depósito entra**, porque un proveedor puede descargar directo en el otro local.
- **La ficha del producto, con dos depósitos, muestra cuánto hay en cada uno y ya no deja escribir «Contado»**: un número sin lugar no dice qué corregir. Se corrige con una toma.
- **Un depósito se da de baja vacío y sin máquinas.** Lo impide la base, con el mensaje que dice qué hacer primero.
- **Con un solo depósito, nada de esto se ve**: ni el selector de Stock, ni la columna de Cajas y mostradores, ni la pregunta en Inventario y Recepción. Hoy la pantalla de Transferencias dice que hace falta un segundo depósito.
- **Permiso nuevo:** *stock.transferir*, para Administrador y Encargado. Ver las transferencias pide *stock.ver*.
- **Transferencias no tiene entrada en el menú**, a propósito: se llega desde Stock. Ver el punto 9 de *Lo que sigue*.

**Lo que NO cambió:** la tienda web sigue viendo el total menos el colchón. El depósito «Online» sigue siendo una idea anotada ([alcance, §13](alcance-v1.md)): qué ve la web ya se decide con «Vender online». Y **el mostrador sin internet sigue mostrando el total** en su copia local, no el de su depósito — ver *Lo que sigue*.

Verificado contra la base real: **48 comprobaciones** en [`supabase/pruebas/transferencias-entre-depositos.sql`](../supabase/pruebas/transferencias-entre-depositos.sql), como usuario. Antes de aplicar la migración se corrió todo junto en seco, porque toca el disparador por el que pasa cada venta. **Se rompió a propósito dos veces** —que lo que vuelve no vuelva adonde salió, y que la toma compare contra el total— **y las dos fueron atrapadas.** **457 pruebas** en la app, con 12 nuevas; una rota a propósito y atrapada.

**Y en pantalla, el 30/09:** se creó el depósito *PRUEBA Local 2* desde Configuración y aparecieron solos el selector de Stock, la columna de Cajas y mostradores y la pregunta en Inventario. Se transfirieron 2 bolsas de ROYAL GATO y 1 NEXGARD —que en Local estaba en -10: el sistema avisó que no alcanzaba y dejó transferir igual—; Stock mostró las 2 bolsas en el depósito nuevo y la ficha del producto, el reparto. Dar de baja el depósito con mercadería lo frenó con su mensaje; se anuló la transferencia —la **7**: las pruebas de la base consumen números, que no se reusan— y el depósito vacío se dio de baja. Todo volvió a su lugar y **no quedó ningún producto donde los depósitos no sumen el total**. Quedan a la vista, como datos de prueba, la transferencia 7 anulada y el depósito dado de baja.

✅ **Publicada en la 0.11.0 el 30/09**, con el manual en PDF actualizado (Stock, Inventario, Compras y Configuración). Las 4 PC la reciben con *Actualizar ahora*; lo de la base ya andaba en todas desde que se aplicó, y **las PC con la versión anterior siguen funcionando igual**: la única función que cambió de firma, la de recibir mercadería, acepta la llamada vieja y la manda al principal.

**Salieron tres cosas que las pruebas no veían, ya corregidas:** el campo Cantidad de Transferencias ocupaba todo el ancho —la trampa de `estilos.ts`, dos anchos en la misma clase—; la fila de edición de Cajas y mostradores se desplazaba hacia el costado —ahora edita en un formulario a todo el ancho—; y en el celular no se veía cuánto quedaba en el origen. Revisando a 375 px se corrigieron además dos tablas de Inventario y la lista de Productos, que ya se desplazaban antes de hoy.

## Lo que pasó el 28 de septiembre

**Importar clientes con su saldo, y los saldos de los proveedores.** Era lo que más bloqueaba el corte de nuestro lado: el punto 12 del alcance pide los clientes y sus saldos «cargados y verificados», y sólo había importación de productos. Clientes → *Importar planilla*, y Cuentas proveedores → *Importar saldos*.

> **Cómo se lo contás a Lucas:** el día del corte se exporta de OBTech la lista de clientes con lo que debe cada uno, y la de proveedores con lo que se les debe. Se arrastra la planilla, el sistema reconoce las columnas y, **antes de importar, muestra la suma de todos los saldos**: ése es el número que hay que comparar con el total de OBTech. Si coincide, se importa. Se puede repetir las veces que haga falta sin duplicar nada.

- **Se reconoce cada cliente** por su código, después por su CUIT o DNI, y como último recurso por el nombre exacto. Una celda vacía no borra lo que ya estaba.
- **El saldo queda igual al de la planilla, no se suma.** Una planilla corregida deja un movimiento por la diferencia, con fecha y responsable, y lo avisa.
- **El saldo vence a los días de plazo del cliente** desde la fecha del corte: no hay forma de saber cuánto de lo que trae OBTech ya estaba vencido.
- **Un CUIT con el dígito verificador mal no entra.** Un cliente con saldo marcado sin cuenta corriente, se la habilita y lo avisa.
- **Permisos:** clientes con saldo piden *clientes.editar* y *cuentacorriente.limite*; proveedores, *proveedores.gestionar* y *proveedores.pagar*. Administrador y Encargado.
- ⚠️ **Falta saber qué exporta OBTech** y en qué formato. La pantalla reconoce muchos nombres de columna, y lo que no, se elige a mano. Conviene pedirle a Lucas una exportación de prueba ahora, no el 25/10.

Verificado contra la base real: **26 comprobaciones** en [`supabase/pruebas/importar-clientes-y-saldos.sql`](../supabase/pruebas/importar-clientes-y-saldos.sql). **La prueba encontró un error real** —una fila con aviso fallaba entera— y se corrigió en una migración aparte. Se rompió a propósito que el saldo se sume en vez de reemplazarse, y la prueba lo atrapó. **445 pruebas** en la app.

**Y en pantalla, el 28/09:** una planilla de clientes con título arriba, columnas escritas como *Cód.*, *C.U.I.T.*, *Cond. IVA*, *Cta. Cte.* y números en formato argentino: reconoció las diez columnas sin ayuda, mostró la suma de los saldos, importó tres y rechazó el CUIT mal tipeado. Reimportada, actualizó los tres sin duplicar la deuda. Lo mismo con una de proveedores. **Salió un error que las pruebas no veían**, ya corregido: los mensajes decían «fila 3» cuando en el Excel era la 5, porque contaban desde las filas que se mandaban y no desde el archivo. **La importación de productos tenía lo mismo**, y se corrigió también. Los datos de prueba quedaron dados de baja y con saldo cero.

✅ **Publicada en la 0.10.0 el 28/09**, con la corrección de la fila también en la importación de productos.


✅ **Publicada la 0.9.0 el 28/09**, con *Factura después* y *Cajas y mostradores*. Con esto, todo lo que describe el manual en PDF está en las PC: las 4 la reciben con *Actualizar ahora*. **Falta ver en pantalla la opción *Factura después* de la caja**, que pide PIN.


**Gross da de alta sus cajas y mostradores.** Configuración → *Cajas y mostradores*: la lista de las máquinas con su prefijo, su punto de venta y cuándo se conectó cada una por última vez, y el botón *Agregar*. Publicado en la 0.9.0.

> **Cómo se lo contás a Lucas:** para sumar una PC, en Configuración se agrega la terminal —el sistema propone el nombre y el prefijo que siguen, por ejemplo *Mostrador 3* y *MOS3*— y después, en la PC nueva, se abre el sistema y se la elige en Ventas. Una caja necesita su punto de venta de ARCA.

- **El prefijo y el tipo no se cambian después**: el prefijo encabeza cada número de venta de esa máquina. Si se cargó mal, se da de baja y se crea otra.
- **No se puede dar de baja la caja que escucha a las demás** —primero se elige otra en *La red del local*— **ni una caja abierta.** Lo impide la base, con el mensaje que dice qué hacer.
- **Reusar un prefijo no choca con ventas viejas**: la numeración sigue desde el último número de ese prefijo.

Verificado contra la base real: **16 comprobaciones** en [`supabase/pruebas/alta-de-terminales.sql`](../supabase/pruebas/alta-de-terminales.sql); se rompió a propósito el freno de la caja que escucha y la prueba lo atrapó. **435 pruebas** en la app. Y en pantalla: se creó *Mostrador 3* con lo propuesto, se intentó dar de baja *Caja 1* y lo frenó con el mensaje correcto, y se dio de baja *Mostrador 3*.


✅ **Publicada la 0.8.0 el 28/09**, con la recepción de mercadería, las cuentas de proveedores, la percepción en la caja y la cola de la caja mostrando el total con percepción. Las 4 PC la reciben con *Actualizar ahora*. Lo de la base ya andaba en todas desde que se aplicó.


**La caja cobra la percepción de IIBB.** Hasta hoy la Factura A a un mayorista sumaba la percepción, pero la caja cobraba sin ella: la factura decía un número y lo que entraba —o lo que quedaba debiendo— era otro. Publicada en la 0.8.0.

> **Cómo se lo contás a Lucas:** cuando el cliente es Responsable Inscripto y la compra pasa el mínimo, la caja muestra *Productos*, *Percepción IIBB Misiones* y el total con las dos cosas. Ése es el precio final que se le dice al cliente. Si paga en el momento, se cobra entero; si va a cuenta corriente, la deuda es la factura entera. Funciona igual sin internet.

- **La percepción queda guardada en la venta, aparte del total.** Los reportes y las métricas siguen mostrando lo vendido: la percepción es plata de Rentas, no venta.
- **La factura dice lo que se cobró**, aunque cambie la alícuota en Configuración entre el cobro y la factura.
- **El cobro acepta también el total sin percepción.** Lo usan los pedidos web pagados en la tienda —ahí sigue el freno antes de facturar— y las cajas que todavía tienen la versión anterior. Una caja con la versión nueva siempre la cobra.
- ~~⚠️ **Para confirmar con Lucas:** a un Responsable Inscripto la caja no le ofrece «sin factura»~~ ✅ **Contestado el 20/10: tiene que poder.** Construido ese día, va en la 0.16.8.
- ✅ **La cola de la izquierda de la Caja también muestra el total con la percepción**, con la leyenda *con percepción IIBB* (corregido antes de publicar la 0.8.0).

Verificado contra la base real: **14 comprobaciones** en [`supabase/pruebas/percepcion-en-la-caja.sql`](../supabase/pruebas/percepcion-en-la-caja.sql), como usuario; se rompió a propósito que la factura use la percepción cobrada y la prueba lo atrapó. **429 pruebas** en la app, con 6 nuevas del cálculo sin internet. **Y en la aplicación de verdad, contra ARCA de homologación:** una venta de $1.960.000 a un mayorista en cuenta corriente mostró $53.616,53 de percepción; se cobró $2.013.616,53, la deuda quedó por lo mismo, salió la Factura A con CAE por lo mismo, y al devolverla la Nota de Crédito A devolvió la percepción entera y la cuenta volvió a cero.

### También el 28/09

**La cuenta corriente de los proveedores.** Es lo que el 26/10 desaparecía con OBTech sin reemplazo: cuánto se le debe a cada proveedor. Menú **Cuentas proveedores**, debajo de Compras. Publicada en la 0.8.0.

> **Cómo se lo contás a Lucas:** arriba está cuánto se les debe en total y cuánto de eso está vencido; abajo, un renglón por proveedor. Al entrar a uno se ve qué falta pagar, factura por factura, y el resumen de cuenta con el saldo después de cada movimiento. Para pagar se pone con qué (transferencia, efectivo, cheque) y las facturas ya vienen marcadas de la más vieja a la más nueva, descontando primero las notas de crédito; se pueden cambiar. Lo que sobra queda a cuenta. El día del corte se carga el saldo que muestra OBTech, uno por proveedor.

Las decisiones, tomadas el 28/09:
- **Al pagar se eligen las facturas, con las más viejas ya marcadas.** La base no deja imputarle a una factura más de lo que le falta, ni imputar más plata de la que sale.
- **El cheque, por ahora, es un dato del pago**: banco, número y fecha de cobro. El módulo de cheques sigue aparte ([`cheques.md`](cheques.md)).
- **El saldo de OBTech se carga a mano**, uno por proveedor, con la fecha del corte. Se le imputan pagos como a una factura. **Las facturas anteriores a esa fecha no se cargan: ya están adentro del saldo.**

Y las que salieron de construirlo:
- **Toda factura va a la cuenta.** No hay marca de «contado»: una factura pagada en el momento es una factura y un pago del mismo día.
- **La factura de compra tiene vencimiento**, opcional. Es lo que ordena qué se paga primero y lo que figura vencido.
- **Un pago se anula con motivo, no se borra.** Anularlo devuelve lo pendiente de las facturas que pagaba. **Una factura con pagos no se da de baja**: primero se anula el pago.
- **Permiso nuevo:** *proveedores.pagar*, para Administrador y Encargado. Ver las cuentas pide *compras.ver*, así que el Cajero y el Vendedor no ven cuánto se le debe a cada proveedor.

Verificado contra la base real: **31 comprobaciones** en [`supabase/pruebas/cuenta-de-proveedores.sql`](../supabase/pruebas/cuenta-de-proveedores.sql), como usuario. Se rompió a propósito el control de imputar de más, y la prueba lo atrapó. **423 pruebas** en la app. Y en la aplicación de verdad: saldo inicial, un pago por transferencia con la sugerencia de facturas, y la anulación. **Salió un error que las pruebas no veían**, ya corregido: los importes que escribe la base salían en formato inglés («150,000.00»). Ahora hay una sola función que escribe pesos, `app.pesos`, y la prueba lo controla.

✅ Publicada en la 0.8.0.

### También el 28/09

**La recepción de mercadería.** Sobre una factura de compra ya cargada se reciben los productos: entra el stock y el costo se actualiza. Publicada en la 0.8.0.

> **Cómo se lo contás a Lucas:** en Compras, cada factura tiene un botón *Recibir*. Al guardar una factura nueva, el sistema pregunta si la mercadería ya está: si está, se recibe en el momento; si no, se recibe cuando llegue, y la puede hacer otra persona. Se pasa el lector o se escribe el código, se pone cantidad y costo, y entra al stock. **El precio de venta no cambia solo:** al terminar, el sistema muestra el precio que corresponde según el margen de cada producto, y se aplica con un clic a los que elijas.

Las decisiones, tomadas por vos el 28/09:
- **El costo de la factura pisa el del producto.** Es el último costo, no un promedio.
- **El precio se propone y no se aplica solo.** Es la misma regla que tenía la ficha desde agosto.
- **Si llega un producto que no está en el catálogo, se da de alta ahí mismo**, con código, nombre e IVA. Queda sin precio y sin revisar, y la pantalla avisa que no se puede vender hasta ponerle precio.

Y dos que salieron de construirlo:
- **El costo se guarda con IVA**, porque el precio de venta es con IVA y la ficha compara uno contra el otro. En una factura A se copia el unitario sin IVA, como está impreso, y el sistema le suma la alícuota de cada producto. En una B o una C va como está. La ficha ahora dice *Costo (con IVA)*.
- **Dar de baja una factura que ya entró al stock la saca del stock**, con un ajuste. El costo no vuelve atrás: puede haber entrado otra factura después.

**Y el Excel de compras para el contador**, en la misma pantalla que ventas y percepciones: una fila por alícuota, las notas de crédito en negativo y las percepciones separadas por concepto (IVA, IIBB y otros). No es imprescindible, porque el contador baja las compras de ARCA, pero le sirve para controlar que no falte ninguna.

Verificado contra la base real: **26 comprobaciones** en [`supabase/pruebas/recepcion-de-mercaderia.sql`](../supabase/pruebas/recepcion-de-mercaderia.sql), corriendo como usuario y no como dueño de la base. Se rompió a propósito sacándole el IVA al costo, y la prueba lo atrapó. **414 pruebas** en la app.

**Y en la aplicación de verdad, el 28/09:** se cargó una factura A, se recibió un producto existente (pasándole el código) y uno nuevo dado de alta ahí mismo, se aplicó el precio sugerido, y se dio de baja la factura: el stock volvió solo. Salieron dos detalles de pantalla, ya corregidos: la tabla de Compras se cortaba en monitores chicos y el botón *Dar de baja* se partía en tres renglones. Los datos de prueba quedaron como estaban.

✅ Publicada en la 0.8.0.

**La percepción de IIBB, resuelta el 28/09:** va con la factura, a donde vaya la plata. Si pasa en la caja, al elegir un cliente responsable inscripto la caja muestra el total ya con la percepción. El vendedor le pregunta *«¿facturamos ahora?»* y, si dice que sí, le da ese precio final. **Construido el mismo día** (ver arriba).

## Lo que pasó el 25 de septiembre

🔴 **Lo más importante del día tampoco estaba en el plan: desde el 11/09, ninguna devolución parcial se podía registrar desde la aplicación.** Ni desde Facturación ni desde ningún lado. Contestaba *«new row violates row-level security policy»* y en la base había **cero devoluciones**.

> **Cómo se lo contás a Lucas:** el botón *Devolver parte* de Facturación no andaba: si un cliente traía una bolsa de tres, el sistema no la podía registrar. Nadie lo había usado todavía, así que no hay nada que corregir hacia atrás. **Ya está arreglado, y como el arreglo es del servidor, anda en todas las PC sin instalar nada.**

- **Por qué no se vio el 11/09:** la base no dejaba escribir la devolución a nadie más que a la función que la registra, pero esa función corre con los permisos de quien la usa. Las pruebas de ese día corrieron como dueño de la base, que se saltea esos controles.
- **Tenía una segunda mitad, peor:** con el alta arreglada, la devolución se registraba pero no quedaba atada a su nota de crédito. La base ignoraba ese último paso sin avisar. La pantalla decía *«la venta no estaba facturada»* y **la nota de crédito quedaba sin pedirle el CAE a ARCA**, con el stock ya devuelto.
- **Arreglado y verificado en la aplicación:** una devolución desde la pantalla sale con la nota de crédito autorizada por ARCA en el acto. Y una devolución ya no se puede editar: si estuvo mal, se registra otra.
- **Las pruebas de las devoluciones ahora corren como un usuario de verdad**, no como dueño de la base. Se rompió a propósito cada arreglo y las pruebas lo atraparon.

> ⚠️ **La lección, que vale para lo que queda:** una prueba que corre como dueño de la base no ve las reglas de acceso. Lo que use funciones que corren con los permisos del usuario se prueba como usuario.

**Y lo que sí estaba en el plan: la pantalla Pedidos web**, lo que el local hace con un pedido después de que entra.

> **Cómo se lo contás a Lucas:** en el menú hay una entrada *Pedidos web* con un número al lado: lo que espera que alguien haga algo. Cada pedido muestra si el cliente pagó en la web o paga en el local, cómo se entrega, y **hace cuánto espera factura** —en rojo si ya pasó el día del cobro—. Desde ahí se marca preparado, se emite el remito del envío, se factura y se marca entregado. **Lo que se cobró en la web no se puede entregar sin factura: lo impide el sistema.**

- **Facturar** usa el mismo circuito de siempre. Si el pedido está marcado para revisar, hay que confirmar *«lo revisé»* y queda el nombre de quien lo hizo. **Si la factura saldría por más de lo que el cliente pagó** —pasa cuando le corresponde percepción de IIBB—, **no factura**: frena y dice por qué, sin perder el número de comprobante.
- **Cancelar** antes de entregar anula la venta y devuelve el stock; si ya estaba facturado, sale la nota de crédito. **Lo entregado vuelve por devolución**, con el *Devolver parte* de siempre.
- **El reintegro:** si el cliente pagó en la web, la plata la tiene la pasarela de la tienda y el sistema no la puede devolver. Cada cancelación o devolución deja un pendiente *«a devolver por la tienda»*, a la vista hasta que alguien anota que se devolvió, con la referencia. **Si alguien anula la venta desde Facturación** sin saber que era de la web, el pedido queda cancelado y el reintegro se anota igual.
- **En Facturación**, un pedido web no aparece en el panel rojo mientras está dentro del día; si se pasa, aparece con la etiqueta *Pedido web* y el enlace para facturarlo desde Pedidos, porque desde Facturación se saltearía el control de la percepción.
- **Permiso nuevo:** *tienda.pedidos*, para Administrador y Encargado.
- **Y la tienda pregunta:** `GET /pedidos/{numero}` le dice a Zubu en qué está el pedido, si tiene factura y cuánto hay que devolver. Documentación al día en [`api-tienda.md`](api-tienda.md) y en la página que se le comparte, que dicen lo mismo.

Verificado contra la base real: **49 comprobaciones** de Pedidos web, las 41 de pedidos anteriores siguen verdes, **64 por internet** contra la API publicada, y **405 pruebas** en la app. Se rompió a propósito de **nueve maneras** —entregar sin factura, facturar por más de lo cobrado, sin el control de permiso, sin la cancelación que sigue a la venta, sin el reintegro de la devolución, la tienda viendo una factura sin CAE, y las tres de las devoluciones— y **las nueve fueron atrapadas**. La del permiso **pasó la primera vez por un error de la prueba**, no del código: aceptaba cualquier error como bueno. Se corrigió en los ocho lugares donde estaba.

Y en la aplicación de verdad, contra ARCA de homologación: un pedido facturado con CAE, con remito del envío y entregado; otro marcado, confirmado, facturado y cancelado con nota de crédito autorizada y el reintegro anotado; dos devoluciones con su nota de crédito. **Salieron tres cosas que las pruebas no veían**, ya corregidas: las devoluciones de arriba; **el remito del pedido web**, que fallaba porque intentaba guardarse primero en la copia local de la PC, donde las ventas de la web no están; y la factura que figuraba sin decir si era A o B.

⚠️ **Lo que queda de los pedidos es el mail con la factura**, y espera la dirección de correo de Gross. Mientras tanto la factura se abre para imprimir o guardar en PDF. El día que llegue hay que decidir si va adjunta en PDF —lo habitual, pero hay que generarlo en el servidor— o en el cuerpo del mail con el QR de ARCA.

✅ **Publicada en la 0.7.0 el 25/09**: las 4 PC la reciben con *Actualizar ahora*. El arreglo de las devoluciones, que es del servidor, ya anda en todas, también en las que siguen con una versión vieja.

## Lo que pasó el 24 de septiembre

🔴 **Lo más importante del día no estaba en el plan: la sincronización estaba rota desde el 18/09, y no se veía.**

Verificando la pantalla nueva aparecieron errores en la consola del navegador. La terminal baja cada tabla filtrando por `actualizado_en`, y **la tabla del CAEA no tiene esa columna**: el pedido volvía con «column caea.actualizado_en does not exist» y **la bajada se cortaba ahí**.

> **Cómo se lo contás a Lucas:** el código con el que la caja factura cuando se corta internet tiene que estar guardado en la máquina antes del corte. Por un error nuestro, ese código no estaba bajando. Lo encontramos y lo arreglamos; **si se hubiera cortado internet en el local, la caja no habría podido facturar**.

Lo que arrastraba, en orden de gravedad:

- **El CAEA no llegaba a ninguna máquina.** Es lo único que permite facturar durante un corte, y pedirlo también necesita internet.
- **Lo que viene después en la lista tampoco bajaba:** la numeración desde la que emite la terminal sin conexión, y los saldos de cuenta corriente.
- **Y nadie se enteraba.** El aviso al servidor se mandaba sólo cuando la sincronización terminaba bien, así que desde el servidor una terminal rota se veía igual que una apagada. La última sincronización registrada era del 22/09.

**Las tres cosas están arregladas:**

1. La tabla del CAEA tiene su columna, como todas las demás tablas maestras. **Verificado en la copia local del navegador: el CAEA `86370874703771` ya está en la máquina**, junto con la numeración y los saldos.
2. **Una sincronización que falla ahora deja constancia en el servidor**, así aparece en *La red del local*, en el diagnóstico, y hace que la tienda online deje de confiar en el stock.
3. **Hay una prueba nueva que lo hubiera encontrado sola**: `node supabase/pruebas/columnas-de-sincronizacion.mjs` lee lo que la terminal le pide a cada tabla y se lo pregunta a la base. Hoy revisa 22 tablas. Se rompió a propósito —pidiéndole a una tabla una columna inventada— y la atrapó.

> **Por qué ninguna prueba lo había visto:** las de la aplicación corren sin base, y las de la base no saben qué le pide la terminal. La prueba nueva une esas dos puntas. Es la misma lección del 17/09: lo que no se puede ver no se puede arreglar.

**Y lo que sí estaba en el plan: «Vender online».**

> **Cómo se lo contás a Lucas:** ahora vos decidís qué se vende en la web. En la ficha de cada producto hay un interruptor *Vender online*; también se puede prender a varios de una, o a una categoría entera —«todos los Alimentos»—. Un producto sale a la tienda sólo si además tiene nombre público y precio, y si le falta algo la ficha te lo dice en una línea.

- **En la ficha:** el interruptor, el colchón de ese producto, y la línea que dice qué ve la tienda —*"Se vende online: la tienda ve 3 unidades a $6.900"*, *"Prendido, pero no sale: le falta el nombre público"*—. La cuenta la hace la base, la misma que usa la API: la ficha no puede decir «se vende» de algo que la tienda no ve.
- **En la lista:** filtro por categoría y marca, *Marcar todos*, las acciones sobre lo marcado, y la marca **Web** en cada fila (ámbar si está prendido pero no sale).
- **Una categoría entera la prende la base, no la pantalla.** La lista muestra de a 100: «marcar todos» prendería 100 de una categoría de 800. La acción va sobre todos los que coinciden, con la cantidad a la vista antes de confirmar.
- **Prender una categoría avisa cuántos no salen.** Esto apareció verificando en pantalla: el aviso decía cuántos se prendieron pero no cuántos quedaban afuera por faltarles el nombre o el precio. Con 800 productos nadie mira fila por fila.
- **En Precios:** con qué lista se publican los precios de la tienda. Esa lista no se puede dar de baja mientras la tienda la use — **verificado en pantalla**: la base lo impide y el mensaje dice qué hacer.

Verificado contra la base real: **30 comprobaciones** de «Vender online» y **353 pruebas** en la app. Se rompió a propósito de dos maneras —prender sin controlar el permiso, y que el colchón prenda un producto de paso— y las dos fueron atrapadas. Y en la aplicación de verdad: se le puso el nombre público que le faltaba a un producto, se guardó, **y apareció en la API con su precio y su stock**; al apagarlo, le llegó a la tienda como baja.

**Y lo tercero del día: la tienda ya puede mandar pedidos.** Es la segunda pieza de V1-B, también al costado de lo que anda: ninguna versión del programa cambió.

> **Cómo se lo contás a Lucas:** cuando alguien compra en la web, el pedido entra al sistema como una venta más, con el nombre del cliente y lo que compró. **Nada se factura solo.** El encargado lo revisa, arma el paquete y recién ahí factura y se lo manda al cliente por mail —como Mercado Libre—. Si el cliente eligió pagar en el local, la venta le aparece a la caja como cualquier otra. El stock lo descuenta el sistema, siempre: la tienda nunca lo toca.

**La decisión del día, tomada por vos: no se factura automáticamente, nunca.** Vale para todos los pedidos, no sólo para los que piden factura A. El motivo es práctico: **la factura sale cuando ya se sabe lo que realmente se entrega.** Si faltaba una unidad, si el cliente cambió algo por teléfono o si hay que reemplazar un producto, se arregla antes. Facturar primero y corregir después significa notas de crédito.

> ⚠️ **Con un límite que conviene saber:** si el cliente ya pagó en la web, para ARCA la factura corresponde al momento del cobro. En la práctica se hace el mismo día, pero no puede quedar para la semana que viene. La pantalla de Pedidos va a mostrar cuáles esperan factura y hace cuánto.

Cómo entra un pedido, y las tres decisiones que la base impuso:

- **Entra como una venta de verdad**, por el mismo camino que el mostrador: líneas, totales, IVA y descuento de stock los hace el sistema. Si el cliente **pagó en la web**, la venta queda cobrada con el medio de pago «Tienda online» —que no aparece en el mostrador ni entra al arqueo, porque esa plata no está en el cajón—. Si eligió **pagar en el local**, la venta espera en la cola de la caja y el stock se descuenta al cobrarla.
- **El mismo pedido dos veces no se duplica.** El número del pedido de la tienda es la llave: si se corta la conexión y reintentan, contesta lo mismo que la primera vez. Reintentar es seguro; lo que duplicaría es cambiar el número.
- **El precio que manda la tienda es el que se factura.** Lo enseñó la base: una línea con un precio distinto del de lista exige que diga quién lo cambió y por qué —la regla del precio tocado a mano en el mostrador—, y en un pedido web no hay ningún quién. Entonces el precio de la web es el precio de la línea, **y la diferencia contra el sistema queda anotada en el pedido**, que es donde alguien la va a mirar antes de facturar.
- **Nada se rechaza por falta de stock.** Si el cliente ya pagó, rechazarlo sería perder la venta y dejarlo sin respuesta. El pedido entra marcado y lo resuelve el local.
- **El que dice ser responsable inscripto pero manda un DNI** entra como consumidor final y queda marcado. La base no admite un responsable inscripto sin CUIT, y perder el pedido de alguien que ya pagó sería peor.

Verificado contra la base real: **43 comprobaciones** de pedidos y **55 por internet**, contra la API publicada. Se rompió a propósito de **siete maneras** —sacarle el reconocimiento del pedido repetido, hacer que lo no pagado descuente stock, que la puerta no mire la clave, callar el aviso de precio raro, callar el de falta de stock, deshacer el arreglo del precio de la línea y desarmar el guardián del medio de pago— **y las siete fueron atrapadas**. Las pruebas de la app pasaron de 353 a 378.

> **Tres defectos reales los encontró la prueba antes de que el código saliera de la máquina:** un pedido con CUIT fallaba entero por un operador mal usado; un cliente que se declaraba responsable inscripto con DNI chocaba con una regla fiscal de la base; y un precio distinto del de lista era rechazado por la regla del precio tocado a mano. Los tres se arreglaron y los tres tienen su prueba.

⚠️ **Al desplegar la puerta hay que apagar la verificación de JWT.** Viene prendida por omisión y, prendida, rechaza la clave de la tienda antes de llegar a nuestro código: la API queda contestando «Invalid JWT» a todo. Pasó hoy en el primer despliegue, se detectó en el minuto siguiente con las pruebas por internet, y quedó anotado en el encabezado de la función.

**Lo que seguía de los pedidos:** ~~la pantalla Pedidos web~~ y ~~el botón de facturar~~ ✅ **hechos el 25/09** (arriba). Queda **el mail con la factura**, que espera la dirección de correo de Gross.

## Lo que pasó el 18 de septiembre, a la tarde: la API para Zubu

**La tienda online ya puede leer el catálogo.** Es la primera pieza de V1-B, adelantada para que Zubu arme la tienda en paralelo, y es **todo nuevo al costado de lo que anda**: no hizo falta publicar una versión del programa. El diseño se aprobó antes de construir. Para Zubu: [`api-tienda.md`](api-tienda.md), que un desarrollador de afuera puede leer sin nosotros.

> **Cómo se lo contás a Lucas:** la tienda de Zubu mira el catálogo y el stock del sistema como se mira una vidriera: ve lo que está a la venta y a qué precio, pero no puede tocar nada ni ver lo de adentro —costos, proveedores, clientes—. Entra con una clave propia, que no es la de ningún empleado y que se anula en el momento. **Lo que sale a la web lo decide Gross**, prendiendo «Vender online» producto por producto o por categoría.

Lo que quedó decidido, y por qué:

- **Zubu no es un usuario del sistema.** Tiene una clave atada al canal «Tienda online», guardada como huella: ni nosotros podemos leerla. La puerta entra a la base con la llave pública, que sin usuario no lee ninguna tabla: **aunque la puerta tuviera un error, no tiene con qué llegar a los costos.**
- **«Vender online» es la decisión; nombre público y precio son el control.** Sin nombre público no sale —en la web se leería «ALIM BAL TOTALMAX PERRO 20KG»—. **Los fitosanitarios no salen** hasta que Gross lo decida: la ley de Misiones pide receta agronómica. Hoy salen **29 de los 35** productos de prueba, prendidos a mano mientras llega el interruptor.
- **El precio es el de la lista que se elija para la tienda**: la de contado, o una creada para la web. Esa lista no se puede dar de baja mientras la use la tienda.
- **El stock sale con el colchón descontado** —hoy 2 unidades—, para que una venta del mostrador y una de la web en el mismo minuto no se lleven la misma bolsa. El número real no sale nunca.
- **La frescura no es la de Inicio**: aquella se traba con una PC apagada. La de la tienda dice «confiable» si alguna terminal sincronizó en los últimos 15 minutos y ninguna tiene ventas trabadas. De noche dice «no confiable», y qué hace la tienda con eso lo deciden Gross y Zubu.

> **Lo delicado, y cómo se verificó:** si Zubu consulta justo mientras alguien guarda un precio, ese precio podía quedar detrás de la marca de «lo que cambió» y **no llegar nunca** a la web. La marca ahora nunca pasa por delante de un guardado en curso. Se probó con dos sesiones a la vez: un guardado abierto 25 segundos mientras la «tienda» consultaba. Con el código bien, el cambio llegó; **rompiendo la marca a propósito, se perdió.** En total, 64 comprobaciones contra la base, 30 pruebas nuevas en la app, 27 por internet, y **siete roturas a propósito, las siete atrapadas**. Y el punto 16 del alcance: una salida de stock en el local, y la tienda pasó de ver 9 a ver 8 en la consulta siguiente.

**Lo que quedó pensado ese día para los pedidos** fue que la venta online pagada se facturara sola. **El 24/09 se decidió lo contrario** —la factura la emite una persona, después de armar el paquete— y está explicado arriba. Lo que no cambió: **el proceso de compra tiene que pedir DNI o CUIT, condición frente al IVA y email**, que es lo que hace falta para facturar, y el DNI o el CUIT es lo que va a vincular a los clientes de la web con los del local. El mail de la factura sale por **Resend**, gratis hasta que esté probado.

💡 **Idea anotada:** cuando abra el segundo local, un depósito «Online» del que salgan las ventas de la tienda. Está en el [alcance, §13](alcance-v1.md). **Sigue como idea** después del 30/09: el módulo de depósitos ya existe, pero qué se ve en la web ya lo decide «Vender online», y la tienda sigue viendo el total.

## Lo que pasó el 18 de septiembre, a la mañana

**Arrancó el CAEA sin internet**, que es lo que falta para que el corte de conexión no deje al cliente sin papel. Decidido con Francisco el 17/09: los cortes en Oberá son pocos, pero el sistema híbrido se prometió justamente para eso, así que se hace bien y no con un parche.

**Lo que está hecho (primera parte, la cuenta):**

- **La terminal ya baja lo que necesita para facturar sola:** las alícuotas de IVA, qué clase de factura le corresponde a cada condición frente al IVA, los tipos de comprobante y de documento, el punto de venta, y **el CAEA de la quincena** — que tiene que estar en la máquina *antes* del corte, porque pedirlo también necesita internet.
- **Y hace la misma cuenta fiscal que el servidor**, en un módulo aparte que es puro cálculo: el IVA que viene adentro del precio, lo exento, y la percepción de IIBB con sus tres reglas.

> **Por qué esto es lo delicado:** lo que se imprima durante un corte se entrega y no se puede rehacer. Si la cuenta de la terminal difiere de la del servidor aunque sea en un centavo, la factura que se llevó el cliente dice una cosa y la que queda en el sistema dice otra.
>
> **Cómo se verificó:** contra los tickets que salieron impresos en el local el 17/09 —el collar de $6.400 y la venta de dos alícuotas de $69.900— y contra la vista del servidor, que da exactamente los mismos números. Y se rompió el código de cuatro maneras a propósito: redondear línea por línea en vez de agrupar, comparar el mínimo de la percepción contra la venta en vez de contra la percepción, usar «menor» donde va «menor o igual» en el borde exacto, y sacar el total de la suma del desglose en vez del total cobrado. **Las cuatro fueron atrapadas** —la última recién después de corregir una prueba que no distinguía los dos caminos—.

**Y quedó completo el mismo día, en la 0.5.0.** Al cobrar sin internet, la caja emite la factura con el CAEA y **el ticket sale solo**. El cliente se va con su comprobante.

> **Cómo se lo contás a Lucas:** si se corta internet, la caja sigue facturando. El código con el que sale la factura —el CAEA— ARCA lo entrega por adelantado, una vez por quincena, justamente para esto. Cuando vuelve la conexión, la factura sube sola y el sistema le informa a ARCA lo que se emitió. **El cliente nunca se va sin papel.**

Las tres piezas que faltaban:

- **La numeración**, que era lo delicado: sale del mayor entre lo que sabe el servidor y lo que esta máquina ya emitió. Mirar solo al servidor repetiría números —quedó atrasado justo porque no había internet—; mirar solo lo local los repetiría después de reinstalar. Las dos formas entregan dos papeles con el mismo número.
- **La impresión**, que ahora lee de la terminal cuando el servidor no contesta. Es lo que permite imprimir en el momento y **reimprimir después**, con o sin conexión.
- **Facturación muestra lo emitido en el corte**, con reimpresión y con cuáles todavía no llegaron al servidor. Informarle a ARCA lo sigue haciendo la tarea diaria sola: un botón que alguien tiene que acordarse de apretar no es una obligación cumplida.

⚠️ **Lo que todavía no se probó:** un corte de internet de verdad, con las dos máquinas. Es lo primero para la próxima visita. Y **mientras el sistema esté en homologación, lo que sale de una contingencia es un comprobante de prueba**, igual que todo lo demás: recién con el certificado de producción es una factura válida.

⚠️ **Una decisión tomada, para que la sepas:** durante un corte **emite sólo la caja**. Es donde ya se cobra y se factura, y así alcanza con un punto de venta CAEA —el 9, que ya está dado de alta—. Si más adelante quieren que cada mostrador emita por su cuenta, es darle de alta un punto de venta a cada uno: trámite, no rehacer.

## Lo que pasó el 17 de septiembre, en el local

**Francisco estuvo en Gross con las PC delante**, y de ahí salió lo bueno y lo malo. Lo bueno: **la impresión anda**, los tickets salieron por la POS80 y las ventas se cobraron y facturaron con CAE. Lo malo, en orden de gravedad:

🔴 **Cobrar con tarjeta en cuotas era imposible.** El recargo del plan —que ya existía— se sumaba al **importe del pago** y no al precio de la venta: total $181.280, pago $199.408, y el sistema contestaba *"Los pagos exceden el total en $18.128"* con el botón *Cobrar* apagado. No había forma de cobrar en cuotas salvo borrándole el recargo a mano.

> **Cómo se arregló:** el recargo ahora va **adentro del precio**, que es como Gross lo cobra y lo que confirmó el contador. Al elegir el plan, el total sube, la pantalla dice *"Incluye 10% de recargo por 2 cuotas. De contado serían $181.280"*, y el importe coincide con el del posnet. La factura sale por lo que el cliente pagó.
>
> ✅ **Verificado en la aplicación de verdad, no sólo con pruebas:** se armó una venta de $6.400, se mandó a la caja y al elegir *Tarjeta de crédito · 2 cuotas* el total pasó a **$7.040** con el cartel del recargo y el botón *Cobrar* habilitado. Volviendo a Efectivo baja a $6.400, sin acumular. **Ahí salió un detalle más**, ya corregido: la lista de la izquierda se quedaba con el total anterior mientras el detalle mostraba el nuevo.
>
> **Editable por Lucas, en Precios**, un casillero por plan, con el ejemplo de cuánto se cobra una venta de $100.000 al lado. Cargados el 17/09: **0% a 1 cuota, 10% a 2, 15% a 3**. Está en el manual y en la [guía de pantallas](guia-de-pantallas.md).

🔴 **El ticket salía con las letras cambiadas:** *Oberá* → *Oberß*, *Régimen* → *Rθgimen*, y un `$á` delante de cada importe. No era que perdiera la tilde: ponía otra letra. Se le mandaba el alfabeto de Windows y la impresora lee el suyo, el de MS-DOS. El `$á` era el espacio duro que el formato de moneda mete entre el signo y el número, que en ese alfabeto es justo la `á`. **Corregido y probado contando los bytes**; falta verlo en papel.

🟡 **Cobrar imprimía en tres pasos.** Ahora **al cobrar sale el ticket solo** por la impresora de esa PC. El botón queda para verlo o darle una copia al cliente, y si el ticket no sale, la pantalla lo dice en vez de dejar al cajero esperando.

🔴 **Sin internet, la caja no vio la venta del mostrador** — el punto 2-bis, que era la promesa grande. La caja **está** marcada como la que escucha y **publicó su dirección ese día a las 15:15**, así que esa parte funcionó; lo que no se pudo saber es qué falló después, **porque el sistema no lo decía**. La entrega devolvía un número y los errores se descartaban con un `catch` vacío.

> **Eso se arregló primero, y a propósito:** antes de adivinar la causa hay que poder verla. Ahora la entrega a la caja informa cuál de los cuatro finales tuvo —al día, entregado, *no sé cuál es la caja*, o *la caja no contesta*, con el motivo—, y eso aparece en tres lugares: el **indicador de arriba** se pone rojo y dice *"Sin conexión · la caja no recibe"*, **Configuración → La red del local** muestra la última entrega, y el **diagnóstico que se copia y se pega** trae el renglón nuevo. Con eso, la próxima vez el chat de WhatsApp alcanza para saber si es el aviso de Windows, una terminal que nunca sincronizó, o la caja apagada.

🟡 **Y la pantalla de Caja tardaba un minuto en abrir sin internet.** Cada consulta esperaba doce segundos antes de rendirse, y la Caja hace varias. Ahora hay un **cortacircuito**: cuando una falla por red, las que vienen atrás se descartan en el acto y el sistema pasa directo a la copia local; cada quince segundos deja pasar una para ver si volvió la conexión. La primera sigue esperando sus doce segundos —no hay forma de saber antes—, pero el resto ya no.

⚠️ **Lo que todavía no se sabe** es por qué no llegó esa venta. Puede ser el aviso de Windows contestado que no, que la caja estuviera abierta en el navegador en ese momento, o que el mostrador no hubiera sincronizado después de las 15:15. **Los tres casos ahora se distinguen solos**, y la prueba son dos minutos en el local: Configuración → La red del local → *Probar la conexión*.

✅ **La PC con Windows 7 ya no es un problema abierto.** Volvió a fallar la instalación —mismo motivo de siempre, Microsoft dejó Windows 7 en 2023— pero **Lucas avisó ese mismo día que van a cambiar las computadoras**: están rehaciendo el local con un arquitecto y la renovación de las máquinas va en paralelo. **Mientras tanto ese puesto usa Chrome.** Lo que queda dicho, una vez: hasta que se cambie, ahí no se imprime y, con internet cortado, sus ventas no llegan a la caja. Detalle en [`la-pc-con-windows-7.md`](la-pc-con-windows-7.md).

## Lo que pasó el 16 de septiembre

**Llegó la constancia del punto de venta CAEA**: el **00009**, *CAEA – Fact. Elect. (RECE) – RI IVA – Contingencias*, dado de alta en ARCA el 11/09. **Se cargó en el sistema** como *Contingencia CAEA*, marcado de respaldo: las ventas comunes nunca van a ese punto de venta.

🔴 **Y al usarlo apareció el límite de las pruebas.** El ambiente de pruebas de ARCA rechazó el aviso de «sin movimiento» con el **1204** —*el PtoVta debe corresponder a un punto de venta CAEA*— y, preguntado qué puntos de venta ve, contestó **«Sin Resultados»**: ninguno. No se entera de las altas reales. **La última prueba del CAEA sólo se puede hacer en producción**, así que lo que la bloquea ahora es el **certificado de producción**, no el alta.

> **Cómo se lo contás a Lucas:** el alta está bien hecha y ya está cargada. Pero el simulador de ARCA donde probamos no ve las altas reales, así que para terminar de probar la contingencia hace falta el certificado de producción. **El pedido ya está armado**: es subir un archivo con la clave fiscal y autorizarlo, diez minutos. Paso a paso en [`certificado-produccion.md`](certificado-produccion.md) — **se puede hacer en la reunión**.

Dos cosas que quedaron hechas de paso:

- **La tarea diaria del CAEA no mezcla ambientes.** Buscaba los CAEA sin informar sin mirar si eran de pruebas o reales: el día del cambio a producción le habría mandado a la ARCA real, todos los días, los códigos de pruebas. Verificado con la consulta vieja contra la nueva.
- **La Edge Function pregunta qué puntos de venta ve ARCA** (`accion: 'puntos_venta'`). Así se confirmó el diagnóstico, y es lo primero que se mira el día que se pase a producción.

✅ **Y un pendiente que ya no lo era:** el control de huecos antes de rendir el CAEA —que la nota de detalle daba por pendiente— está construido y funcionando en el servidor desde el 03/09.

## Lo que pasó el 14 de septiembre

**Se publicó la 0.3.1** con las devoluciones parciales, verificada en el sitio.

**Y está el resumen de cuenta corriente**, que Lucas pidió en un audio esa misma mañana: el documento que le manda a fin de mes al cliente que no pagó. Detalle y cómo se usa en [`pedidos-de-lucas-estado.md`](pedidos-de-lucas-estado.md).

> **Cómo se lo contás a Lucas:** en la ficha del cliente, o directo desde la tabla de quién debe en Reportes, hay un botón *Resumen*. Sale una hoja como la de un resumen del banco —saldo anterior, facturas, pagos y notas de crédito con el saldo renglón por renglón, y el saldo final—, se elige el mes y se guarda como PDF para adjuntarlo al mail. El archivo ya sale con el nombre del cliente.
>
> **Es una hoja que se guarda como PDF, igual que la factura en A4:** no hizo falta sumar una biblioteca ni un servicio, y lo que se ve en pantalla es lo que sale en el archivo.

Verificado contra la base: en los cinco clientes el saldo final del resumen es el de la ficha, la cuenta cierra a mano (anterior + debe − haber = final), y un período partido en dos encadena solo. Una cobranza del 31 a las 22:30 cae en ese mes y no en el siguiente. Se rompió el código a propósito de cinco maneras y las pruebas atraparon las cinco.

🟡 **Lo del mail automático sigue sin decidir** (punto 17): el resumen y la factura se adjuntan a mano. Mandarlos solos necesita contratar un servicio de correo.

**Y está el cifrado de la base local** (0.4.0, sin publicar). Era el punto 3 de la lista, comprometido en el alcance §1 y exigido por la Ley 25.326.

> **Cómo se lo contás a Lucas:** para vender sin internet, cada PC guarda los clientes. Ahora los guarda cifrados: si alguien se lleva la computadora o copia la carpeta del programa, no puede leer ni un nombre. La llave la guarda Windows, atada a la cuenta de usuario de esa PC, así que copiar los archivos a otra máquina no sirve de nada. **No protege contra alguien sentado frente al sistema abierto**: para eso están el usuario y los PIN.

Lo que se cifra: nombre, documento, la búsqueda de clientes (que es una copia del nombre), el nombre para llamar y las observaciones de la venta, todo lo del receptor y la entrega de los remitos, y **las operaciones pendientes enteras**. Lo que queda en claro —límites, saldos, importes— está atado a un código interno que sin el nombre no dice de quién es.

Tres cosas que definen si esto sirve de verdad:

- **Si la llave se pierde, el sistema frena y no crea otra.** Crear otra en silencio dejaría ilegibles para siempre las ventas que no subieron. Un *testigo* —una palabra conocida cifrada con la llave— distingue «primera vez» de «llave perdida». Arriba de todo aparece un aviso que dice qué hacer, y el botón para rehacer la base desde el servidor **sólo aparece si no hay ventas sin subir**.
- **Lo que el mostrador le manda a la caja por la red del local viaja abierto**, porque cada PC tiene su propia llave: cifrado con la del mostrador, la caja no lo podría leer nunca. Era el error más fácil de cometer y el más difícil de ver —la venta no aparecía en la caja, sin ningún mensaje—, y tiene su prueba.
- **Los campos cifrados tienen otro tipo en el código**, así el compilador marca cada lugar que intenta usarlos sin descifrar. Encontró 41. Y revisando a mano lo que el compilador no ve, aparecieron **dos lugares que guardaban el nombre para llamar y las observaciones en claro**, escondidos detrás de un `as never`.

Verificado: las 2 pruebas nuevas del programa pasan contra el **Administrador de credenciales real de Windows**; el programa de escritorio, abierto en esta PC, **creó la credencial** *Sistema Gross - base local*; y en el navegador, la base vieja de las sesiones anteriores **se migró sola**: 8 clientes y 3 ventas, ninguno quedó legible, y la búsqueda, la cola de la caja y la sincronización siguen andando con los nombres descifrados. Siete roturas a propósito, las siete atrapadas.

🔴 **Y apareció algo que cambia cómo se instala.** Migrando en el lugar, el motor de la base **no borra en el momento** lo que reemplaza: se comprobó que después de migrar los nombres seguían legibles en su archivo interno, y ahí se quedan hasta que el motor limpia solo, días después. **Por eso la 0.4.0, aunque está publicada, se instala limpia PC por PC**, borrando la carpeta de datos con 0 pendientes —Francisco la instala a mano esta semana—. El procedimiento está en el [paso 9](instalacion-en-el-local.md).

> **Lo que queda afuera, dicho para no prometer de más:** la red del local sigue sin cifrar por el cable (es la red interna, con su clave), y el perfil del usuario que entra —nombre, mail y permisos, para poder entrar sin internet— sigue guardado en claro en el navegador. Son datos de los empleados, no de los clientes.

**Y la versión móvil**, que era lo que seguía.

> **Cómo se lo contás a Lucas:** desde el celular entra a la misma dirección y la agrega a la pantalla de inicio; queda un ícono de Gross y se abre como una aplicación. El menú se esconde en un botón arriba a la izquierda. Sirve para lo que le prometimos: mirar el stock, ver los reportes y cambiar un precio parado en el depósito. Vender sigue siendo en la PC.

Lo que hubo que cambiar, porque la app estaba pensada para una pantalla ancha:

- **El menú** ocupaba dos tercios del teléfono. Ahora es un panel que se abre con un botón y se cierra solo al elegir. En tablet y PC queda la barra de siempre.
- **Tocar un producto o un cliente parecía no hacer nada**: la ficha se abría a la derecha de la lista, fuera de la pantalla. Ahora, en pantallas angostas, la ficha reemplaza a la lista. De paso se arregló en tablet, donde tampoco entraba.
- **Las fichas** tenían los campos en cuatro columnas: el tipo de persona se leía «Pers». En el teléfono van en dos.
- **Las tablas** muestran lo que se mira parado: en Stock, producto, cuánto queda y estado; en Productos, precio y stock con el código bajo el nombre; en la deuda de Reportes, cliente, vencido y **un teléfono que se toca para llamar**.
- **El ícono**: había sólo un SVG, que el iPhone ignora. Ahora hay íconos PNG, uno adaptable para Android y el del iPhone. Y el color de la barra del teléfono era un verde viejo: ahora es el violeta de la marca.

Verificado simulando un teléfono (375 px): las 16 pantallas entran de ancho, y se recorrieron a mano Stock, Productos con su ficha, Clientes y Reportes. En PC (1280 px) y tablet (768 px) todo queda como estaba, salvo la ficha en tablet, que ahora sí entra. ⚠️ **Falta probarla en un celular de verdad**, sobre todo la instalación.

## Lo que pasó el 11 de septiembre

**Está la pantalla de Reportes, la última de V1-A que faltaba.** Con eso, el punto 9 del alcance —«métricas simples»— queda cubierto entero.

> **Salió mucho más barata de lo que parecía, y conviene saber por qué:** casi todo estaba construido en la base desde agosto y sin usar. El permiso `reportes.ver` ya existía y ya lo tenían Administrador y Encargado; la vista que reparte la deuda por antigüedad también. Lo que faltaba era la pantalla y **una sola cosa nueva de cálculo**: contra qué comparar las ventas.

Lo que trae, y lo que deliberadamente **no** trae:

- **Las ventas comparadas contra el período anterior.** El importe ya estaba en Inicio; lo que faltaba era poder leerlo. Ahora dice *"+631% que los 7 previos"*.
- **Quién debe y desde hace cuánto**, que no estaba en ninguna pantalla. La ficha del cliente muestra un cliente por vez; nunca se veía el conjunto.
- **El stock bajo y el estado de la facturación van como enlace**, no copiados. Ya son las pantallas de Stock y Facturación, con sus filtros. Dos lugares para mirar lo mismo terminan no coincidiendo.

🔴 **Y apareció un error de plata que nadie había visto.** `vista_deuda_antiguedad` existía desde el principio y **ninguna pantalla la usaba**: al ponerla en Reportes salieron los números mal.

> **Cómo se lo explicás a Lucas:** la cuenta que dice cuánto debe cada cliente sumaba las facturas y **no restaba los pagos**. Un cliente que debía $281.600 y los pagó enteros seguía figurando con $281.600 vencidos, con saldo cero en la misma fila. Si eso salía a la pantalla, Gross llamaba a reclamarle plata a alguien que ya había pagado.
>
> **Cómo se arregló:** los pagos se aplican a la deuda más vieja primero, que es como trabaja cualquier cuenta corriente y lo que espera un contador. Ahora **la suma de los tramos da exactamente el saldo** en los cinco clientes, y eso se puede verificar de un vistazo.
>
> El error estuvo escondido porque la vista se construyó junto con la cuenta corriente y nunca se llegó a mirar. **Es un argumento para mirar lo que está construido y no se usa**, no sólo para construir lo que falta.

**El mes se compara por tramo y no contra el mes anterior entero.** Hoy es 11: comparar once días contra los treinta y uno de agosto haría que septiembre aparezca en baja todos los años, todos los meses, hasta el día 30. Se compara del 1 al 11 contra el 1 al 11, y **la pantalla dice contra qué días compara**, porque un "−12%" que no se puede rastrear no se discute con nadie.

**Se probaron las pruebas rompiendo el código a propósito**, y una no aguantó: la que decía proteger el parseo de fechas de la zona horaria pasaba igual con el código roto, porque un redondeo que está para otra cosa tapaba las tres horas de diferencia. **Se corrigió el comentario en vez de fingir que la prueba servía.** Las otras tres roturas sí fueron atrapadas.

**Y están las devoluciones parciales.** Hasta hoy devolver era todo o nada: el cliente traía una bolsa de tres y había que anular la venta entera y rehacerla.

> **Cómo se lo contás a Lucas:** en Facturación, al lado de *Devolver*, ahora hay *Devolver parte*. Se abre la lista de lo que el cliente se llevó, se marca cuánto vuelve de cada cosa, y el total de lo que hay que devolverle se ve **antes** de confirmar. La venta no se anula: queda como está, con lo devuelto restado.
>
> **Se puede devolver varias veces**, porque el cliente puede traer una bolsa hoy y otra la semana que viene. Cada devolución saca su propia nota de crédito, y el sistema lleva la cuenta de cuánto queda: nadie puede devolver cuatro de tres.

Tres decisiones que definen si los números salen bien:

- **El IVA se calcula por alícuota, no sobre el total.** Devolver una bolsa de alimento (10,5%) y un collar (21%) son dos bases distintas; un promedio daría mal.
- **La percepción de IIBB se prorratea, no se recalcula.** Si se recalculara, una devolución chica caería por debajo del mínimo de $24.000 y devolvería percepción cero, dejándole al cliente una percepción cobrada por mercadería que devolvió.
- **Los importes se prorratean sobre lo que se cobró**, no sobre el precio de lista. Una línea con descuento tiene que devolver lo que el cliente pagó; con el precio de lista se le devolvería de más, y la diferencia sale del mostrador.

🔴 **Y de paso se tapó un agujero que la devolución parcial abría.** Si alguien devolvía una bolsa y después anulaba la venta entera, el sistema reingresaba las tres —la anulación mira lo que salió por la venta y no descuenta lo que ya volvió—. **Ahora una venta con devoluciones parciales no se puede anular entera**, y el mensaje dice qué hacer en su lugar. Verificado: el stock queda con el +1 que corresponde, no con +2.

> **El efectivo lo sigue entregando el cajero.** El sistema descuenta de la cuenta corriente la parte que estaba en cuenta y emite la nota de crédito, pero no abre la caja — el mismo criterio que ya tenía la anulación entera.

**Se rompió el código a propósito otra vez**, y esta vez las tres roturas fueron atrapadas: prorratear sobre el precio de lista, sacar el redondeo al centavo y mirar lo vendido en vez de lo que queda.

## Lo que pasó el 10 de septiembre

**La venta llega a la caja sin internet.** Es el punto 2-bis del alcance, entero: la terminal de la caja escucha, los mostradores le entregan lo que no pudieron subir, y el cajero ve la venta como si nada.

> **La decisión de fondo:** las terminales no se buscan entre todas — una escucha, la de la caja, y las demás le hablan. El negocio ya tiene un lugar donde todo converge. Está en [[10 · Las decisiones que no se revisan]] con su porqué.
>
> **Las dos suben lo mismo, y es a propósito:** si la máquina del mostrador no vuelve a encenderse, la venta sube igual desde la caja. La segunda copia choca contra la clave primaria y se descarta sola. **Nadie configura una IP:** la caja publica el nombre de su computadora y las demás la buscan por ahí.
>
> ⚠️ **Falta probarlo con dos máquinas de verdad** — sólo se puede en el local. Y la primera vez, **Windows va a preguntar si permite que el programa se comunique en redes privadas**: hay que decir que sí, una sola vez, en la máquina de la caja.

**Se puede cargar la factura de compra.** Decisión de Francisco: sube a V1-A, porque el 26/10 Gross deja OBTech y OBTech es donde carga sus facturas hoy — *"sino queda el hueco el 26"*. Pantalla **Compras**, entre Proveedores y Ventas.

Se carga lo que dice el papel —proveedor, tipo, número, fecha, desglose por alícuota y percepciones— **sin líneas de producto**: la recepción de mercadería es la parte grande y sigue en V1-B. El IVA se sugiere al escribir el neto y se puede corregir, porque manda el papel; el total se arma solo para compararlo antes de guardar; y la misma factura no entra dos veces. El detalle está en [[Lo construido, en detalle]].

⚠️ **Ojo con el argumento que NO hay que volver a usar:** no es que el contador necesite estas facturas para el IVA. Las baja de Mis Comprobantes de ARCA — se corrigió el 09/09 y está en [`compras-e-iva.md`](compras-e-iva.md). Lo que el contador espera de este sistema es el Excel de ventas.

**Llegaron las fotos de cómo lo hacen hoy**, con tres audios de Lucas. Confirman la partición que hicimos —la factura y la mercadería a veces las carga la misma persona y a veces dos distintas— y de ahí salió que las percepciones se elijan de una lista. **Y abren un hueco nuevo, el de la tabla de abajo: la cuenta corriente de proveedores.**

> ⚠️ **Corregido al volver a escuchar los audios:** acá decía que Lucas "nunca usó el centro de costos". **Mal leído.** En el audio arranca diciendo eso y se corrige enseguida: *"centro de costos"* es como él llama a **la grilla del desglose de IVA**, que sí usa y que es justamente lo que se construyó. Lo que queda sin confirmar es la **columna** con ese nombre. La pregunta exacta está en [`compras-e-iva.md`](compras-e-iva.md).

**Coherencia visual y menú achicable.** Los botones de Productos usaban el gris de Tailwind y el magenta invertido; ahora hay un solo lugar donde están definidos ([`estilos.ts`](../app/src/estilos.ts)) y el gris es el de la identidad de Gross en todo el sistema. Y el menú se puede achicar a sólo íconos, con la decisión guardada **por computadora**: la caja tiene un monitor chico y la oficina no.

**Los depósitos se administran desde Configuración**, y cada movimiento de stock ya guarda en cuál ocurrió.

> **El dato que faltaba:** hoy hay **uno** y en breve son **dos**, porque abre el segundo local. **Los cinco de OBTech no son referencia.** Lo que sigue en V1-B es el módulo —mover mercadería entre depósitos y ver el stock separado—: poder nombrarlos no es lo mismo que poder mover entre ellos. ✅ **Hecho el 30/09**, arriba.
>
> **El principal no se puede desactivar**, y lo impide la base: sin principal, la próxima venta fallaría con un error que no menciona depósitos por ningún lado.

**Las métricas de venta en Inicio**, que era lo último visible que le faltaba a V1-A. Al abrir el sistema se ve cuánto se vendió **hoy**, en los **últimos 7 días** y en el **mes**, qué fue **lo más vendido** y **cuánto vendió cada uno**. Antes había que ir a Facturación y sumar a ojo.

> Tres cosas que no se ven pero definen si el número está bien: **el día es el de Oberá y no el del servidor** —sin eso, lo cobrado después de las nueve figura como vendido mañana—, **sólo cuentan las cobradas**, y **cada uno ve lo suyo**: quien no puede ver todas las ventas lee *"Tus ventas"* en vez de *"Ventas del local"*.

## Lo que pasó el 9 de septiembre

**Se construyó la impresión por impresora de Windows**, que era lo único que trababa el mostrador, y **se publicó en la 0.2.3**. Antes, en el mismo día, salió la 0.2.2 con el arreglo del instalador adentro.

> **Como se lo contás a Lucas:** la impresora se elige de una lista, como cuando imprimís desde el Word, y **cada computadora elige la suya**. El ticket sale por la cola de impresión de Windows y no por la red, porque la POS80 está enchufada por USB a la caja y compartida desde ahí para los mostradores.

El detalle completo —por qué el nombre se guarda por terminal, qué hace el diagnóstico, qué se verificó sin la impresora delante— está en [[Lo construido, en detalle]]. ⚠️ **Falta el papel:** que la POS80 imprima el ticket sólo se puede ver en Oberá.

**Y la 0.2.2, con el arreglo del instalador**: un gancho propio que espera a que el `.exe` se suelte antes de reemplazarlo, porque el chequeo que trae Tauri busca el proceso por nombre y los hijos de WebView2 se llaman distinto. El detalle está en el paso 8 de [`instalacion-en-el-local.md`](instalacion-en-el-local.md). ⚠️ Sin probar de punta a punta — ver *Lo primero de todo*.

🟡 **SmartScreen:** es esperable que **no** aparezca actualizando desde el programa —lo dispara la marca de web que pone el navegador al descargar, y el actualizador no la pone—. Sin confirmar. Sacarlo de verdad necesita un certificado de firma de código, que es una compra anual.

**Las percepciones de IIBB se exportan para el contador.** Francisco preguntó por las pantallas de *retención* de OBTech: **no son retenciones.** El contador confirmó por escrito que Gross es agente de **percepción** —régimen 14— y no de retención, así que no emite comprobantes de retención; lo que presenta todos los meses es el detalle de lo percibido. Eso ahora sale en un archivo, al lado del de ventas, y el dato ya se guardaba desde agosto.

> 📋 **Para la reunión hay un plan aparte de toda la sección Compras**, con lo que falta, cuánto cuesta cada pieza y qué pasa si no entra: [`plan-compras.md`](plan-compras.md).

## Lo que sigue, en orden

> 🔴 **26/10 — Hasta el 2/11: terminar el corte.** Práctica en el local y cerrar lo que vayan encontrando. **Después, la Fase 03** en el orden de [`fase-03.md`](fase-03.md) —empieza por el recibo numerado y el remito interno—, con las ocho preguntas para Lucas contestadas o con la opción por defecto que dice el documento. **Y la auditoría de integralidad**, como trabajo propio.

> 🔴 **19/10 — Terminar la limpieza de los datos de prueba.** ✅ **Productos y clientes ya están** (los reales cargados, los de prueba de baja: ver *Lo último que pasó*). Falta lo demás —ventas, comprobantes, stock, cuentas corrientes, cheques, compras, la caja abierta—, y para eso hay tres cosas que cuidar:
> 1. **Las PC del local no se enteran de lo que se borra.** La copia local baja lo que cambió, no lo borrado. **Resuelto en la 0.16.7**: al terminar la limpieza se pone `copia_local.generacion` en `configuracion` (por ejemplo, `1`) y cada PC vacía su copia y la vuelve a bajar entera, sólo si no tiene nada por subir. Antes de borrar, el respaldo en otro esquema, como el 19/10. **Las preguntas que quedaron abiertas**: si Marcela Duarte, Diego Fernández y Silvina Rojas son usuarios reales; qué hacer con las 6 categorías y las 13 marcas de ejemplo; y cuándo borrar los 10 pedidos web de prueba sin cortarle la prueba a Zubu.
> 2. **Las facturas de homologación ocupan números.** Hay 50 comprobantes de prueba en el punto de venta 1. El día que se pase a producción, ARCA arranca en el 1 y el sistema no deja dos comprobantes con el mismo número: hay que sacarlos antes del cambio, junto con sus ventas, pagos, movimientos de stock y de cuenta corriente.
> 3. **Cuándo.** Después de limpiar ya no se puede probar con lo de prueba. Lo natural es hacerlo junto con el cambio a producción, contra el 26/10.

> 🔴 **Revisado el 18/09 contra la definición de terminado de V1-A, y lo más grande que falta no estaba en esta lista: los datos reales.** Hoy la base tiene 35 productos y 8 clientes, todos de prueba, y el punto 12 del alcance dice *"todos los productos, clientes y saldos están cargados y verificados"*. La importación del catálogo está construida y espera **el Excel de Lucas con la columna de IVA**. Los clientes y sus saldos de cuenta corriente no tienen importación masiva todavía. Y **antes de cargar nada real, la base tiene que pasar a plan pago** —sin eso no hay copias de seguridad—, que no consta que se haya hecho. Es trabajo de semanas del personal de Gross, y quedan cinco hasta el 26/10.
>
> Lo demás que bloquea el corte depende de Lucas y está en la tabla de abajo: **dónde se cobra la percepción de IIBB** —hoy la factura a un mayorista grande suma la percepción pero la caja no la cobra— y **los atajos de teclado**. Y falta poner fecha a **la capacitación y la semana en paralelo** con OBTech.
>
> **Actualizado el 18/09 con lo que contó Francisco:**
> - **La percepción, casi resuelta.** El mayorista no compra en la caja: hace un pedido y se le manda. Casi siempre en cuenta corriente, a veces lo paga en el momento con factura. **La regla que sale de ahí: la percepción va con la factura, a donde vaya la plata** —si es cuenta corriente, la deuda es la factura entera con la percepción; si paga en el momento, se cobra entera—. Falta confirmarlo con Lucas en una línea y construirlo: el cálculo ya existe, lo que falta es sumarlo a lo que se cobra o se debe.
> - **Los atajos de teclado** se definen con Lucas la **primera semana de octubre**.
> - **La capacitación ya se viene haciendo** en cada visita, fuera de horario, y Lucas y los empleados siguen el sistema al detalle. No es un pendiente.
> - **La base de datos sigue en plan gratis, por decisión de Gross**, conociendo el riesgo: sin copias de seguridad recuperables. Se contrata más adelante. Dicho una vez y anotado.
> - ~~**Lo que sigue: adelantar V1-B, empezando por la API para Zubu**~~ ✅ **Hecho.** El catálogo se publicó el 18/09, **«Vender online» el 24/09** (0.6.0) y **los pedidos el 24/09** y **la pantalla Pedidos web con la facturación el 25/09**. **Zubu ya tiene su clave y su documentación, en la **versión 5** desde el 19/10: fotos, productos sólo para consultar y cómo paga cada pedido.** De la tienda queda el mail con la factura, que espera la dirección de correo de Gross.

0. 🔴 **Que la venta llegue a la caja sin internet.** Falló en el local el 17/09. **El sistema ya dice qué pasa** (0.4.3) — eso era lo que faltaba para poder arreglarlo. **Lo que sigue es una prueba de dos minutos en el local**, con las dos máquinas prendidas y el programa instalado en las dos: Configuración → La red del local → *Probar la conexión*, y después una venta con internet cortado.
   - Si dice **«no sé cuál es la caja»**: esa terminal no sincronizó desde que la caja se presentó. Se resuelve sincronizando una vez con internet.
   - Si dice **«la caja no contesta»**: es el aviso de Windows —hay que permitir la comunicación en redes privadas en la máquina de la caja— o el sistema no está abierto ahí.
   - Si con eso no alcanza, la salida de fondo es que las terminales **se encuentren solas en la red**, sin depender de haber sincronizado antes. Es trabajo del programa (Rust) y no se hizo todavía a propósito: primero hay que ver qué dice la prueba.
   - ~~**Que la Caja no tarde un minuto en abrir sin conexión.**~~ ✅ **Hecho** con el cortacircuito.
1. ~~🔴 **Probar la impresión en el local, con la impresora delante.**~~ ✅ **Hecho el 17/09: imprime.** Quedaron dos correcciones en la 0.4.2 —las letras acentuadas y el ticket que ahora sale solo al cobrar— que **falta ver en papel**.
2. 🔴 **CAEA** — el alta del punto de venta 9 llegó y está cargada (16/09). **Falta el certificado de producción**: el ambiente de pruebas no ve el punto de venta, y la última prueba sólo se puede hacer con la ARCA real. El pedido está armado: [`certificado-produccion.md`](certificado-produccion.md).
   - ⚠️ **Y antes que eso: que el CAEA esté en cada máquina.** Se arregló el 24/09 lo que lo impedía; hace falta que cada PC sincronice una vez con internet. Es lo primero de la próxima visita, porque sin eso la prueba del corte no puede salir bien.
3. ~~**Cifrado de la base local.**~~ ✅ **Hecho y publicado el 14/09 (0.4.0).** Se instala limpio, PC por PC, esta semana: [paso 9 del guion](instalacion-en-el-local.md).
4. ~~**Devoluciones parciales**~~ ✅ **Hechas el 11/09 y publicadas el 14/09** en la 0.3.1.
5. ~~**Reportes**~~ ✅ **Hecha y publicada el 11/09** en la 0.3.0.
6. ~~**La versión móvil**~~ ✅ **Hecha y publicada el 14/09 (0.4.1).** Lo prometido en la primera reunión: *consultar stock, ver reportes o pasar un precio desde el depósito*; vender sigue siendo en la PC con el lector. Cómo se instala en el celular: [paso 10](instalacion-en-el-local.md). **Falta probarla en un teléfono de verdad.**
7. **Todo con teclado** — ✅ **construido el 05/10 y publicado en la 0.13.4; los atajos son una propuesta para que Lucas la revise.** **La navegación:** en los formularios de carga, **el Enter del teclado numérico pasa al campo siguiente** —pedido así: el del teclado numérico, no el grande—. El Enter grande queda como estaba, y por eso el lector de códigos, que manda el grande, no se confunde. Saltea botones y textos largos, respeta los campos que ya usan Enter (agregar un código de barra) y en el último campo no hace nada. Está en clientes, productos, proveedores, factura de compra, recepción, cobranza con cheques, pagos y saldos de proveedores, usuarios y Configuración. **Los atajos**, definidos en un solo lugar ([`atajos.ts`](../app/src/lib/atajos.ts)) y mostrados con **F1** desde cualquier pantalla y en **Configuración → Esta computadora**: F2 Mostrador (en el Mostrador, vuelve al buscador), F3 elegir cliente en el Mostrador / próxima venta en la Caja, F4 Caja, F6 Clientes, F7 Productos, F8 Stock, **F9 lo principal de la pantalla** —enviar a caja, cobrar, guardar, aceptar—, Esc cerrar. F9 aprieta el botón de verdad, así que si está apagado no hace nada; los botones llevan la tecla escrita al lado. Las de ir a otra pantalla sólo llevan adonde la persona puede entrar. Están en el manual, bloque *Trabajar con el teclado*. **Verificado en pantalla:** F1 y Esc, F2/F4/F6/F7/F8, F2 y F3 en el Mostrador, F9 guardando una ficha de cliente y el Enter numérico recorriendo la ficha en orden. **Falta:** que Lucas confirme o cambie teclas —cambiar una es cambiar la tabla— y probar F3 y F9 en la Caja con una venta en la cola.
8. ~~**Que Gross dé de alta sus cajas y mostradores desde el sistema.**~~ ✅ **Hecho el 28/09.** Pedido por Francisco el 28/09, **para después de la cuenta corriente de proveedores y la percepción en la caja**. Hoy una terminal nueva la da de alta alguien de nuestro lado; con dos locales en camino, Gross tiene que poder hacerlo solo desde Configuración.
9. ~~🟡 **Ordenar el sistema: menú, Configuración y celular.**~~ ✅ **Hecho el 30/09**, arriba. Lo que se había pedido:
   - **El menú de la izquierda tiene demasiadas entradas.** La referencia es OBTech —pocas secciones arriba y submenús con varias opciones—, como ejemplo de orden y no para copiarlo. La idea a evaluar: agrupar lo que se usa junto (Stock, Inventario y Transferencias como pestañas de una sección; Proveedores, Compras y Cuentas proveedores en otra; Facturación, Remitos y Presupuestos en otra). Transferencias ya quedó sin entrada propia a propósito, para no sumarle una más.
   - **Configuración se hizo larga hacia abajo.** Revisar cada sección y separar por pestañas donde haga falta, para que se vea de un vistazo qué se hace en cada una.
   - **Ninguna pantalla con scroll horizontal**, en ningún ancho: es regla desde el 30/09. Medido ese día a 375 px, **se desplazan hacia el costado** Compras (636 px en 343), Facturación (641), Presupuestos (793), Remitos (785), Precios (402), Proveedores (481), Cuentas proveedores (423) y Usuarios (497). Todas son anteriores a los depósitos.
10. 🟢 **Cuando abra el segundo local: que el mostrador sin internet muestre el stock de su depósito.** Hoy la copia local de cada PC tiene el total, y es lo que ve el mostrador al buscar. No cambia lo que se descuenta —eso lo decide la base al subir la venta—, sólo el número que se lee en pantalla. Se deja para ese momento porque toca la sincronización, que hoy anda.
11. ~~🟡 **Cheques: recibidos, endosados a proveedores y propios.**~~ ✅ **Construido el 30/09**, con las cuatro respuestas de Lucas y el calendario de recibos. Falta verlo en pantalla y publicarlo. [`cheques.md`](cheques.md).
12. ~~🟡 **El historial de costos por proveedor**~~ ✅ **Construido el 30/09**: el desplegable en la ficha del producto y Compras → Costos. Falta verlo en pantalla y publicarlo.
13. ~~🟡 **Los datos bancarios de cada proveedor: CBU, CVU o alias.**~~ ✅ **Construido el 30/09**: en la ficha del proveedor, y listos para copiar en el pago por transferencia. Falta verlo en pantalla y publicarlo.

14. 🟡 **Traer los datos del cliente de ARCA con el CUIT, y no preguntar nunca la condición frente al IVA.** ✅ **Construido el 01/10 y publicado en la 0.13.3.** Observación de ese día: los sistemas actuales piden sólo el CUIT y completan solos razón social, domicilio y condición; el cliente dice «factura A» y nada más. Se hace con el servicio de ARCA **Consulta de Constancia de Inscripción** (`ws_sr_constancia_inscripcion`), con el mismo certificado que factura. Con DNI no hay consulta: es consumidor final.
    - **Dónde está:** la **ficha del cliente** —con un CUIT bien escrito aparece *Traer datos de ARCA*, y en un cliente nuevo la consulta sale sola—; el **buscador de clientes del mostrador** —un CUIT que no está ofrece *Traer de ARCA y agregarlo*, lo da de alta y lo deja elegido, y la tarjeta dice *Responsable Inscripto · Factura A*—; **Clientes → Verificar con ARCA**, para después de importar de OBTech: pregunta por cada cliente con CUIT, lista los que tienen otra condición y los corrige de una vez, y aparte los CUIT mal escritos o inexistentes; y **el detalle de un pedido web** sin facturar, que consulta solo y avisa si ARCA dice otra condición, con el botón para actualizar el cliente. El nombre que se pone en el local no se pisa en la verificación masiva: sólo la condición.
    - **Verificado:** la función `arca-constancia` está desplegada; desde la app, un CUIT mal escrito se frena antes de preguntar, sin sesión contesta 401, y con sesión llega a ARCA firmada con el certificado: hoy ARCA contesta *«Computador no autorizado a acceder al servicio»*, y la pantalla lo dice así. **17 pruebas** de cómo se lee la respuesta de ARCA —inscripto, monotributo, monotributo social, exento, empleado sin IVA, empresa, CUIT inactivo, constancia observada, inexistente—, rotas a propósito de tres maneras y las tres atrapadas. En pantalla, con la respuesta de ARCA simulada: el alta desde el mostrador, la verificación masiva con su corrección y el aviso del pedido web con su actualización. Los datos de prueba quedaron dados de baja.
    - ✅ **Con ARCA de pruebas, verificada el 08/10**: Lucas autorizó el servicio en WSASS y las tres respuestas reales —con aviso, completa y rechazada— se leyeron bien. 🔴 **Falta la autorización para el certificado de producción**, con el trámite del certificado —está en [`certificado-produccion.md`](certificado-produccion.md)—.
    - ⏱️ **La primera consulta del día tarda** lo que ARCA en dar el permiso: diez segundos en pruebas, medido. Las siguientes, medio segundo. Por eso esa llamada tiene un límite de 30 s y no los 12 del resto.
    - La página de la API de la tienda se actualizó a la **versión 4**: con el CUIT alcanza, la condición no hace falta.

15. ~~🔴 **La caja y la unidad suelta**~~ ✅ **Construida el 08/10 y publicada en la 0.14.0**, con tres niveles. Ver *Lo último que pasó*. Lo que se había planteado: Pedido de Lucas del 07/10. **Dos productos atados** —la caja, que se compra y se cuenta, y la suelta, con su precio— y **la caja se abre sola** cuando se vende una suelta y no quedan sueltas: queda en el libro como *Apertura de caja*. Stock, la ficha y el mostrador las muestran juntas: *0 cajas cerradas + 9 sueltas*. Uno solo con el stock en unidades obligaría a tocar la venta, la factura, la copia sin internet y la API; dos atados no tocan nada de eso, y es como ya trabajan en OBTech. **Mediano**; el disparador nuevo va en el libro de stock y se corre en seco antes de aplicar. Detalle, decisiones y tres preguntas para Lucas en [`pedidos-lucas-2026-10-07.md`](pedidos-lucas-2026-10-07.md).
16. 🟢 **La orden de compra interna y el pedido a proveedor** — V1-B, §11. ✅ **La orden interna, construida el 09/10 y publicada en la 0.15.0** (ver *Lo último que pasó*). ✅ **El pedido a proveedor, construido el 12/10, con la recepción desde el pedido** (ver *Lo último que pasó*). **El mínimo de cada proveedor es variado** (respuesta del 12/10): hay directos y otros que revenden varias marcas, y unos piden un monto, otros bultos, otros kilos. La propuesta: en la ficha del proveedor, el mínimo con su unidad —pesos, bultos, kilos o ninguno—, y en el pedido, cuánto falta para llegar en esa unidad. ✅ **El peso de cada producto y sus unidades por bulto ya se cargan** (12/10), en la planilla y en la ficha: es lo que necesitan los kilos y los bultos. Lo que se había planteado: Pedido de Lucas del 07/10, **con su modelo dibujado el 08/10** (en [`pedidos-lucas-2026-10-07.md`](pedidos-lucas-2026-10-07.md), punto 2). **Orden interna:** número y fecha arriba al costado, *Emite* y *Recibe* desplegables con los sectores (Depósito, Ventas, Venta mostrador, Administración, Consultorio…), renglones con código, descripción, proveedor de la ficha y cantidad —y libres, para lo que no está en el catálogo—, observación, el contacto del cliente si es para uno, y la firma del responsable al pie de la hoja impresa. **Pedido a proveedor:** se elige un proveedor, aparecen todos sus productos con stock, mínimo y lo que pidieron las órdenes, y se arma la orden que se le manda. **Lucas aclaró que «umbrales de stock por proveedor» quería decir esto**, no un umbral distinto por proveedor: el mínimo sigue siendo por producto. Pantallas nuevas, sin riesgo para lo que anda: no bloquean el corte, pero se pueden hacer antes si sobra tiempo. ~~De paso, **la planilla de importación de productos tiene que traer el mínimo**~~ ✅ **Hecho el 12/10**, junto con la suelta. Falta publicarlo.

> ✅ **Los desplegables de *Percepciones* ya usan el estilo común**, así que muestran el recuadro de foco como el resto del sistema — un paso menos para el punto 6. La pantalla tenía además el botón y la tarjeta escritos a mano; los tres ahora salen de [`estilos.ts`](../app/src/estilos.ts).

## Lo que está bloqueado, y por quién

| Qué | Quién | |
|---|---|---|
| ~~El **Excel con la columna de IVA** por producto~~ | — | ✅ **Llegó el listado de OBTech el 19/10**, con el precio con y sin IVA: el IVA sale de ahí. Todo al 21 % |
| ~~**Alta del punto de venta CAEA** en ARCA~~ | — | ✅ **El 00009, alta del 11/09.** Cargado en el sistema el 16/09 |
| **Certificado de producción** de ARCA | Lucas | 🔴 Ahora bloquea también la última prueba del CAEA. **El pedido está armado**; el trámite, paso a paso: [`certificado-produccion.md`](certificado-produccion.md) |
| ~~**Dónde se cobra la percepción de IIBB**~~ | — | ✅ **Resuelto y construido el 28/09**: va con la factura, a donde vaya la plata. Falta publicarlo |
| ~~Qué es un **"comprobante de percepción"**~~ | — | ✅ **Respondido el 19/10**: una pantalla para ver y exportar las facturas con percepción. Construida en la 0.16.6 |
| ~~¿Reciben cheques? ¿Los depositan o endosan? ¿Emiten propios? ¿Hay diferidos?~~ | — | ✅ **Contestadas el 30/09 y construido ese día**: [`cheques.md`](cheques.md) |
| **¿Cómo se llama el segundo local?** | Lucas | 🟢 Se carga en Configuración → Depósitos cuando abra. Los cinco de OBTech quedaron descartados como referencia |
| ~~Las **fotos de cómo cargan facturas de compra**~~ | Lucas | ✅ Llegaron el 10/09, con tres audios. Análisis en [`compras-e-iva.md`](compras-e-iva.md) |
| ~~**¿La cuenta corriente de proveedores entra al alcance?**~~ | — | ✅ **Sí, decidido y construido el 28/09.** Falta publicarla |
| Qué **columnas** quiere el contador en el Excel | Contador | 🟡 Ya se exporta con lo estándar |
| ~~**El dominio para los mails y el sistema**~~ | — | ✅ **Mudado y verificado en Resend el 23/10.** Las facturas salen de `notificaciones@agroveterinariagross.com.ar`. `empresa.` conectado |
| **Las casillas de mail del dominio** (`@agroveterinariagross.com.ar`) | ILUMA y Lucas | 🟡 Cuando se creen, se carga la que recibe las respuestas de los clientes en `correo.responder_a` (Configuración del sistema, grupo *correo*) |
| **Envío y descuentos de la tienda** | Zubu y Lucas | 🟡 Pendiente desde la reunión del 19/10, hasta saber cómo lo maneja Andreani |
| ~~**Las fotos de la tienda: con qué se arranca**~~ | — | ✅ **Lucas eligió el 20/10 que el sistema las busque** y él acepte o descarte cada una. **Construido el 21/10**, con Serper |
| **Qué clientes no llevan percepción de IIBB** (certificado de exclusión de la DGR) | Lucas | 🟡 Los 2.494 clientes de OBTech entraron **sin ninguno marcado**: a todos los inscriptos que pasen el mínimo se les va a percibir. Se marca en la ficha de cada uno |

→ La lista completa está en [[Pendientes con terceros]].

### Las preguntas para la próxima reunión, juntas

Dos, y las dos cambian el tamaño de algo. Están desarrolladas en sus documentos; acá van para no tener que buscarlas:

1. ¿Le llevan **la cuenta a cada proveedor** en OBTech, o eso lo miran en otro lado? → [`plan-compras.md`](plan-compras.md)
2. En la grilla del IVA de compras, la columna **Centro de Costo**: ¿elegís algo o la dejás como viene? → [`compras-e-iva.md`](compras-e-iva.md)

Y cuatro de los audios del 07/10, desarrolladas en [`pedidos-lucas-2026-10-07.md`](pedidos-lucas-2026-10-07.md):

3. En OBTech, ¿la caja y la unidad suelta son **dos artículos distintos**? Sin contestar; con pocos casos, se atan a mano en la ficha.
4. ~~¿Hay productos de **dos niveles**?~~ ✅ Sí, unos cinco: caja, tableta y pastilla. Construido así.
5. ~~El **precio de la suelta**~~ ✅ Lo pone él; la ficha sugiere la división.
6. ~~El **mínimo que acepta un proveedor**, ¿es en plata, en bultos o en kilos?~~ ✅ Es variado: depende del proveedor. Ver el punto 16.

Las cuatro de los cheques se contestaron el 30/09. Queda una de configuración, para cuando se mire la pantalla: **¿a un cheque diferido se le cobra otro precio?** Hoy usa la lista de contado.

Y dos para el contador: **qué columnas quiere** en los dos archivos, y si le sirven en Excel.

## Lo que NO hay que tocar

Está andando y verificado. Si algo de acá se rompe, es una regresión:

- **La emisión sin conexión** — probada con internet cortado de verdad el 07/09.
- **La reconciliación de stock del reparto** — `cobrar_venta()` lee el libro de movimientos, no las líneas del remito. Un remito que no descuenta no deja movimiento y la cuenta le da bien sola.
- **La numeración contra ARCA** — se alinea sola después de cada rechazo.
- **`networkMode: 'always'`** en React Query. Sacarlo cuelga el mostrador entero sin conexión.
- **El límite de 12 s** en `supabase.ts`, **salvo las funciones de ARCA, que esperan 35** (`funcionesDeArca.ts`). Y **ese número tiene que quedar por encima del plazo de las funciones** (`PLAZO_ARCA_MS`, 25 s, en `arca-wsfe-solicitar-cae` y `arca-wsfe-caea`): si la app se rinde antes, el cajero ve un error mientras el CAE sale igual, y la app se da por desconectada y factura la venta siguiente con CAEA.
- **El CAE se escribe sólo si el comprobante sigue esperando ese pedido** —mismo estado, mismo número—. Escribirlo siempre deja un comprobante con el número de un punto de venta y el CAE de otro, o un autorizado vuelto a rechazado por una respuesta que llegó tarde.
- **`aumentar_precios` y `revertir_aumento` son SECURITY DEFINER a propósito.** No agregarles política de insert: el registro que existe para deshacer un error no puede ser editable por fuera del mecanismo que lo deshace.
- **La factura de compra no tiene líneas de producto, y es a propósito.** Agregárselas no es "completar la pantalla": es abrir la recepción de mercadería, que necesita emparejar códigos del proveedor con los nuestros y decidir qué pasa con los costos. Eso es V1-B.
- **El disparador que completa el depósito del movimiento.** Sacarlo obliga a que los dieciséis lugares que escriben en el libro de stock manden el depósito, y el que se olvide no falla al compilar: falla al vender. Desde el 30/09 decide además **el de la máquina** y que **lo que vuelve vuelva adonde salió**; el orden de sus reglas importa y está explicado en la migración `20260930120000`.
- **El saldo de cada depósito lo mantiene el mismo disparador que el total** (`app.aplicar_movimiento_stock`). Partirlo en dos permitiría que uno quede apagado y que la suma de los depósitos deje de dar el total, sin que nada falle.
- **La toma de inventario compara contra el depósito de la toma, no contra el total.** Volver al total hace que cerrar la toma de un local borre la mercadería del otro. Se probó rompiéndolo.
- **En la red del local, las dos terminales suben lo mismo, y es a propósito.** La operación no sale de la cola del mostrador cuando se le entrega a la caja. Si una de las dos máquinas no vuelve a encenderse, la venta sube igual desde la otra; la copia que llega segunda choca contra la clave primaria y se descarta sola.
- **Una venta que la caja ya cobró no se vuelve a guardar cuando el mostrador la reenvía.** Sin esa regla vuelve a la pantalla del cajero con la plata ya cobrada. Está en `loQueSeGuarda()`, con su prueba.
- **Una venta con devoluciones parciales no se anula entera.** La anulación reingresa el stock mirando lo que salió por la venta y no descuenta lo que ya volvió: sacar esa restricción hace que una venta con una bolsa devuelta reingrese las tres.
- **La percepción de IIBB de una devolución se prorratea, nunca se recalcula.** Recalcularla sobre el importe devuelto la hace caer bajo el mínimo no sujeto y devuelve cero, dejándole al cliente una percepción que no corresponde.
- **Sin llave, la base local frena y no crea otra.** El testigo existe para eso. Crear una llave nueva cuando ya hay datos cifrados deja ilegibles para siempre las ventas que no subieron.
- **Las operaciones viajan abiertas por la red del local.** Cada PC cifra con su propia llave; mandarlas cifradas deja a la caja sin poder leerlas, sin ningún error.
- **Se cifra antes de abrir una transacción de Dexie, nunca adentro.** Esperar el cifrado con la transacción abierta la cierra sola y la escritura falla.
- **Los pagos de cuenta corriente se imputan a la deuda más vieja primero.** Es lo que hace que la suma de los tramos de `vista_deuda_antiguedad` dé el saldo. Volver a sumar sólo las facturas —que es como estaba— hace que un cliente que ya pagó siga apareciendo como deudor vencido.
- **Las métricas de venta se comparan por tramo del mes, no contra el mes anterior completo.** Cambiarlo deja el mes en curso en baja permanente hasta el día 30, todos los meses.
- **El recargo por cuotas va en el precio de la venta, no en el importe del pago.** Sumarlo al pago —como estaba hasta el 17/09— deja la venta valiendo menos que lo que el cliente paga, y como el cobro exige que los pagos cierren con el total, cobrar en cuotas se vuelve imposible. Además la factura saldría por menos de lo cobrado.
- **El ticket va en la página 437, la de MS-DOS, y no en el alfabeto de Windows.** Es lo que la impresora lee de fábrica. Con el de Windows, "Oberá" sale impreso "Oberß" y cada importe arrastra un `$á`.
- **La tabla `caea` necesita `actualizado_en`, como toda tabla maestra.** La terminal pagina por esa columna: sin ella la bajada se corta, el CAEA no llega a la máquina y la caja no puede facturar durante un corte. Lo mismo vale para cualquier tabla nueva que se sume a la sincronización — lo comprueba `supabase/pruebas/columnas-de-sincronizacion.mjs`.
- **La API de la tienda entra a la base con la llave pública, no con la de servicio.** Es lo que hace que un error en la puerta no pueda llegar a los costos ni a los clientes. Con la de servicio, la puerta lo ve todo.
- **La lista de campos que sale a la tienda está escrita a mano**, y una prueba la compara. Armarla «con lo que tenga la tabla» publicaría el próximo campo interno que se agregue.
- **La marca de agua de la API mira las transacciones abiertas.** Si devuelve «ahora», un precio que se guarda mientras Zubu consulta no llega nunca a la web. Se probó rompiéndola.
- **Todo lo que cambia lo que ve la tienda le mueve la fecha al producto** (animales, etapas, códigos de barra, «Vender online», precio en una lista). Sacar esos disparadores deja a la tienda con datos viejos, sin ningún error.
- **Un pedido web pagado no se entrega sin factura, y no se factura por un importe distinto del cobrado.** Lo hace cumplir la base (`pedido_web_marcar`, `pedido_web_facturar`), no la pantalla. El segundo freno es el que impide facturar una percepción de IIBB que la web no cobró.
- **El pedido sigue a su venta.** Anular la venta por cualquier camino cancela el pedido y anota el reintegro, y cada devolución de un pedido pagado en la web anota el suyo: son disparadores de la base. Sacarlos deja plata del cliente sin devolver, sin ningún aviso.
- **El remito de un pedido web se emite en el servidor, no en la copia local.** Las ventas de la tienda no bajan a las terminales: por el camino de siempre falla con «la venta no está en esta computadora».
- **Las devoluciones necesitan sus permisos de la base:** dar de alta la devolución y sus líneas, y anotarle la nota de crédito una sola vez. Sin el último, la nota queda sin CAE y la pantalla dice que la venta no estaba facturada. Se prueban **como usuario**, nunca como dueño de la base.
- **El menú lateral aparece desde 1024 píxeles, no desde 768.** Volverlo a 768 hace que una tablet le deje a la página menos lugar que un celular acostado, y las tablas vuelven a desplazarse hacia el costado justo en ese tramo.
- **Las pestañas de cada sección van en la franja de arriba, no adentro del área que se desplaza.** Adentro empujan la Caja, el Mostrador, Productos y Clientes, que ocupan justo el alto de la pantalla.
- **Una pantalla nueva se agrega en `lib/menu.ts`**, en su sección, y no en el Layout. La prueba controla que ninguna dirección esté en dos secciones.
- **El cheque nunca va al arqueo.** El medio «Cheque» no afecta la caja y una restricción de la base (`medio_pago_cheque_no_va_al_cajon`) no deja configurarlo de otra forma. Si sumara, la caja cerraría con diferencia cada día que entra uno.
- **El cheque de la caja entra a la cartera al cobrarse la venta, no al cargar el pago** (disparador `venta_cobrada_trae_sus_cheques`). Los pagos se cargan un paso antes del cobro: si entrara ahí, un cobro que falla dejaría un cheque en la cartera. **Y entra aunque le falten datos**: está en el cajón y tiene que figurar.
- **El cheque de tercero se elige de la cartera y se endosa entero.** Dejar tipearlo de nuevo al pagar es cómo un mismo cheque termina contado dos veces.
- **Todo cambio de estado de un cheque pasa por `app.cheque_pasa_a`**, que deja el renglón en la historia. Un estado que cambia sin historia es un cheque del que nadie sabe cómo llegó adonde está.
- **Anular un pago a proveedor devuelve el cheque a la cartera antes de sacarle el proveedor.** Al revés, la base lo frena: un cheque endosado sin proveedor no puede existir. Pasó en la primera corrida en seco.
- **El historial de costos compara el costo con IVA** (`costo_con_iva`), nunca el del papel. El de una A viene sin IVA: compararlo contra una B daría un 21% de aumento que no existe.
- **El CBU lo controla la base con sus dos dígitos verificadores** (`app.cbu_valido`). Un número cambiado es una transferencia a otra persona.
- **La apertura de una caja lleva como referencia el movimiento de la venta, nunca la venta** (`referencia_tipo = 'fraccionamiento'`). La anulación y las devoluciones leen «lo que salió por la venta»: con la venta como referencia, anular devolvería una caja cerrada y sacaría diez pastillas.
- **El disparador que abre la caja corre después del que suma al saldo**, por orden alfabético: `movimiento_stock_aplicar` antes que `movimiento_stock_sin_sueltas_abre_envase`. Renombrar cualquiera de los dos puede hacer que lea el saldo de antes de la venta y no abra nada. Y **reacciona a `apertura`**: es lo que hace andar los tres niveles. Se probó sacándolo.
- **El estado de una suelta se calcula con lo disponible** —sueltas más lo que se puede abrir—, en `vista_stock` y en la copia local. Con las sueltas solas, la pastilla de una caja llena aparece en Crítico todos los días.
- **Quitar un aviso de stock marca la fila (`eliminado_en`), no la borra.** La sincronización baja lo que cambió: lo borrado no llega a las PC y el mostrador sigue avisando con un número que ya no existe. Se probó volviendo a borrar.
- **El historial ordena por cuándo pasó (`ocurrido_en`), no por cuándo llegó, y a la misma hora la apertura de la caja va antes.** Por cuándo llegó, una venta hecha sin internet cambia los saldos del medio; sin la apertura antes, la venta de una suelta dice «queda −1».
- **Cada vez que la copia local baja columnas nuevas de una tabla, se sube `VERSION_BAJADA`** en `sync.ts` y se borra el cursor de esa tabla. La 0.14.0 se lo olvidó y la 0.15.0 lo corrigió.
- **La impresora se guarda por terminal, no en la configuración del comercio.** Volverla a un solo valor para todo el local deja tres de las cuatro PC imprimiendo a un nombre que en su lista no existe. Y el nombre se elige de la lista de Windows: escribirlo a mano falla en silencio.

## Cómo arrancar

```bash
npm --prefix "D:/00 ILUMA/Dev Code/Sistema Gross/app" run dev
```

Queda en `http://localhost:5173`.

⚠️ **El conector de Supabase tiene que apuntar a `ywggnhoifhtoncnxrodh`.** Hay tres conectores y **dos apuntan a otro lado**. Verificar **siempre** antes de aplicar una migración.

**Publicar una corrección:** subir la versión en `app/src-tauri/tauri.conf.json` y correr `npm --prefix app run escritorio:publicar` **desde Git Bash** —o, desde PowerShell, `npm.cmd --prefix app run escritorio:publicar`: PowerShell no deja correr `npm` a secas por la política de scripts—. Sube solo a Cloudflare. **Tres trampas vistas el 12/10:** (1) **el antivirus revisa las conexiones seguras** y Node no acepta su certificado: wrangler corta con *unable to verify the first certificate*. El publicador ya corre wrangler con `--use-system-ca`; para iniciar sesión a mano, `$env:NODE_OPTIONS = '--use-system-ca'; npx.cmd wrangler login`, con la cuenta de Cloudflare correcta abierta en el navegador. (2) **Avast puede avisar que bloqueó un PowerShell** al abrir el navegador del inicio de sesión: es un falso positivo, se cierra el aviso y se sigue. (3) **Las sesiones de Claude no pueden publicar**: el control de permisos lo frena aunque se autorice en el chat; lo corre la persona. Ojo: `actualizaciones/latest.json` puede tardar un minuto en cambiar de número —queda un rato cacheado en el borde de Cloudflare—, así que si se mira enseguida todavía dice la versión anterior y no es que falló. **Nunca** subir `dist` a mano: un `dist` de `npm run build` no tiene `actualizaciones/` y deja a las 4 PC sin correcciones, en silencio.

---

## Qué se hizo el 8 y 9 de septiembre

**Tanda 1 — todo lo que se ve (10 puntos).** Scroll que frena, diálogos propios en lugar de los 16 `window.prompt`, umbral de stock en la ficha, descripción, descuento en caja por porcentaje con motivo de lista, cierre del PIN al enviar a caja, nombre para llamar al cliente, cantidad al agregar (configurable), descuento por línea con PIN, y Stock como entrada propia del menú.

**Tanda 2 — remitos y líneas libres (4 puntos).** Remito sin precios, remito de cero, elegir si descuenta stock, y el producto comodín en venta, presupuesto y remito.

**Proveedores y el contador.** Ficha de proveedor, **ajuste** de precios en masa por proveedor y rubro —sube y baja, `7` y `-8`, con deshacer exacto— y la exportación mensual de ventas a Excel.

**La impresión del mostrador, rehecha.** Del camino por red —que no servía en ninguna de las dos cajas— al camino por la cola de Windows, con la impresora elegida de una lista y guardada por terminal. Es el punto 1 de la reunión del 07/09.

**Documentación.** Se partió `ESTADO.md` (766 líneas) en `AHORA.md` + cuatro notas, sin perder una línea. Las 40 imágenes se movieron a `referencias/`.

📊 **16 de 24 pedidos de Lucas hechos** · 173 pruebas verdes en la app y 9 en el programa · 68 migraciones. *(Los números del 9 de septiembre; los de hoy están arriba.)*

---

## El mapa

**Para entender el proyecto**
- [[10 · Las decisiones que no se revisan]] — las ocho de fondo. Cambiar cualquiera obliga a rehacer módulos.
- [`ESTADO.md`](ESTADO.md) — qué es, estado por módulo, convenciones, datos de prueba.
- [`alcance-v1.md`](alcance-v1.md) — qué entra en V1-A y V1-B, y la definición de terminado.

**Para trabajar**
- [[Lo construido, en detalle]] — cada módulo, con qué criterio y cómo se verificó.
- [[Las del trabajo sin conexión]] — las trampas que ya costaron tiempo.
- [`guia-de-pantallas.md`](guia-de-pantallas.md) — el recorrido del menú, para mostrar y explicar.

**Para hablar con el cliente**
- [`pedidos-de-lucas-estado.md`](pedidos-de-lucas-estado.md) — los 24 puntos con su estado. El papel de la próxima reunión.
- [`reunion-lucas-2026-09-07.md`](reunion-lucas-2026-09-07.md) — la visita al local.
- [`obtech-como-piso.md`](obtech-como-piso.md) — qué cubre el sistema que usan hoy y qué nos falta.
- [`compras-e-iva.md`](compras-e-iva.md) — facturas de compra y Libro de IVA.
- [`certificado-produccion.md`](certificado-produccion.md) — el trámite del certificado, y lo que se hace el día que se pasa a producción.
- [`la-pc-con-windows-7.md`](la-pc-con-windows-7.md) — la hoja para que Lucas decida qué hace con esa máquina.

**Para el local**
- [`instalacion-en-el-local.md`](instalacion-en-el-local.md) — el guion de las 4 PC.
- [[Pendientes con terceros]] — a quién se le debe qué.

---

## Qué hacer con esta nota

**Se actualiza al empezar y al terminar cada sesión**, y se mantiene en una página. Si crece, algo tiene que bajar a una nota propia.

Lo que va acá es **lo que cambia**. Lo que no cambia —las decisiones, cómo funciona un módulo— vive en su nota y se enlaza.
