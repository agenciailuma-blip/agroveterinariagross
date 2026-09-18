# API de catálogo — Agroveterinaria Gross

Para el equipo que desarrolla la tienda online. Se puede leer sin nadie al lado: cómo se entra, qué devuelve cada consulta y cómo mantener la tienda al día.

> **Primera etapa: leer el catálogo.** Productos con su nombre público, precio, clasificaciones, stock disponible para la tienda y el dato de frescura. **Los pedidos van en la segunda etapa**; al final de este documento está lo que conviene preparar desde ya.

---

## En una página

| | |
|---|---|
| **Dirección** | `https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/api-tienda` |
| **Consultas** | `GET /catalogo` y `GET /clasificaciones` |
| **Clave** | En el encabezado `Authorization: Bearer <clave>` |
| **Formato** | JSON en UTF-8. Fechas en ISO 8601, en UTC (`2026-09-18T21:13:34.057949Z`) |
| **Sólo lectura** | Todo es `GET`. Cualquier otro método contesta `405` |
| **Desde dónde** | Desde su servidor. La API no les contesta a los navegadores |

```bash
curl -s "https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/api-tienda/catalogo?limite=2" \
  -H "Authorization: Bearer $CLAVE_GROSS"
```

---

## La clave

- **Se la pasamos una sola vez, por un canal privado.** Nosotros no la tenemos guardada: guardamos una huella que no permite recuperarla. Si se pierde, se hace otra.
- **Va en el servidor, nunca en la página.** Guárdenla como variable de entorno. La API no manda encabezados CORS a propósito: un navegador no puede leer las respuestas, así que la clave no sirve puesta en el código de la página, y si estuviera ahí cualquiera la podría copiar.
- **Va en el encabezado, no en la dirección.** Las direcciones quedan anotadas en los registros; los encabezados no.
- **Está atada al canal «Tienda online».** Es la clave la que decide qué productos se ven, con qué precio y con qué margen de stock.
- **Para cambiarla sin cortar la tienda:** les damos una nueva, la cambian, nos avisan, y recién ahí anulamos la vieja. Las dos andan mientras tanto.
- **Si creen que se filtró, avísennos:** se anula en el momento y deja de andar en la consulta siguiente.

---

## `GET /catalogo`

Los productos que Gross decidió vender online.

| Parámetro | | |
|---|---|---|
| `desde` | opcional | El valor de `siguiente` de una respuesta anterior, **tal como llegó**. Sin `desde`, trae el catálogo entero; con `desde`, sólo lo que cambió. |
| `limite` | opcional | Cuántos productos por página, de 1 a 1000. Si no se manda, 500. |

Cualquier otro parámetro se rechaza con `400`: un `dsde` mal escrito devolvería el catálogo entero en cada consulta sin que nadie se diera cuenta.

### La respuesta

```json
{
  "canal": "Tienda online",
  "generado_en": "2026-09-18T21:14:54.309804Z",
  "frescura": {
    "ultima_conexion_del_local": "2026-09-18T19:55:59.593186Z",
    "minutos_sin_conexion": 78,
    "tolerancia_minutos": 15,
    "confiable": false
  },
  "productos": [
    {
      "id": "25dc5aa4-2e61-4f35-8479-6cb3a886994a",
      "publicado": true,
      "codigo": "DEMO-051",
      "codigos_barra": [],
      "nombre": "Comedero de acero 1 L",
      "descripcion": null,
      "precio": 6900,
      "unidad": "unidad",
      "stock": 9,
      "requiere_receta": false,
      "categoria": "accesorios",
      "marca": "sin-marca",
      "presentacion": "unidad",
      "animales": [],
      "etapas_de_vida": [],
      "actualizado_en": "2026-09-18T21:13:34.057949Z"
    },
    {
      "id": "7c1e9a04-5b2f-4d0e-9a51-2f6c3e8d1b77",
      "publicado": false,
      "actualizado_en": "2026-09-18T21:20:02.118300Z"
    }
  ],
  "hay_mas": false,
  "siguiente": "eyJ0IiA6ICIyMDI2LTA5LTE4VDIxOjE1OjMwLjQ1MDM5M1oiLCAiaSIgOiAi..."
}
```

*(Es una respuesta real, con los productos de prueba que hay hoy; el segundo producto está puesto para mostrar cómo llega una baja.)*

