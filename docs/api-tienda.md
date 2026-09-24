# API de catálogo

Documentación de la API que lee la tienda online: nombre público, descripción, precio, clasificaciones y stock disponible para la venta web.

> **La versión que se le entrega a la tienda** es la página con la marca de Gross: https://claude.ai/artifact/VXHehNGKU5HF9Ltbbe7LgB — esta copia es la misma documentación, en el repositorio, para que no dependa de un enlace.
>
> **Criterio de redacción:** documentación atemporal. Datos, pasos y ejemplos; nada de «por ahora», «primera etapa» ni el nombre del proveedor que la consume. Lo que cambia —el estado del proyecto, qué falta— vive en [`AHORA.md`](AHORA.md).

---

## En una página

| | |
|---|---|
| **Dirección** | `https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/api-tienda` |
| **Consultas** | `GET /catalogo` y `GET /clasificaciones` |
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
| `404` | `ruta_desconocida` | La consulta no existe. Las disponibles son `/catalogo` y `/clasificaciones` |
| `405` | `metodo_no_permitido` | Un método distinto de `GET`. La API es de sólo lectura |
| `500` | `error_interno` | Falla del lado del sistema. Conviene reintentar espaciando los intentos y, si persiste, reportarlo con la hora del pedido |

El stock y los precios los administra el sistema de gestión, que es su único origen: por esta API no se modifica nada. El descuento de stock de un pedido web también lo hace el sistema.

---

## Datos del comprador para facturar

La facturación de los pedidos web la hace el sistema de gestión: emite la factura electrónica ante ARCA y la envía por mail al comprador. La API de pedidos se documenta aparte; esto es lo que el proceso de compra tiene que registrar para que un pedido se pueda facturar.

| Dato | Por qué |
|---|---|
| Nombre y apellido, o razón social | Es el receptor del comprobante |
| Email | A esa dirección se envía la factura |
| DNI o CUIT | Identifica al receptor ante ARCA, y permite reconocer al comprador si ya es cliente del local |
| Condición frente al IVA | Consumidor final, responsable inscripto, monotributo o exento. Define la clase de comprobante: un responsable inscripto requiere factura A, con su CUIT |
| Forma de pago | Pagado en la web o a pagar en el local: determina si el sistema factura al recibir el pedido o al cobrarlo en la caja |
| Entrega | Retiro en el local o envío, con el domicilio en ese caso |
