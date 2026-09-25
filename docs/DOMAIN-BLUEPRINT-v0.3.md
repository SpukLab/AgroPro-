# SURKARA — Domain Blueprint v0.3

**Estado:** CANDIDATE — stress-tested; listo para derivación arquitectónica  
**Fecha:** 2026-09-24  
**Base:** Domain Blueprint v0.2 + Domain Stress Test v0.1  
**Propósito:** fijar los límites de dominio de SURKARA antes de rediseñar arquitectura, persistencia o interfaz.

> **Naming:** SURKARA es el nombre de producto de trabajo. El repositorio conserva temporalmente el nombre técnico heredado `SpukLab/AgroPro-` hasta completar las verificaciones marcarias, denominativas, fonéticas y de dominio correspondientes.

## 1. Visión

SURKARA es una **plataforma operacional agropecuaria de punta a punta**.

Debe conectar:

**planificación → ejecución → evidencia → conciliación → resultado**

a través de agricultura, contratistas, maquinaria, cosecha, logística y transporte, ganadería, feedlot, tambo, mantenimiento, inventarios, costos y soporte operativo de campaña.

SURKARA no intenta convertir todas estas actividades en un único modelo genérico. La plataforma comparte infraestructura operacional; cada dominio conserva sus propias entidades, reglas, estados y lenguaje.

## 2. Principio central

### Compartir infraestructura, no semántica

No se modelará:
- una vaca como un Asset;
- un lote como una Location genérica sin semántica agronómica;
- un viaje como la misma entidad que una siembra;
- un ordeñe como un Work indistinguible de una reparación.

Sí pueden compartir:
- responsables;
- asignaciones;
- tiempo;
- ubicación;
- evidencias;
- mediciones;
- incidencias;
- costos;
- documentos;
- auditoría;
- sincronización;
- procedencia.

## 3. Mapa general

```text
                         SURKARA

                    SHARED PLATFORM
────────────────────────────────────────────────
 Identity & Access
 Parties & Relationships
 Operational Coordination
 Operational Teams
 Field Deployment
 Spatial Infrastructure
 Equipment & Devices
 Measurement & Provenance
 Evidence & Documents
 Inventory Foundation
 Costing Foundation
 Offline & Sync
 Audit
 Integration Gateway
────────────────────────────────────────────────

       │              │               │
       ▼              ▼               ▼
   AGRONOMY     CONTRACTOR OPS     TRANSPORT
       │
       ├──────── HARVEST & GRAIN
       ├──────── LIVESTOCK
       ├──────── FEEDLOT
       ├──────── DAIRY
       ├──────── MAINTENANCE
       └──────── FIELD SUPPORT
```

Los dominios colaboran mediante contratos y referencias; no comparten internamente un único modelo.

## 4. Shared Platform

### 4.1 Identity & Access

Responsable de:
- cuentas;
- autenticación;
- sesiones;
- permisos;
- roles;
- dispositivos autorizados.

No contiene reglas de agricultura, transporte o ganadería.

### 4.2 Parties & Relationships

Representa quién participa:
- persona;
- organización;
- cliente;
- proveedor;
- contratista;
- transportista;
- asesor;
- veterinario;
- contador.

Una misma persona u organización puede participar con distintos roles según operación, cliente o período.

Conceptos:
- Membership
- Relationship
- Participation
- Scope
- Permission

`organization_id` puede continuar existiendo como partición/base de tenancy, pero no será el único mecanismo de pertenencia.

### 4.3 Operational Coordination

No contiene un Work universal.

Provee mecanismos compartidos para coordinar operaciones creadas por otros dominios:
- Assignment
- ResponsibleParty
- ResourceAllocation
- Schedule
- OperationalStatus
- Dependency
- Incident reference

Una AgriculturalOperation, un Trip, una FeedingRound y una MilkingSession pueden participar de esta infraestructura sin convertirse en la misma entidad.

### 4.4 Operational Teams

Una operación puede ser ejecutada por una **unidad operacional compuesta**, no por un único activo.

