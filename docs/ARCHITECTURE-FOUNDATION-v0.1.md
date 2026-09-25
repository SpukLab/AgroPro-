# SURKARA — Architecture Foundation v0.1

**Fecha:** 2026-09-24  
**Base:** Domain Blueprint v0.3  
**Estado:** CANDIDATE — architecture derivation  
**Objetivo:** convertir el dominio validado en límites de ownership, aggregates y contratos implementables sin diseñar todavía el esquema físico de base de datos.

## 1. Principio estructural

SURKARA se implementará inicialmente como un **modular monolith con fronteras de dominio explícitas**.

Esto significa:
- un único producto/despliegue de backend puede contener varios módulos;
- cada módulo conserva ownership de sus entidades y reglas;
- ningún módulo lee/escribe tablas internas de otro como contrato de negocio;
- los cruces se hacen mediante contratos de aplicación, referencias estables y read models;
- la separación lógica debe permitir extraer un módulo en el futuro sólo si aparece una necesidad real.

No se adopta microservicios por anticipado.

## 2. Capas

```text
Mobile / PWA
    ↓
Application Commands & Queries
    ↓
Domain Modules
    ↓
Persistence / Sync / External Adapters
```

### 2.1 UI / PWA
Responsable de:
- interacción;
- cache local;
- captura offline;
- cola de operaciones pendientes;
- estado de sincronización;
- evidencia local temporal.

No contiene autoridad de negocio definitiva.

### 2.2 Application Layer
Responsable de:
- comandos;
- queries;
- autorización contextual;
- orquestación entre módulos;
- idempotencia;
- validación previa;
- composición de read models.

No debe saltarse reglas de dominio.

### 2.3 Domain Modules
Contienen:
- entidades;
- aggregates;
- invariantes;
- estados;
- políticas;
- contratos publicados.

### 2.4 Adapters
Incluyen:
- persistencia;
- autenticación;
- storage;
- integraciones oficiales;
- sensores;
- import/export;
- telemetría;
- proveedores externos.

Un adapter nunca redefine la autoridad semántica del dominio.

## 3. Regla de ownership

**Sólo el módulo dueño puede mutar una entidad autoritativa.**

Otros módulos pueden:
- referenciarla;
- leer una proyección publicada;
- solicitar una acción mediante un contrato;
- reaccionar a un resultado.

No pueden:
- clonar el objeto y asumir autoridad;
- modificar su persistencia directamente;
- inferir un estado autoritativo a partir de una copia desactualizada.

## 4. Shared Platform — aggregates y responsabilidades

### 4.1 Parties

Aggregate roots:
- **Party**
- **PartyRelationship**

Party representa persona u organización.
PartyRelationship representa relaciones contextuales y temporales entre partes.

Invariantes:
- un rol no convierte a una persona en una entidad distinta;
- una relación puede tener vigencia;
- tenancy y relación comercial no son lo mismo;
- una organización no obtiene acceso a otra sólo por compartir una operación.

### 4.2 Equipment

Aggregate root:
- **Equipment**

Responsable de identidad y características relativamente estables del recurso:
- tipo;
- marca/modelo;
- identificadores;
- propietario;
- estado registral;
- capacidades.

No es dueño de:
- asignación a una operación;
- mantenimiento;
- telemetría histórica;
- combustible consumido;
- productividad.

### 4.3 Operational Teams

Aggregate root:
- **OperationalTeam**

Children/value objects:
- TeamCompositionRevision
- TeamMemberAssignment

Invariantes:
- la composición tiene vigencia;
- una revisión no borra la anterior;
- personas, máquinas e implementos conservan su identidad externa;
- el equipo no se convierte en dueño de los recursos que agrupa.

### 4.4 Field Deployment

Aggregate root:
- **FieldDeployment**

Incluye:
- período;
- campaña/servicio relacionados;
- personas desplegadas;
- recursos desplegados;
- TemporaryBase reference;
- rotaciones.

La composición efectiva debe reconstruirse históricamente.

### 4.5 Measurements & Provenance

Aggregate/record root:
- **MeasurementRecord**

Preferencia: registro append-oriented.

Campos conceptuales:
- subject reference;
- metric;
- value;
- unit;
- observed_at;
- provenance;
- quality/confidence;
- source reference;
- correction/supersession relation when applicable.

Una medición corregida no desaparece.

### 4.6 Evidence

Aggregate/record root:
- **EvidenceRecord**

Puede representar:
- foto;
- firma;
- ticket;
- posición;
- archivo;
- lectura;
- observación documentada.

Debe poder existir localmente antes de que el binario quede sincronizado.

### 4.7 External Documents

Aggregate root:
- **ExternalDocumentRecord**

Conserva:
- document type;
- related domain references;
- external authority;
- draft/prepared data;
- external identifier;
- observed status;
- evidence;
- timestamps.

No es dueño del acto oficial externo.

### 4.8 Inventory Foundation

Aggregate roots conceptuales:
- **InventoryItem**
- **InventoryLocation**
- **InventoryMovement**

