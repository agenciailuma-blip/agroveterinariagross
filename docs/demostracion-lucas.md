# Demostración para Lucas — guion y preparación

**Para qué sirve:** estudiarlo antes de la reunión y tener el orden claro. No es para leerlo delante de él.

Hay además una **presentación** para seguir slide por slide mientras Lucas prueba del otro lado. El link está al final de este documento.

---

# PARTE 0 — Dónde estamos (para tenerlo en la cabeza)

Lo que sigue es el mapa completo. No hace falta contárselo así a Lucas: sirve para que vos sepas, en cualquier momento de la reunión, si algo que él pregunta ya está, está a medias o no está.

## Cómo está partido el proyecto

| | |
|---|---|
| **V1-A** | Lo que tiene que estar andando en el local el **26 de octubre**. Es lo que se ve en esta demostración. |
| **V1-B** | Compras a proveedores, Libro de IVA y la tienda online. Después del corte, ya acordado. |

## V1-A — lo que ya funciona

| Bloque de trabajo | Estado | Qué significa |
|---|---|---|
| Usuarios, roles y permisos | ✅ | Cada uno ve lo suyo. El vendedor entra con PIN de cuatro números |
| Productos y categorías | ✅ | Con alta, baja (de a uno y en masa) y jerarquía de rubros |
| Precios y medios de pago | ✅ | **ABM completo**: se crean listas y formas de pago sin depender de nosotros |
| Stock y movimientos | ✅ | Sabe cuánto hay y por qué |
| Toma de inventario por sectores | ✅ | Contar sin cerrar el local |
| Clientes y cuenta corriente | ✅ | Con límite de crédito y cobranza desde la caja |
| Ventas: el vendedor arma, la caja cobra | ✅ | Y lo que el vendedor preguntó le llega al cajero |
| Facturación ARCA | ✅ | **Emite CAE real** contra el ambiente de pruebas de ARCA |
| Comprobante en ticket y en A4 | ✅ | Los dos formatos que usan hoy, con el logo |
| Notas de crédito / devoluciones | ✅ | Stock, deuda y comprobante en una sola operación |
| Percepción de IIBB | ✅ | Calculada según el cliente y el monto |
| Vender sin internet | ✅ | Probado. Falta verlo en las máquinas del local |
| Importar la planilla de productos | ✅ | Probado contra la planilla real de Lucas |
| Contingencia con CAEA | ✅ | Construida. Esperando un trámite de ARCA |

## V1-A — lo que falta

| Qué falta | De quién depende |
|---|---|
| 🔴 **Instalar el programa en las 4 PC** | Nuestro. Es lo que habilita lo dos de abajo |
| 🔴 **Impresión directa a la Hasar** | Nuestro, después de lo anterior |
| 🔴 **Sincronización por la red del local** | Nuestro. Hoy las terminales se hablan por internet |
| 🟡 Cifrado de la base de cada terminal | Nuestro. Comprometido en el alcance |
| 🟡 Métricas de venta en la pantalla de Inicio | Nuestro. Es de lo último y es rápido |
| 🔴 **Certificado de producción de ARCA** | **Trámite de Lucas** |
| 🔴 **Punto de venta del régimen CAEA** | **Trámite de Lucas** |
| 🔴 **El Excel con la columna de IVA** | **Lucas** |
| 🔴 Planificar la carga de los 3.000 productos | Los dos |
| 🟡 Pasar la base de datos a plan pago | Lucas, antes de la carga |

> **La frase corta, si te la pide:** *"Todo lo que se ve funciona. Lo que falta es instalarlo en las máquinas del local, conectarlo a la impresora fiscal, y dos trámites tuyos con ARCA."*

---

# PARTE 1 — Subirlo a la nube

## Por qué Cloudflare Pages y no otra cosa

Es donde va a vivir el sistema igual, y la cuenta ya está a nombre de Gross. Cualquier otra opción es trabajo que se tira. Además el sistema ya habla con la base de datos que está en la nube: lo único que falta subir es la pantalla.

## Los pasos, una sola vez (10 minutos)

1. Generar la versión para publicar:

```bash
npm --prefix "D:/00 ILUMA/Dev Code/Sistema Gross/app" run build
```

Eso deja todo en la carpeta `app/dist`.