Ejemplos:
- equipo de cosecha;
- cuadrilla de siembra;
- equipo de pulverización;
- equipo de mantenimiento;
- cuadrilla de manga.

Un Operational Team puede contener:
- personas;
- máquinas;
- implementos;
- vehículos;
- dispositivos;
- recursos auxiliares.

Su composición puede variar por jornada o campaña.

### 4.5 Field Deployment

Representa el desplazamiento temporal de personas, equipos y recursos fuera de su base habitual.

Conceptos:
- Deployment
- CrewDeployment
- ResourceDeployment
- TemporaryBase
- Rotation
- Arrival / Departure
- SupportRequirement

Permite responder:
- quién está desplegado;
- dónde;
- desde cuándo;
- hasta cuándo;
- con qué equipo;
- bajo qué campaña/servicio;
- qué soporte requiere.

### 4.6 Spatial Infrastructure

Provee primitivas geográficas:
- punto;
- línea;
- polígono;
- geofence;
- posición;
- recorrido.

Los dominios conservan el significado:

- Agronomy → Field / Plot / ManagementZone
- Livestock → Paddock
- Feedlot → Pen
- Transport → Route / Stop
- Dairy → Facility
- Field Support → TemporaryBase / MobileCamp

Spatial sabe que existe una geometría; el dominio sabe qué significa.

### 4.7 Equipment & Devices

Incluye:
- tractor;
- cosechadora;
- sembradora;
- pulverizadora;
- monotolva;
- camión;
- automóvil;
- mixer;
- balanza;
- lector RFID;
- sensor;
- estación meteorológica;
- generador.

**Los animales quedan explícitamente excluidos de Equipment/Asset.**

### 4.8 Measurement & Provenance

Toda medición importante debe registrar:
- valor;
- unidad;
- momento;
- sujeto;
- origen;
- procedencia;
- calidad/confianza cuando corresponda.

Procedencia mínima:
- manual;
- sensor;
- máquina;
- GPS;
- RFID;
- importado;
- API oficial;
- calculado;
- estimado;
- corregido por humano.

Un dato calculado nunca debe presentarse como medición directa.

### 4.9 Evidence & Documents

**Evidence**
- foto;
- firma;
- ubicación;
- ticket;
- observación;
- lectura;
- archivo producido por máquina.

**Document**
- CPE;
- DT-e;
- receta;
- factura;
- remito;
- certificado;
- contrato;
- liquidación.

Los documentos externos mantienen su autoridad externa. SURKARA conserva representación, estado, vínculo y evidencia.

### 4.10 Inventory Foundation

Provee:
- productos;
- unidades;
- depósitos;
- ubicaciones;
- lotes;
- movimientos;
- reservas;
- ajustes.

Usos especializados:
- Agronomy → semillas, fertilizantes, fitosanitarios;
- Feedlot → maíz, silo, núcleo, suplementos;
- Maintenance → filtros, correas, aceites, repuestos;
- Field Support → alimentos, agua, higiene, botiquín, gas, combustible auxiliar;
- Transport → combustible y lubricantes.

### 4.11 Costing Foundation

Permite imputar costos operacionales a:
- operación;
- máquina;
- persona;
- lote;
- viaje;
- animal/tropa;
- cliente;
- campaña;
- despliegue;
- base móvil.

Ejemplos:
- combustible;
- mano de obra;
- repuesto;
- servicio;
- peaje;
- insumo;
- mantenimiento;
- alojamiento;
- vianda;
- suministros de casilla.

No reemplaza un ERP contable.

### 4.12 Offline & Sync

Offline-first es fundacional.

Un dispositivo podrá conservar localmente:
- operaciones activas;
- asignaciones;
- mapas relevantes;
- mediciones;
- fotografías;
- GPS;
- incidencias;
- combustible;
- sesiones de manga;
- cargas;
- movimientos de inventario;
- datos de despliegue.

Estados visibles:
- ✓ Confirmado
- ↑ Pendiente
- ⟳ Sincronizando
- ⚠ Conflicto

Cada operación local debe tener identidad propia e idempotencia para evitar duplicación.

### 4.13 Cross-domain References