Regla:
- el stock es una proyección de movimientos conciliados;
- no se usa last-write-wins para consumos concurrentes;
- los dominios consumidores aportan motivo/contexto, no reimplementan stock.

### 4.9 Costing Foundation

Aggregate/record roots:
- **CostEntry**
- **CostAllocation**

CostEntry conserva el hecho económico operacional.
CostAllocation distribuye ese costo entre referencias de dominio cuando corresponda.

No sustituye contabilidad fiscal.

## 5. AGRONOMY

Aggregate roots iniciales:
- **Establishment**
- **Field**
- **Campaign**
- **AgriculturalOperation**

### AgriculturalOperation

Es la autoridad sobre la intención y resultado agronómico de una labor.

Debe conservar:
- operation type;
- field/campaign;
- planned window;
- planned area;
- prescription/reference cuando corresponda;
- agronomic status;
- execution references;
- result summary.

Invariantes:
- planificado y ejecutado son conceptos distintos;
- una operación puede ejecutarse en varias jornadas;
- superficie estimada, GPS y superficie conciliada no se confunden;
- ContractorJob puede ejecutar la labor, pero no pasa a ser dueño de AgriculturalOperation.

## 6. CONTRACTOR OPERATIONS

Aggregate roots:
- **ServiceAgreement**
- **ContractorJob**
- **WorkSession**
- **DowntimeRecord**
- **ServiceSettlement**

### ContractorJob

Representa el compromiso operacional/comercial de ejecutar un servicio.

Referencia:
- cliente;
- ServiceAgreement;
- AgriculturalOperation cuando exista;
- OperationalTeam;
- FieldDeployment.

No copia Field/Campaign.

### WorkSession

Unidad efectiva de ejecución por jornada/tramo.

Debe poder capturarse offline.

Conserva:
- start/end;
- effective team composition reference;
- equipment references;
- area/time observations;
- fuel/resource references;
- incidents;
- downtime references.

### DowntimeRecord

Conserva:
- intervalo;
- cause;
- blocking reference cuando exista;
- operator note;
- evidence.

No se deduce únicamente desde telemetría.

## 7. HARVEST & GRAIN

Aggregate roots:
- **HarvestOperation**
- **HarvestSession**
- **GrainBatch**
- **GrainTransfer**
- **Load**
- **GrainReconciliation**

### HarvestOperation

Especializa la ejecución de cosecha y referencia:
- AgriculturalOperation;
- ContractorJob cuando exista;
- Field/Campaign mediante referencia autoritativa;
- HarvestTeam.

### HarvestSession

Tramo temporal concreto de cosecha.

Permite atribuir:
- equipo efectivo;
- máquina;
- operador;
- output observado;
- humedad;
- tiempos;
- incidentes.

### GrainBatch

Identidad del material cosechado.

Invariantes:
- debe conservar origen agronómico;
- puede dividirse;
- puede combinarse;
- parent/child lineage no puede formar ciclos;
- una combinación genera una nueva identidad derivada;
- las cantidades asociadas siempre indican procedencia.

### GrainTransfer

Hecho de movimiento físico entre dos holders/locations.

Debe incluir:
- source;
- destination;
- GrainBatch reference;
- quantity observation;
- unit;
- provenance;
- occurred_at;
- responsible party;
- evidence.

Invariantes:
- source y destination no pueden ser equivalentes;
- no transforma un estimado en peso real;
- no elimina el batch de origen; actualiza/proyecta custodia mediante relaciones explícitas.

### Load

Representa material preparado/cargado para transporte o entrega.

Contiene allocations a GrainBatch.
Puede existir antes de Trip.

### GrainReconciliation

Aggregate root independiente.

Conserva:
- scope;
- source inputs;
- estimates;
- transferred quantities;
- weighed quantities;
- tolerances;
- result;
- corrections.

Una nueva evidencia puede producir una nueva revisión/resultado sin borrar inputs previos.

## 8. TRANSPORT & LOGISTICS

Aggregate roots:
- **Trip**
- **TransportSettlement**

Trip conserva:
- vehicle assignment;
- driver assignment;
- origin;
- destination;
- load references;
- state;
- waiting periods;
- departure/arrival;
- delivery/unload evidence.

El transporte consume una referencia a Load; no muta directamente GrainBatch.

Cambios de chofer/vehículo se modelan con asignaciones temporales.

## 9. MAINTENANCE

Aggregate roots:
- **MaintenanceOrder**
- **FailureRecord**

Un incidente operacional puede solicitar:
- diagnóstico;
- orden;
- reparación.

El vínculo conserva la referencia al incidente fuente.
Maintenance no reescribe el incidente original.

## 10. FIELD SUPPORT

Aggregate roots:
- **MobileCamp**
- **CampSupplyRequirement**
- **CrewSupportRecord**

MobileCamp representa la base móvil.
FieldDeployment representa el despliegue.
Ambos se relacionan, pero no son la misma entidad.

Suministros usan Inventory.
Gastos usan Costing.

