# SURKARA — Milestone A Live Validation — 2026-09-25

## Objetivo

Registrar evidencia verificable del paso desde contrato/CI a backend real antes de continuar con Operational Team / WorkSession.

## Estado

**Backend live: validado.**  
**Preview PWA: publicado.**  
**E2E interactivo en dispositivo físico: pendiente.**

Preview técnico:

`https://spuklab.github.io/AgroPro-/preview/`

## Hallazgo de producción detectado

La primera prueba transaccional contra el proyecto Supabase real detectó una divergencia que el PostgreSQL efímero de CI no exponía:

- Supabase instala `pgcrypto` en el schema `extensions`;
- los RPC autoritativos referenciaban `public.digest(...)`;
- `process_setup_agronomy_context` fallaba en el proyecto real antes de persistir el comando.

No se aceptó el resultado del CI como sustituto de una prueba live.

## Corrección

Migración aplicada y versionada:

`20260926005115_surkara_pgcrypto_schema_fix`

La corrección:

- normaliza `pgcrypto` a `extensions`;
- reemplaza `public.digest` por `extensions.digest`;
- conserva los RPC como `security invoker`;
- mantiene ejecución autoritativa restringida a `service_role`;
- alinea el bootstrap PostgreSQL de CI con el layout real de Supabase;
- agrega una regresión que falla ante nuevo schema drift.

PR integrado:

- PR #12 — `fix: align SURKARA pgcrypto schema with Supabase`
- merge commit: `84df1f346ebe7b9e67a7f9eb41bca65a41e2da54`

## Evidencia backend live

Se ejecutó una cadena completa en el proyecto Supabase SURKARA usando fixtures transaccionales y `ROLLBACK`:

1. usuario Auth sintético temporal;
2. bootstrap de Organization vía `service_role`;
3. creación de membership owner;
4. setup de establecimiento + lote + campaña;
5. creación de AgriculturalOperation de cosecha;
6. lectura posterior bajo rol `authenticated` y RLS;
7. aislamiento entre tenants;
8. rechazo de escritura directa del cliente;
9. rollback completo.

Resultado: **PASS**.

Después de la prueba:

- organizations: 0;
- memberships: 0;
- establishments: 0;
- fields: 0;
- campaigns: 0;
- agricultural_operations: 0.

No quedaron datos de test persistentes.

## Seguridad posterior

Supabase Security Advisor después de la migración: **0 hallazgos**.

Los avisos de Performance Advisor son únicamente índices todavía sin uso en una base sin carga operacional suficiente. No se eliminan preventivamente.

Los tres RPC autoritativos verificados:

- `process_bootstrap_organization`;
- `process_setup_agronomy_context`;
- `process_create_harvest_operation`;

usan `extensions.digest` y no `public.digest`.

## Publicación PWA

PR integrado:

- PR #13 — `chore: deploy SURKARA preview with GitHub Pages`
- merge commit: `5188632e856f668db02078ddd03d3dc764397a7c`

Run de GitHub Actions `SURKARA Pages` sobre `main`: **success**.

GitHub Pages reportó:

`https://spuklab.github.io/AgroPro-/`

La raíz redirige al preview técnico bajo:

`/AgroPro-/preview/`

El pipeline:

- compila la PWA con el base path correcto;
- valida `index.html` y `manifest.webmanifest`;
- exige publishable key;
- falla si detecta un token real con formato `sb_secret_...`;
- publica únicamente el artefacto estático preparado.

## Pendiente real para cerrar Milestone A

La infraestructura ya no es el bloqueo.

Falta probar desde iPhone/iPad:

1. abrir el preview;
2. signup/login;
3. crear Organization;
4. crear establecimiento/lote/campaña;
5. crear cosecha con conectividad disponible;
6. repetir creación offline y comprobar outbox;
7. reconectar y sincronizar;
8. confirmar read model;
9. instalar como PWA / añadir a inicio;
10. recargar sin red y confirmar continuidad mínima.

No avanzar a Operational Team / WorkSession hasta registrar esta evidencia o un bloqueo específico de Safari/iOS.
