# SURKARA — Sync Gateway Contract v0.1

**Fecha:** 2026-09-24  
**Estado:** CANDIDATE  
**Base:** Offline & Sync Contract v0.1 + Persistence Model v0.1

## 1. Propósito

El Sync Gateway es la única entrada autoritativa inicial para mutaciones críticas originadas en la PWA.

El navegador:
- crea comandos offline;
- los conserva en IndexedDB;
- reintenta con el mismo client_operation_id;
- recibe un resultado explícito.

El navegador no escribe directamente aggregates críticos mediante Data API.

## 2. Transporte objetivo

Implementación inicial prevista:
- Supabase Edge Function: `sync-command`;
- autenticación de usuario obligatoria;
- payload JSON;
- un comando por request en v0.1.

Batching puede agregarse después sin cambiar la identidad de cada comando.

## 3. Request

El body corresponde al Offline Mutation Envelope:

```json
{
  "clientOperationId": "uuid",
  "actorId": "user-id",
  "deviceId": "device-id",
  "tenantScope": "organization-id",
  "commandType": "agronomy.create_harvest_operation",
  "targetRef": "uuid",
  "baseRevision": 1,
  "occurredAtLocal": "2026-09-24T22:00:00-03:00",
  "queuedAtLocal": "2026-09-24T22:00:01-03:00",
  "payload": {},
  "conflictClass": "C",
  "dependencies": [],
  "evidenceRefs": [],
  "schemaVersion": 1
}
```

El gateway no confía en `actorId` enviado por el cliente: debe compararlo o sustituirlo por la identidad autenticada.

## 4. Response

```json
{
  "clientOperationId": "uuid",
  "status": "accepted",
  "serverRevision": 1,
  "processedAt": "2026-09-25T01:00:00Z",
  "authoritativeRef": "agricultural_operation:uuid"
}
```

Estados:
- accepted;
- duplicate;
- conflict;
- rejected;
- blocked_dependency;
- pending_external.

Errores de red/HTTP que impiden obtener resultado **no** se convierten en rejected. El cliente vuelve el comando a pending y reintenta con el mismo ID.

## 5. Flujo server-side

```text
Authenticate user
  ↓
Resolve organization membership
  ↓
Validate command envelope/schema
  ↓
Check client_operation_id receipt
  ├─ exists → return previous logical result as duplicate
  ↓
Validate dependencies
  ↓
Dispatch command handler
  ↓
Validate aggregate revision + invariants
  ↓
Atomic mutation + command receipt
  ↓
Return explicit result
```

## 6. Atomicidad

La mutación del aggregate y el receipt de idempotencia deben confirmarse en la misma transacción de base de datos.

No es válido:
1. insertar el aggregate;
2. perder conexión;
3. no registrar receipt;
4. reintentar;
5. insertar un duplicado.

Para Milestone A, la estrategia preferida es una función PostgreSQL/RPC específica por comando o un mecanismo transaccional equivalente, invocado sólo desde backend.

No usar `SECURITY DEFINER` como atajo de permisos.

Si una función RPC se expone en un schema accesible:
- revocar EXECUTE a PUBLIC/anon/authenticated;
- concederlo sólo al rol backend necesario;
- validar identidad y membership en el gateway antes de invocarla.

## 7. Command v0.1

### agronomy.create_harvest_operation

Payload mínimo:
- operation id generado offline;
- field id;
- campaign id;
- crop code;
- planned area ha;
- planned from;
- planned to.

Reglas:
- operation id debe ser UUID válido;
- planned area > 0;
- planned_to >= planned_from;
- Field y Campaign deben pertenecer al tenantScope;
- usuario autenticado debe tener membership activo;
- targetRef debe coincidir con operation id;
- creación repetida con mismo clientOperationId → duplicate;
- mismo operation id con intención incompatible → rejected/conflict según contexto.

Resultado accepted:
- authoritativeRef;
- serverRevision = 1;
- processedAt.

## 8. Dependencias

Antes de procesar un comando con dependencies:
- cada dependencia debe tener receipt aceptado/duplicado;
- dependencia rechazada/conflictiva → blocked_dependency;
- dependencia todavía desconocida → blocked_dependency o retryable wait según política del handler.

El cliente también ordena dependencias, pero el servidor vuelve a validarlas.

## 9. Conflictos

Un comando state-sensitive incluye baseRevision.

Si la revisión autoritativa difiere:
- no sobrescribir;
- devolver conflict;
- incluir serverRevision;
- persistir SyncConflict cuando corresponda.

El cliente no modifica automáticamente la intención original para “hacerla pasar”.

## 10. Seguridad

- publishable key en navegador;
- sesión/JWT identifica al usuario;
- secret key sólo backend;
- user_metadata no participa en autorización;
- membership y permisos provienen de datos server-side;
- RLS protege lecturas del navegador;
- escritura autoritativa se valida en Application Layer.

## 11. External actions

Para CPE u otra autoridad externa:
- prepared localmente no significa authorized;
- si el gateway acepta preparación pero espera sistema externo, retorna pending_external;
- un retry conserva clientOperationId;
- autorización sólo se registra con evidencia/respuesta externa.

## 12. Observabilidad mínima

Cada comando debe poder correlacionarse por:
- clientOperationId;
- actor;
- device;
- tenant;
- commandType;
- receipt;
- targetRef;
- processedAt;
- status.

No loguear secretos ni payloads sensibles indiscriminadamente.

## 13. Gate de implementación backend

Antes de desplegar `sync-command`:
1. aprovisionar proyecto Supabase exclusivo de SURKARA;
2. convertir persistence draft en migración;
3. validar RLS y advisors;
4. implementar transacción/handler para `agronomy.create_harvest_operation`;
5. desplegar Edge Function;
6. ejecutar E2E retry/idempotency/conflict.
