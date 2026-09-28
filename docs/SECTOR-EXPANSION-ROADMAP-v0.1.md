# SURKARA — Sector Expansion Roadmap v0.1

**Fecha:** 2026-09-27  
**Estado:** ACTIVE DIRECTION  
**Objetivo:** evitar que el desarrollo quede encerrado en cosecha y preservar una expansión ordenada hacia los demás rubros agropecuarios.

## 1. Principio rector

SURKARA es una plataforma operacional agropecuaria, no una aplicación exclusiva de cosecha.

El desarrollo actual usa cosecha como primer vertical slice porque concentra:
- maquinaria;
- operadores;
- jornadas;
- trabajo offline;
- logística;
- movimiento físico de producto;
- documentación;
- conciliación;
- costos.

Lo aprendido en este slice debe convertirse en infraestructura reutilizable, pero **no en semántica universal**.

Se reutilizan:
- Organization / membership;
- Party y relaciones;
- Equipment;
- asignaciones temporales;
- PWA offline-first;
- IndexedDB + Outbox;
- Sync Gateway;
- idempotencia;
- provenance;
- evidencia;
- conflictos;
- revisiones;
- read models operativos.

Cada sector conserva sus entidades y reglas propias.

## 2. Secuencia de expansión

### Fase 1 — Contractor Ops + Harvest

Estado actual:
- operación agronómica;
- ContractorJob;
- OperationalTeam;
- WorkSession multi-jornada;
- composición temporal de equipos/personas;
- reemplazos y correcciones;
- cierre de jornada;
- finalización de trabajo;
- historial;
- captura offline y auto-sync;
- parte de jornada con:
  - hectáreas realizadas;
  - horas de máquina;
  - combustible;
  - paradas/esperas;
  - provenance.

Pendientes principales:
- GrainBatch;
- GrainTransfer;
- Load;
- evidencia/fotos;
- incidentes;
- lecturas y correcciones;
- métricas de rendimiento/costo por hectárea.

### Fase 2 — Transporte y logística

Debe conectarse con Harvest sin quedar subordinado a él.

Entidades/reglas propias:
- Load;
- Trip;
- Vehicle;
- Driver;
- origen/destino;
- asignaciones temporales;
- salida/llegada;
- WaitingTime;
- descarga;
- ticket/peso;
- CPE y otros documentos externos con lifecycle explícito;
- costo de transporte.

Casos:
- cosecha → monotolva → camión → acopio/puerto;
- traslado entre establecimientos;
- cargas que no provienen de cosecha;
- viajes con cambios de chofer/vehículo.

### Fase 3 — Grain & Reconciliation

Objetivo:
- preservar linaje físico del grano;
- comparar estimado, transferido, cargado y pesado;
- registrar diferencias sin borrar observaciones previas.

Incluye:
- GrainBatch;
- almacenamiento;
- silo/silobolsa;
- tickets;
- humedad;
- GrainReconciliation;
- correcciones/supersession;
- tolerancias;
- costos básicos.

### Fase 4 — Agricultura operacional ampliada

Expandir el mismo núcleo agronómico a:
- siembra;
- pulverización;
- fertilización;
- preparación de suelo;
- riego;
- monitoreo;
- agricultura de precisión.

No forzar estas labores dentro de objetos diseñados exclusivamente para cosecha.

### Fase 5 — Ganadería

Entidades propias:
- Animal;
- RFID/identificación;
- Herd/Rodeo;
- Pasture/Potrero;
- pesajes;
- sanidad;
- reproducción;
- movimientos;
- tratamientos;
- eventos productivos.

Equipment sigue siendo infraestructura compartida; Animal no es Equipment.

### Fase 6 — Feedlot

Entidades/reglas propias:
- tropas;
- corrales;
- dietas;
- raciones;
- mixer;
- entregas;
- consumos;
- stock de alimento;
- pesajes;
- conversión;
- sanidad;
- mortalidad;
- costos.

Debe reutilizar identidad, inventario, equipos, personas, evidencia y sync, sin copiar el modelo de Harvest.

### Fase 7 — Tambo

Entidades/reglas propias:
- animales/lactancias;
- ordeñes;
- producción de leche;
- tanques;
- calidad;
- alimentación;
- reproducción;
- sanidad;
- turnos/equipos.

### Fase 8 — Field Support, mantenimiento e inventarios

Capacidades transversales:
- MobileCamp / casilla;
- suministros;
- agua/energía;
- viandas;
- repuestos;
- mantenimiento preventivo/correctivo;
- combustible;
- herramientas;
- inventario;
- costos y proveedores.

Estas capacidades deben poder servir a cosecha, transporte, feedlot, tambo y demás sectores.

## 3. Gate para pasar de un sector al siguiente

No esperar a “terminar todo” un sector, pero tampoco expandir sobre una base inestable.

Un vertical puede habilitar el siguiente cuando:
1. el recorrido principal funciona offline;
2. la autoridad remota está validada;
3. retries no duplican hechos;
4. conflictos relevantes son explícitos;
5. existe evidencia E2E real;
6. los límites de dominio están documentados;
7. la infraestructura reutilizable está separada de la semántica sectorial.

## 4. Orden inmediato

El foco inmediato continúa siendo cerrar el recorrido operativo de cosecha.

Después:
1. **GrainTransfer + Load**;
2. **Transport / Trip**;
3. **Unload + ticket/peso**;
4. **GrainReconciliation**;
5. endurecimiento multi-device/evidencia/costos;
6. expansión a agricultura ampliada, ganadería, feedlot y tambo por verticales independientes.

Este orden no convierte Transporte ni Feedlot en “features de cosecha”. Sólo usa el primer recorrido completo para endurecer la plataforma común antes de multiplicar sectores.

## 5. Regla arquitectónica permanente

Ante cada nuevo rubro preguntar:

> ¿Qué parte es infraestructura común y qué parte pertenece exclusivamente a la semántica de este sector?

Si una abstracción obliga a llamar igual a cosas operacionalmente distintas, no se comparte.

La plataforma debe crecer por **módulos de dominio interoperables**, no por una tabla universal de “eventos agropecuarios”.
