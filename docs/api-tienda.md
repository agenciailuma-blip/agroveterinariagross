# API de la tienda online

Documentación de la API con la que una tienda online lee el catálogo del sistema de gestión —nombre público, descripción, precio, clasificaciones y stock disponible—, le registra las compras y consulta en qué está cada una.

> **La versión que se le entrega a la tienda** es la página con la marca de Gross: https://claude.ai/artifact/VXHehNGKU5HF9Ltbbe7LgB — esta copia es la misma documentación, en el repositorio, para que no dependa de un enlace.
>
> **Criterio de redacción:** documentación atemporal. Datos, pasos y ejemplos; nada de «por ahora», «primera etapa» ni el nombre del proveedor que la consume. Lo que cambia —el estado del proyecto, qué falta— vive en [`AHORA.md`](AHORA.md).

---

## En una página

| | |
|---|---|
| **Dirección** | `https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/api-tienda` |
| **Caminos** | `GET /catalogo`, `GET /clasificaciones`, `POST /pedidos` y `GET /pedidos/{numero}` |
| **Autenticación** | Encabezado `Authorization: Bearer <clave>`. La clave se entrega por separado |
| **Formato** | JSON en UTF-8. Fechas ISO 8601 en UTC (`2026-09-24T12:30:15.807035Z`). Importes en pesos, finales, con IVA |
| **Origen** | Las consultas se hacen desde el servidor de la tienda. La API no responde a pedidos de un navegador |

```bash
curl -s "https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/api-tienda/catalogo?limite=2" \
  -H "Authorization: Bearer $CLAVE_GROSS"
```

---

## La clave

- **Va en el encabezado, no en la dirección.** Las direcciones quedan registradas en los servidores intermedios; los encabezados no.
- **Vive en el servidor de la tienda.** La API no envía encabezados CORS, así que una clave puesta en el navegador no sirve, y además quedaría a la vista de cualquiera.
- **Define qué se ve.** Cada clave está atada a un canal de venta: de ahí salen los productos publicados, el precio y el margen de stock.
- **No se puede recuperar.** El sistema guarda una huella de la clave (SHA-256), no la clave. Si se pierde, se emite otra.
- **Se cambia sin cortar el servicio:** se emite una nueva, la tienda la reemplaza, y recién entonces se anula la anterior.
- **Una clave comprometida se anula** y deja de funcionar en la consulta siguiente.

---

## `GET /catalogo`

Los productos publicados en la tienda.

| Parámetro | | |
|---|---|---|
| `desde` | opcional | El valor de `siguiente` de una respuesta anterior, **tal como llegó**. Sin él, devuelve el catálogo entero; con él, sólo lo que cambió |
| `limite` | opcional | Productos por página, de 1 a 1000. Por omisión, 500 |

Cualquier otro parámetro se rechaza con `400`: un `dsde` mal escrito devolvería el catálogo entero en cada consulta sin que nadie lo note.

```json
{
  "canal": "Tienda online",
  "generado_en": "2026-09-24T12:30:15.807035Z",
  "frescura": {
    "ultima_conexion_del_local": "2026-09-24T12:28:41.320011Z",
    "minutos_sin_conexion": 1,
    "tolerancia_minutos": 15,
    "confiable": true
  },
  "productos": [
    {
      "id": "2d6034c0-a623-4226-8bd8-39ec535df2c7",
      "publicado": true,
      "codigo": "DEMO-002",
      "codigos_barra": ["7790000000002"],
      "nombre": "Royal Canin Gato Adulto 7,5 kg",
      "descripcion": null,
      "precio": 62300,
      "unidad": "bolsa",
      "stock": 1,
      "requiere_receta": false,
      "categoria": "alimentos",
      "marca": "royal-canin",
      "presentacion": "bolsa",
      "animales": [],
      "etapas_de_vida": [],
      "actualizado_en": "2026-09-18T21:13:34.057949Z"
    },
    { "id": "7c1e9a04-5b2f-4d0e-9a51-2f6c3e8d1b77", "publicado": false, "actualizado_en": "2026-09-24T12:20:02.118300Z" }
  ],
  "hay_mas": false,
  "siguiente": "eyJ0IiA6ICIyMDI2LTA5LTI0VDEyOjMwOjE1..."
}
```

