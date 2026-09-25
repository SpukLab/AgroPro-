# SURKARA — Project Context

> **Naming:** SURKARA es el nombre de producto de trabajo. El repositorio conserva temporalmente el nombre técnico heredado `SpukLab/AgroPro-` hasta completar las verificaciones formales de marca, denominación/fonética y dominios antes de consolidar branding o lanzamiento.

**Última actualización:** 2026-09-24  
**Estado:** Milestone A — offline/sync + contrato PostgreSQL validados / backend remoto pendiente  
**Repositorio:** SpukLab/AgroPro-

## 1. Propósito

SURKARA apunta a ser una **plataforma operacional agropecuaria de punta a punta**, no solamente una app de cosecha ni un ERP administrativo.

Patrón rector:

**planificación → ejecución → evidencia → conciliación → resultado**

Debe conectar agricultura, contratistas, maquinaria, cosecha, logística/transporte, ganadería, feedlot, tambo, mantenimiento, inventarios, costos y soporte de campaña, preservando las reglas especializadas de cada dominio.

## 2. Cliente inicial y laboratorio real

Cliente inicial de referencia: **Stepanosky Hermanos**, contratistas rurales de Trenque Lauquen, Buenos Aires.

El repositorio contiene dos generaciones claramente separadas:

### Prototipo histórico
- `index.html`;
- HTML/CSS/JS vanilla;
- comportamiento principal simulado en memoria del navegador;
- referencia útil de UX/casos de uso;
- no constituye backend ni arquitectura objetivo.

### Implementación nueva
- `app/`;
- React + TypeScript + Vite PWA;
- Dexie/IndexedDB para offline y outbox;
- Supabase como backend objetivo;
- CI con typecheck, tests y build.

No almacenar claves o secretos en esta documentación.

## 3. Alcance estratégico

SURKARA no debe limitarse al contratista de cosecha. El objetivo es cubrir operaciones productivas completas, incluyendo:

### Agricultura
- campos, lotes y ambientes;
- campañas y cultivos;
- preparación de suelo;
- siembra;
- fertilización;
- pulverización;
- riego;
- monitoreo;
- agricultura de precisión;
- cosecha;
- rendimientos;
- insumos e inventario.

### Contratistas
- clientes y servicios;
- cuadrillas;
- equipos operativos;
- maquinaria;
- jornadas;
- hectáreas;
- combustible;
- tiempos muertos;
- mantenimiento;
- conciliación;
- costos y liquidación.

### Harvest & Grain
- equipo de cosecha;
- cosechadora;
- tractor;
- monotolva;
- transferencias internas de grano;
- camiones;
- silos;
- silobolsas;
- peso/humedad;
- conciliación de cantidades.

### Transporte y logística
- cargas;
- viajes;
- choferes;
- vehículos;
- origen/destino;
- espera;
- CPE;
- descarga;
- liquidación.

### Ganadería
- animales individuales;
- RFID;
- rodeos;
- potreros;
- pesajes;
- sanidad;
- reproducción;
- movimientos.

### Feedlot
- tropas;
- corrales;
- dietas;
- raciones;
- mixer;
- consumos;
- conversión;
- costos.

### Tambo
- lactancias;
- ordeñes;
- leche;
- tanques;
- alimentación;
- reproducción;
- sanidad;
- calidad.

### Field Support
- casilla/base móvil;
- cuadrillas desplazadas;
- alimentos;
- agua;
- higiene;
- botiquín;
- herramientas;
- repuestos;
- energía;
- conectividad;
- viandas;
- rotaciones;
- gastos de campaña.

## 4. Decisiones de dominio vigentes

La fuente principal es [Domain Blueprint v0.3](DOMAIN-BLUEPRINT-v0.3.md), validado por [Domain Stress Test v0.1](DOMAIN-STRESS-TEST-v0.1.md).

v0.2 se conserva como historial de diseño, no como canon vigente.

Principios ya adoptados:

1. Compartir infraestructura, no semántica.
2. No habrá una entidad universal que convierta siembra, viaje, ordeñe y reparación en el mismo objeto.
3. Los animales no se modelan como Assets/Equipment.
4. Offline-first es fundacional.
5. Toda información crítica debe mantener procedencia.
6. Datos medidos, estimados, calculados y corregidos deben distinguirse.
7. `organization_id` es límite de seguridad, pero no sustituye relaciones multiempresa.
8. Party es una identidad compartible; OrganizationParty expresa relaciones contextuales.
9. Documentos oficiales externos mantienen autoridad externa.
10. Real-time se usa sólo cuando aporta valor operativo.
11. DAHZEA nunca escribe directamente sobre datos críticos.
12. Una operación puede usar un Operational Team compuesto.
13. Field Deployment y Mobile Camp/Casilla son conceptos propios.
14. Grain Transfer es explícito entre cosechadora, monotolva, camión, silo o silobolsa.
15. Los vínculos entre dominios son referencias explícitas, sin copiar autoridad.
16. Equipos, cuadrillas y asignaciones relevantes conservan vigencia temporal.
17. GrainBatch preserva identidad/linaje del grano a través de transferencias.
18. GrainReconciliation es una entidad de primer nivel.
19. Las correcciones críticas preservan historia y procedencia.
20. Documentos externos conservan lifecycle explícito y autoridad externa.
21. Mutaciones offline requieren identidad estable e idempotencia.
22. Downtime/WaitingTime puede identificar el recurso o dependencia bloqueante.

## 5. Unidad operativa de cosecha

La unidad real no es una cosechadora aislada.

```text
Harvest Team
├─ Cosechadora
├─ Tractor
│  └─ Monotolva
├─ Operadores
├─ Camiones / destinos
└─ Field Deployment / Casilla
```

La monotolva desacopla cosecha y transporte y debe formar parte explícita del flujo.

```text
Lote
 ↓
Cosechadora
 ↓
Monotolva
 ├─→ Camión → acopio/puerto
 ├─→ Silo del propietario
 └─→ Silobolsa
```

Esto permite medir esperas y cuellos de botella reales.

## 6. Casilla y permanencia en campaña

La casilla se considera **base móvil de campaña**, no gasto accesorio.

Debe poder vincular:
- personas desplegadas;
- equipo operativo;
- campaña/servicio;
- ubicación;
- fechas de llegada/salida;
- suministros;
- alimentación;
- energía;
- agua;
- herramientas;
- repuestos;
- gastos;
- proveedores locales;
- rotaciones y reemplazos.

## 7. Primer vertical slice

