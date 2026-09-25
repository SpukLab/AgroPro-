# SURKARA — Database Contract v0.1

**Fecha:** 2026-09-24  
**Estado:** VALIDATED IN CI — PostgreSQL 17  
**Aplicado a Supabase remoto:** NO

## 1. Alcance validado

GitHub Actions levanta PostgreSQL 17 efímero y ejecuta, con `ON_ERROR_STOP`:

1. stubs mínimos de roles/Auth equivalentes para CI;
2. `supabase/drafts/milestone_a_core.sql`;
3. `supabase/drafts/process_create_harvest_operation.sql`;
4. `supabase/tests/milestone_a_contract.sql`.

El entorno se destruye al finalizar el job.

## 2. Garantías probadas

### Schema
- el draft compila en PostgreSQL 17;
- claves compuestas mantienen consistencia tenant-scoped;
- RLS queda habilitado en tablas públicas del Milestone A.

### Browser boundary
- `authenticated` obtiene lectura condicionada por RLS;
- `authenticated` no puede insertar directamente en tablas autoritativas;
- el frontend tiene además un architecture guard que detecta adapters Supabase con `.insert/.update/.delete/.upsert`.

### Backend
- `service_role` tiene permisos explícitos sobre el core;
- el primer handler SQL usa `SECURITY INVOKER`;
- CI rechaza `SECURITY DEFINER` dentro de `supabase/drafts`.

### Idempotencia
Para `agronomy.create_harvest_operation`:
- primera ejecución → `accepted`;
- mismo `client_operation_id` + misma intención → `duplicate`;
- no se crea una segunda AgriculturalOperation;
- no se crea un segundo receipt;
- mismo ID + intención distinta → `rejected / idempotency_key_reused`.

### Atomicidad
- aggregate + receipt se confirman como una única transacción;
- una referencia cross-tenant inválida produce rollback;
- un comando fallido por FK no deja un receipt huérfano.

### Membership
- actor sin membership activo no puede ejecutar el comando.

### RLS
- un usuario autenticado sólo ve la organización para la que tiene membership en el fixture CI.

## 3. Command fingerprint

`command_receipts.command_hash` guarda SHA-256 de la intención normalizada del comando.

Su propósito no es seguridad criptográfica de contenido; es impedir que un bug o cliente reutilice un `client_operation_id` para una intención diferente y sea tratado erróneamente como retry legítimo.

## 4. Primer comando transaccional

`public.process_create_harvest_operation(...)`

Responsabilidades:
- validar schema version y valores básicos;
- validar membership;
- calcular fingerprint;
- reclamar idempotency key;
- crear AgriculturalOperation;
- registrar receipt;
- resolver duplicate/collision/conflict;
- retornar contrato compatible con Sync Engine.

El gateway futuro seguirá siendo responsable de:
- autenticar JWT;
- derivar actor real;
- parsear request;
- no confiar en actorId del body;
- observabilidad HTTP;
- invocar el handler autorizado.

## 5. Lo que todavía NO demuestra

Este CI no sustituye:
- Supabase Advisors;
- comportamiento exacto de Data API;
- Storage policies;
- Realtime Authorization;
- Edge Function deployment;
- performance/load;
- red real/offline real en iOS;
- configuración de backups/región.

Esas pruebas requieren un proyecto SURKARA aislado.

## 6. Gate siguiente

El core llegó hasta el límite razonable sin infraestructura remota.

Siguiente paso productivo:
1. elegir organización/región;
2. consultar costo de proyecto Supabase;
3. obtener confirmación explícita;
4. crear proyecto SURKARA aislado;
5. convertir drafts en migraciones formales;
6. aplicar + advisors;
7. desplegar Sync Gateway;
8. ejecutar E2E real offline → sync → authoritative read model.
