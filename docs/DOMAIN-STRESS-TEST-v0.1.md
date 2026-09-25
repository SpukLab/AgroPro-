# SURKARA — Domain Stress Test v0.1

**Fecha:** 2026-09-24  
**Base evaluada:** Domain Blueprint v0.2  
**Estado:** completado para promoción a v0.3  
**Repositorio:** `SpukLab/AgroPro-` (nombre técnico heredado; SURKARA es el nombre de producto de trabajo)

## 1. Objetivo

Validar que los límites de dominio representen los flujos operativos obligatorios antes de elegir arquitectura técnica, tablas o reescribir el prototipo.

El criterio no es que cada flujo “quepa” por fuerza. Si para soportarlo hubiera que:
- duplicar autoridad;
- crear una entidad universal;
- perder procedencia;
- sobrescribir historia;
- mezclar dominios;
- depender de conectividad permanente;

entonces el Blueprint debe corregirse.

## 2. Resultado ejecutivo

Los 17 flujos obligatorios son representables, pero **7 capacidades necesitan quedar explícitas en el canon** antes de construir:

1. referencias entre dominios sin copiar autoridad;
2. composición temporal/versionada de equipos y asignaciones;
3. identidad del grano a través de transferencias;
4. conciliación como objeto de dominio;
5. esperas y bloqueos vinculados a la causa operacional;
6. correcciones que preserven historia y procedencia;
7. ciclo de vida explícito para documentos externos y comandos offline.

No se encontró evidencia que obligue a crear un `Work` universal, fusionar animales con Assets, adoptar event sourcing ni introducir microservicios.

## 3. Stress test de flujos obligatorios

| # | Flujo | Resultado | Observación |
|---|---|---|---|
| 1 | Sembrar 180 ha durante dos jornadas | PASS con refuerzo | AgriculturalOperation + WorkSession cubren ejecución multi-jornada. Debe quedar explícito cómo una ejecución contratista referencia la labor agronómica y cómo se conserva superficie planificada vs ejecutada. |
| 2 | Fertilizar con receta y dosis variable | PASS con refuerzo | Prescription + Measurement/Provenance son suficientes si la ejecución conserva receta fuente, dosis objetivo y dosis efectivamente aplicada sin confundirlas. |
| 3 | Cosechar con dos cosechadoras | PASS con refuerzo | HarvestTeam permite múltiples máquinas. Falta fijar composición efectiva por intervalo/jornada y atribución de producción a cada recurso cuando exista evidencia. |
| 4 | Cosechadora + tractor + monotolva como equipo | PASS | OperationalTeam + HarvestTeam representan correctamente la unidad compuesta. |
| 5 | Cosechadora → monotolva → camión | PASS con refuerzo | GrainTransfer modela el movimiento, pero hace falta identidad persistente del grano/lote físico para encadenar transferencias y conservar trazabilidad. |
| 6 | Descargar en silo del propietario | PASS | El destino puede ser almacenamiento interno sin crear Trip externo. Debe conservarse propietario/parte responsable y ubicación/destino. |
| 7 | Máquina detenida esperando monotolva/camión | PASS con refuerzo | Downtime existe, pero la causa debe poder referenciar explícitamente el recurso, asignación o dependencia que bloqueó la operación. |
| 8 | Registrar combustible y horas | PASS con refuerzo | Measurement + Inventory + Costing cubren el caso. Debe distinguirse carga/entrega de combustible, consumo estimado/calculado y lectura real de horas. |
| 9 | Generar reparación desde incidente | PASS con refuerzo | Maintenance puede recibir el incidente, siempre que exista vínculo causal explícito y no se copie el incidente como una segunda autoridad. |
| 10 | Viaje + CPE + descarga | PASS con refuerzo | Transport + Evidence/Documents cubren el flujo. El documento externo necesita estados claros: preparado, enviado, autorizado, rechazado, anulado, etc. |
| 11 | Conciliar kg estimados, transferidos y pesados | GAP RESUELTO EN v0.3 | El Blueprint describía conciliación pero no la elevaba a entidad explícita. Se incorpora GrainReconciliation. |
| 12 | Cuadrilla + casilla varias semanas | PASS | FieldDeployment + MobileCamp cubren permanencia y soporte. |
| 13 | Alimentos, agua, repuestos y gastos | PASS | Inventory + Costing + FieldSupport cubren movimientos y costos. |
| 14 | Rotar/reemplazar operador | PASS con refuerzo | Rotation existe; las asignaciones deben tener vigencia temporal para reconstruir quién operaba en cada momento. |
| 15 | Manga con RFID y pesada offline | PASS con refuerzo | Livestock + Measurement + Offline cubren el caso. Escaneos/eventos locales requieren identidad/idempotencia y política ante duplicados. |
| 16 | Alimentación diaria de corral | PASS | Feedlot conserva semántica propia mediante FeedingPlan/FeedingRound/IngredientLoad/DeliveredFeed. |
| 17 | Ordeñe individual + tanque | PASS | Dairy conserva medición individual y agregada sin convertir ordeñe en Work genérico. |

## 4. Invariantes descubiertas

### I-001 — Cross-domain reference, not copy

Cuando una entidad de un dominio participa en otro, el segundo dominio conserva una referencia estable y el tipo de relación; no clona el objeto autoritativo.

Ejemplo:

```text
Agronomy.AgriculturalOperation
        ↑ referenced by
ContractorOps.ContractorJob
        ↑ referenced by
HarvestGrain.HarvestOperation
        ↑ linked to
Transport.Trip
```

### I-002 — Temporal composition

