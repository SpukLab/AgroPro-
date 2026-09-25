# SURKARA — Technical Stack Decision v0.1

**Fecha:** 2026-09-24  
**Estado:** ADOPTED para Milestone A  
**Base:** Domain Blueprint v0.3, Architecture Foundation v0.1, Offline & Sync Contract v0.1, Vertical Slice 01 v0.1

## Decisión

### Cliente
- React 19 + TypeScript
- Vite
- PWA mediante vite-plugin-pwa / Workbox
- Dexie 4 sobre IndexedDB para cache local, working state y outbox durable

### Backend
- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Supabase Edge Functions como Application API / Sync Gateway
- Supabase Realtime Broadcast privado sólo como acelerador de actualización multi-dispositivo

### Testing
- Vitest
- fake-indexeddb para probar outbox e invariantes offline en CI
- E2E de dominio y sync incorporados progresivamente desde Milestone A

## Razones

1. El producto necesita operación web/mobile-first, especialmente iPhone/iPad, sin obligar a una app nativa.
2. IndexedDB es la persistencia local estándar del navegador; Dexie aporta una capa pequeña, tipada y con manejo de upgrades.
3. El outbox pertenece a SURKARA. No se delega la semántica offline a Realtime ni a una sincronización automática de terceros.
4. Postgres encaja con relaciones, auditoría, conciliación, invariantes, RLS y reporting.
5. Supabase permite mantener Auth, Storage, Realtime y Postgres en una sola plataforma sin forzar microservicios.
6. Edge Functions permiten conservar la Application Layer delante de mutaciones sensibles.
7. Realtime no será autoridad: sólo distribuye cambios ya confirmados. Una caída de WebSocket no puede impedir operar.
8. La arquitectura inicial sigue siendo modular monolith lógico, aunque frontend, Edge Function y Postgres tengan runtimes diferentes.

## Seguridad

- El navegador sólo utilizará una publishable key.
- Nunca se incluirá secret/service key en frontend o repositorio.
- RLS será obligatorio para toda tabla expuesta.
- Las mutaciones sensibles entrarán por el Sync Gateway.
- El gateway autenticará usuario y scope antes de usar cualquier operación privilegiada.
- No se usará user_metadata como fuente de autorización.
- Realtime productivo usará canales privados y políticas explícitas.

## Offline

El cliente mantiene tres áreas:

```text
Read Cache
Working State
Outbox
```

El outbox usa client_operation_id estable y conserva comandos durante reintentos, reinicios y pérdida de señal.

Realtime no sustituye:
- outbox;
- idempotencia;
- revisión de aggregates;
- conflictos;
- reconciliación posterior.

## Proyecto Supabase

No se reutiliza el proyecto activo `Spk_Multidev`, porque contiene infraestructura de otro desarrollo.

Tampoco se restaura ni modifica automáticamente el proyecto genérico inactivo existente.

SURKARA deberá disponer de un proyecto Supabase aislado cuando se pase del scaffold local al backend real. La creación se hará sólo después de revisar costo/región y confirmar el aprovisionamiento.

## Versionado inicial

Las dependencias se fijan a versiones exactas y el lockfile será obligatorio antes del merge.

## Gate siguiente

1. Scaffold PWA y offline core.
2. CI: typecheck + unit tests + build.
3. Fijar lockfile.
4. Definir Persistence Model v0.1 y RLS.
5. Preparar primera migración sin aplicarla a un proyecto ajeno.
6. Implementar Application API / Sync Gateway.