### Cada producto

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto (UUID) | El identificador del producto, que no cambia nunca. Es la clave con la que conviene guardarlo en la tienda |
| `publicado` | sí/no | `true`: está a la venta. `false`: hay que sacarlo de la tienda |
| `codigo` | texto | El código interno del producto, el mismo que usa el mostrador |
| `codigos_barra` | lista | Los códigos del envase (EAN). Es la forma más confiable de emparejar productos ya cargados en la tienda. Puede venir vacía |
| `nombre` | texto | El nombre público. El sistema maneja además un nombre interno para el vendedor, que no se expone |
| `descripcion` | texto o `null` | La descripción para la web |
| `precio` | número | En pesos, final, con IVA incluido. Corresponde a la lista de precios asignada al canal de la tienda |
| `unidad` | texto | En qué se cuenta el stock: `unidad`, `bolsa`, `kg`… |
| `stock` | número | Lo que la tienda puede vender, con el margen de seguridad ya descontado. Nunca es negativo |
| `requiere_receta` | sí/no | Si el producto requiere receta veterinaria |
| `categoria`, `marca`, `presentacion` | texto o `null` | El `slug` de cada una. Los nombres para mostrar están en `/clasificaciones` |
| `animales`, `etapas_de_vida` | listas | `["perros"]`, `["adulto"]`. Un producto puede pertenecer a varios |
| `actualizado_en` | fecha | Cuándo cambió por última vez algo de lo que la tienda ve de este producto |

**Los productos despublicados llegan sólo con `id`, `publicado: false` y `actualizado_en`**, sin nombre ni precio: lo que no está a la venta no se expone. Ocurre cuando el producto se apaga para la web, se da de baja, o le falta el nombre público o el precio. Un `id` desconocido para la tienda se ignora.

### El margen de seguridad del stock

El stock que publica la API es el del local **menos unas unidades que no se publican**. Ese margen evita que una venta del mostrador y una de la web, en el mismo minuto, se lleven la misma unidad. Si hay 5 y el margen es 2, la API devuelve 3. Se configura por canal y, cuando hace falta, por producto.

### La frescura

| Campo | Qué es |
|---|---|
| `ultima_conexion_del_local` | La última vez que alguna computadora del local sincronizó |
| `minutos_sin_conexion` | Cuánto hace de esa sincronización |
| `tolerancia_minutos` | Cuántos minutos de atraso se consideran al día |
| `confiable` | `true` si el local sincronizó dentro de la tolerancia y ninguna computadora tiene ventas pendientes de subir |

Con `confiable: false` puede haber ventas del mostrador que el servidor todavía no registró. Fuera del horario comercial el valor es `false`, porque con el local cerrado nadie sincroniza, aunque el stock no haya cambiado.

---

## `GET /clasificaciones`

Las listas para armar menús y filtros. No acepta parámetros.

```json
{
  "generado_en": "2026-09-24T12:30:18.199674Z",
  "categorias":     [{ "slug": "alimentos", "nombre": "Alimentos", "padre": null, "orden": 20, "activo": true }],
  "marcas":         [{ "slug": "royal-canin", "nombre": "Royal Canin", "activo": true }],
  "animales":       [{ "slug": "perros", "nombre": "Perros", "orden": 10, "activo": true }],
  "etapas_de_vida": [{ "slug": "cachorro", "nombre": "Cachorro", "orden": 10, "activo": true }],
  "presentaciones": [{ "slug": "bolsa", "nombre": "Bolsa", "activo": true }]
}
```

El `slug` no cambia, mientras que el `nombre` puede cambiar: por eso los productos citan el `slug`. `padre` es el `slug` de la categoría superior, o `null`. Una consulta por día es suficiente.

---

## `POST /pedidos`

Registra una compra hecha en la tienda. El sistema la convierte en una venta, descuenta el stock cuando corresponde y la deja lista para que el local la prepare.

```bash
curl -s -X POST "https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/api-tienda/pedidos" \
  -H "Authorization: Bearer $CLAVE_GROSS" \
  -H "Content-Type: application/json" \
  -d '{
    "numero": "1042",
    "pagado": true,
    "referencia_pago": "mp-8871234",
    "comprador": {
      "nombre": "María Gómez",
      "email": "maria@ejemplo.com",
      "documento": "30111222",
      "tipo_documento": "DNI",
      "condicion_iva": "consumidor_final"
    },
    "entrega": { "tipo": "envio", "domicilio": "Av. Libertad 1234", "localidad": "Oberá", "contacto": "3755-000000" },
    "productos": [
      { "id": "0f3c2a44-1c9e-4f0a-9a1e-7b6c2d8e5a10", "cantidad": 2, "precio": 10000 },
      { "id": "7a1b9c02-3d4e-4f56-8a90-1b2c3d4e5f60", "cantidad": 1, "precio": 2500 }
    ],
    "total": 22500
  }'
```

### El pedido

