# Reunión 1 con Agroveterinaria Gross — Guía de trabajo

**Objetivo de la reunión:** salir con (a) la decisión híbrido vs nube tomada, (b) los datos del relevamiento operativo, (c) los no negociables aceptados y (d) cuatro pedidos en marcha que tienen demora externa.

**Duración sugerida:** 90 minutos. No más. Si se estira, cortá y agendá una segunda.

**Quién tiene que estar:** Lucas (decisor) + quien atiende el mostrador todos los días. El segundo es más importante de lo que parece: es el que te va a decir cómo funciona el negocio de verdad, no cómo dicen que funciona.

**Reunión aparte, después:** el contador. 30 minutos. No la mezcles con esta.

---

# PARTE 0 — Para vos, antes de entrar

Seis conceptos. Si entendés estos seis, podés sostener toda la reunión sin que nadie te haga una pregunta que no puedas contestar.

### 1. "Master de stock" = quién tiene la verdad

Si tres sistemas anotan cuántas bolsas de alimento hay, los tres van a dar números distintos en menos de un mes. No porque estén mal programados, sino porque es matemáticamente inevitable. Tiene que haber **uno solo que manda**, y los demás le copian.

Nuestro sistema va a ser ese. El ecommerce y cualquier otra cosa le copian.

### 2. "Movimientos, no saldos"

Mala forma: guardar "quedan 12 bolsas". Si dos PC guardan al mismo tiempo, una pisa a la otra y perdés una venta sin enterarte.

Buena forma: guardar "vendí 3", "entraron 20", "ajusté -1". El saldo se calcula sumando. Si dos PC vendieron la última bolsa estando offline, al reconectar el sistema te dice *"che, vendiste una bolsa que no tenías"* en vez de tapar el problema.

**Esto no se puede agregar después.** Se decide ahora o se reescribe todo el sistema más adelante.

### 3. "Punto de venta" (ARCA)

Es un número que ARCA le asigna a cada caja/terminal que emite facturas. Las facturas se numeran en orden, sin saltos, **dentro de cada punto de venta**.

Si dos PC comparten el mismo punto de venta y están sin internet, las dos van a generar la factura número 1043. Eso no es un bug: es un problema fiscal.

Solución: **una PC = un punto de venta.** Darlos de alta es gratis y toma 10 minutos en la web de ARCA.

### 4. CAE y CAEA

- **CAE**: el código que ARCA te da *en el momento* cuando emitís una factura. Requiere internet. Es la forma normal.
- **CAEA**: un código que ARCA te da **por adelantado**, cada 15 días. Te permite facturar sin internet y después informarle a ARCA qué facturaste.

El CAEA es literalmente la herramienta que ARCA diseñó para el problema de Gross. Existe hace años, pero **desde el 1 de agosto de 2026** hay reglas nuevas: el CAE online pasó a ser obligatorio como norma, y el CAEA quedó reservado solo para cortes reales, con obligación de registrar cada intento fallido (fecha, causa, quién estaba en la caja).

**Límite importante:** ARCA tolera hasta ~5% de indisponibilidad mensual por punto de venta. Sobre 30 días eso es aproximadamente **un día y medio por mes**. Alcanza de sobra para cortes reales. No alcanza para operar habitualmente desconectados.

### 5. Sincronización

Cuando la PC del local vuelve a tener internet, manda todo lo que hizo y baja lo que pasó afuera. La parte difícil no es mandar los datos: es **decidir quién tiene razón cuando dos lados cambiaron lo mismo**. Eso es el "motor de sincronización", y es lo primero que hay que construir.

### 6. PWA

Es una app web que se instala como programa. Ícono en el escritorio, se abre sin navegador a la vista, funciona sin internet. Un solo desarrollo que corre en la PC del mostrador, en la notebook del dueño y en el celular. **No hay que subirla a ninguna tienda de apps ni pagar licencias.**

### 7. Certificado digital de ARCA

Es el "documento de identidad" del sistema frente a ARCA. Sin él, ARCA no acepta ninguna factura.

