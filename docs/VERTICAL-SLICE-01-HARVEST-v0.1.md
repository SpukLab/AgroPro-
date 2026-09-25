# SURKARA — Vertical Slice 01: Harvest Operations v0.1

**Fecha:** 2026-09-24  
**Base:** Domain Blueprint v0.3 + Architecture Foundation v0.1 + Offline & Sync Contract v0.1  
**Estado:** CANDIDATE — implementation target  
**Objetivo:** definir el primer recorrido funcional completo que debe implementarse antes de expandir a otros dominios.

## 1. Alcance

Vertical Slice 01 cubre:

**Agronomy + Contractor Ops + Harvest & Grain + Transport + Field Support**

No intenta cubrir todavía:
- ganadería;
- feedlot;
- tambo;
- telemetría avanzada;
- integración real con todos los fabricantes;
- optimización automática;
- facturación completa;
- integración productiva con ARCA.

## 2. Resultado esperado

Un operador debe poder registrar y seguir una operación real de cosecha desde la planificación hasta la conciliación física/económica, incluso con conectividad intermitente.

El recorrido debe responder:

1. qué se iba a cosechar;
2. quién y qué equipo trabajó;
3. cuándo empezó/terminó cada tramo;
4. qué paradas ocurrieron;
5. cuánto combustible/recursos se registraron;
6. cómo se movió el grano;
7. qué carga salió;
8. qué viaje/documentación la acompañó;
9. cuánto se pesó al descargar;
10. qué diferencia quedó entre estimado, transferido y pesado;
11. qué costos básicos se asociaron;
12. qué soporte de campaña mantuvo al equipo operativo.

## 3. Precondiciones

Datos maestros mínimos disponibles:
- organización;
- cliente;
- establecimiento;
- lote;
- campaña;
- cultivo;
- personas;
- equipos;
- vehículo/camión opcional;
- destinos;
- inventario básico;
- MobileCamp opcional.

No hace falta un ERP maestro completo para iniciar.

## 4. Flujo principal

### VS01-01 — Crear operación agronómica

Crear AgriculturalOperation de tipo harvest.

Datos mínimos:
- cliente/party reference;
- establishment;
- field;
- campaign;
- crop;
- planned area;
- planned window.

Resultado:
- operation id;
- revision;
- status planned.

### VS01-02 — Crear trabajo contratista

Crear ContractorJob referenciando AgriculturalOperation.

Datos:
- service agreement/reference;
- cliente;
- operation ref;
- estimated start;
- pricing/cost basis opcional en primera versión.

Resultado:
- job id;
- revision;
- status planned/ready.

### VS01-03 — Componer Harvest Team

Crear OperationalTeam/HarvestTeam.

Ejemplo:

```text
Harvest Team A
├─ Cosechadora 1
├─ Operador cosechadora
├─ Tractor 1
├─ Monotolva 1
├─ Operador tractor
└─ recursos auxiliares
```

Debe poder cambiarse la composición con vigencia temporal.

### VS01-04 — Asociar Field Deployment

Si corresponde:
- crear/seleccionar FieldDeployment;
- asociar cuadrilla;
- asociar MobileCamp;
- fecha de llegada;
- suministros/soporte inicial.

No es obligatorio que toda operación use MobileCamp.

### VS01-05 — Iniciar WorkSession / HarvestSession

Debe funcionar offline.

Captura:
- started_at local;
- operador;
- equipo efectivo;
- field;
- machine readings iniciales opcionales;
- GPS inicial opcional.

Resultado local:
- pending sync;
- client-generated id;
- visible aunque no exista conexión.

### VS01-06 — Registrar ejecución

Durante la sesión se pueden registrar:

- area observation;
- hours;
- fuel;
- moisture;
- incidents;
- downtime;
- photos;
- notes;
- GPS/evidence.

Cada dato conserva provenance.

### VS01-07 — Registrar Downtime

Caso obligatorio:

“Cosechadora detenida esperando monotolva”.

Registrar:
- start;
- end;
- cause = waiting_resource;
- blocking_ref = monotolva;
- note/evidence opcional.

Otro caso:
“Monotolva esperando camión”.

Debe quedar diferenciable del caso anterior.

### VS01-08 — Crear GrainBatch

