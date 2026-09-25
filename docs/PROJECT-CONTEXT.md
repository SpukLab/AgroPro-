# SURKARA — Project Context

> **Naming:** SURKARA es el nombre de producto de trabajo. El repositorio conserva temporalmente el nombre técnico heredado `SpukLab/AgroPro-` hasta completar las verificaciones formales de marca, denominación/fonética y dominios antes de consolidar branding o lanzamiento.

**Última actualización:** 2026-09-24  
**Estado:** Domain Blueprint v0.3 + Architecture Foundation v0.1 / listo para selección técnica  
**Repositorio:** SpukLab/AgroPro-

## 1. Propósito

SURKARA apunta a ser una **plataforma operacional agropecuaria de punta a punta**, no solamente una app de cosecha ni un ERP administrativo.

Patrón rector:

**planificación → ejecución → evidencia → conciliación → resultado**

Debe conectar agricultura, contratistas, maquinaria, cosecha, logística/transporte, ganadería, feedlot, tambo, mantenimiento, inventarios, costos y soporte de campaña, preservando las reglas especializadas de cada dominio.

## 2. Cliente inicial y laboratorio real

Cliente inicial de referencia: **Stepanosky Hermanos**, contratistas rurales de Trenque Lauquen, Buenos Aires.

El proyecto existente nació como PWA mobile-first con un prototipo funcional en `index.html`. El prototipo se conserva como referencia de UX y de casos de uso, pero **no condiciona la arquitectura futura**.

Stack actual/prototipo:
- HTML/CSS/JS vanilla;
- Supabase (PostgreSQL + Auth + Storage);
- GitHub Pages;
- enfoque multi-tenant inicial mediante `organization_id`.

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
7. `organization_id` por sí solo no alcanza para relaciones multiempresa.
8. Documentos oficiales externos mantienen autoridad externa.
9. Real-time se usa sólo cuando aporta valor operativo.
10. DAHZEA nunca escribe directamente sobre datos críticos.
11. Una operación puede usar un Operational Team compuesto.
12. Field Deployment y Mobile Camp/Casilla son conceptos propios.
13. Grain Transfer es explícito entre cosechadora, monotolva, camión, silo o silobolsa.
14. Los vínculos entre dominios son referencias explícitas, sin copiar autoridad.
15. Equipos, cuadrillas y asignaciones relevantes conservan vigencia temporal.
16. GrainBatch preserva identidad/linaje del grano a través de transferencias.
17. GrainReconciliation es una entidad de primer nivel.
18. Las correcciones críticas preservan historia y procedencia.
19. Documentos externos conservan lifecycle explícito y autoridad externa.
20. Mutaciones offline requieren identidad estable e idempotencia.
21. Downtime/WaitingTime puede identificar el recurso o dependencia bloqueante.

## 5. Unidad operativa de cosecha

La unidad real no es una cosechadora aislada.

Ejemplo típico:

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

Cadena típica:

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

Esto refleja el trabajo de equipos “tanteros” y cuadrillas que permanecen lejos de su base durante semanas o meses.

## 7. Primer vertical slice recomendado

**Agricultura + Contractor Ops + Harvest & Grain + Transport + Field Support**

Flujo objetivo:

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
Conciliación
↓
Costo
↓
Liquidación
```

## 8. DAHZEA

DAHZEA es un producto separado.

Puede actuar como capa conversacional para:
- consultas;
- sugerencias;
- borradores de comandos;
- solicitudes estructuradas.

SURKARA conserva autoridad operacional.

Las acciones sensibles requieren políticas explícitas y, cuando corresponda, confirmación humana.

## 9. Transporte general y movilidad

La plataforma puede compartir primitivas con transporte general y, a futuro, movilidad/remises:
- personas;
- organizaciones;
- vehículos;
- asignaciones;
- posición;
- incidentes;
- costos;
- evidencias.

No se debe diseñar SURKARA como “Uber rural”. Compartir plataforma no implica compartir dominio, motor de despacho ni UX.

## 10. Forgeworks

**Forgeworks se registra como candidato futuro para una tarea de validación/desarrollo de SURKARA cuando Forgeworks esté suficientemente testeado.**

Uso potencial:
- stress-test del Domain Blueprint;
- derivación de arquitectura desde dominios ya validados;
- generación de contratos y scaffolding;
- verificación de invariantes;
- auditoría de cambios;
- evolución controlada del prototipo hacia una base sólida.

Forgeworks **no es una dependencia actual** y no debe condicionar las decisiones de dominio de SURKARA.

## 11. Próximo hito

Ya están completados:
- Domain Stress Test v0.1;
- Domain Blueprint v0.3;
- Architecture Foundation v0.1;
- Offline & Sync Contract v0.1;
- Vertical Slice 01 — Harvest v0.1.

El siguiente bloque debe:

1. seleccionar stack técnico mínimo;
2. mapear aggregates a persistencia;
3. definir tenancy/autorización;
4. definir API/command/query surface;
5. crear scaffolding del Milestone A;
6. implementar E2E desde el comienzo.

El prototipo actual de `index.html` es UI/mock funcional en memoria; no existe un backend legado que deba preservarse como autoridad.

## 12. Regla de continuidad

Cuando se retome SURKARA en otro chat o herramienta, usar en este orden:

1. `docs/PROJECT-CONTEXT.md`
2. `docs/DOMAIN-BLUEPRINT-v0.3.md`
3. `docs/ARCHITECTURE-FOUNDATION-v0.1.md`
4. `docs/OFFLINE-SYNC-CONTRACT-v0.1.md`
5. `docs/VERTICAL-SLICE-01-HARVEST-v0.1.md`
6. `docs/DOMAIN-STRESS-TEST-v0.1.md`
7. `docs/RESEARCH-SYNTHESIS-2026-09-24.md`
8. prototipo actual `index.html`

No asumir que el prototipo representa la arquitectura objetivo.