Son dos archivos que trabajan juntos: la **clave privada** (secreta, vive en nuestro servidor, nunca se comparte) y el **certificado** (público, lo emite ARCA a nombre del CUIT de Gross). Para conseguir el certificado, primero hay que generar un **pedido** (`.csr` o `.rec`) — y ese pedido **lo genera el sistema de gestión**, o sea nosotros. Por eso el instructivo de ARCA da por hecho que ya lo tenés: asume que tenés un sistema andando.

Lo importante para la reunión: **el trámite lo hace el cliente con su clave fiscal. Nosotros nunca entramos a ARCA ni pedimos su clave.**

---

# PARTE 1 — Agenda de la reunión

## Bloque A — Confirmar la salida de OBTech (10 min)

Ya está decidido. Acá solo se confirma **el cómo**, que es lo que suele romperse.

Puntos a cerrar:

1. **Convivencia con fecha de vencimiento.** Sí, van a convivir un tiempo. Pero con una fecha de corte anotada en un papel, no "hasta que estemos cómodos". Sin fecha, conviven tres años.

2. **Durante la convivencia, OBTech no toca stock.** Puede seguir facturando hasta el corte. Pero desde el día 1 de la migración, **el stock se carga en un solo lado**. Si no, cuando llegue el momento de cortar, los números no van a coincidir y la migración se cae.

3. 🔴 **Pedir HOY la exportación de datos de OBTech.** Esto es lo más urgente de toda la reunión.

   Necesitamos, en Excel/CSV: productos (con código, código de barras, precio, costo, stock), clientes (con CUIT, domicilio, teléfono), cuentas corrientes con saldos, y el histórico de ventas.

   **Por qué es urgente:** si OBTech no lo exporta o se hace el difícil, la migración pasa a ser carga manual de miles de productos, y eso son semanas de trabajo y plata que hoy no está en el plan. Es mejor enterarse ahora que en el mes cuatro.

   > **Frase para la reunión:** *"Lucas, esto lo pediría esta semana. No porque lo necesitemos ya, sino porque si nos dicen que no, tenemos que replanificar. Y prefiero replantear en agosto que en diciembre."*

---

## Bloque B — La decisión: híbrido o nube (20 min) ⭐

Este es el bloque importante. No lo plantees como sí/no. Planteá **tres niveles** y que elija.

### La pregunta con la que abrís

> *"Cuando se les corta internet, ¿qué hacen hoy? ¿Cierran, anotan en papel, esperan? ¿Cuántas veces pasó el mes pasado y cuánto duró?"*

Dejalos contestar. La respuesta te da el argumento; no hace falta que vos lo empujes.

### Los tres niveles

| | **Nivel 1 — Nube pura** | **Nivel 2 — Híbrido operativo** | **Nivel 3 — Híbrido completo** |
|---|---|---|---|
| Sin internet, ¿puedo vender? | ❌ No | ✅ Sí | ✅ Sí |
| ¿Descuenta stock offline? | ❌ | ✅ | ✅ |
| ¿Emite factura fiscal offline? | ❌ | ❌ (queda en cola) | ✅ Con CAEA |
| Complejidad / tiempo | Base | +3 semanas | +6 semanas |
| ¿Queda 100% limpio con ARCA? | ✅ | ⚠️ Depende del contador | ✅ |

**Nivel 2 tiene una letra chica que hay que decir en voz alta:** el cliente se va con la mercadería y sin comprobante fiscal en la mano. Se documenta con remito y se factura al reconectar. **Eso lo tiene que avalar el contador de Gross, no vos.** Si el contador dice que no, el Nivel 2 no existe y hay que ir directo al 3.

### Lo que recomendamos

**Nivel 3, construido por etapas.** Arrancamos con el Nivel 2 funcionando (que ya resuelve el 90% del dolor diario) y sumamos el CAEA en la fase de facturación. El cliente ve resultado antes y termina en el lugar correcto.

### Contra-argumento que te van a tirar

> *"Pero acá casi nunca se corta, ¿no será mucho gasto?"*

Respuesta: *"El costo de infraestructura es el mismo en los tres niveles, unos 25 dólares por mes. Lo que cambia es tiempo de desarrollo, que ya está cubierto por el fee. La pregunta no es cuánto cuesta, es cuánto vale una mañana de mostrador parado."*

### Lo que NO cambia según el nivel