Al comenzar a materializar output de cosecha, crear/obtener GrainBatch ligado a:
- campaign;
- crop;
- field;
- HarvestOperation;
- HarvestSession/source context.

No se obliga a crear un batch por cada descarga pequeña; la granularidad final se ajustará con pruebas de campo.

### VS01-09 — GrainTransfer cosechadora → monotolva

Registrar:
- source = harvester;
- destination = grain cart;
- batch;
- quantity observation;
- provenance = machine/manual/estimated/etc;
- occurred_at;
- responsible operator.

Debe poder capturarse offline.

### VS01-10 — GrainTransfer monotolva → destino

Dos caminos:

#### Camino A — Camión
Registrar transfer a Load/Truck handoff.

#### Camino B — Silo/Silobolsa
Registrar transfer a TemporaryStorage/SiloBag y cerrar ese tramo sin crear Trip.

El sistema no debe obligar a usar transporte externo.

## 5. Camino transporte

### VS01-11 — Crear Load

Load contiene:
- GrainBatch allocations;
- origin;
- intended destination;
- observed quantity/provenance;
- status.

Puede existir antes de asignar camión.

### VS01-12 — Crear Trip

Trip referencia Load.

Datos:
- vehicle;
- driver;
- origin;
- destination;
- planned departure.

Cambios de chofer/vehículo posteriores conservan historia temporal.

### VS01-13 — CPE lifecycle inicial

Primera versión:
- SURKARA permite preparar datos y registrar estado;
- no se implementa todavía una integración oficial productiva sin validación específica.

Estados soportados:
- draft;
- prepared;
- submitted;
- authorized;
- rejected;
- cancelled/annulled cuando corresponda.

En entorno sin integración:
- el usuario puede adjuntar/registrar evidencia manual;
- no se simula autorización oficial.

### VS01-14 — Salida y viaje

Trip:
- loaded;
- departed;
- waiting;
- unloading;
- delivered.

WaitingTime puede registrar espera en destino.

## 6. Descarga y conciliación

### VS01-15 — Registrar ticket/peso

Al descargar:
- ticket evidence;
- weighed quantity;
- unit;
- moisture cuando exista;
- provenance = scale/ticket/manual;
- observed_at.

### VS01-16 — Crear UnloadResult

Transport publica:
- trip;
- load;
- destination;
- unload time;
- weighed quantity;
- evidence;
- external document refs.

### VS01-17 — GrainReconciliation

Harvest & Grain concilia:
- monitor estimate;
- GrainTransfer observations;
- Load quantity;
- destination scale/ticket.

Resultado:
- absolute difference;
- relative difference;
- tolerance;
- status;
- notes;
- corrections/evidence.

No se elimina ningún input previo.

## 7. Cierre de sesión

WorkSession/HarvestSession puede cerrarse cuando:
- operador solicita cierre;
- no existe conflicto crítico pendiente para ese cierre;
- se registra end time;
- resultado queda pendiente/confirmado según sync.

Una segunda solicitud de cierre con mismo client_operation_id devuelve duplicate/already processed.

Un segundo dispositivo basado en revisión antigua recibe conflicto si intenta una transición incompatible.

## 8. Costing mínimo

Registrar como mínimo:
- combustible;
- horas;
- repuestos incidentales;
- viandas/suministros de campaña opcionales;
- peajes/fletes opcionales;
- mantenimiento originado por incidente.

No se exige todavía contabilidad completa.

Read model final:
- cost per ha;
- fuel per ha;
- time per ha;
- downtime;
- transport cost básico;
- support cost básico.

## 9. Pantallas mínimas

La implementación no debe copiar literalmente el prototipo actual, pero sí conservar su enfoque mobile-first.

Pantallas/read models mínimos:

1. **Inicio operativo**
   - trabajo actual;
   - estado sync;
   - hectáreas/tiempo;
   - acciones rápidas.

2. **Servicio / sesión**
   - equipo;
   - tiempo;
   - superficie;
   - cargas;
   - incidencias;
   - paradas;
   - combustible.

3. **Transferencias**
   - origen;
   - destino;
   - batch;
   - cantidad/provenance;
   - pending/confirmed.

4. **Cargas**
   - esperando camión;
   - asignadas;
   - despachadas.

