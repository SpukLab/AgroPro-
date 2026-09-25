# SURKARA — Persistence Model v0.1

**Fecha:** 2026-09-24  
**Estado:** CANDIDATE para Milestone A  
**Base:** Domain Blueprint v0.3 + Architecture Foundation v0.1 + Offline & Sync Contract v0.1

## 1. Objetivo

Definir el primer modelo relacional de SURKARA sin confundir:
- tenancy con relaciones comerciales;
- estado actual con historia;
- cliente offline con autoridad;
- Realtime con sincronización;
- documentos/read models con aggregates.

## 2. Estrategia de acceso

### Browser/PWA
Puede:
- autenticar;
- leer filas permitidas por RLS;
- recibir Broadcast privado;
- subir evidencia mediante flujos autorizados futuros.

No puede escribir directamente aggregates críticos en Milestone A.

### Application API / Sync Gateway
Recibe comandos autenticados, valida:
- actor;
- organización/scope;
- idempotencia;
- revisión;
- invariantes;
- dependencias.

Después ejecuta mutaciones autoritativas.

### Admin/secret client
Sólo existe dentro del backend.
Nunca llega al navegador.

## 3. Tenancy

`organization_id` es la partición de seguridad inicial.

No representa por sí solo la relación de negocio.

Se agregan explícitamente:
- Party global;
- OrganizationParty;
- client/owner/provider roles contextuales.

Party no contiene `organization_id`: una misma persona u organización puede participar en más de un tenant sin duplicar su identidad. La visibilidad se obtiene mediante OrganizationParty + membership.

Ejemplo:

```text
SURKARA tenant: Contratista A
Party global: Productor B
OrganizationParty: Contratista A -> Productor B [client]
Establishment: pertenece al tenant operativo y referencia Productor B
```

## 4. Tablas Milestone A

### organizations
Tenant de seguridad.

### organization_memberships
Usuario ↔ organización.
Es la base de autorización RLS.

### parties
Persona u organización participante.

### organization_parties
Relación contextual entre tenant y Party:
- client;
- supplier;
- contractor;
- carrier;
- advisor;
- owner;
- other.

### establishments
Establecimiento operado/gestionado en el contexto del tenant.

### fields
Lotes con semántica agronómica.

### campaigns
Campañas agrícolas.

### equipment
Identidad estable de maquinaria/vehículos/implementos.

### agricultural_operations
Aggregate Agronomy.
Incluye revision explícita.

### operational_teams
Aggregate de equipo operacional.

### team_assignments
Composición temporal del OperationalTeam.
Puede referenciar Party-person o Equipment.

### contractor_jobs
Ejecución contratista que referencia AgriculturalOperation.

### work_sessions
Tramo efectivo de ejecución.
Incluye revision.

### command_receipts
Registro server-side de client_operation_id.
Es la barrera de idempotencia.

### sync_conflicts
Conflictos explícitos originados al procesar comandos.

## 5. Revisión

Aggregates mutables relevantes incluyen:
- `revision integer not null default 1`.

Las mutaciones sensibles usan compare-and-swap conceptual:

```sql
update ...
set ..., revision = revision + 1
where id = :id
  and revision = :base_revision
```

Cero filas actualizadas implica conflicto, no éxito silencioso.

## 6. Idempotencia

`command_receipts` tiene unicidad por:
- organization_id;
- client_operation_id.

Un retry:
- encuentra receipt previo;
- devuelve el mismo resultado lógico;
- no vuelve a ejecutar el comando.

## 7. RLS

Toda tabla en `public` tiene RLS habilitado.

Milestone A:
- `authenticated` recibe SELECT explícito;
- no recibe INSERT/UPDATE/DELETE directo en aggregates;
- las policies de SELECT requieren membership activo en la organización;
- Party se hace visible sólo si existe una relación OrganizationParty alcanzable por el usuario;
- organization_memberships sólo permite al usuario leer sus propias memberships;
- las referencias entre tablas tenant-scoped usan claves compuestas `(id, organization_id)` para impedir asociaciones accidentales entre tenants.

No se usa user_metadata para autorización.

## 8. Relaciones multiempresa

El modelo no asume que:
- tenant = propietario del campo;
- tenant = propietario de la máquina;
- tenant = cliente.

Los owners/clientes se expresan con Party references y relaciones OrganizationParty. La identidad Party puede reutilizarse entre organizaciones; los aggregates operativos siguen aislados por organization_id.

Esto preserva colaboración multiempresa sin volver ambiguo el aislamiento de seguridad.

## 9. Historial

Milestone A no adopta event sourcing.

Historia crítica se preserva mediante:
- revision;
- filas temporales como team_assignments;
- command_receipts;
- sync_conflicts;
- futuras correction/supersession records para Measurements.

No se hace hard-delete operacional desde el cliente.

## 10. Estado del SQL

`supabase/drafts/milestone_a_core.sql` es un **draft revisable**, no una migración aplicada.

No se aplica a:
- Spk_Multidev;
- el proyecto Supabase inactivo existente;
- ningún entorno productivo.

Cuando exista un proyecto SURKARA aislado:
1. crear migración con Supabase CLI;
2. incorporar SQL revisado;
3. aplicar;
4. ejecutar advisors de seguridad/performance;
5. verificar queries y RLS;
6. generar tipos TypeScript.