Aclarale esto para que no se confunda: **el ecommerce, el CRM, los reportes y el panel de administración son en la nube siempre.** El offline es solo para el mostrador. Nadie va a tener que instalar nada en el celular ni en la casa.

---

## Bloque C — Relevamiento operativo (25 min)

Acá vos escuchás y anotás. Es la parte donde más vas a aprender.

### Sobre los equipos

- ¿Cuántas PC hay en el mostrador? ¿Y en la oficina?
- ¿Qué sistema operativo? ¿Windows 10 u 11? ¿Qué edad tienen las máquinas?
- ¿Hay UPS? (si se corta la luz, no importa cuán bueno sea el offline)
- ¿Cómo es internet? ¿Fibra, antena, 4G de respaldo?

### Sobre el lector de códigos de barra 🔴

Este punto define cosas del diseño, no lo pases rápido.

- **Marca y modelo.** Sacale una foto al aparato, tiene la etiqueta abajo.
- ¿Es de cable USB o inalámbrico?
- ¿Los productos que venden **ya vienen con código de barras de fábrica** (el EAN del envase), o le ponen etiquetas propias?
- ¿Hay productos que se venden **a granel o fraccionados**? (alimento por kilo, semilla suelta). Estos no tienen código de barras y necesitan un tratamiento aparte, incluida balanza.
- ¿Tienen impresora de etiquetas?

> **Buena noticia para dar en la reunión:** la mayoría de los lectores USB funcionan como si fueran un teclado. No necesitan driver ni programa especial. Enchufás, escaneás, y el número aparece solo en el campo. Casi seguro el que tienen ya sirve.

### Sobre la impresora

- ¿Qué usan para imprimir facturas hoy? ¿Impresora fiscal, térmica de tickets, o láser con hoja A4?
- ⚠️ **Si tienen impresora fiscal vieja (de las homologadas), avisame antes de seguir.** Esas se manejan distinto y hay que evaluarlas aparte.

### Sobre la operación diaria

- ¿Cuántas ventas por día, más o menos? ¿Y en temporada alta?
- ¿Cuántos productos distintos manejan? (Zubu cargó 112 en el ecommerce, pero el local seguro tiene muchos más)
- ¿Cuántos clientes tienen cuenta corriente?
- ¿Manejan varias listas de precios? ¿Descuentos distintos por cliente?
- ¿Trabajan con lotes y vencimientos? *(en veterinaria es casi seguro que sí, y ahora es obligatorio — ver Bloque D)*

### Sobre el "calendario de recibos" 🔴

Este término lo trajiste vos del pedido original y **necesito que signifique una sola cosa**. Preguntá directamente:

- ¿Son los vencimientos de las cuentas corrientes de clientes (a quién hay que cobrarle y cuándo)?
- ¿Son cheques a cobrar o a pagar?
- ¿Son los pagos a proveedores?
- ¿Son las tres?

Cada una es un módulo distinto. Salí de la reunión con esto definido en una frase.

---

## Bloque D — Lo legal (15 min)

⚠️ **Tono importante:** no vayas a decir "OBTech no cumple". No lo sabés, y te pone en guerra con un tercero sin necesidad. El encuadre correcto es:

> *"Estas normas son nuevas, varias de este año. Yo el sistema nuevo lo tengo que hacer cumpliéndolas sí o sí. Necesito saber de dónde partimos, y eso lo confirma tu contador."*

### 🔴 El tema que probablemente nadie les contó todavía: SIGTRAZAVET

Este es tu mejor argumento de toda la reunión, y es real.

**Resolución SENASA 654/2026**, de julio de este año. Crea un sistema nacional de trazabilidad de productos veterinarios y la **Receta Veterinaria Electrónica obligatoria**. Y alcanza expresamente a **las veterinarias y comercios**, no solamente a los laboratorios y distribuidores.

Qué significa en la práctica para Gross:

- Van a tener que **informar los movimientos de medicamentos veterinarios** a SENASA.
- Cada receta electrónica **descuenta stock automáticamente**.
- Para poder hacer eso, el sistema tiene que guardar por producto: **lote, vencimiento, principio activo y número de certificado SENASA**. No alcanza con "tengo 12 unidades".

El cronograma es progresivo y lo va definiendo SENASA por producto. Todavía no está el mecanismo técnico publicado.