2. Entrar a [dash.cloudflare.com](https://dash.cloudflare.com) con la cuenta `lucasgross.cuentas@gmail.com`.

3. **Workers y Pages → Create → Pages → Upload assets**.

4. Nombre del proyecto: `gross-sistema`. Arrastrar la carpeta **`dist`** entera.

5. Queda publicado en `https://gross-sistema.pages.dev`.

> **Por qué subir la carpeta a mano y no conectar el repositorio:** conectarlo obliga a configurar las claves de la base en Cloudflare y a que compile allá. Para una demostración es andar buscando problemas. Arrastrar la carpeta funciona la primera vez, siempre.

## Para actualizarlo después

Repetir el paso 1 y volver a arrastrar `dist` al mismo proyecto. Un minuto.

---

## ✅ Checklist de preparación — hacelo el día anterior, no en el momento

- [ ] **Subir el logo.** Configuración → Datos del emisor → Logo. Cambia mucho cómo se ve el comprobante delante de él.
- [ ] **Mirar el comprobante impreso**, en los dos formatos, y dejarlo listo para mostrar.
- [ ] **Armar una venta y dejarla en la cola de caja**, para no perder tiempo tipeando en el Bloque 1.
- [ ] **Probar el corte de internet** en tu máquina una vez, para saber qué se ve.
- [ ] Si querés que Lucas pruebe solo: **crearle el usuario y verificar que entra.** Nunca en el momento.
- [ ] Tener el celular con señal para escanear el QR.

**Para esta demostración, entrá vos con tu usuario y manejá vos la pantalla.** Es más ágil y evita que se pierda buscando cosas.

---

# PARTE 2 — Antes de empezar, decí esto

Dos frases que evitan malentendidos y que conviene decir **antes** de mostrar nada:

> **"Todo lo que veas hoy funciona de verdad, pero contra el sistema de pruebas de ARCA. Las facturas que emitamos ahora no son válidas: son exactamente iguales a las reales, pero de práctica. El día que pasemos a producción es cambiar un dato y listo."**

> **"Los productos y clientes que vas a ver son de prueba, treinta y pico. Los tuyos son tres mil y entran cuando me pases el Excel."**

Sin esa aclaración, la primera pregunta va a ser "¿esto ya está facturando?" y se pierde el hilo.

---

# PARTE 3 — El guion

El orden sigue **cómo trabaja el local**, no cómo está organizado el sistema. Cada bloque tiene lo que hacés y lo que decís.

---

## Bloque 1 — Una venta de punta a punta *(el más importante)*

Es el corazón del sistema y lo que reemplaza a OBTech. Si solo tenés tiempo para una cosa, es esta.

### 1.1 El vendedor arma la venta

**Pantalla:** Ventas

- Escribí parte de un nombre de producto — no hace falta el nombre completo
- Agregá dos o tres productos
- Elegí un cliente (o dejá Consumidor Final)
- **Elegí cómo va a pagar el cliente** (por ejemplo, Tarjeta en 3 cuotas)
- Mandala a caja

> *"El vendedor no cobra ni factura. Arma la venta y la manda. Se identifica con su PIN de cuatro números, así queda registrado quién la hizo, pero sin tener que estar entrando y saliendo del sistema todo el día."*

### 1.2 La caja cobra — y ya sabe lo que se habló en el mostrador

**Pantalla:** Caja

- La venta aparece sola en la cola de la izquierda
- Elegí la venta
- **Mostrá el cartelito que dice "El vendedor anotó: Tarjeta de crédito · 3 cuotas"**, y que el medio ya viene elegido con el precio calculado
- Cambiá el medio a Efectivo → **mostrale cómo cambia el total**
- Cobrar

> *"Fijate esto: lo que el vendedor le preguntó al cliente le llega al cajero. Hoy el cajero tiene que volver a preguntar con la persona adelante. Igual lo puede cambiar —la tarjeta puede no pasar— pero ve al lado lo que se le había dicho al cliente, así no le cobra un precio distinto del que se cotizó."*

> *"Y acá está la diferencia de precio por medio de pago que ustedes ya manejan. El vendedor le dice el precio de tarjeta, y si paga en efectivo aparece el descuento. Nunca al revés, para que no quede pegado el vendedor con el cliente adelante."*

### 1.3 La factura sale sola *(el momento ARCA en vivo)*

Al cobrar, el sistema le pide el CAE a ARCA **automáticamente**. En la misma pantalla aparece:

> Venta CAJA1-0000XX cobrada y facturada · CAE 863407… · **[Imprimir comprobante]**

> *"Eso que acaba de pasar es la factura pidiéndole autorización a ARCA, en vivo. El número que ves es el CAE, que es lo que hace que la factura sea válida. Tardó menos de un segundo, y el cajero no tuvo que ir a ninguna otra pantalla."*

### 1.4 El comprobante, en los dos formatos *(pedido suyo)*

Apretá **Imprimir comprobante**. Arriba hay un selector: **Ticket 80 mm** y **Hoja A4**.

- Mostrá primero el **ticket** — es el que sale por la Hasar
- Cambiá a **A4** — es el que le manda por mail al cliente de cuenta corriente
- Señalá el **logo** arriba y el **QR** abajo

> *"Estos son los dos comprobantes que vos me mandaste. El ticket sigue el mismo orden y las mismas etiquetas que el de ustedes, a propósito: tus clientes leen ese papel desde hace años y no tienen por qué aprender otro. Y la elección se recuerda por computadora: la caja imprime tickets todo el día, la oficina imprime A4."*

> *"El QR es obligatorio desde 2021. Cualquiera lo escanea con el celular y ARCA le confirma que la factura existe."*

**Si tenés señal en el celular, escaneá el QR delante de él.** Es el momento más convincente de toda la demostración.

> 💡 **Si la venta fue a un Responsable Inscripto y superó el mínimo**, aprovechá para mostrarle la percepción de IIBB al pie, sumada después del IVA — exactamente como él la describió.

---

## Bloque 2 — El semáforo de facturación

**Pantalla:** Facturación

- Mostrá la lista con los colores
- La venta que acabás de hacer está ahí, en verde o amarillo

> *"Este semáforo lo pediste vos en la primera reunión: verde autorizado e impreso, amarillo autorizado sin imprimir, naranja esperando, rojo rechazado. De un vistazo sabés si quedó algo sin resolver."*

Mostrá también el **panel rojo de arriba**: ventas cobradas sin comprobante.

> *"Este es el aviso más importante de la pantalla: plata que entró sin factura. Si ARCA se cae justo cuando cobrás, la venta se hace igual —no vas a dejar al cliente esperando— pero queda marcado acá hasta que se resuelva."*

---

## Bloque 3 — Sin internet *(el que más lo va a sorprender)*

**Preparación:** tené el sistema abierto en Ventas.

- **Desconectá el wifi de la computadora**
- Buscá un producto → sigue apareciendo
- Armá una venta y mandala a caja → funciona
- Mostrá el indicador de "sin conexión" y el contador de pendientes
- **Reconectá** → mostrá cómo sube sola

> *"Esto es lo que pediste: que si se corta internet el mostrador no se pare. Los productos, los precios y los clientes están guardados en cada computadora. La venta se guarda y sube sola cuando vuelve la conexión."*

### ⚠️ Lo que tenés que aclarar acá, sí o sí

> *"Hay un límite que quiero que sepas ahora y no el día que pase. Hoy las computadoras se sincronizan entre sí **a través de internet**. Si se corta, la caja sigue cobrando lo que ya tenía, pero una venta que arma un vendedor en otra máquina no le llega hasta que vuelva la conexión. Lo estamos resolviendo: va a haber sincronización por la red del local, sin depender de internet. Es lo último que vamos a hacer, después de todo lo demás."*

**No te lo saltees.** Es mejor que lo escuche de vos ahora, tranquilo, que lo descubra un día que se corte el servicio.

---

## Bloque 4 — Precios y medios de pago, sin depender de nosotros

**Pantalla:** Precios

Este bloque es corto pero da mucha tranquilidad.

- Mostrá las listas de precios y el ajuste de cada una
- **Creá un medio de pago nuevo en vivo** — por ejemplo "Transferencia con 5% de descuento"
- Mostrá el desplegable de cuotas de 1 a 12 y los recargos por cuota

> *"En Argentina las formas de pago cambian tres veces por año. Si cada cambio dependiera de que yo lo programe, el sistema te estorba. Esto lo maneja tu encargado, sin llamarme."*

---

## Bloque 5 — Stock de verdad

**Pantalla:** Productos

> *"Esto es lo que hoy no tienen: el sistema sabe cuánto hay de cada cosa, y sabe por qué. Cada movimiento queda con quién lo hizo y cuándo."*

- Abrí un producto y mostrá el detalle
- Mostrá la **baja de productos**: marcás varios y los das de baja juntos, y se pueden restaurar

> *"Dar de baja no borra: el producto sale del mostrador pero las ventas viejas lo siguen teniendo. Y si te equivocaste, se restaura."*

**Pantalla:** Inventario

> *"Y esto es para contar la mercadería sin cerrar el local. Se cuenta por sectores, una góndola por vez, en los ratos tranquilos. Se escanea, se pone cuánto hay, y el sistema te dice al toque si coincide o no."*

- Abrí una toma de prueba y contá un producto escaneando o buscando
- Mostrá la diferencia y cuánto representa en plata

---

## Bloque 6 — La carga de los 3.000 productos *(con SU planilla)*

**Pantalla:** Productos → **Importar planilla**

**Llevá su archivo cargado y hacelo en vivo.** Ya está probado: entra completo.

- Elegí su planilla
- Mostrá que **encontró sola la hoja de Productos** y dónde empieza la tabla
- Mostrá el mapeo de columnas ya resuelto
- Mostrá el resumen: 2.262 filas, sin errores

> *"Tu planilla la probé tal cual me la mandaste. Entra completa: los cuatro niveles de categoría, la marca y las tres columnas de sí/no. Dos mil doscientas sesenta y dos filas, sin un error."*

> *"Y se puede importar las veces que haga falta. Si corregís algo en el Excel y lo volvés a mandar, actualiza en vez de duplicar."*

**Este es el momento de pedirle el Excel con la columna de IVA.** Está preparado el terreno.

También es el momento de preguntarle por **Animal** y por **Precio tarjeta** (ver Parte 5).

---

## Bloque 7 — Devoluciones

**Pantalla:** Facturación → botón **Devolver** en una factura autorizada

> *"Cuando un cliente devuelve, con un botón se hacen las tres cosas juntas: vuelve el stock, se le saca la deuda si era cuenta corriente, y sale la nota de crédito que anula la factura ante ARCA."*

⚠️ **Si pregunta por devolución parcial** (que devuelva 1 de 3): hoy no está. Se anula todo y se rehace la venta. **Anotá si le pasa seguido** — es una decisión que necesito de él.

---

# PARTE 4 — Preguntas que probablemente haga

| Si pregunta… | Contestá |
|---|---|
| **"¿Ya puedo facturar de verdad?"** | "Todavía no. Falta el certificado de producción, que es un trámite tuyo con la clave fiscal, igual al que hicimos para pruebas. Cuando lo tengamos es cambiar un dato." |
| **"¿Cuándo lo tengo funcionando?"** | "El 26 de octubre, como quedamos. Lo que falta está identificado y no depende de nadie de afuera, salvo el Excel y dos trámites tuyos con ARCA." |
| **"¿Puedo verlo desde casa / del celular?"** | "Sí, es la misma dirección web. Para el mostrador van a ser programas instalados en las cuatro PC, porque eso es lo que permite trabajar sin internet y hablarle a la impresora." |
| **"¿Cómo imprime en la Hasar?"** | "El formato del ticket ya es el de ustedes, igual al que me mandaste. Hoy sale por el navegador a cualquier impresora; la conexión directa con la Hasar la hacemos cuando instalemos el programa en las PC del local." |
| **"¿Y si se cae ARCA?"** | "Está resuelto: hay un régimen de contingencia que ARCA mismo tiene, que se llama CAEA. El circuito está construido. Necesito de vos un trámite para activarlo — te lo paso por escrito." |
| **"¿Esto se puede perder?"** | "No, pero hay algo que necesito destrabar: la base de datos está en el plan gratuito, que no tiene copias de seguridad recuperables. **Antes de que empiece la carga de los 3.000 productos hay que pasarla al plan pago.** Son unos 25 dólares por mes y es la mejor plata del proyecto: sin eso estaríamos arriesgando semanas de trabajo de tu gente." |
| **"¿Y el ecommerce de Zubu?"** | "La parte nuestra está diseñada y lista para enchufar. Depende de que ellos hagan su parte, y por eso lo dejamos para después del corte: no quiero que una fecha nuestra dependa de la agenda de un tercero." |

---

# PARTE 5 — Lo que tenés que salir con esto

Además de mostrar, la reunión sirve para destrabar. **Lo que necesitás pedirle:**

1. 🔴 **El Excel de productos con la columna de alícuota de IVA.** Es lo que más bloquea.
   ⚠️ **Sólo IVA. La percepción NO va en el Excel** — ver la nota de abajo.
2. 🔴 **Que dé de alta un punto de venta bajo el régimen CAEA** en el portal de ARCA (*Administración de puntos de venta y domicilios*). Sin eso ARCA no entrega el código de contingencia — lo probé y lo rechaza con el error 15003.
3. 🔴 **Dónde se cobra la percepción de IIBB** — en la caja o a la cuenta corriente. Tenés el ejemplo con números en [`mensajes-lucas-2026-08-21.md`](mensajes-lucas-2026-08-21.md).
4. 🟡 **Qué hacer con la columna "Animal"** de su planilla (Perros, Gatos, Bovinos). No es un nivel más del rubro, es otra cosa. Sirve sobre todo para la tienda.
5. 🟡 **La columna "Precio tarjeta"**: hoy el sistema lo calcula solo con un porcentaje sobre el contado. Si sus precios de tarjeta no salen todos del mismo porcentaje, hay que hablarlo.
6. 🟡 **Pasar Supabase a plan pago** antes de que arranque la carga.
7. 🟡 **Comprar el lector de códigos de barra** antes del conteo, no después.
8. 🟡 **Confirmar cuántas cajas van a facturar** (sigue sin definir desde julio).
9. 🟡 **¿Devuelven parcial seguido?**

> ### 📌 La percepción NO va por producto
>
> Lucas lo aclaró el 24/08 y tiene razón: **la percepción es de la factura, no del producto.** El Excel no lleva ninguna columna de percepción — sólo la de IVA, que sí es por producto.
>
> El sistema ya funciona como él lo describió: la marca de **exento de DGR va en la ficha del cliente** (Clientes → Datos fiscales), y cada Factura A que supere el mínimo la calcula sola.
>
> Su frase *"cada factura mayor a setecientos y pico mil"* además confirma el mínimo: con la alícuota de 3,31%, un mínimo de $24.000 se dispara justo a los **$725.075**.

> ### ✅ Ya resueltos, no hace falta pedirlos
>
> **Ingresos Brutos** (`20-14636976-7`) y **fecha de inicio de actividades** (`16/06/1986`) salieron de los dos comprobantes que mandó el 25/08. Ya están cargados y salen impresos.

---

# PARTE 6 — Cosas que NO hay que mostrar

Para no generar expectativa sobre lo que todavía no existe:

- **Reportes y métricas de venta** — la pantalla de Inicio muestra stock y comprobantes, pero no ventas del día ni ranking de productos. Si pregunta: "viene, es de lo último y es rápido".
- **Compras a proveedores y Libro de IVA** — es V1-B, después del corte. Está en el alcance firmado.
- **Notas de débito** y **devoluciones parciales** — no están.
- **Contingencia con CAEA** — el circuito está construido (pantalla, reglas y las cuatro llamadas a ARCA), pero **todavía no emitió nada real**: ARCA no otorga el código hasta que Gross dé de alta el punto de venta del régimen CAEA. Si sale el tema, la respuesta honesta es: "está hecho, falta un trámite de ARCA que necesito de tu lado". No lo muestres — un panel que dice "no hay CAEA vigente" no ayuda a explicar nada.

Si aparece alguno de estos temas, la respuesta honesta es corta: *"está en el plan, no está hecho todavía"*. No prometas fechas que no tenemos.

---

# La presentación

Para seguir la reunión slide por slide, con lo que hay que hacer y lo que hay que decir en cada paso:

**https://claude.ai/code/artifact/7c872226-5282-4dac-8c32-bb3ce398bfd0**

Son 20 láminas con la estética de Gross. Es **privada**: sólo la ve quien está en tu cuenta, no está enlazada desde ninguna parte del sistema y Lucas no tiene forma de llegar a ella. Abrila en tu pantalla mientras él prueba en la suya.

- `←` `→` para moverte
- `i` para el índice, y saltar a cualquier lámina
- `Inicio` / `Fin` para el principio y el final
