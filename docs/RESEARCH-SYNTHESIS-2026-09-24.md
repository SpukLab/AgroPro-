# AGROPRO — Research Synthesis 2026-09-24

**Estado:** evidencia para diseño, no especificación técnica.

## 1. Fuentes de análisis

Se cruzaron investigaciones independientes de Claude, Gemini y Grok con verificación puntual de contexto 2026.

La convergencia principal fue suficientemente fuerte para adoptar varios principios de diseño, pero ninguna devolución debe tratarse como autoridad absoluta.

## 2. Hallazgos convergentes

### 2.1 El problema central es la conciliación

El valor no está sólo en registrar operaciones, sino en conectar:
- planificado;
- ejecutado;
- recursos consumidos;
- evidencia;
- documentación;
- resultado físico;
- resultado económico.

Patrón adoptado:

**Plan → Execution → Evidence → Result**

### 2.2 Existe un core compartible, pero no semántica universal

Puede compartirse:
- identidad;
- relaciones entre partes;
- asignaciones;
- tiempo;
- spatial base;
- evidencia;
- mediciones;
- procedencia;
- auditoría;
- sincronización;
- costos básicos.

No deben unificarse semánticamente:
- animal y máquina;
- lote y ruta;
- siembra y viaje;
- ordeñe y reparación;
- campaña agrícola y viaje logístico.

### 2.3 Offline-first es requisito estructural

No debe ser un modo opcional.

El sistema debe poder capturar operaciones, evidencias y mediciones sin conectividad y sincronizar después con:
- idempotencia;
- estados visibles;
- detección de conflictos;
- políticas distintas según tipo de dato.

No se adopta todavía CRDT, vector clocks ni event sourcing.

### 2.4 Procedencia y autoridad son obligatorias

Toda medición/dato crítico debe distinguir:
- manual;
- sensor;
- máquina;
- GPS;
- RFID;
- importado;
- API oficial;
- estimado;
- calculado;
- corregido.

Los sistemas externos oficiales conservan autoridad sobre sus documentos.

### 2.5 El white space más interesante está en la costura

Especialmente:

**agronomía ↔ ejecución del contratista ↔ maquinaria ↔ cosecha ↔ logística ↔ documentación ↔ costo**

No alcanza con competir como otro monitor agronómico ni como un TMS aislado.

### 2.6 La unidad real de cosecha es un equipo

Cosechadora + tractor + monotolva + operadores + transporte + soporte de campaña.

El Grain Transfer intermedio es relevante para:
- trazabilidad;
- conciliación;
- rendimiento;
- detección de esperas;
- cuellos de botella.

### 2.7 Field Support estaba submodelado

La casilla/base móvil, suministros y permanencia de cuadrillas son parte directa del costo y continuidad operativa de la campaña.

## 3. Hallazgos regulatorios relevantes 2026

Estos puntos deben volver a verificarse contra fuentes oficiales antes de implementación productiva:

- identificación electrónica individual bovina vigente desde 2026 para los casos alcanzados por SENASA;
- SIGSA/DT-e como autoridad de movimientos y registros sanitarios;
- creación/uso de SIGTRAZAVET y receta veterinaria electrónica para productos alcanzados;
- CPE con Web Service oficial de ARCA;
- SISA como parte del marco actual de granos;
- normativa provincial para recetas y aplicaciones fitosanitarias.

Regla: nunca inventar una integración oficial. Clasificar siempre como:
1. API/WS oficial;
2. import/export;
3. integración de tercero;
4. operación manual.

## 4. Decisiones técnicas NO adoptadas

No se consideran decididas:
- microservicios;
- GraphQL;
- event sourcing;
- CRDT;
- vector clocks;
- almacenamiento columnar;
- arquitectura de telemetría;
- REST vs RPC;
- motor geoespacial específico;
- motor de optimización de rutas.

La arquitectura se elegirá después de validar flujos e invariantes.

## 5. Riesgos principales

1. abstracción excesiva;
2. UX genérica que no hable el lenguaje del rubro;
3. conflictos offline en estados/inventario;
4. autoridad de datos ambigua;
5. dependencia de fabricantes;
6. telemetría de alta frecuencia mezclada con eventos de dominio;
7. regulación modelada como simple adjunto;
8. organization_id insuficiente para colaboración multiempresa;
9. costos calculados sin trazabilidad;
10. pretender cubrir agricultura, feedlot, tambo y transporte con una sola máquina de estados.

## 6. Áreas que requieren evidencia de campo

Antes de fijar arquitectura:
- cómo se forman y cambian realmente los equipos de campaña;
- cómo se mide superficie entre cliente y contratista;
- cómo se registra combustible hoy;
- causas reales de paradas;
- flujo cosechadora ↔ monotolva ↔ camión;
- cambios de destino/camión a último momento;
- operación de casilla y abastecimiento;
- rotaciones del personal;
- conciliación de kilos origen/destino;
- conflictos reales cuando trabajan varios dispositivos sin señal.

## 7. Dirección recomendada

Mantener visión amplia de plataforma agropecuaria completa, pero construir por **vertical slices profundos**.

Primer slice recomendado:
**Agriculture + Contractor Ops + Harvest & Grain + Transport + Field Support.**

Ganadería/RFID aparece como siguiente territorio fuerte, especialmente por cambios regulatorios 2026.

Feedlot y Dairy deben conservar lugar explícito en el dominio, sin forzar implementación inmediata.

## 8. Criterio de éxito del núcleo

AGROPRO debería poder responder confiablemente:

1. ¿Qué estaba previsto?
2. ¿Qué se hizo?
3. ¿Quién y qué equipo intervino?
4. ¿Qué se consumió?
5. ¿Qué incidencias ocurrieron?
6. ¿Cómo se movió físicamente el producto?
7. ¿Qué evidencia existe?
8. ¿Qué documento externo respalda la operación?
9. ¿Qué costo tuvo?
10. ¿Qué resultado físico/económico produjo?