> **Cómo plantearlo:** *"Nosotros vamos a dejar la base de datos preparada para esto desde el arranque, aunque la conexión con SENASA la hagamos cuando publiquen el mecanismo. Prepararlo ahora no cuesta nada. Agregarlo después significa rehacer el módulo de stock entero."*

⚠️ Aclará también que hay ruido: en julio ocho entidades rurales rechazaron el sistema, así que puede haber prórrogas o cambios. **Preparamos la base igual** — eso es gratis. Lo que no hacemos todavía es la integración.

### Fitosanitarios (Ley XVI-144 de Misiones)

Para vender fitosanitarios hace falta **receta de asesor técnico**, el comercio tiene que estar registrado, y hay que llevar un **libro rubricado** de compras, ventas y recetas.

Preguntas concretas:
- ¿Gross vende fitosanitarios? ¿Cuánto pesa en la facturación?
- ¿Tienen el registro provincial al día?
- ¿Cómo llevan el libro hoy — a mano?
- ¿Misiones ya les pidió pasar a receta digital? *(varias provincias lo hicieron este año)*

Si venden, el sistema tiene que atar cada venta a su receta y poder exportar el libro. Es trabajo, y tiene que estar en el alcance desde el principio.

### ARCA — transparencia fiscal

Desde abril de 2025, todo comprobante a consumidor final tiene que **discriminar el IVA** y llevar la leyenda *"Régimen de Transparencia Fiscal al Consumidor Ley 27.743"*. Aplica a todos menos monotributistas.

Confirmar: **¿Gross es Responsable Inscripto?** (casi seguro que sí, pero confirmalo).

### Datos personales (Ley 25.326)

La base de clientes tiene que estar inscripta ante la AAIP y los clientes tienen derecho a pedir sus datos, corregirlos o que los borren.

**Lo que sí te toca a vos:** si vamos a híbrido, los datos de clientes se copian a la PC del mostrador. Esa base local **va cifrada**, sí o sí. Una notebook robada es mucho más probable que un hackeo, y es tu responsabilidad profesional.

---

## Bloque E — Accesos y terceros a destrabar (10 min)

Cuatro pedidos que dependen de otra gente. **Se arrancan en esta reunión o se atrasa el proyecto.**

### 1. Certificado digital de ARCA

Lo que hace falta pedir hoy son **tres datos**, ningún trámite:

- CUIT de Gross
- **Razón social exacta como figura en ARCA** (literal, con S.A. / S.R.L. / el apellido si es unipersonal — si no coincide, ARCA rechaza el pedido)
- Quién tiene **clave fiscal nivel 3 o superior** (hace falta ese nivel; si no lo tienen se saca por homebanking en cinco minutos, pero mejor saberlo hoy)

**Cómo es el circuito, para que lo puedas explicar:**

Yo genero dos archivos en mi máquina. Uno es la **clave privada**, que es el secreto y nunca sale de nuestro servidor. El otro es el **pedido de certificado** (`.csr`, que ARCA a veces llama `.rec`), que no tiene nada secreto adentro. Ese segundo archivo se lo mando a Lucas, él lo sube con su clave fiscal, y ARCA le devuelve el **certificado**. Ese certificado me lo manda de vuelta tranquilo por mail.

> **La analogía:** el `.csr` es el formulario de solicitud del pasaporte. Lo lleno yo, lo presenta el titular, el Estado devuelve el pasaporte. La clave privada es la firma que nadie más tiene, y por eso el pasaporte sirve.

⚠️ **El paso que todo el mundo se olvida:** después de emitir el certificado, hay que **autorizarlo a usar el servicio "Facturación Electrónica"** desde el Administrador de Relaciones de Clave Fiscal. Sin eso el certificado existe pero no puede facturar, y el error que devuelve ARCA no aclara que el problema es ese.