Equipo, operador, vehículo, implemento y despliegue pueden cambiar durante una operación.

Toda composición operacional que pueda cambiar debe expresar, cuando corresponda:
- vigencia desde;
- vigencia hasta;
- rol;
- recurso/persona;
- motivo de cambio;
- procedencia de la modificación.

No se debe reconstruir historia sólo a partir del estado actual.

### I-003 — Grain identity survives movement

Una transferencia no crea “grano nuevo”.

El flujo debe poder preservar identidad de origen y cadena de custodia desde:
- campaña/cultivo/lote;
- cosecha;
- cosechadora;
- monotolva;
- carga;
- almacenamiento o transporte;
- descarga;
- peso final.

Se incorpora el concepto **GrainBatch** como identidad lógica/física del material cosechado. Puede dividirse o combinarse, preservando relaciones de procedencia.

### I-004 — Reconciliation is first-class

La conciliación no es un cálculo descartable.

Debe registrar:
- inputs;
- procedencia de cada input;
- unidad;
- método;
- diferencia absoluta/relativa;
- tolerancia;
- estado;
- observaciones;
- correcciones;
- responsable y fecha.

Para cosecha se incorpora **GrainReconciliation**.

### I-005 — Downtime can point to blocker

Una parada debe poder responder no sólo “por qué”, sino también “qué la bloqueó”.

Ejemplos:
- cosechadora esperando monotolva;
- monotolva esperando camión;
- camión esperando descarga;
- sembradora detenida por reparación;
- cuadrilla detenida por clima.

El bloqueo puede referenciar recurso, operación, dependencia o causa externa.

### I-006 — Correction does not erase evidence

Correcciones humanas o sincronizaciones tardías no deben borrar silenciosamente el dato previo.

Cuando un dato crítico cambia:
- se conserva el valor anterior;
- se registra la corrección;
- se identifica quién/cuándo;
- se conserva razón/procedencia;
- el sistema distingue valor vigente de historia.

Esto no obliga a event sourcing global.

### I-007 — External document lifecycle is explicit

Un documento oficial preparado dentro de SURKARA no equivale a un documento autorizado externamente.

Estados conceptuales mínimos:
- draft;
- prepared;
- submitted;
- authorized;
- rejected;
- cancelled/annulled;
- expired, cuando corresponda.

La autoridad final permanece en el sistema externo.

### I-008 — Offline mutation identity

Toda mutación creada offline debe tener identidad estable generada en origen.

Como mínimo:
- `client_operation_id` o equivalente;
- dispositivo/actor;
- timestamp local;
- tipo de operación;
- versión/base conocida cuando corresponda;
- clase de conflicto;
- estado de sincronización.

El objetivo es idempotencia y detección de conflicto, no imponer una tecnología específica.

## 5. Nuevos conceptos para v0.3

### Shared Platform

**DomainReference**
- domain;
- entity_type;
- entity_id;
- relation_type;
- optional effective interval.

Es un contrato conceptual para vincular dominios sin crear una tabla universal ni duplicar autoridad.

**EffectiveAssignment**
- subject/resource;
- role;
- valid_from;
- valid_to;
- source/reason.

Puede ser implementado por cada dominio o infraestructura compartida según arquitectura futura.

### Harvest & Grain

**GrainBatch**
- identidad del material;
- campaign/crop/field provenance;
- quantity observations;
- parent/child relationships ante división o mezcla;
- custody/location references;
- status.

**GrainReconciliation**
- subject/batch/load/trip scope;
- estimated quantity;
- transferred quantity;
- weighed quantity;
- sources/provenance;
- difference;
- tolerance;
- status;
- corrections/evidence.

### Operational Coordination

**BlockingReference**
- bloqueador;
- tipo;
- intervalo;
- vínculo a Downtime/WaitingTime;
- evidencia opcional.

No se crea un “motor universal de dependencias”; se define una relación operacional observable.

## 6. Límites que se mantienen

El stress test **no justifica**:

- un `Work` universal;
- una única máquina de estados;
- convertir todos los movimientos físicos en InventoryMovement;
- convertir GrainTransfer en Trip;
- tratar animales como Assets;
- mezclar telemetría cruda con eventos de dominio;
- reemplazar documentos oficiales por estados internos;
- adoptar event sourcing general;
- adoptar CRDT por anticipado;
- separar en microservicios antes de validar uso real.

## 7. Consecuencias para el primer vertical slice

El primer slice debe demostrar de extremo a extremo:

```text
AgriculturalOperation
  ↓ explicit reference
ContractorJob
  ↓
HarvestOperation
  ↓
HarvestTeam [effective composition]
  ↓
HarvestSession
  ↓
GrainBatch
  ↓
GrainTransfer
  ↓
Load / TemporaryStorage
  ↓
Trip when applicable
  ↓
External Document lifecycle
  ↓
Unload / WeightRecord
  ↓
GrainReconciliation
  ↓
Cost / Settlement
```

En paralelo:

```text
FieldDeployment
  ↓
MobileCamp
  ↓
Crew rotations
  ↓
Supplies / Inventory
  ↓
Costs
```

## 8. Resultado

**Conclusión:** el dominio es suficientemente consistente para promover el Blueprint a v0.3 incorporando estos invariantes.

La promoción a v0.3 **no autoriza todavía** a elegir arquitectura técnica arbitrariamente. El siguiente paso posterior es derivar:
1. aggregate/ownership boundaries;
2. contratos entre dominios;
3. invariantes de persistencia;
4. estrategia offline/sync;
5. recién después, esquema técnico y migración del prototipo.