## 11. Contratos entre dominios

Los siguientes contratos son conceptuales. No implican REST, RPC ni eventos distribuidos.

### C-001 Agronomy → Contractor Ops: OperationExecutionContext

Publica lo mínimo necesario:
- agricultural_operation_id;
- field_id;
- campaign_id;
- operation_type;
- planned_area;
- planned_window;
- prescription reference;
- revision.

Contractor Ops guarda la referencia, no una copia autoritativa.

### C-002 Contractor Ops → Harvest: JobExecutionContext

- contractor_job_id;
- agricultural_operation_ref;
- effective team ref;
- active work session ref;
- client/service refs.

### C-003 Harvest → Transport: LoadHandoff

- load_id;
- GrainBatch allocations;
- origin;
- intended destination;
- observed quantity + provenance;
- custody handoff status;
- evidence refs.

Transport acepta el handoff y crea/asocia Trip.

### C-004 Transport → Harvest: UnloadResult

- trip_id;
- load_id;
- destination;
- arrived_at;
- unload_at;
- scale/ticket evidence;
- weighed quantity + provenance;
- external document refs.

Harvest & Grain usa este contrato como input para GrainReconciliation.

### C-005 Operational Incident → Maintenance: MaintenanceRequest

- source incident/downtime ref;
- equipment ref;
- observed symptom;
- severity;
- evidence refs;
- requested_at.

### C-006 Domain → Costing: CostInput

- source domain ref;
- cost type;
- amount/quantity;
- unit/currency;
- provenance;
- occurred_at;
- allocation hints.

### C-007 External document status

Todo módulo que dependa de un documento oficial consume:
- document record id;
- authority;
- external id;
- observed state;
- observed_at;
- evidence.

Ningún módulo interpreta `prepared` como `authorized`.

## 12. Cross-domain workflow rule

Una operación que cruza módulos se orquesta desde Application Layer.

Ejemplo:

```text
Create Load
  ↓
Harvest validates batch allocation
  ↓
Application requests Trip
  ↓
Transport creates Trip
  ↓
Document adapter prepares/submits CPE
  ↓
External status observed
  ↓
Trip continues
  ↓
Unload result returned
  ↓
Harvest reconciles
```

No se necesita una transacción distribuida global.

Si un paso falla:
- el paso previo conserva su estado válido;
- el error se hace visible;
- el workflow puede reintentarse idempotentemente;
- las compensaciones son explícitas.

## 13. Read models

La UI puede necesitar vistas que mezclen varios dominios.

Ejemplos:
- “Operación de hoy”;
- “Equipo de cosecha”;
- “Cargas esperando camión”;
- “Camiones esperando descarga”;
- “Campamento y suministros”;
- “Resultado de campaña”.

Estas vistas son **read models**, no nuevas autoridades.

Pueden denormalizar información para lectura siempre que:
- indiquen fuente/revisión cuando sea crítico;
- no se conviertan en punto de escritura cruzada;
- puedan reconstruirse desde fuentes autoritativas.

## 14. Transaction boundaries

Regla inicial:
- una transacción de negocio escribe en un aggregate owner;
- cross-domain orchestration usa comandos separados;
- idempotencia protege reintentos;
- audit/provenance acompaña cambios críticos.

Excepción:
infraestructura puramente técnica puede usar una transacción física más amplia si no rompe ownership lógico.

## 15. Concurrency

Cada aggregate mutable debe soportar control de versión/revisión.

Conceptualmente:
- client knows revision N;
- command proposes change;
- server validates against current revision;
- safe changes apply;
- conflicting state changes return conflict;
- no silent last-write-wins para clases C/D/E del Blueprint.

## 16. Qué NO representa este documento

No define todavía:
- tablas;
- columnas;
- ORM;
- REST endpoints;
- framework frontend;
- proveedor cloud;
- motor de cola;
- Postgres schema layout;
- RLS;
- formato final de IDs.

Eso se decide después del contrato offline/sync y del primer vertical slice.

## 17. Decisión para implementación inicial

La forma recomendada para el primer release es:

```text
SURKARA PWA
    ↓
Application API / Sync Gateway
    ↓
Modular Monolith
 ├─ Parties
 ├─ Agronomy
 ├─ Contractor Ops
 ├─ Harvest & Grain
 ├─ Transport
 ├─ Field Support
 ├─ Maintenance
 ├─ Inventory
 ├─ Costing
 └─ Evidence/Documents
    ↓
Transactional persistence
```

Motivo:
- menor complejidad operacional;
- transacciones locales simples;
- contratos de dominio siguen siendo visibles;
- facilita offline/sync;
- permite iterar con cliente real;
- evita pagar el costo de microservicios antes de tener volumen o límites operativos demostrados.

## 18. Gate siguiente

Antes de diseñar persistencia:
1. fijar Offline & Sync Contract v0.1;
2. fijar Vertical Slice 01;
3. verificar que sus comandos puedan respetar estos aggregate boundaries;
4. recién entonces mapear a almacenamiento y APIs.
