# El manual del sistema, en PDF

**Qué es:** el manual que se le entrega a Gross. Explica cada sección con la misma estructura —para qué sirve, qué veo, qué hago, qué exporto— y **sólo habla de lo que funciona hoy**. Nada de lo que está en camino entra acá: el manual se lee sin nosotros al lado, y una promesa escrita se reclama.

**Cómo se regenera** (Windows, con el Edge que ya viene instalado):

```bash
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="docs/manual/Manual del Sistema - Agroveterinaria Gross.pdf" "file:///D:/00 ILUMA/Dev Code/Sistema Gross/docs/manual/manual.html"
```

La marca y las tipografías salen de `app/public/marca` y `app/public/fuentes`, así que el manual usa exactamente lo mismo que el sistema. **No hay que duplicar los archivos acá.**

**Cuándo actualizarlo:** cada vez que una pantalla cambie lo que el usuario ve o lo que exporta. Si se agrega una sección nueva, va con la misma estructura de cuatro preguntas.
