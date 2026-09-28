# SURKARA — Operational Execution Live Validation — 2026-09-27

## Estado

**Operational Team → Contractor Job → WorkSession: E2E físico validado.**

## Evidencia en iPhone

Se probó el flujo completo desde la PWA instalada:

1. con el dispositivo offline se preparó una nueva jornada sobre **MAÍZ · Lote 2 · 180 ha**;
2. SURKARA creó localmente una cadena de tres comandos dependientes:
   - Operational Team;
   - Contractor Job;
   - WorkSession;
3. el contador mostró **3 comandos pendientes** en IndexedDB;
4. al recuperar conectividad se pulsó **Sincronizar pendientes** una sola vez;
5. el Sync Engine drenó la cadena completa respetando dependencias;
6. resultado visible: **3 aceptados · 0 duplicados · 0 conflictos · 0 fallos técnicos**;
7. contador posterior: **0 comandos pendientes en este dispositivo**;
8. el contexto agronómico remoto volvió a mostrarse como **CONFIRMADO**.

## Resultado

**PASS.**

Quedan demostradas en dispositivo físico:

- creación offline de una ejecución compuesta;
- persistencia local de dependencias;
- desbloqueo progresivo de comandos dentro de un mismo ciclo de sync;
- escritura autoritativa ordenada en backend;
- ausencia de duplicados/conflictos en el recorrido nominal.

## Siguiente incremento

Composición real del equipo operativo:

- cosechadora;
- tractor;
- monotolva;
- operadores;
- asignaciones temporales;
- rotaciones posteriores sin perder historia.

La UI de operador debe utilizar lenguaje operativo en español; los nombres técnicos internos pueden permanecer en código y documentación.


## Team Composition + Auto Sync — cierre físico 2026-09-27

Validación adicional realizada en iPhone con la PWA instalada:

1. se agregaron recursos y operadores sin conectividad real;
2. la cola llegó a **10 comandos pendientes**;
3. al volver a abrir SURKARA con conectividad disponible, el Sync Engine drenó automáticamente la cola sin intervención manual;
4. la autoridad remota confirmó los nuevos integrantes en el mismo Operational Team;
5. la composición remota quedó formada por maquinaria y operadores con asignaciones temporales activas;
6. el indicador de conectividad fue corregido para comprobar alcance real al Sync Gateway en lugar de depender sólo de `navigator.onLine`.

### Integrantes confirmados remotamente tras la prueba

- Cosechadora Vassalli — cosechadora;
- Jhon deere — tractor;
- Monotolva 1 — monotolva;
- Monotolva xa — monotolva;
- Juan Carlos — operador de cosechadora;
- Bernardo — operador de cosechadora;
- Victor — operador de tractor;
- Jacobo — operador / apoyo.

### Resultado

**PASS.**

Quedó validado en dispositivo físico el comportamiento esperado de **offline queue → reapertura con red → auto-sync → autoridad remota** para composición operativa.


## Rotación de operador + corrección visible — validación física 2026-09-27

Se probó en la PWA instalada una rotación real de operador:

1. **Victor** estaba activo como operador de tractor;
2. se ejecutó **Reemplazar**;
3. SURKARA cerró la asignación anterior y creó una nueva asignación con el mismo rol;
4. la autoridad remota confirmó:
   - Victor → **FINALIZADO**;
   - Victor turno tarde → **ACTIVO**;
   - ambos intervalos se unen en el mismo instante efectivo, sin borrar historia;
5. posteriormente se corrigió un error de tipeo de la nueva asignación mediante **corrección de nombre visible**;
6. la corrección no creó otro operador, no cambió rol ni horarios y no reescribió la identidad maestra de la persona.

### Resultado

**PASS.**

Quedó validada físicamente la semántica **reemplazo ≠ edición destructiva** y la separación **equipo activo / historial de asignaciones**.

## Lifecycle WorkSession / ContractorJob — backend live

Los siguientes recorridos están implementados en cliente, Sync Gateway y PostgreSQL, y fueron probados contra el proyecto Supabase real dentro de transacciones con rollback:

### Cerrar jornada

- una WorkSession activa puede pasar a `completed`;
- `ended_at` y revisión se preservan;
- el cierre duplicado es idempotente;
- una segunda mutación incompatible produce conflicto;
- el cierre de la jornada no borra Operational Team ni asignaciones.

**Backend live: PASS.**

### Trabajo multi-jornada

Un mismo ContractorJob puede conservar:

```text
ContractorJob
├─ WorkSession / Jornada 1
├─ WorkSession / Jornada 2
├─ WorkSession / Jornada 3
└─ ...
```

Se validó:

- cerrar Jornada 1;
- iniciar Jornada 2 sobre el mismo ContractorJob y el mismo Operational Team;
- impedir dos WorkSessions activas simultáneas para el mismo trabajo;
- rechazar un Operational Team que no corresponda al trabajo;
- conservar cada jornada como registro independiente.

**Backend live: PASS.**

### Finalizar trabajo

Se incorporó una acción distinta de **Cerrar jornada**:

- `Cerrar jornada` finaliza sólo una WorkSession;
- `Nueva jornada` continúa el mismo ContractorJob;
- `Finalizar trabajo` cambia el ContractorJob a `completed`;
- no permite finalizar el trabajo mientras exista una WorkSession activa;
- utiliza revisión optimista para detectar concurrencia;
- conserva todas las jornadas y asignaciones históricas.

**Backend live: PASS.**

## Lifecycle multi-jornada — validación física completa

Se completó en iPhone el recorrido extremo a extremo:

1. se cerró la Jornada 1 mediante un segundo paso explícito de confirmación;
2. la jornada dejó el contexto activo y apareció en **Historial de jornadas**;
3. se inició **Nueva jornada** sobre el mismo ContractorJob y el mismo Operational Team;
4. backend confirmó que no se duplicaron ni el trabajo ni el equipo;
5. se cerró Jornada 2;
6. el historial pasó a mostrar **2 jornadas**;
7. con 0 jornadas activas se ejecutó **Finalizar trabajo**;
8. la autoridad remota dejó el ContractorJob en `completed`, revisión 3;
9. el bloque **Trabajo en curso** desapareció y el historial de jornadas permaneció visible.

Evidencia autoritativa final:
- ContractorJob: `completed`;
- WorkSessions activas: **0**;
- WorkSessions completadas: **2**.

**E2E físico multi-jornada: PASS.**