| Campo | | |
|---|---|---|
| `numero` | **obligatorio** | El identificador del pedido en la tienda. Es lo que evita que un reintento entre dos veces |
| `productos` | **obligatorio** | Lista con al menos un producto. Cada uno con `id`, `cantidad` y `precio` |
| `comprador.nombre` | **obligatorio** | Nombre y apellido, o razón social |
| `pagado` | opcional | `true` si el comprador ya pagó en la web. Por omisión, `false` |
| `referencia_pago` | opcional | El identificador del pago en la pasarela. Queda anotado en la venta |
| `comprador.email` | opcional | A esa dirección se envía la factura |
| `comprador.documento` | opcional | DNI o CUIT, sin puntos ni guiones. Permite reconocer al comprador si ya es cliente del local |
| `comprador.tipo_documento` | opcional | `DNI`, `CUIT` o `CUIL`. Sin él se deduce por la cantidad de dígitos |
| `comprador.condicion_iva` | opcional | `consumidor_final` (por omisión), `responsable_inscripto`, `monotributo` o `exento` |
| `entrega.tipo` | opcional | `retira` (por omisión) o `envio` |
| `entrega.domicilio`, `entrega.localidad`, `entrega.contacto` | opcional | Para el envío |
| `total` | opcional | El total que la tienda le cobró al comprador. Si no coincide con la suma de las líneas, el pedido queda marcado para revisar |
| `observaciones` | opcional | Texto libre del comprador |

Cada producto lleva:

| Campo | | |
|---|---|---|
| `id` | **obligatorio** | El `id` tal como viene en `/catalogo` |
| `cantidad` | **obligatorio** | Número mayor que cero |
| `precio` | **obligatorio** | Precio **unitario**, final, con IVA: el que la tienda le mostró y le cobró al comprador |

### La respuesta

```json
{
  "repetido": false,
  "pedido": "1042",
  "estado": "recibido",
  "venta": "WEB-000007",
  "total": 22500,
  "revisar": null
}
```

| Campo | Qué es |
|---|---|
| `repetido` | `true` cuando ese `numero` ya se había registrado antes |
| `pedido` | El `numero` que envió la tienda |
| `estado` | El estado del pedido en el sistema: `recibido`, `preparado`, `entregado` o `cancelado` |
| `venta` | El código de la venta en el sistema. Sirve para referirse al pedido al hablar con el local |
| `total` | La suma de las líneas, calculada por el sistema |
| `revisar` | Qué llamó la atención del sistema, o `null`. Informativo: lo resuelve una persona en el local |

### El mismo pedido dos veces

`numero` identifica el pedido. Si se envía dos veces —porque se cortó la conexión y la tienda reintenta— el segundo envío **no crea otra venta**: responde `200` con `repetido: true` y el mismo número de venta que la primera vez.

Reintentar es seguro y es lo recomendado ante un `500` o ante un corte de conexión. Lo que **no** hay que hacer es cambiar el `numero` al reintentar: eso sí duplica el pedido.

### El precio que manda es el de la tienda

El precio que llega en cada línea es el que se factura: es lo que el comprador vio y pagó, y el comprobante tiene que decir eso.

El sistema igual compara contra su propio precio. Si la diferencia pasa la tolerancia configurada, el pedido entra lo mismo y queda marcado para que alguien lo mire antes de facturar. Una diferencia sistemática suele significar que la tienda quedó con un catálogo viejo: conviene revisar cada cuánto se sincroniza.

### El stock

Lo descuenta el sistema, nunca la tienda:

- **Pagado en la web:** la venta queda cobrada y el stock se descuenta al registrarse el pedido.
- **A pagar en el local:** la venta queda esperando en la caja y el stock se descuenta cuando se cobra.

Si no alcanza el stock, **el pedido entra igual** y queda marcado. Es a propósito: si el comprador ya pagó, rechazarlo sería perder la operación y dejarlo sin respuesta. Lo resuelve el local, hablando con el comprador.

### La facturación

**No es automática y no ocurre al registrarse el pedido.** El local revisa el pedido, prepara la mercadería y recién entonces emite la factura, que sale por el mismo circuito fiscal del mostrador y se envía por mail al comprador.

Para la tienda esto significa dos cosas:

- La respuesta de `POST /pedidos` **no trae número de factura**, y no hay que esperarlo.
- El mail de «recibimos tu pedido» lo envía la tienda. El de la factura lo envía el sistema, más tarde.
- Cuándo quedó facturado se ve en [`GET /pedidos/{numero}`](#get-pedidosnumero).

### Responsable inscripto

Un responsable inscripto necesita factura A, y para eso hace falta el CUIT. Si el pedido dice `responsable_inscripto` pero no trae un CUIT, el comprador se registra como consumidor final y el pedido queda marcado, para que el local lo hable antes de facturar. El pedido entra igual.

---

## `GET /pedidos/{numero}`

En qué está un pedido: si se preparó, si salió, si ya tiene factura y si hay plata para devolverle al comprador. Es lo que la tienda necesita para contestarle «¿está listo?».

```bash
curl -s "https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/api-tienda/pedidos/1042"   -H "Authorization: Bearer $CLAVE_GROSS"
```

`{numero}` es el mismo `numero` con el que se envió el pedido, **codificado para URL** (`encodeURIComponent`): un número como `2026/0001` va como `2026%2F0001`. Se respetan mayúsculas y minúsculas.

```json
{
  "numero": "1042",
  "estado": "entregado",
  "entrega": "envio",
  "pagado_en_la_web": true,
  "cobrado": true,
  "factura": "B 00003-00000123",
  "reintegros": [
    { "motivo": "devolucion", "importe": 6900, "devuelto": false, "devuelto_en": null }
  ],
  "actualizado": "2026-09-25T14:02:11.518204Z"
}
```

| Campo | Qué es |
|---|---|
| `numero` | El `numero` que envió la tienda |
| `estado` | `recibido` → `preparado` → `entregado`, o `cancelado` |
| `entrega` | `retira` o `envio`, como vino en el pedido |
| `pagado_en_la_web` | Como vino en el pedido |
| `cobrado` | Si el sistema ya registró el cobro. Un pedido a pagar en el local pasa a `true` cuando se cobra en la caja |
| `factura` | La clase y el número del comprobante, con el punto de venta: `B 00003-00000123`. `null` mientras no esté autorizado por ARCA |
| `reintegros` | Plata que hay que devolverle al comprador, si la hay. Ver abajo |
| `actualizado` | El último cambio de cualquiera de las partes del pedido: su estado, la factura o un reintegro |

**Cada cuánto consultar:** no hace falta más de una vez cada algunos minutos por pedido abierto, ni seguir consultando uno `entregado` sin reintegros pendientes o `cancelado` con todo devuelto. `actualizado` sirve para saber si algo cambió desde la última vez.

### Los estados

| Estado | Qué significa para el comprador |
|---|---|
| `recibido` | El pedido entró y el local lo tiene a la vista |
| `preparado` | La mercadería está armada. Si retira, ya puede pasar |
| `entregado` | Lo retiró o salió con el envío |
| `cancelado` | No se entrega. Si pagó en la web, se le devuelve la plata (ver abajo) |

Lo que ya se cobró en la web **no se entrega sin factura**: un pedido pagado pasa a `entregado` con su factura emitida. Uno a pagar en el local pasa a `entregado` después de cobrarse en la caja.

### Cancelaciones y devoluciones

Una cancelación la decide el local, y la API no permite cancelar. Si el comprador se arrepiente, la tienda se lo avisa al local.

Cuando se cancela o se devuelve algo **que se pagó en la web**, el sistema no puede devolver la plata: la cobró la pasarela de la tienda. Lo que hace es anotar un **reintegro**, que aparece en `reintegros`:

| Campo | Qué es |
|---|---|
| `motivo` | `cancelacion` (el pedido entero) o `devolucion` (lo que el comprador devolvió después de recibirlo) |
| `importe` | Lo que hay que devolverle, en pesos |
| `devuelto` | `true` cuando el local anotó que la tienda ya lo devolvió |
| `devuelto_en` | Cuándo se anotó, o `null` |

Una devolución puede ser parcial, y puede haber más de una: cada una es un reintegro aparte. **El reintegro lo hace la tienda** por su pasarela, y le avisa al local la referencia para que quede anotado.

### Errores de `GET /pedidos/{numero}`

| Estado | `codigo` | Qué significa |
|---|---|---|
| `404` | `pedido_desconocido` | No hay ningún pedido con ese `numero` para esta clave |
| `400` | `numero_invalido` | El número del camino vino vacío o no se pudo decodificar |
| `405` | `metodo_no_permitido` | Se usó otro método que `GET` |

Un número con una codificación rota (`%E0%A4%A`) puede ser rechazado por la infraestructura antes de llegar a la API, con un `500` en texto plano en lugar del JSON de siempre. Codificar el número con `encodeURIComponent` lo evita.

---

## Mantener el catálogo al día

**La primera carga:**

1. `GET /catalogo`. Guardar cada producto por su `id`.
2. Mientras `hay_mas` sea `true`, pedir `GET /catalogo?desde=<siguiente>`.
3. Cuando sea `false`, guardar el último `siguiente`.

**Cada uno a cinco minutos:**

1. `GET /catalogo?desde=<el guardado>`.
2. Por cada producto: si `publicado` es `true`, crearlo o actualizarlo por `id`; si es `false`, sacarlo de la venta.
3. Seguir mientras `hay_mas` sea `true`.
4. **Guardar el `siguiente` recién cuando se procesó todo.** Si una tanda falla por la mitad, se vuelve a pedir con el anterior: repetir es inocuo, saltear no.

**Una vez por día, el catálogo entero**, sin `desde`. Lo que la tienda tenga a la venta y no aparezca en esa lista, se baja. Es la red de seguridad de la sincronización incremental.

Tres comportamientos a tener en cuenta:

- **Un producto puede llegar dos veces** en dos consultas seguidas. Es deliberado: el sistema prefiere repetir antes que perder un cambio que se estaba guardando en el momento de la consulta. Guardar por `id` lo resuelve.
- **`siguiente` es opaco.** Se guarda y se devuelve tal cual. Un valor que no haya salido de la API se rechaza con `400`.
- **Cuenta como un cambio:** el nombre, la descripción, el precio, las clasificaciones, los códigos de barra, el stock, la publicación y el margen de seguridad.

---

## Errores

```json
{ "error": { "codigo": "limite_invalido", "mensaje": "El parámetro limite tiene que ser un número entero entre 1 y 1000." } }
```

| Estado | `codigo` | Qué significa |
|---|---|---|
| `401` | `falta_clave` | No vino el encabezado `Authorization: Bearer <clave>` |
| `401` | `clave_invalida` | La clave no existe o fue anulada |
| `400` | `parametro_desconocido` | Un parámetro que esa consulta no acepta. El mensaje lo nombra |
| `400` | `desde_invalido` | `desde` no es un `siguiente` devuelto por la API |
| `400` | `limite_invalido` | `limite` no es un entero entre 1 y 1000 |
| `404` | `ruta_desconocida` | El camino no existe. Los disponibles son `/catalogo`, `/clasificaciones`, `/pedidos` y `/pedidos/{numero}` |
| `405` | `metodo_no_permitido` | El camino no acepta ese método. El encabezado `Allow` dice cuál va |
| `500` | `error_interno` | Falla del lado del sistema. Conviene reintentar espaciando los intentos y, si persiste, reportarlo con la hora del pedido |

Los de `POST /pedidos`:

| Estado | `codigo` | Qué significa |
|---|---|---|
| `400` | `cuerpo_invalido` | El cuerpo no es un objeto JSON |
| `400` | `falta_numero` | Falta `numero` |
| `400` | `faltan_productos` | Falta `productos`, o la lista vino vacía |
| `400` | `falta_el_comprador` | Falta `comprador.nombre` |
| `400` | `producto_desconocido` | Un `id` que no existe en el sistema. El mensaje dice cuál |
| `400` | `cantidad_invalida` | Una `cantidad` que no es un número mayor que cero |
| `400` | `precio_invalido` | Un `precio` que no es un número de cero para arriba |
| `400` | `entrega_invalida` | `entrega.tipo` no es `retira` ni `envio` |
| `400` | `pedido_invalido` | Algún valor no tiene el formato esperado: un `id` que no es un identificador, un número que vino como texto |
| `413` | `cuerpo_demasiado_grande` | El pedido pasa de 200.000 caracteres |

**Ante un `500` o un corte de conexión, reintentar con el mismo `numero`.** Es seguro: el pedido no se duplica. Ante un `400`, reintentar no sirve: hay que corregir el pedido.

El stock y los precios los administra el sistema de gestión, que es su único origen: por esta API no se modifican. El descuento de stock de un pedido web también lo hace el sistema.

---

## Datos del comprador para facturar

La factura la emite el sistema de gestión ante ARCA y se envía por mail al comprador. Esto es lo que el proceso de compra de la tienda tiene que pedirle al comprador para que su pedido se pueda facturar.

| Dato | Por qué |
|---|---|
| Nombre y apellido, o razón social | Es el receptor del comprobante |
| Email | A esa dirección se envía la factura |
| DNI o CUIT | Identifica al receptor ante ARCA, y permite reconocer al comprador si ya es cliente del local |
| Condición frente al IVA | Consumidor final, responsable inscripto, monotributo o exento. Define la clase de comprobante: un responsable inscripto requiere factura A, con su CUIT |
| Forma de pago | Pagado en la web o a pagar en el local: determina si la venta queda cobrada o esperando en la caja |
| Entrega | Retiro en el local o envío, con el domicilio en ese caso |
