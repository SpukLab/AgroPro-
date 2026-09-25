# SURKARA — Offline & Sync Contract v0.1

**Fecha:** 2026-09-24  
**Base:** Domain Blueprint v0.3 + Architecture Foundation v0.1  
**Estado:** CANDIDATE  
**Objetivo:** fijar el comportamiento observable de captura offline, sincronización, idempotencia y conflictos antes de diseñar persistencia física.

## 1. Regla principal

Offline no es un modo degradado secundario.

SURKARA debe permitir capturar trabajo real sin conectividad y sincronizar después sin:
- duplicar hechos;
- perder evidencia;
- ocultar conflictos;
- convertir estimaciones en datos medidos;
- ejecutar acciones regulatorias como si estuvieran confirmadas;
- sobrescribir silenciosamente cambios concurrentes.

## 2. Separación local

El cliente mantiene conceptualmente tres zonas:

```text
Local Read Cache
    datos necesarios para operar

Local Working State
    formularios, evidencia y entidades todavía no confirmadas

Outbox
    comandos/mutaciones pendientes de sincronización
```

El cache puede descartarse y reconstruirse.
El outbox no puede perderse mientras existan operaciones pendientes.

## 3. Offline Mutation Envelope

Toda mutación creada en el dispositivo debe viajar dentro de un envelope conceptual.

Campos mínimos:

- `client_operation_id`;
- `actor_id`;
- `device_id`;
- `tenant_scope` o contexto equivalente;
- `command_type`;
- `target_ref`;
- `base_revision` cuando aplique;
- `occurred_at_local`;
- `queued_at_local`;
- `payload`;
- `conflict_class`;
- `dependencies[]` cuando un comando dependa de otro aún no sincronizado;
- `evidence_refs[]`;
- `schema_version`.

El servidor agrega:
- received_at;
- processing result;
- authoritative revision/result;
- rejection/conflict reason;
- external status cuando corresponda.

## 4. Idempotencia

`client_operation_id` debe ser estable a través de:
- reintentos;
- cierre/reapertura de la app;
- pérdida y recuperación de conectividad;
- respuestas duplicadas;
- timeouts.

El mismo comando recibido dos veces no debe crear dos hechos de negocio.

Resultado conceptual ante repetición:
- primera vez → processed;
- siguientes → duplicate/already processed + mismo resultado lógico.

La implementación exacta del identificador se define en persistencia; debe poder generarse offline sin coordinación central.

## 5. Revisión y concurrencia

Los aggregates mutables exponen una revisión lógica.

Ejemplo:

```text
Device A reads revision 7
Device B reads revision 7

A submits change based on 7
→ accepted, revision becomes 8

B submits state-sensitive change based on 7
→ conflict, not silent overwrite
```

No todas las operaciones requieren conflicto:
- hechos append-only pueden coexistir;
- cambios de estado o stock sí requieren validación contextual.

## 6. Clases de conflicto

Se mantiene la taxonomía del Blueprint.

### Clase A — hechos independientes

Ejemplos:
- foto;
- GPS;
- pesada;
- RFID;
- medición de humedad.

Política:
- conservar ambos;
- deduplicar sólo si existe evidencia suficiente de identidad real;
- no descartar por “último valor”.

### Clase B — actualización simple

Ejemplos:
- comentario;
- nota;
- descripción no crítica.

Política:
- auto-merge cuando sea inequívoco;
- en caso contrario, conservar versiones y pedir resolución.

### Clase C — estado operacional

Ejemplos:
- dos dispositivos intentan cerrar la misma WorkSession;
- reasignación simultánea de una máquina;
- cambio de destino mientras otro usuario despacha.

Política:
- comparar base_revision;
- validar transición;
- devolver conflicto visible cuando las intenciones sean incompatibles.

### Clase D — inventario

Ejemplos:
- dos dispositivos consumen offline el mismo repuesto;
- dos cargas de combustible descuentan stock localmente.

Política:
- cada consumo es un movimiento propio;
- sincronizar ambos movimientos;
- recalcular disponibilidad;
- marcar inconsistencia/stock negativo si corresponde;
- nunca resolver con last-write-wins.

### Clase E — acciones regulatorias/externas

Ejemplos:
- CPE;
- DT-e;
- facturación fiscal;
- otra autorización externa.

Política:
- datos pueden prepararse offline;
- se crea estado local `prepared`;
- no se marca `authorized` sin respuesta externa;
- la ejecución efectiva requiere conectividad;
- reintentos deben ser idempotentes contra el adapter cuando sea posible.

## 7. Orden y dependencias

Los comandos no se procesan necesariamente sólo por timestamp.

Ejemplo:

```text
Create GrainBatch
  ↓
Create GrainTransfer referencing that batch
  ↓
Create Load referencing transfer/batch
```

El outbox debe conservar dependencias.

Un comando dependiente:
- espera si su dependencia sigue pendiente;
- se procesa cuando la dependencia queda confirmada;
- se bloquea con razón visible si la dependencia es rechazada;
- puede remapear referencias locales a identificadores autoritativos si la estrategia técnica lo requiere.

Preferencia: usar identificadores estables generados en origen para reducir remapeo.

## 8. Evidencia offline

Una EvidenceRecord puede existir antes del upload binario.