Los dominios se vinculan mediante **referencias explícitas**, no copiando entidades autoritativas.

Contrato conceptual: **DomainReference**
- domain;
- entity_type;
- entity_id;
- relation_type;
- effective interval cuando corresponda.

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

Una referencia entre dominios:
- no cambia la autoridad del dato;
- no crea una entidad universal;
- permite trazabilidad entre procesos;
- evita duplicar cliente, lote, operación, carga o documento.

### 4.14 Temporal Assignments

La composición de equipos, cuadrillas, vehículos y responsables puede cambiar durante una operación.

Toda asignación operacional que pueda variar debe expresar, cuando corresponda:
- recurso/persona;
- rol;
- vigencia desde;
- vigencia hasta;
- fuente o razón del cambio.

Concepto: **EffectiveAssignment**.

El estado actual nunca debe ser la única fuente para reconstruir quién operaba una máquina, integraba una cuadrilla o estaba asignado a un viaje en un momento pasado.

## 5. Política de conflictos offline

### Clase A — hechos independientes
Ejemplos: foto, pesada, lectura RFID, posición GPS.  
**Política:** conservar ambos.

### Clase B — actualización simple
Ejemplos: comentario, descripción.  
**Política:** conciliación automática cuando sea segura.

### Clase C — estado operacional
Ejemplo: dos operadores intentan finalizar la misma operación.  
**Política:** detectar concurrencia y validar; nunca ocultar el conflicto.

### Clase D — inventario
Ejemplo: dos dispositivos consumen offline el mismo stock.  
**Política:** registrar movimientos independientes y reconciliar disponibilidad; no usar last-write-wins.

### Clase E — acciones regulatorias
Ejemplos: emitir CPE, DT-e, facturación fiscal.  
**Política:** pueden prepararse offline; la ejecución final requiere conexión y confirmación externa.

### Identidad de mutación offline

Toda mutación creada offline debe contar con identidad estable generada en origen para permitir idempotencia y detección de conflicto.

Conceptualmente debe poder conservar:
- identificador local único;
- actor/dispositivo;
- timestamp local;
- tipo de operación;
- versión/base conocida cuando corresponda;
- clase de conflicto;
- estado de sincronización.

La estrategia concreta se decidirá en arquitectura; este requisito no implica CRDT ni event sourcing.

## 6. Eventos

Se distinguen cuatro conceptos:

### Domain Event
Hecho de negocio relevante:
- AgriculturalOperationStarted
- MachineStopped
- GrainTransferred
- LoadCreated
- TripDeparted
- AnimalWeighed
- TreatmentApplied
- MilkingCompleted
- CampRelocated

### Audit Event
Quién modificó qué y cuándo.

### Telemetry
Flujo técnico de alta frecuencia:
- GPS;
- RPM;
- temperatura;
- caudal;
- velocidad.

### Event Sourcing
No se adopta como arquitectura general. Solo podrá evaluarse en un subdominio si existe necesidad demostrable.

## 7. AGRONOMY

Autoridad sobre:
- establecimiento agrícola;
- campo;
- lote;
- ambiente;
- campaña;
- cultivo;
- planificación;
- prescripción;
- labor;
- aplicación;
- siembra;
- fertilización;
- pulverización;
- cosecha agronómica;
- rendimiento.

Objeto conceptual central: **Agricultural Operation**.

Ejemplos:
- preparar suelo;
- arar;
- sembrar;
- fertilizar;
- pulverizar;
- cosechar.

Cada tipo conserva sus propios datos e invariantes.

## 8. CONTRACTOR OPERATIONS

Representa una empresa que ejecuta servicios para terceros.

Entidades:
- ServiceRequest
- ServiceAgreement
- ContractorJob
- Crew
- MachineAssignment
- WorkSession
- Downtime
- ServiceSettlement

Una operación puede extenderse durante múltiples jornadas y cambiar de composición.

```text
Trabajo
 ├─ Jornada 1
 ├─ Jornada 2
 ├─ Jornada 3
 └─ Conciliación
```