5. **Viajes**
   - estado;
   - conductor/vehículo;
   - destino;
   - documento.

6. **Conciliación**
   - estimado;
   - transferido;
   - pesado;
   - diferencia.

7. **Campamento**
   - personas;
   - suministros;
   - pendientes.

8. **Conflictos sync**
   - elemento;
   - razón;
   - acción requerida.

## 10. Offline acceptance

El slice debe funcionar sin señal para:
- iniciar sesión de trabajo;
- registrar superficie/horas;
- registrar downtime;
- registrar fuel;
- crear evidencia local;
- crear GrainBatch/GrainTransfer;
- preparar Load;
- cerrar un tramo local cuando la política lo permita.

Requiere conexión para:
- acciones externas oficiales;
- confirmación de cambios que entren en conflicto;
- sincronización final multi-device.

## 11. Multi-device acceptance

Caso mínimo:

- Operador A registra transferencias desde campo.
- Operador B consulta cargas desde otro dispositivo.
- Al sincronizar:
  - no aparecen duplicados;
  - B ve cambios confirmados;
  - si ambos modificaron estado sensible desde la misma revisión, aparece conflicto;
  - los checks/estados confirmados pueden propagarse en realtime cuando haya conexión.

## 12. Evidencia mínima

Cada demo/E2E del slice debe poder mostrar:
- IDs estables;
- revisiones;
- provenance;
- sync state;
- history/corrections;
- batch lineage;
- external document state;
- reconciliation inputs.

No se considera válido un demo que sólo cambie tarjetas de UI en memoria.

## 13. Casos E2E obligatorios

### E2E-01 — Cosecha sin transporte
Lote → cosechadora → monotolva → silo propietario → conciliación local.

### E2E-02 — Cosecha con transporte
Lote → cosechadora → monotolva → camión → Trip → descarga → ticket → conciliación.

### E2E-03 — Offline
Crear sesión + downtime + transfer + load sin red; reconectar; sincronizar sin duplicados.

### E2E-04 — Multi-device conflict
Dos dispositivos intentan cerrar/modificar estado sensible desde misma revisión; uno debe recibir conflicto explícito.

### E2E-05 — Retry idempotente
Enviar dos veces el mismo GrainTransfer con mismo client_operation_id; debe existir un solo hecho.

### E2E-06 — Correction
Registrar peso manual y luego corregir con ticket; ambos permanecen auditables y el read model muestra el vigente.

### E2E-07 — Team rotation
Cambiar operador durante la jornada; consultas históricas muestran quién estuvo asignado en cada intervalo.

### E2E-08 — External document
Preparar CPE offline; al reconectar queda pending external/submitted; nunca authorized sin evidencia externa.

## 14. Fuera de alcance del primer código

No implementar todavía:
- IA autónoma tomando decisiones operativas;
- DAHZEA escribiendo tablas;
- optimizador de rutas;
- integración universal de telemetría;
- conciliación contable completa;
- RFID livestock;
- feedlot/dairy;
- microservicios;
- event sourcing.

## 15. Orden de implementación

### Milestone A — Core operacional
- Parties;
- fields/campaign;
- equipment;
- AgriculturalOperation;
- ContractorJob;
- OperationalTeam;
- WorkSession;
- sync envelope.

### Milestone B — Harvest
- HarvestOperation/Session;
- GrainBatch;
- GrainTransfer;
- Load;
- downtime/evidence.

### Milestone C — Transport
- Trip;
- assignments;
- waiting;
- external document lifecycle;
- unload result.

### Milestone D — Reconciliation
- weight/ticket;
- GrainReconciliation;
- costing summary;
- end-to-end read models.

### Milestone E — Hardening
- multi-device;
- offline conflicts;
- retry/idempotency;
- audit;
- E2E suite.

## 16. Gate para comenzar código

Se puede iniciar scaffolding técnico cuando:
- Architecture Foundation v0.1 esté aceptado;
- Offline & Sync Contract v0.1 esté aceptado;
- este slice no requiera romper aggregate ownership;
- stack/persistencia seleccionados puedan demostrar los E2E-01 a E2E-08.

El prototipo actual se conserva como referencia visual/operativa, no como base arquitectónica.
