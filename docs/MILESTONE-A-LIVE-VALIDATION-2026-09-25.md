# SURKARA — Milestone A Live Validation — 2026-09-25

## Objetivo

Registrar evidencia verificable del paso desde contrato/CI a backend real antes de continuar con Operational Team / WorkSession.

## Estado

**Backend live: validado.**  
**Preview PWA: publicado.**  
**E2E interactivo en dispositivo físico: validado.**

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

## E2E físico — checkpoint 2026-09-27

Validado en dispositivos físicos:

1. preview abierto correctamente;
2. signup/login completado;
3. Organization creada: `Stepanosky Hermanos`;
4. sesión persistida y backend Supabase accesible;
5. capturas revisadas desde **iPad**;
6. acceso posterior desde **iPhone** confirmado por el operador;
7. layout responsive aceptado en ambos dispositivos sin cambios de dimensiones;
8. contexto agronómico inicial creado y verificado en Supabase: establecimiento `La cuka`, lote `Lote 2`, 180 ha, campaña `2026/27` del 2026-07-01 al 2027-06-30.

La cuenta de prueba que completó el acceso quedó asociada como `owner`. La recuperación de contraseña se incorporó a la aplicación; la entrega del correo de recovery mediante el mailer estándar de Supabase queda como asunto separado de infraestructura de correo y no bloquea el E2E funcional.

## E2E físico — cierre 2026-09-27

Validación final completada en iPhone:

1. creación offline registrada localmente en IndexedDB;
2. reconexión y sincronización completadas;
3. resultado de Outbox: **1 aceptado · 0 duplicados · 0 conflictos · 0 fallos técnicos**;
4. contador posterior: **0 comandos pendientes en este dispositivo**;
5. operación visible posteriormente bajo **Autoridad remota / Operaciones confirmadas**;
6. SURKARA instalada como PWA y abierta desde el icono de inicio;
7. arranque completo en modo avión con estado **OFFLINE**;
8. sesión autenticada y Organization `Stepanosky Hermanos` conservadas;
9. contexto agronómico recuperado desde **CACHE LOCAL**: establecimiento `La cuka`, lote `Lote 2`, 180 ha, campaña `2026/27`;
10. formulario de nueva operación disponible sin conectividad.

### Observación de dispositivo

El identificador local visto en Safari difirió del identificador dentro de la PWA instalada. Debe tratarse como dos clientes locales distintos para efectos de outbox y trazabilidad de dispositivo.

## Resultado Milestone A

**CERRADO / PASS.**

Quedaron demostrados en dispositivo físico:

- backend Supabase real;
- autenticación y aislamiento de organización;
- persistencia local;
- outbox offline;
- sincronización hacia autoridad remota;
- PWA instalable;
- arranque sin red;
- recuperación de contexto operativo desde cache local.

El desarrollo puede continuar con **Operational Team / WorkSession** sin mantener Milestone A como bloqueo.