Debe permitir conocer:
- hectáreas;
- horas;
- operadores;
- máquinas;
- combustible;
- incidencias;
- tiempo improductivo;
- causa y, cuando corresponda, recurso/dependencia bloqueante;
- costos;
- recursos de soporte.

## 9. HARVEST & GRAIN

Funciona como puente entre Agronomy y Transport.

Entidades:
- HarvestOperation
- HarvestTeam
- HarvestSession
- GrainBatch
- GrainTransfer
- Load
- TemporaryStorage
- SiloBag
- WeightRecord
- MoistureRecord
- DestinationAllocation
- GrainReconciliation

### 9.1 Harvest Team

La unidad operativa real de cosecha puede incluir:

```text
Harvest Team
├─ Cosechadora 1
├─ Tractor 1
│  └─ Monotolva 1
├─ Cosechadora 2
├─ Tractor 2
│  └─ Monotolva 2
├─ Operadores
└─ Field Deployment / Mobile Camp
```

La composición es explícita y versionable por jornada o intervalo efectivo. Debe poder reconstruirse qué personas, máquinas e implementos integraban realmente el equipo en cualquier tramo de la operación.

### 9.2 Grain Transfer

El grano puede atravesar varias transferencias antes de salir del campo:

```text
Cultivo en lote
      ↓
Cosechadora
      ↓
Monotolva
      ├──→ Camión → Acopio / Puerto
      ├──→ Silo del propietario
      └──→ Silobolsa
```

Cada GrainTransfer registra:
- GrainBatch o identidad de material relacionada;
- origen;
- destino;
- hora;
- cantidad;
- unidad;
- procedencia de la cantidad;
- operador/responsable;
- evidencia cuando exista.

Esto permite distinguir:
- cantidad estimada por monitor;
- cantidad transferida;
- peso de balanza;
- diferencia final conciliada.

También permite medir cuellos de botella:
- cosechadora esperando monotolva;
- monotolva esperando camión;
- camión esperando carga;
- camión esperando descarga.

### 9.3 Grain Batch

**GrainBatch** preserva la identidad lógica/física del grano a través de cosecha, transferencias, carga, almacenamiento y descarga.

Debe poder vincular:
- campaña;
- cultivo;
- lote/origen;
- operación/sesión de cosecha;
- observaciones de cantidad;
- ubicación o custodia actual;
- divisiones;
- combinaciones;
- batch padre/hijo;
- evidencia y procedencia.

Dividir o combinar material no debe borrar su linaje.

### 9.4 Grain Reconciliation

**GrainReconciliation** es una entidad explícita, no un cálculo efímero.

Puede conciliar:
- cantidad estimada por monitor;
- cantidad transferida;
- peso de balanza;
- peso/ticket de descarga;
- correcciones posteriores.

Debe conservar:
- inputs y procedencia;
- unidad;
- método;
- diferencia absoluta/relativa;
- tolerancia;
- estado;
- evidencia;
- correcciones;
- responsable y fecha.

Una corrección nunca transforma retroactivamente una estimación en medición directa.

## 10. TRANSPORT & LOGISTICS

Autoridad sobre:
- Trip;
- VehicleAssignment;
- DriverAssignment;
- Cargo;
- Origin;
- Destination;
- Route;
- Stop;
- Dispatch;
- WaitingTime;
- Delivery;
- TransportSettlement.

Estados posibles:
- planned
- assigned
- loading
- loaded
- departed
- waiting
- unloading
- delivered
- closed
- cancelled

No deben reutilizarse automáticamente como estados de una labor agrícola.

## 11. CPE

La CPE pertenece al flujo logístico/documental.

```text
Load
 ↓
Trip
 ↓
CPE Draft Data
 ↓
Validation
 ↓
ARCA
 ↓
Authorized CPE
 ↓
Transport
 ↓
Arrival / Unload
```

SURKARA nunca debe confundir **CPE preparada** con **CPE autorizada**.

## 12. LIVESTOCK

Autoridad sobre:
- Animal;
- AnimalIdentity;
- RFID;
- Herd;
- Category;
- PaddockAssignment;
- Weight;
- Health;
- Reproduction;
- Movement;
- Treatment;
- AnimalLifecycle.