Debe poder conservar localmente:
- local evidence id;
- mime/type;
- capture timestamp;
- subject reference;
- file/blob reference local;
- size/hash cuando sea posible;
- upload state.

Estados conceptuales:
- local;
- queued;
- uploading;
- uploaded;
- failed;
- conflict/rejected.

La entidad operacional no debe “perder” la referencia a la evidencia porque el archivo todavía no subió.

## 9. Tiempo

Se distinguen:
- occurred_at_local;
- device timezone/offset;
- queued_at_local;
- received_at_server;
- external_authority_timestamp cuando exista.

No se debe reemplazar el momento observado en campo por la hora del servidor.

Si el reloj del dispositivo parece inconsistente:
- conservar valor original;
- registrar advertencia/calidad;
- no corregirlo silenciosamente.

## 10. Posición

Una posición GPS debe incluir, cuando esté disponible:
- lat/lon;
- observed_at;
- accuracy;
- source;
- optional altitude/speed.

Una posición manual no se presenta como GPS.

## 11. Eliminaciones

Offline no ejecutará hard delete de información operacional crítica.

Política:
- cancelación;
- tombstone;
- supersession;
- invalidation;
según dominio.

Hard delete queda reservado para datos que la política de retención permita eliminar y no formen parte de auditoría/evidencia.

## 12. Correcciones

Corregir un valor crítico genera una relación de corrección/supersession.

Ejemplo:

```text
WeightRecord A = 21,350 kg [manual]
Correction B = 21,530 kg [ticket]
B supersedes A
A remains auditable
```

El read model muestra el valor vigente, pero la historia permanece.

## 13. Sync result

Cada comando sincronizado recibe uno de estos resultados conceptuales:

- `accepted`;
- `duplicate`;
- `conflict`;
- `rejected`;
- `blocked_dependency`;
- `pending_external`.

La UI nunca debe mostrar “sincronizado” cuando el resultado sea conflict/rejected/pending_external.

## 14. UX mínima de sincronización

Estados visibles por registro/operación:

- ✓ Confirmado;
- ↑ Pendiente;
- ⟳ Sincronizando;
- ⚠ Conflicto;
- ! Rechazado;
- ◷ Pendiente externo.

La pantalla principal puede resumir conteos, pero el operador debe poder identificar qué elemento necesita acción.

## 15. Estrategia ante caída durante envío

El cliente asume que una respuesta perdida no implica que el servidor no procesó la operación.

Por eso:
1. reintenta con el mismo `client_operation_id`;
2. el servidor devuelve resultado previo si ya fue procesada;
3. nunca genera otro id para “hacer que pase”.

## 16. Reintentos

Se distinguen:

### Retry técnico
Ejemplo: timeout/red.

Puede reintentarse automáticamente.

### Retry de negocio
Ejemplo: CPE rechazada por datos inválidos.

Requiere corregir datos o decisión humana.
No se repite indefinidamente.

### Retry por conflicto
Requiere:
- refrescar estado;
- reevaluar intención;
- resolver o regenerar comando basado en nueva revisión.

## 17. Realtime

Realtime no reemplaza sync.

Puede usarse para:
- actualizar checks multioperador;
- composición/estado visible;
- llegada de cambios confirmados;
- alertas operativas.

Pero:
- una desconexión de realtime no puede impedir trabajar;
- el estado local conserva revisión;
- al reconectar se ejecuta reconciliación normal.

## 18. Multi-device

Dos dispositivos pueden operar sobre la misma campaña.

Requisitos:
- identidad de dispositivo;
- actor identificado;
- idempotencia por operación;
- revisión por aggregate;
- read models actualizables;
- conflictos visibles.

No se intenta bloquear todo el sistema con locks largos.

## 19. Seguridad conceptual

Offline cachea sólo lo necesario para el scope autorizado del usuario/dispositivo.

Al revocar acceso:
- el servidor deja de aceptar comandos;
- el cliente debe purgar o inutilizar datos locales según política;
- una cola vieja no recupera privilegios por haber sido creada offline.

Los detalles de auth/tokens/RLS se deciden en arquitectura técnica.

## 20. Telemetría

Telemetría de alta frecuencia no viaja por el mismo outbox semántico que comandos de negocio.

Ejemplo:
- GPS cada segundo → telemetry path;
- “Trip departed” → domain/application command.

La arquitectura futura puede almacenar/batchear telemetría separadamente.

## 21. Invariantes de aceptación

Una implementación de sync no es válida si puede:
1. crear dos GrainTransfers por un retry;
2. perder una foto pendiente por cerrar la app;
3. cerrar dos veces una WorkSession;
4. convertir `prepared CPE` en `authorized` sin autoridad externa;
5. ocultar un conflicto de stock;
6. borrar una pesada anterior al corregirla;
7. cambiar silenciosamente un operador histórico;
8. marcar como “confirmado” un comando rechazado;
9. depender de conexión para registrar una parada o transferencia;
10. usar la hora del servidor como sustituto del hecho observado.

## 22. Gate para persistencia

El modelo físico deberá demostrar soporte para:
- ids offline estables;
- revisiones;
- outbox durable;
- dedupe/idempotency;
- append/corrections;
- evidence pending uploads;
- dependency ordering;
- explicit sync result;
- conflict records;
- external pending states.

Sólo después se eligen tablas, índices, funciones y APIs.
