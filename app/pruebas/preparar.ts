/*
  Preparación del entorno de pruebas.

  Dexie habla con IndexedDB, que es una interfaz del navegador y en Node
  no existe. fake-indexeddb la implementa entera en memoria, así que la
  base local se puede probar de verdad —transacciones, índices, versiones
  del esquema— en vez de simularla con objetos, que probaría el simulacro
  y no el código que va a correr en el mostrador.

  Cada archivo de prueba arranca con una base limpia porque se importa
  'auto', que registra una implementación nueva por proceso.
*/
import 'fake-indexeddb/auto'
