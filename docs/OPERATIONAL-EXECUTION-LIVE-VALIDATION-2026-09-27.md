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
