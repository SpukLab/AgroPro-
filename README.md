# SURKARA

SURKARA es una plataforma operacional agropecuaria mobile-first orientada a conectar planificación, ejecución, evidencia, conciliación y resultado.

> El repositorio conserva temporalmente el nombre técnico heredado `SpukLab/AgroPro-`. SURKARA continúa como nombre de producto de trabajo hasta completar clearance marcario/denominativo y verificación de dominios antes de consolidar branding.

## Documentación

- [Project Context](docs/PROJECT-CONTEXT.md) — punto de entrada para retomar el proyecto y conocer el estado vigente.
- [Domain Blueprint v0.3](docs/DOMAIN-BLUEPRINT-v0.3.md) — canon vigente de límites de dominio e invariantes.
- [Architecture Foundation v0.1](docs/ARCHITECTURE-FOUNDATION-v0.1.md) — ownership, aggregates, contratos entre dominios y modular monolith.
- [Offline & Sync Contract v0.1](docs/OFFLINE-SYNC-CONTRACT-v0.1.md) — idempotencia, revisiones, outbox, conflictos, evidencia offline y multi-device.
- [Vertical Slice 01 — Harvest v0.1](docs/VERTICAL-SLICE-01-HARVEST-v0.1.md) — recorrido implementable de cosecha a conciliación con E2E obligatorios.
- [Technical Stack v0.1](docs/TECHNICAL-STACK-v0.1.md) — React/TypeScript/Vite PWA + Dexie/IndexedDB + Supabase.
- [Persistence Model v0.1](docs/PERSISTENCE-MODEL-v0.1.md) — tenancy, RLS, revisiones e idempotencia server-side.
- [Sync Gateway Contract v0.1](docs/SYNC-GATEWAY-CONTRACT-v0.1.md) — protocolo cliente/backend, resultados, atomicidad e idempotencia.
- [Domain Stress Test v0.1](docs/DOMAIN-STRESS-TEST-v0.1.md) — validación de los 17 flujos obligatorios y gaps resueltos.
- [Research Synthesis — 2026-09-24](docs/RESEARCH-SYNTHESIS-2026-09-24.md) — síntesis de investigación y riesgos.
- [Domain Blueprint v0.2](docs/DOMAIN-BLUEPRINT-v0.2.md) — versión histórica previa al stress test.

## Implementación

El nuevo cliente vive en `app/` y comienza el Milestone A como PWA offline-first.

Base técnica:
- React + TypeScript + Vite;
- Dexie/IndexedDB para cache local, evidencia pendiente y outbox durable;
- Supabase Postgres/Auth/Storage como backend objetivo;
- Application API / Sync Gateway delante de mutaciones autoritativas;
- Sync Engine cliente con recuperación de envíos interrumpidos, dependencias y reintentos;
- Realtime sólo como acelerador de cambios confirmados;
- Vitest + CI para typecheck, tests y build.

El `index.html` de la raíz se conserva como prototipo histórico de UX. No es la arquitectura ni el backend objetivo.

El SQL de `supabase/drafts/` es diseño revisable y **no está aplicado a ningún proyecto Supabase**.

## Orden recomendado para continuar

1. Leer `docs/PROJECT-CONTEXT.md`.
2. Revisar `docs/DOMAIN-BLUEPRINT-v0.3.md`.
3. Revisar `docs/ARCHITECTURE-FOUNDATION-v0.1.md` y `docs/OFFLINE-SYNC-CONTRACT-v0.1.md`.
4. Revisar `docs/TECHNICAL-STACK-v0.1.md`, `docs/PERSISTENCE-MODEL-v0.1.md` y `docs/SYNC-GATEWAY-CONTRACT-v0.1.md`.
5. Continuar Milestone A desde `app/`, incluyendo el Sync Engine.
6. Aprovisionar un proyecto Supabase exclusivo de SURKARA antes de convertir el draft SQL en migración real y desplegar el gateway.