### Cada producto

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto (UUID) | El identificador del producto. **No cambia nunca.** Es la clave para guardarlo de su lado. |
| `publicado` | sí/no | `true`: está a la venta. `false`: **hay que sacarlo de la tienda** (ver abajo). |
| `codigo` | texto | El código interno de Gross, el que usa el mostrador. Sirve para hablar de un producto por teléfono. |
| `codigos_barra` | lista de textos | Los códigos del envase (EAN). **Es lo más seguro para emparejar los productos que ya tienen cargados.** Puede venir vacía. |
| `nombre` | texto | El nombre para el público. |
| `descripcion` | texto o `null` | La descripción que se carga en la ficha para la web. |
| `precio` | número | En pesos, **final, con IVA incluido**. Es el de la lista de precios que Gross eligió para la tienda. |
| `unidad` | texto | Cómo se cuenta el stock: `unidad`, `bolsa`… |
| `stock` | número | **Lo que la tienda puede vender.** Ya viene con un margen de seguridad descontado (ver abajo): no le resten ni le sumen nada. Nunca es negativo. |
| `requiere_receta` | sí/no | Si el producto pide receta veterinaria. Qué hace la tienda con eso lo acuerdan con Gross. |
| `categoria`, `marca`, `presentacion` | texto o `null` | El `slug` de cada una: `alimentos`, `pro-plan`, `bolsa`. Los nombres para mostrar están en `/clasificaciones`. |
| `animales`, `etapas_de_vida` | lista de textos | Los `slug`: `["perros"]`, `["adulto"]`. Un producto puede estar en varios. |
| `actualizado_en` | fecha | Cuándo cambió por última vez lo que la tienda ve de este producto. |

**Lo que dejó de publicarse** llega sólo con `id`, `publicado: false` y `actualizado_en`, sin nombre ni precio. Pasa cuando Gross lo apaga para la web, lo da de baja, o le falta algo para salir (nombre público o precio). Si no lo tienen cargado, ignórenlo.

**El margen de seguridad.** El stock que publica la API es lo que hay en el local **menos unas unidades que la tienda no ve**, para que una venta del mostrador y una de la web en el mismo minuto no se lleven la misma unidad. Si hay 5 y el margen es 2, la API dice 3. Lo configura Gross, por producto si hace falta.

### La frescura

El stock sale del sistema del local, que sincroniza con el servidor cada minuto mientras tiene internet. La frescura dice si eso está pasando:

| Campo | Qué es |
|---|---|
| `ultima_conexion_del_local` | La última vez que alguna computadora del local sincronizó. |
| `minutos_sin_conexion` | Hace cuánto fue eso. |
| `tolerancia_minutos` | Hasta cuántos minutos de atraso se considera al día. |
| `confiable` | `true` si el local sincronizó dentro de la tolerancia y ninguna computadora tiene ventas trabadas sin subir. |

Con `confiable: false` puede haber ventas del mostrador que el servidor todavía no vio. **De noche, con el local cerrado, va a decir `false`**: el stock en realidad está bien —no se vende—, pero el sistema no lo puede probar. Qué hace la tienda en ese caso (mostrar igual y confirmar el pedido a la mañana, por ejemplo) se acuerda con Gross.

---

## `GET /clasificaciones`

Las listas para armar los menús y los filtros: categorías, marcas, animales, etapas de vida y presentaciones. Son las mismas que usa la tienda, sin traducir. No acepta parámetros.

```json
{
  "generado_en": "2026-09-18T21:14:55.199674Z",
  "categorias":     [{ "slug": "farmacia", "nombre": "Farmacia", "padre": null, "orden": 10, "activo": true }],
  "marcas":         [{ "slug": "bago", "nombre": "Bagó", "activo": true }],
  "animales":       [{ "slug": "perros", "nombre": "Perros", "orden": 10, "activo": true }],
  "etapas_de_vida": [{ "slug": "cachorro", "nombre": "Cachorro", "orden": 10, "activo": true }],
  "presentaciones": [{ "slug": "bolsa", "nombre": "Bolsa", "activo": true }]
}
```

*(Recortado: cada lista trae todas.)* El `slug` no cambia; el `nombre` puede cambiar, y por eso los productos citan el `slug`. `padre` es el `slug` de la categoría de arriba, o `null`. Consúltenla una vez por día.

---

## Cómo mantener la tienda al día

**La primera vez:**

1. `GET /catalogo`. Guarden cada producto por su `id`.
2. Mientras `hay_mas` sea `true`, pidan `GET /catalogo?desde=<siguiente>` y sigan guardando.
3. Cuando `hay_mas` sea `false`, guarden el último `siguiente`.

