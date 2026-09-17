---
actualizado: 2026-09-17
estado: resuelto — Gross la va a cambiar
---

# La PC con Windows 7

> ✅ **Resuelto el 17/09, por Lucas.** Están rehaciendo el local entero con un arquitecto y **en paralelo van renovando las computadoras**, que son viejas y compradas de a una. Esa PC se cambia cuando le toque. **Mientras tanto, ese puesto trabaja con Chrome** y no hay nada que hacer de nuestro lado.
>
> **Lo que sí conviene tener claro, dicho una vez:** hasta que esa máquina se cambie, ese puesto **no imprime** y, con internet cortado, **sus ventas no le llegan a la caja** — quedan esperando en esa computadora hasta que vuelva la conexión. Si el corte es largo y justo ahí se vende, eso se nota.
>
> **Y una buena:** poner el sistema en la PC nueva es bajar el instalador y elegir la terminal. Nada se pierde ni se migra, porque los datos viven en el servidor. Es exactamente lo que Lucas quiere: no depender de que nadie venga a reinstalar nada.

Lo que sigue es el detalle técnico, por si hace falta explicarlo de nuevo.

---

## Qué pasa

En esa máquina —la del **mostrador**— el programa instalado **no arranca**. Se intentó el 07/09 y otra vez el 17/09, con dos carteles distintos:

```
Error: La instalación de WebView2 falló con el código -2147024769.
No se encuentra el punto de entrada del procedimiento
PackageIdFromFullName en la biblioteca KERNEL32.dll
```

Los dos dicen lo mismo con otras palabras: el componente de Microsoft que el programa necesita para dibujar las pantallas **usa funciones que Windows 7 no tiene**. Microsoft dejó de soportar Windows 7 en 2023.

**No hay versión nuestra que lo arregle, ni la va a haber.** No es que falte programarlo: no se puede.

> Además, esa máquina **no recibe actualizaciones de seguridad desde enero de 2020** y ahí se cargan datos de clientes.

---

## Qué pierde ese puesto hoy

Hoy funciona **con el navegador**, y así se usó en el local. Con eso alcanza para vender, pero no para todo:

| | Con el navegador (hoy) | Con el programa instalado |
|---|---|---|
| Vender y mandar a la caja | ✅ | ✅ |
| Vender **sin internet** | ✅ (guarda en esa PC) | ✅ |
| Que la venta **le llegue a la caja sin internet** | ❌ | ✅ |
| Imprimir el ticket en la impresora del local | ❌ | ✅ |
| Aspecto | 🟡 algunos fondos sin color | ✅ |

---

## Las opciones que se plantearon, y en qué quedó

**1. Cambiar la máquina.** ✅ **Es lo que va a pasar**, dentro de la renovación del local. La decide Gross y tiene su propio tiempo.

**2. Mover los puestos.** Si el corte de internet llega antes que la PC nueva y molesta, se puede intercambiar esa máquina con otra que no necesite imprimir. No cuesta plata y se hace en una tarde. **Queda como recurso, no como plan.**

**3. Dejarla con el navegador.** Es lo que se está haciendo mientras tanto.

---

## Cuando llegue la PC nueva

Quince minutos, y no hace falta que vayamos:

1. Bajar el instalador de `gross-sistema.pages.dev` y ejecutarlo.
2. Entrar con el usuario de esa persona y **elegir la terminal** (Mostrador 2, por ejemplo).
3. Configuración → **Impresora del mostrador**, elegirla de la lista, e *Imprimir una prueba*.
4. Correr el **diagnóstico** y copiarlo, para dejar constancia de que quedó bien.

Nada se migra: lo que esa máquina tenía sin subir ya subió, y el resto vive en el servidor.