Animal es una entidad de dominio propia.

Eventos especializados:
- Born
- Tagged
- Weighed
- Vaccinated
- Treated
- Moved
- PregnancyChecked
- Weaned
- Sold
- Died

## 13. FEEDLOT

Autoridad sobre:
- FeedlotBatch;
- Pen;
- Diet;
- FeedingPlan;
- FeedingRound;
- IngredientLoad;
- DeliveredFeed;
- Refusal;
- Conversion;
- FeedlotCycle.

No es simplemente Livestock + Inventory.

## 14. DAIRY

Autoridad sobre:
- Lactation;
- MilkingSession;
- MilkMeasurement;
- MilkTank;
- QualityMeasurement;
- DryPeriod;
- MilkWithdrawal;
- DairyTreatment.

Un ordeñe no se modelará simplemente como Work.

## 15. MAINTENANCE

Autoridad sobre:
- MaintenancePlan;
- MaintenanceOrder;
- Failure;
- Repair;
- PartUsage;
- ServiceInterval;
- DowntimeCause;
- MaintenanceCost.

Puede servir a maquinaria agrícola, transporte, equipos de feedlot, instalaciones y base móvil.

## 16. FIELD SUPPORT

Representa la logística que permite que una cuadrilla permanezca y opere fuera de su base habitual.

### 16.1 Mobile Camp / Casilla

La casilla es una **base móvil de campaña**, no un gasto suelto.

Puede registrar:
- ubicación actual;
- campaña/servicio;
- cuadrilla alojada;
- llegada;
- salida prevista;
- capacidad;
- energía/generador;
- agua;
- conectividad;
- herramientas;
- botiquín;
- suministros.

### 16.2 Camp Supplies

Categorías típicas:
- alimentos;
- agua;
- higiene;
- gas;
- combustible auxiliar;
- medicamentos básicos;
- herramientas;
- repuestos;
- ropa/elementos de trabajo.

Los movimientos consumen Inventory Foundation y Costing Foundation.

### 16.3 Crew Support

Debe permitir:
- cantidad de personas presentes;
- viandas/comidas necesarias;
- turnos y descansos;
- rotaciones;
- reemplazos;
- viajes de retorno;
- anticipos/gastos operativos;
- proveedores locales;
- necesidades pendientes.

No es un sistema de vigilancia personal; registra logística necesaria para sostener la operación.

## 17. Autoridad de datos

| Información | Autoridad |
|---|---|
| Usuario/permisos | Identity |
| Relaciones entre empresas | Parties |
| Lote/cultivo | Agronomy |
| Labor agronómica | Agronomy |
| Ejecución contratista | Contractor Ops |
| Equipo operativo | Operational Teams |
| Despliegue de campaña | Field Deployment |
| Casilla/suministros | Field Support |
| Máquina/dispositivo | Equipment |
| Mantenimiento | Maintenance |
| Transferencia interna de grano | Harvest & Grain |
| Viaje | Transport |
| Carga | Harvest & Grain / Transport según fase |
| CPE oficial | ARCA |
| Animal | Livestock |
| RFID | Livestock + registro oficial cuando corresponda |
| Dieta | Feedlot |
| Ordeñe | Dairy |
| Stock | Inventory |
| Costo operacional | Costing |
| GPS | dispositivo/telemetría |
| Clima | proveedor externo/estación |

Los demás contextos consumen esta información; no crean una segunda autoridad.

## 18. Corrección, historia y procedencia

Los datos críticos no deben corregirse mediante sobrescritura silenciosa.

Cuando una medición, cantidad, asignación o estado crítico sea corregido:
- se conserva el valor previo;
- se registra la corrección;
- se identifica actor y momento;
- se conserva motivo/procedencia;
- se distingue valor vigente de historia.

Esto es un requisito de trazabilidad; no implica adoptar event sourcing como arquitectura global.

## 19. Protocolo operacional compartido

Todos los dominios operacionales deberían poder expresar, cuando corresponda:

- qué debe ocurrir;
- quién participa;
- qué equipo/grupo operacional interviene;
- qué recursos utiliza;
- dónde ocurre;
- cuándo estaba previsto;
- cuándo ocurrió realmente;
- qué mediciones produjo;
- qué evidencias existen;
- qué incidencias ocurrieron;
- qué recursos consumió;
- qué costo produjo;
- qué resultado dejó.

Es un contrato conceptual, no una tabla común.

## 20. Plan → Execution → Evidence → Result

Patrón principal de SURKARA.

Ejemplo de siembra:

```text
PLAN
180 ha
72.000 semillas/ha

EXECUTION
178,4 ha
74.200 semillas/ha

EVIDENCE
GPS
monitor sembradora
fotos

INCIDENTS
42 min detenido

RESOURCES
tractor
sembradora
operador
semilla
gasoil

RESULT
costo/ha
tiempo/ha
consumo/ha
```

El mismo patrón puede aplicarse con semántica propia a cosecha, transporte, alimentación, manga, mantenimiento y ordeñe.

## 21. Primer vertical slice

La primera implementación completa deberá atravesar:

**Agriculture + Contractor + Harvest + Logistics + Field Support**

```text
Cliente
 ↓
Establecimiento
 ↓
Lote
 ↓
Campaña
 ↓
Labor
 ↓
Planificación
 ↓
Operational Team
 ↓
Field Deployment / Casilla
 ↓
Ejecución offline
 ↓
Partes diarios
 ↓
Paradas
 ↓
Combustible
 ↓
Incidentes
 ↓
Cosecha
 ↓
Cosechadora → Monotolva
 ↓
Grain Transfer
 ↓
GrainBatch / cadena de custodia
 ↓
Camión / Silo / Silobolsa
 ↓
Trip
 ↓
CPE
 ↓
Descarga
 ↓
Ticket
 ↓
GrainReconciliation
 ↓
Costo
 ↓
Liquidación
```

## 22. Flujos obligatorios para validar el dominio

El diseño debe representar correctamente:

1. sembrar 180 ha durante dos jornadas;
2. fertilizar con receta y dosis variable;
3. cosechar con dos cosechadoras;
4. operar cosechadora + tractor + monotolva como equipo;
5. transferir grano cosechadora → monotolva → camión;
6. descargar cosecha en silo del propietario en lugar de transporte externo;
7. registrar una máquina detenida esperando monotolva o camión;
8. registrar combustible y horas;
9. generar reparación desde un incidente;
10. viaje + CPE + descarga;
11. conciliar kilos estimados, transferidos y pesados;
12. desplegar cuadrilla con casilla durante varias semanas;
13. gestionar alimentos, agua, repuestos y gastos de la base móvil;
14. rotar o reemplazar un operador durante campaña;
15. sesión de manga con RFID y pesada offline;
16. alimentación diaria de un corral;
17. ordeñe con mediciones individuales y tanque.

Si alguno obliga a romper los límites anteriores, el Blueprint debe revisarse antes de construir.

## 23. DAHZEA Boundary

DAHZEA será un cliente externo autorizado de SURKARA.

Puede realizar:

### Query
“¿Cuántas hectáreas faltan?”

### Suggestion
“Parece conveniente enviar otro camión.”

### Draft Command
“Preparar una asignación del camión 12.”

### Command
Enviar una solicitud estructurada a SURKARA.

### Sensitive Action
Requiere política y, cuando corresponda, confirmación humana.

Ejemplos:
- emitir documento fiscal;
- modificar stock crítico;
- cerrar una operación;
- registrar tratamiento sanitario;
- cambiar una asignación activa crítica.

Flujo:

```text
DAHZEA
  ↓
Structured Command
  ↓
SURKARA Policy
  ↓
Validation
  ↓
Human confirmation if required
  ↓
Execution
  ↓
Audit
  ↓
Result returned to DAHZEA
```

DAHZEA nunca escribe directamente sobre tablas operativas.

## 24. No objetivos actuales