**Cada uno a cinco minutos:**

1. `GET /catalogo?desde=<el siguiente guardado>`.
2. Por cada producto: si `publicado` es `true`, créenlo o actualícenlo por `id`; si es `false`, sáquenlo de la venta.
3. Mientras `hay_mas` sea `true`, sigan con el `siguiente` nuevo.
4. **Guarden el `siguiente` recién cuando procesaron todo.** Si algo falla a la mitad, vuelvan a pedir con el que tenían: repetir no hace daño, saltear sí.

**Una vez por día:** el catálogo entero, sin `desde`. Lo que tengan a la venta y no venga, sáquenlo. Es la red de seguridad.

Tres cosas que conviene saber:

- **A veces el mismo producto llega dos veces**, en dos consultas seguidas. Es a propósito: el sistema prefiere repetir antes que arriesgarse a perder un cambio que se estaba guardando justo cuando ustedes consultaron. Guardar por `id` lo resuelve.
- **`siguiente` es opaco.** Guárdenlo y devuélvanlo tal cual. No lo armen ni lo modifiquen: si no es uno que devolvió la API, contesta `400`.
- **Qué cuenta como un cambio:** el nombre, la descripción, el precio, las clasificaciones, los códigos de barra, el stock, que se publique o se deje de publicar, y el margen de seguridad.

---

## Errores

Todos vienen con la misma forma:

```json
{ "error": { "codigo": "limite_invalido", "mensaje": "El parámetro limite tiene que ser un número entero entre 1 y 1000." } }
```

| Estado | `codigo` | Qué pasó |
|---|---|---|
| `401` | `falta_clave` | No vino el encabezado `Authorization: Bearer <clave>`. |
| `401` | `clave_invalida` | La clave no existe o fue anulada. |
| `400` | `parametro_desconocido` | Un parámetro que esa consulta no acepta. El mensaje lo nombra. |
| `400` | `desde_invalido` | `desde` no es un `siguiente` devuelto por la API. |
| `400` | `limite_invalido` | `limite` no es un entero entre 1 y 1000. |
| `404` | `ruta_desconocida` | La consulta no existe. |
| `405` | `metodo_no_permitido` | Un método que no es `GET`. |
| `500` | `error_interno` | Algo falló de nuestro lado. Reintenten en un rato, esperando cada vez un poco más; si sigue, avísennos con la hora. |

---

## Lo que la API no da, y por qué

No expone costos, márgenes, proveedores, el stock real del local, el nombre interno de los productos, datos fiscales, listas de precios internas, ni nada de clientes, ventas o usuarios. **La lista de campos de arriba es cerrada**: si en algún momento se agrega uno, se avisa y se actualiza este documento.

No hay forma de modificar nada por la API: el stock y los precios los maneja el sistema de Gross, que es el único que los anota. Cuando entre un pedido de la tienda, el que descuenta el stock es el sistema.

---

## Lo que viene: los pedidos

En la segunda etapa la tienda va a poder **mandar los pedidos** al sistema. El sistema aparta el stock y, si el cliente pagó online, **emite la factura electrónica y se la manda por mail**. El mail de «recibimos tu pedido» es de ustedes; el de la factura lo manda el sistema. Si el cliente paga en el local, el pedido le aparece a la caja y se cobra ahí.

**Lo que conviene que el proceso de compra pida desde ahora**, porque sin eso no se puede facturar sola:

- Nombre y apellido, o razón social.
- Email.
- DNI o CUIT.
- Condición frente al IVA: consumidor final, responsable inscripto, monotributo o exento. Un responsable inscripto necesita factura A, con su CUIT.
- Si paga online o en el local.
- Si retira en el local o se lo mandan, y el domicilio.

El DNI o el CUIT es además lo que permite reconocer al cliente si ya compra en el local.

También va a haber una consulta de disponibilidad en el momento del pago, para confirmar el stock justo antes de cobrar.

---

## Hoy

- **Los datos son de prueba**: los productos que se usaron para construir el sistema. Cuando Gross cargue su catálogo real, es la misma dirección y la misma clave.
- **Para emparejar lo que ya tienen cargado**, usen `codigos_barra` y `codigo`. Los productos de prueba casi no tienen códigos de barra; los reales, sí.
- **Contacto:** ILUMA, la agencia que les pasó la clave.