**Aclaración importante sobre el modelo:** el certificado va **a nombre del CUIT de Gross**. Mi CUIT no aparece en ningún lado de ARCA y yo nunca entro al sitio. No es una delegación — la delegación es lo que hacen los proveedores de software que facturan para muchos clientes, y no es nuestro caso. *(Ver no negociable #2.)*

✅ **Buena noticia: esto no frena el desarrollo.** El ambiente de pruebas de ARCA se puede usar con mi propio CUIT, así que el circuito de facturación se construye y se prueba sin depender de Gross. Los datos de arriba hacen falta para la segunda vuelta, cuando validamos contra su configuración real.

### 2. Casilla de mail institucional 🔴

Que armen una casilla del dominio de Gross: `sistemas@agroveterinariagross.com.ar` o similar.

**Para qué:** a nombre de esa casilla van a quedar las cuentas de producción (base de datos, hosting, dominio) y los mails que manda el sistema. Es trámite de cinco minutos, pero si no se pide ahora aparece justo el día que querés salir a producción.

**Por qué importa el detalle de a nombre de quién:** el sistema es de Gross, así que las cuentas de producción nacen bajo esa casilla y yo entro como colaborador. Ventaja concreta para ellos: **los ~25 dólares mensuales de infraestructura los pagan directo con su tarjeta**, sin reembolsos ni facturas mías por algo que no es un servicio mío. *(Ver no negociable #8.)*

### 3. Contacto del contador

Reunión aparte de 30 minutos. Temas: condición fiscal, puntos de venta actuales, Libro IVA Digital, percepciones de Ingresos Brutos de Misiones, y el visto bueno sobre el Nivel 2 si van por ahí.

### 4. Zubu — integración con la tienda

**Cambió respecto de lo que estaba previsto, y es una buena noticia para dar en la reunión.**

En vez de esperar a que Zubu construya una API para nosotros, **la exponemos nosotros y ellos se conectan**. Consultan stock y precios, y nos mandan los pedidos. Zubu no tiene que exponer nada.

Por qué es mejor:
- **No dependemos de su agenda.** Les mandamos la documentación y la pelota queda de su lado, sin frenarnos a nosotros.
- **Es casi trabajo cero para ellos.** Su sistema ya está construido para consumir stock desde afuera — es exactamente lo que le habían pedido a OBTech. Nosotros ocupamos ese lugar.
- **Es reutilizable.** Si mañana cambian de ecommerce, el siguiente se enchufa a la misma API.

> **Lo que le decís a Lucas:** *"Esto les destraba el lanzamiento de la tienda. Hoy Zubu está frenado esperando a OBTech, que puede no contestar nunca. Con el sistema nuevo de dueño único del stock, esa espera desaparece."*

Es un beneficio concreto, inmediato y sin costo. Dalo hoy.

---

## Bloque F — No negociables (10 min)

Presentalos como **estándar profesional, no como capricho**. Fórmula: *"esto en todos los proyectos va así, por [razón]"*.

### 1. Un punto de venta de ARCA por terminal
**Por qué:** las facturas se numeran en orden dentro de cada punto de venta. Dos PC en el mismo punto de venta, sin internet, generan la misma numeración. Eso es un problema fiscal, no un error del programa.
**Costo:** cero. Se dan de alta en la web de ARCA en diez minutos.

### 2. El certificado ARCA va a nombre del CUIT de Gross
**Por qué:** la clave fiscal es de la empresa y **nunca se comparte con un proveedor**, ni conmigo. ARCA tiene un mecanismo diseñado justamente para esto: yo genero un archivo de solicitud, ellos lo suben, ARCA emite el certificado bajo su CUIT. Si mañana dejamos de trabajar juntos, revocan ese certificado y listo, sin tocar nada más.
**Bonus:** esto los protege a ellos de mí. Decilo así, genera confianza.

### 3. Cada persona con su usuario y contraseña
**Por qué:** sin esto no hay auditoría. Si aparece un ajuste raro de stock, o una factura anulada, hay que saber quién y cuándo. Con un usuario "mostrador" compartido, nunca se sabe.
**Y además:** es requisito para cumplir con las obligaciones de registro de ARCA y con protección de datos.
→ Anticipá la resistencia: *"es un segundo más al entrar, una vez por turno"*.

### 4. Base local cifrada
**Por qué:** si vamos a híbrido, los datos de clientes viven en la PC del local. Si se roban esa máquina, sin cifrado se llevan la base entera de clientes con CUIT y domicilio. Con cifrado, se llevan una PC.

### 5. Un solo master de stock, desde el día uno de la migración
**Por qué:** ya explicado. Si dos sistemas anotan stock, en un mes ninguno de los dos números sirve.

### 6. El modo offline es para cortes, no para trabajar
**Por qué:** ARCA tolera ~5% de indisponibilidad mensual por punto de venta. Alcanza de sobra para cortes reales. Si la idea fuera operar siempre desconectados, no lo permite la norma, no yo.

### 7. Migración con fecha de corte
**Por qué:** las migraciones "de a poquito" no terminan nunca y dejan datos partidos en dos sistemas para siempre. Se elige un día, se corta, se arranca.

### 8. El sistema es de Gross, y los datos también
**Por qué:** no es un no negociable que les impongo, es un compromiso que asumo. Esto no es una suscripción a un software mío: es **el sistema propio de ellos**. Las cuentas de producción van a nombre de Gross, la infraestructura la pagan directo, los datos se pueden exportar en cualquier momento en formato estándar y el código es de ellos.
**Decilo en voz alta** — es exactamente lo que probablemente no pueden hacer hoy con OBTech, y es lo que más te separa de un proveedor de suscripción.

### 9. Un solo master de stock, también hacia la tienda
**Por qué:** la tienda online va a poder **consultar** el stock, nunca modificarlo. Cuando entra un pedido web, nos lo informan y **el descuento lo hace nuestro sistema**. Si Zubu pudiera escribir stock, volveríamos a tener dos sistemas anotando y todo el diseño se cae.
→ Es probable que lo pidan de buena fe. La respuesta es no, y es técnica, no desconfianza.

---

## Bloque G — Cierre (10 min)

Repasá en voz alta y anotá delante de ellos:

- [ ] Nivel elegido: 1 / 2 / 3 → ______
- [ ] Fecha objetivo de corte de OBTech → ______
- [ ] Quién pide la exportación de datos a OBTech y cuándo → ______
- [ ] Quién avisa a Zubu del cambio de esquema de integración → ______
- [ ] Quién crea la casilla de mail institucional y para cuándo → ______
- [ ] CUIT + razón social exacta → ______
- [ ] Contacto y disponibilidad del contador → ______
- [ ] "Calendario de recibos" significa → ______
- [ ] Fecha de la próxima reunión → ______

---

# PARTE 2 — Checklist de lo que tenés que traerte

## Datos fiscales
- [ ] CUIT de Gross
- [ ] **Razón social exacta como figura en ARCA** (literal, con S.A. / S.R.L. / apellido)
- [ ] ¿Quién tiene clave fiscal nivel 3 o superior?
- [ ] Condición frente al IVA (Responsable Inscripto / otra)
- [ ] Puntos de venta que ya tienen dados de alta
- [ ] Nombre, mail y teléfono del contador
- [ ] Régimen de Ingresos Brutos en Misiones — ¿son agentes de percepción?

## Equipamiento
- [ ] Cantidad de PC en mostrador y en oficina
- [ ] Sistema operativo y antigüedad
- [ ] Marca y modelo del lector de códigos de barra (📷 sacá foto)
- [ ] Marca y modelo de la impresora (📷 sacá foto)
- [ ] ¿Hay UPS?
- [ ] Tipo de conexión a internet y si hay respaldo

## Operación
- [ ] Ventas por día (promedio y pico)
- [ ] Cantidad aproximada de productos
- [ ] Cantidad de clientes con cuenta corriente
- [ ] ¿Cuántas listas de precios?
- [ ] ¿Venden a granel o fraccionado?
- [ ] ¿Manejan lotes y vencimientos hoy?
- [ ] Historial de cortes de internet: frecuencia y duración

## Regulatorio
- [ ] ¿Venden fitosanitarios? ¿Qué porcentaje de la facturación?
- [ ] Registro provincial de fitosanitarios — ¿al día?
- [ ] ¿Cómo llevan el libro de expendio hoy?
- [ ] Registro del comercio ante SENASA
- [ ] ¿Ya les llegó algo sobre SIGTRAZAVET?

## En marcha (pedidos con demora externa)
- [ ] Exportación de datos de OBTech — **pedido esta semana** 🔴 *el más urgente de todos*
- [ ] Casilla de mail institucional del dominio de Gross — **pedido esta semana**
- [ ] Aviso a Zubu de que la API la exponemos nosotros — **esta semana**
- [ ] Datos para el certificado de ARCA (CUIT + razón social exacta + quién tiene clave fiscal)

---

# PARTE 3 — Preguntas que te van a hacer

### "¿Cuánto tarda todo esto?"
> *"Entre 5 y 9 meses para el sistema completo. Pero no van a esperar 9 meses para ver algo: a los dos meses tienen stock y ventas funcionando, y desde ahí crece por partes. Trabajamos por fases justamente para que vean resultado antes de que esté todo terminado."*

### "¿Por qué no compramos un sistema ya hecho y listo?"
Contestá de buena fe, no a la defensiva:
> *"Es una opción válida y hay sistemas buenos. La diferencia es que ninguno va a tener la sincronización con la tienda que están armando, ni el modo offline pensado para acá, ni la trazabilidad de SENASA armada a la medida de una agroveterinaria. Si mañana aparece uno que haga todo eso, te lo digo yo mismo."*

### "¿Y si te pasa algo a vos? ¿Quedamos colgados?"
> *"El código y los datos son de ustedes, no míos. Queda documentado y exportable. Cualquier desarrollador puede tomarlo. Y el certificado de ARCA está a nombre de ustedes con un permiso delegado que pueden revocar cuando quieran."*

### "¿Podemos seguir con OBTech por las dudas un tiempo?"
> *"Sí, y de hecho es lo que vamos a hacer. Pero con fecha de corte y con una sola regla: el stock se carga en un solo lado desde el primer día. Si no, cuando llegue el día de cortar, los números no van a coincidir y no vamos a poder migrar."*

### "¿Se puede usar desde el celular?"
> *"Sí. Es la misma app, se instala como un ícono más en el teléfono. Sirve para consultar stock, ver reportes o pasar un precio desde el depósito. Para vender en el mostrador, la PC con el lector."*

### "¿Cuánto sale mantenerlo por mes?"
> *"Unos 25 a 40 dólares mensuales de infraestructura, más el dominio. No hay licencias por usuario ni por terminal — pueden agregar PC sin que suba el costo."*

### "¿Y esto después es una suscripción que le pagamos a ustedes?"
> *"No. Yo no vendo suscripciones a un software mío: estoy construyendo el sistema de ustedes. Las cuentas de producción van a nombre de Gross, la infraestructura la pagan directo al proveedor, y los datos y el código son de ustedes. El fee mensual es por el desarrollo, mientras dura el desarrollo."*

⚠️ **Ojo con el paso siguiente:** si te preguntan por el soporte y el mantenimiento después de terminado, no improvises un número en la reunión. Decí que lo definimos cuando esté cerca el final, que es cuando se sabe qué necesita mantenimiento de verdad.

### "¿Me pedís la clave fiscal de ARCA?"
> *"No, nunca. Yo genero un archivo de solicitud, vos lo subís con tu clave y me devolvés el certificado que emite ARCA. Yo no entro al sitio de ARCA en ningún momento, y el certificado queda a nombre del CUIT de ustedes — lo pueden revocar cuando quieran."*

---

# PARTE 4 — Errores a evitar en la reunión

❌ **No prometas fechas cerradas.** Todavía no sabés qué te va a dar OBTech ni cuándo responde Zubu.

❌ **No hables de tecnología.** Nadie del otro lado necesita saber qué es Supabase. Hablá de qué hace el sistema, no de con qué está hecho. Si preguntan, contestás en una frase y seguís.

❌ **No digas que OBTech incumple.** No lo sabés. Decí *"esto lo tiene que confirmar el contador"*.

❌ **No aceptes "después lo vemos" en los no negociables.** Esos siete puntos se aceptan en la reunión o se discuten en la reunión. Lo que quede abierto vuelve como conflicto en el mes cinco, cuando ya hay código escrito.

❌ **No te vayas sin la definición de "calendario de recibos".**

✅ **Sí llevá el argumento de SIGTRAZAVET.** Es información real, nueva, específica de su rubro, y probablemente nadie se las dio. Es lo que te separa de "el chico que hace sistemas" y te pone en el lugar de alguien que entiende su negocio.