No se decidirá todavía:
- microservicios;
- GraphQL;
- event sourcing;
- CRDT;
- vector clocks;
- bases columnares;
- blockchain;
- motor propio de telemetría;
- integración directa con todos los fabricantes;
- optimización automática de rutas;
- dispatch estilo Uber;
- ERP contable completo.

Primero se valida el dominio.

## 25. Decisiones adoptadas

**DB-001** SURKARA será una plataforma multi-dominio, no una aplicación monolítica de cosecha.  
**DB-002** Los dominios especializados conservan autoridad semántica.  
**DB-003** No existirá una entidad universal que represente todas las operaciones.  
**DB-004** Asset/Equipment no incluye animales.  
**DB-005** Offline-first es una propiedad fundacional.  
**DB-006** Toda información operacional crítica tendrá procedencia.  
**DB-007** Datos medidos, estimados y calculados serán distinguibles.  
**DB-008** Las relaciones multiempresa serán contextuales, no solamente `organization_id`.  
**DB-009** Documentos externos mantienen su autoridad externa.  
**DB-010** DAHZEA opera mediante contratos de consulta/comando, nunca acceso directo a datos críticos.  
**DB-011** Real-time se utilizará únicamente donde exista necesidad operacional.  
**DB-012** El primer vertical slice será Agricultura + Contratistas + Cosecha + Logística.  
**DB-013** Una operación puede ejecutarse mediante un Operational Team compuesto por múltiples personas, máquinas, implementos y recursos.  
**DB-014** SURKARA modelará explícitamente Field Deployment & Support: cuadrillas desplazadas, base móvil/casilla, suministros, rotaciones y costos de soporte.  
**DB-015** Harvest & Grain modelará Grain Transfer explícito entre cosechadora, monotolva, camión, silo y silobolsa, preservando cantidad, procedencia y evidencia.  
**DB-016** Los vínculos entre dominios usarán referencias explícitas; consumir una entidad no transfiere su autoridad ni habilita su duplicación.  
**DB-017** La composición de equipos, cuadrillas y asignaciones relevantes será temporal/versionable.  
**DB-018** Harvest & Grain preservará identidad y linaje del material mediante GrainBatch, incluyendo divisiones y combinaciones.  
**DB-019** La conciliación física será de primer nivel; GrainReconciliation conservará inputs, procedencia, diferencias, tolerancias y correcciones.  
**DB-020** Las correcciones de datos críticos preservarán historia y procedencia; no habrá sobrescritura silenciosa como política de dominio.  
**DB-021** Los documentos externos tendrán lifecycle explícito y mantendrán autoridad externa.  
**DB-022** Toda mutación offline tendrá identidad estable para idempotencia y detección de conflictos.  
**DB-023** Downtime/WaitingTime podrá referenciar el recurso, operación, dependencia o causa externa que produjo el bloqueo.

## 26. Hipótesis principal

SURKARA debe poder responder:

1. ¿Qué estaba previsto hacer?
2. ¿Qué se hizo realmente?
3. ¿Con qué personas, equipo y recursos?
4. ¿Qué ocurrió durante el trabajo?
5. ¿Cómo se movió físicamente el producto o resultado?
6. ¿Qué soporte necesitó la operación para mantenerse activa?
7. ¿Qué resultado físico y económico produjo?

Si la plataforma responde estas preguntas de manera confiable, offline, trazable y entre dominios, existe una base suficientemente sólida para expandir SURKARA.


## 27. Gate para derivación arquitectónica

El Domain Stress Test v0.1 verificó los 17 flujos obligatorios y no encontró una contradicción que requiera romper los límites principales.

Por lo tanto, v0.3 habilita el siguiente trabajo, en este orden:

1. definir aggregate/ownership boundaries;
2. definir contratos explícitos entre dominios;
3. fijar invariantes de persistencia;
4. diseñar estrategia offline/sync y resolución de conflictos;
5. seleccionar arquitectura técnica mínima que satisfaga esos contratos;
6. diseñar persistencia;
7. migrar el prototipo por vertical slice, no por reescritura total.

La arquitectura futura deberá demostrar que preserva DB-001 a DB-023.