**Agricultura + Contractor Ops + Harvest & Grain + Transport + Field Support**

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
Partes / paradas / combustible / incidentes
↓
Cosecha
↓
Cosechadora → Monotolva
↓
Grain Transfer
↓
Camión / Silo / Silobolsa
↓
Trip
↓
CPE
↓
Descarga / ticket
↓
GrainReconciliation
↓
Costo
↓
Liquidación
```

La especificación implementable está en [Vertical Slice 01 — Harvest v0.1](VERTICAL-SLICE-01-HARVEST-v0.1.md).

## 8. Arquitectura técnica vigente

Decisión inicial:
- modular monolith lógico;
- React + TypeScript + Vite PWA;
- Dexie/IndexedDB como persistencia offline del cliente;
- outbox propio con `client_operation_id` estable;
- Supabase Postgres/Auth/Storage como backend;
- Edge/Application API como Sync Gateway;
- RLS en toda tabla expuesta;
- navegador con publishable key únicamente;
- Realtime como acelerador, nunca como autoridad ni sustituto del sync.

Documentos:
- [Architecture Foundation v0.1](ARCHITECTURE-FOUNDATION-v0.1.md)
- [Offline & Sync Contract v0.1](OFFLINE-SYNC-CONTRACT-v0.1.md)
- [Technical Stack v0.1](TECHNICAL-STACK-v0.1.md)
- [Persistence Model v0.1](PERSISTENCE-MODEL-v0.1.md)
- [Sync Gateway Contract v0.1](SYNC-GATEWAY-CONTRACT-v0.1.md)
- [Database Contract v0.1](DATABASE-CONTRACT-v0.1.md)

## 9. Persistencia y Supabase

Existe un draft en `supabase/drafts/milestone_a_core.sql`.

No está aplicado a ningún proyecto.

Reglas:
- no reutilizar el proyecto activo `Spk_Multidev`, porque contiene infraestructura de otro desarrollo;
- no restaurar/modificar automáticamente el proyecto Supabase genérico inactivo;
- SURKARA debe usar un proyecto aislado;
- antes de crearlo se revisan costo y región;
- el draft recién entonces se convierte en una migración formal y se valida con advisors.

## 10. DAHZEA

DAHZEA es un producto separado.

Puede actuar como capa conversacional para:
- consultas;
- sugerencias;
- borradores de comandos;
- solicitudes estructuradas.

SURKARA conserva autoridad operacional.

Las acciones sensibles requieren políticas explícitas y, cuando corresponda, confirmación humana.

## 11. Forgeworks

**Forgeworks se registra como candidato futuro para una tarea de validación/desarrollo de SURKARA cuando Forgeworks esté suficientemente testeado.**

Puede utilizarse posteriormente para:
- stress-test;
- generación/verificación de contratos;
- scaffolding;
- auditoría;
- evolución controlada.

Forgeworks no es una dependencia actual.

## 12. Estado de Milestone A

Ya están definidos:
- dominio v0.3;
- aggregate/ownership boundaries;
- contrato offline/sync;
- vertical slice de cosecha;
- stack técnico;
- outbox local durable;
- control de revisión inicial;
- modelo de persistencia candidato;
- estrategia tenancy/RLS;
- Sync Engine cliente;
- contrato del Sync Gateway;
- primer comando PostgreSQL atómico;
- command fingerprint server-side;
- contrato de base validado en PostgreSQL 17 efímero;
- CI web + database-contract.

El código inicial de `app/` ya prueba:
- creación local de AgriculturalOperation;
- revisión optimista;
- rechazo de revisiones obsoletas;
- idempotencia del outbox;
- dependencias entre comandos;
- recuperación de comandos interrumpidos en estado syncing;
- propagación de blocked_dependency;
- resultados accepted/duplicate/conflict/rejected/pending_external;
- reintento técnico sin generar un nuevo client_operation_id.

## 13. Próximo hito

1. cerrar Database Contract v0.1 con CI verde;
2. aprovisionar Supabase exclusivo de SURKARA con confirmación de costo/región;
3. convertir los drafts SQL validados en migraciones formales;
4. aplicar migraciones y ejecutar advisors;
5. implementar/desplegar `sync-command`;
6. conectar el transport del cliente;
7. ejecutar primer E2E real: create harvest operation offline → sync → authoritative read model.

## 14. Regla de continuidad

Cuando se retome SURKARA en otro chat o herramienta, usar en este orden:

1. `docs/PROJECT-CONTEXT.md`
2. `docs/DOMAIN-BLUEPRINT-v0.3.md`
3. `docs/ARCHITECTURE-FOUNDATION-v0.1.md`
4. `docs/OFFLINE-SYNC-CONTRACT-v0.1.md`
5. `docs/VERTICAL-SLICE-01-HARVEST-v0.1.md`
6. `docs/TECHNICAL-STACK-v0.1.md`
7. `docs/PERSISTENCE-MODEL-v0.1.md`
8. `docs/SYNC-GATEWAY-CONTRACT-v0.1.md`
9. `docs/DATABASE-CONTRACT-v0.1.md`
10. `docs/DOMAIN-STRESS-TEST-v0.1.md`
11. `docs/RESEARCH-SYNTHESIS-2026-09-24.md`
12. prototipo histórico `index.html`

No asumir que el prototipo representa la arquitectura objetivo.
