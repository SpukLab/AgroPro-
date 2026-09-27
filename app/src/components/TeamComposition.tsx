import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  listActiveExecutionContexts,
  listTeamComposition,
  queueCorrectTeamAssignmentLabel,
  queueEndTeamAssignment,
  queueReplaceTeamMember,
  queueTeamMember,
  type ActiveExecutionContext,
  type TeamCompositionItem
} from "../application/operations/team-composition-service";
import type {
  EquipmentType,
  TeamMemberRole
} from "../domain/operations/team-resource";

interface TeamCompositionProps {
  organizationId: string;
  actorId: string;
  deviceId: string;
  syncVersion: number;
  online: boolean;
  onPendingChanged: () => Promise<void>;
}

type ResourcePreset =
  | "harvester"
  | "tractor"
  | "grain_cart"
  | "harvester_operator"
  | "tractor_operator"
  | "support_operator";

const presetLabels: Record<ResourcePreset, string> = {
  harvester: "Cosechadora",
  tractor: "Tractor",
  grain_cart: "Monotolva",
  harvester_operator: "Operador de cosechadora",
  tractor_operator: "Operador de tractor",
  support_operator: "Operador / apoyo"
};

const presetPlaceholders: Record<ResourcePreset, string> = {
  harvester: "Ej. Cosechadora Vassalli",
  tractor: "Ej. John Deere 1",
  grain_cart: "Ej. Monotolva 1",
  harvester_operator: "Ej. Juan Pérez",
  tractor_operator: "Ej. Juan Pérez",
  support_operator: "Ej. Juan Pérez"
};

const roleLabels: Record<string, string> = {
  harvester: "Cosechadora",
  tractor: "Tractor",
  grain_cart: "Monotolva",
  harvester_operator: "Operador cosechadora",
  tractor_operator: "Operador tractor",
  support_operator: "Operador / apoyo",
  other: "Otro"
};

function localDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

function presetConfig(preset: ResourcePreset):
  | { kind: "equipment"; equipmentType: EquipmentType; role: TeamMemberRole }
  | { kind: "person"; role: TeamMemberRole } {
  switch (preset) {
    case "harvester":
      return { kind: "equipment", equipmentType: "harvester", role: "harvester" };
    case "tractor":
      return { kind: "equipment", equipmentType: "tractor", role: "tractor" };
    case "grain_cart":
      return { kind: "equipment", equipmentType: "grain_cart", role: "grain_cart" };
    case "harvester_operator":
      return { kind: "person", role: "harvester_operator" };
    case "tractor_operator":
      return { kind: "person", role: "tractor_operator" };
    case "support_operator":
      return { kind: "person", role: "support_operator" };
  }
}

export function TeamComposition({
  organizationId,
  actorId,
  deviceId,
  syncVersion,
  online,
  onPendingChanged
}: TeamCompositionProps) {
  const [contexts, setContexts] = useState<ActiveExecutionContext[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [composition, setComposition] = useState<TeamCompositionItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [endingAssignmentId, setEndingAssignmentId] = useState<string>();
  const [rotationTarget, setRotationTarget] = useState<TeamCompositionItem>();
  const [replacementName, setReplacementName] = useState("");
  const [replacementAt, setReplacementAt] = useState(localDateTimeInput(new Date()));
  const [rotationBusy, setRotationBusy] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<TeamCompositionItem>();
  const [correctedName, setCorrectedName] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();
  const [preset, setPreset] = useState<ResourcePreset>("harvester");
  const [displayName, setDisplayName] = useState("");
  const [validFrom, setValidFrom] = useState(localDateTimeInput(new Date()));

  const selected = useMemo(
    () => contexts.find((item) => item.sessionId === selectedSessionId) ?? contexts[0],
    [contexts, selectedSessionId]
  );

  async function refreshContexts() {
    setLoading(true);
    try {
      const next = await listActiveExecutionContexts(organizationId);
      setContexts(next);
      setSelectedSessionId((current) =>
        current && next.some((item) => item.sessionId === current)
          ? current
          : next[0]?.sessionId ?? ""
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshComposition(teamId: string) {
    try {
      setComposition(await listTeamComposition(organizationId, teamId));
    } catch (error) {
      if (online) setMessage(messageOf(error));
    }
  }

  useEffect(() => {
    setContexts([]);
    setComposition([]);
    setSelectedSessionId("");
    void refreshContexts();
  }, [organizationId]);

  useEffect(() => {
    setMessage(undefined);
    void refreshContexts();
  }, [syncVersion]);

  useEffect(() => {
    if (selected?.teamId) {
      void refreshComposition(selected.teamId);
    } else {
      setComposition([]);
    }
  }, [selected?.teamId, syncVersion]);

  async function handleEndAssignment(item: TeamCompositionItem) {
    if (!selected || item.validTo || endingAssignmentId) return;

    const validTo = new Date().toISOString();
    setEndingAssignmentId(item.assignmentId);
    setMessage(undefined);

    try {
      await queueEndTeamAssignment({
        actorId,
        organizationId,
        deviceId,
        operationalTeamId: selected.teamId,
        assignmentId: item.assignmentId,
        validFrom: item.validFrom,
        validTo,
        reason: "Finalizado desde composición operativa"
      });

      setComposition((current) =>
        current.map((candidate) =>
          candidate.assignmentId === item.assignmentId
            ? { ...candidate, validTo, pendingEnd: true }
            : candidate
        )
      );
      await onPendingChanged();
      setMessage(
        online
          ? `${item.displayName} quedó marcado para finalizar y enviado a sincronización.`
          : `${item.displayName} quedó marcado para finalizar. Se sincronizará al recuperar conexión.`
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setEndingAssignmentId(undefined);
    }
  }

  async function handleReplaceMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !rotationTarget) return;

    const name = replacementName.trim();
    if (!name) {
      setMessage("Ingresá el nombre o identificación del reemplazo.");
      return;
    }

    setRotationBusy(true);
    setMessage(undefined);

    try {
      const result = await queueReplaceTeamMember({
        actorId,
        organizationId,
        deviceId,
        operationalTeamId: selected.teamId,
        previous: rotationTarget,
        replacementDisplayName: name,
        effectiveAt: new Date(replacementAt).toISOString()
      });

      const closedAt = result.replacement.validFrom;
      setComposition((current) => [
        ...current.map((item) =>
          item.assignmentId === rotationTarget.assignmentId
            ? { ...item, validTo: closedAt, pendingEnd: true }
            : item
        ),
        result.replacement
      ]);

      await onPendingChanged();
      setMessage(
        online
          ? `Reemplazo preparado: ${rotationTarget.displayName} → ${name}. Se enviaron 3 comandos encadenados a sincronización.`
          : `Reemplazo guardado offline: ${rotationTarget.displayName} → ${name}. Hay 3 comandos encadenados pendientes.`
      );
      setRotationTarget(undefined);
      setReplacementName("");
      setReplacementAt(localDateTimeInput(new Date()));
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setRotationBusy(false);
    }
  }

  async function handleCorrectLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !correctionTarget) return;

    const nextName = correctedName.trim();
    if (!nextName) {
      setMessage("Ingresá el nombre corregido.");
      return;
    }

    if (nextName === correctionTarget.displayName.trim()) {
      setCorrectionTarget(undefined);
      setCorrectedName("");
      return;
    }

    setCorrectionBusy(true);
    setMessage(undefined);

    try {
      await queueCorrectTeamAssignmentLabel({
        actorId,
        organizationId,
        deviceId,
        operationalTeamId: selected.teamId,
        assignmentId: correctionTarget.assignmentId,
        displayLabel: nextName
      });

      setComposition((current) =>
        current.map((item) =>
          item.assignmentId === correctionTarget.assignmentId
            ? {
                ...item,
                displayName: nextName,
                pendingLabelCorrection: true
              }
            : item
        )
      );

      await onPendingChanged();
      setMessage(
        online
          ? `Corrección preparada: "${correctionTarget.displayName}" → "${nextName}". Se enviará a la autoridad remota.`
          : `Corrección guardada offline: "${correctionTarget.displayName}" → "${nextName}". Se sincronizará al recuperar conexión.`
      );
      setCorrectionTarget(undefined);
      setCorrectedName("");
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    const name = displayName.trim();
    if (!name) {
      setMessage("Ingresá un nombre o identificación.");
      return;
    }

    const config = presetConfig(preset);
    setBusy(true);
    setMessage(undefined);

    try {
      const common = {
        actorId,
        organizationId,
        deviceId,
        operationalTeamId: selected.teamId,
        displayName: name,
        role: config.role,
        validFrom: new Date(validFrom).toISOString()
      };

      const queued =
        config.kind === "equipment"
          ? await queueTeamMember({
              ...common,
              kind: "equipment",
              equipmentType: config.equipmentType
            })
          : await queueTeamMember({
              ...common,
              kind: "person"
            });

      await onPendingChanged();
      setMessage(
        online
          ? `${presetLabels[preset]} "${name}" guardado localmente y enviado a sincronización · 2 comandos encadenados.`
          : `${presetLabels[preset]} "${name}" guardado localmente · 2 comandos pendientes hasta recuperar conexión.`
      );
      setDisplayName("");
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <span className="step">EQUIPO DE JORNADA</span>
      <h2>Composición operativa</h2>

      {loading ? (
        <p>Cargando jornadas activas…</p>
      ) : contexts.length === 0 ? (
        <p>No hay una jornada activa confirmada todavía.</p>
      ) : (
        <>
          {contexts.length > 1 && (
            <label className="standalone-label">
              Jornada
              <select
                value={selected?.sessionId ?? ""}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                {contexts.map((context) => (
                  <option key={context.sessionId} value={context.sessionId}>
                    {context.cropCode} · {context.fieldName} · {context.teamName}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selected && (
            <div className="execution-summary">
              <strong>{selected.teamName}</strong>
              <span>
                {selected.cropCode} · {selected.fieldName} · jornada activa
              </span>
            </div>
          )}

          <div className="composition-list">
            {composition.length === 0 ? (
              <p className="empty-note">Todavía no hay integrantes confirmados.</p>
            ) : (
              composition.map((item) => (
                <article className="composition-row" key={item.assignmentId}>
                  <div className="composition-main">
                    <strong>{item.displayName}</strong>
                    <span>{roleLabels[item.role] ?? item.role}</span>
                  </div>
                  <div className="composition-actions">
                    <span
                      className={
                        item.pendingStart ||
                        item.pendingEnd ||
                        item.pendingLabelCorrection
                          ? "assignment-pending"
                          : item.validTo
                            ? "assignment-ended"
                            : "assignment-active"
                      }
                    >
                      {item.pendingStart
                        ? "ALTA PENDIENTE"
                        : item.pendingEnd
                          ? "BAJA PENDIENTE"
                          : item.pendingLabelCorrection
                            ? "CORRECCIÓN PENDIENTE"
                            : item.validTo
                              ? "FINALIZADO"
                              : "ACTIVO"}
                    </span>
                    {!item.pendingStart && (
                      <button
                        className="assignment-correct"
                        type="button"
                        disabled={correctionBusy || rotationBusy || Boolean(endingAssignmentId)}
                        onClick={() => {
                          setCorrectionTarget(item);
                          setCorrectedName(item.displayName);
                          setRotationTarget(undefined);
                          setMessage(undefined);
                        }}
                      >
                        Corregir nombre
                      </button>
                    )}
                    {!item.validTo && !item.pendingStart && (
                      <>
                        <button
                          className="assignment-replace"
                          type="button"
                          disabled={
                            Boolean(endingAssignmentId) ||
                            rotationBusy ||
                            correctionBusy
                          }
                          onClick={() => {
                            setRotationTarget(item);
                            setReplacementName("");
                            setReplacementAt(localDateTimeInput(new Date()));
                            setCorrectionTarget(undefined);
                            setMessage(undefined);
                          }}
                        >
                          Reemplazar
                        </button>
                        <button
                          className="assignment-end"
                          type="button"
                          disabled={
                            Boolean(endingAssignmentId) ||
                            rotationBusy ||
                            correctionBusy
                          }
                          onClick={() => void handleEndAssignment(item)}
                        >
                          {endingAssignmentId === item.assignmentId
                            ? "Marcando…"
                            : "Finalizar"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>

          {correctionTarget && (
            <form
              className="form-stack correction-form"
              onSubmit={(event) => void handleCorrectLabel(event)}
            >
              <div className="rotation-heading">
                <strong>Corregir nombre visible</strong>
                <span>
                  Corrige esta asignación de la jornada sin reemplazar el recurso ni alterar sus horarios.
                </span>
              </div>

              <label>
                Nombre corregido
                <input
                  value={correctedName}
                  onChange={(event) => setCorrectedName(event.target.value)}
                  maxLength={120}
                  required
                />
              </label>

              <div className="rotation-buttons">
                <button
                  className="rotation-cancel"
                  type="button"
                  disabled={correctionBusy}
                  onClick={() => {
                    setCorrectionTarget(undefined);
                    setCorrectedName("");
                  }}
                >
                  Cancelar
                </button>
                <button disabled={correctionBusy} type="submit">
                  {correctionBusy
                    ? "Guardando…"
                    : online
                      ? "Guardar corrección"
                      : "Guardar corrección offline"}
                </button>
              </div>
            </form>
          )}

          {rotationTarget && (
            <form
              className="form-stack rotation-form"
              onSubmit={(event) => void handleReplaceMember(event)}
            >
              <div className="rotation-heading">
                <strong>Reemplazar {rotationTarget.displayName}</strong>
                <span>
                  Rol: {roleLabels[rotationTarget.role] ?? rotationTarget.role}. La asignación anterior conserva su horario de finalización.
                </span>
              </div>

              <label>
                {rotationTarget.subjectKind === "person"
                  ? "Nombre del operador reemplazante"
                  : "Nombre / identificación del recurso reemplazante"}
                <input
                  value={replacementName}
                  onChange={(event) => setReplacementName(event.target.value)}
                  placeholder={
                    rotationTarget.subjectKind === "person"
                      ? "Ej. Operador turno tarde"
                      : "Ej. Reemplazo 2"
                  }
                  maxLength={120}
                  required
                />
              </label>

              <label>
                Reemplazo efectivo desde
                <input
                  type="datetime-local"
                  value={replacementAt}
                  onChange={(event) => setReplacementAt(event.target.value)}
                  required
                />
              </label>

              <div className="rotation-buttons">
                <button
                  className="rotation-cancel"
                  type="button"
                  disabled={rotationBusy}
                  onClick={() => {
                    setRotationTarget(undefined);
                    setReplacementName("");
                  }}
                >
                  Cancelar
                </button>
                <button disabled={rotationBusy} type="submit">
                  {rotationBusy
                    ? "Preparando…"
                    : online
                      ? "Confirmar reemplazo"
                      : "Guardar reemplazo offline"}
                </button>
              </div>
            </form>
          )}

          <form className="form-stack member-form" onSubmit={(event) => void handleAddMember(event)}>
            <div className="member-form-heading">
              <strong>Agregar nuevo integrante</strong>
              <span>
                Elegí el tipo primero. Cambiar de tipo inicia una carga nueva y no modifica los recursos ya confirmados.
              </span>
            </div>

            <fieldset className="resource-fieldset">
              <legend>Recurso</legend>
              <div className="resource-picker" role="group" aria-label="Tipo de recurso">
                {(Object.entries(presetLabels) as [ResourcePreset, string][]).map(
                  ([value, label]) => (
                    <button
                      key={value}
                      className={
                        preset === value
                          ? "resource-option active"
                          : "resource-option"
                      }
                      type="button"
                      aria-pressed={preset === value}
                      onClick={() => {
                        if (value !== preset) {
                          setPreset(value);
                          setDisplayName("");
                          setMessage(undefined);
                        }
                      }}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </fieldset>

            <label>
              {preset.includes("operator")
                ? "Nombre del operador"
                : `Nombre / identificación de ${presetLabels[preset].toLowerCase()}`}
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={presetPlaceholders[preset]}
                maxLength={120}
                required
              />
            </label>

            <label>
              Desde
              <input
                type="datetime-local"
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
                required
              />
            </label>

            <button disabled={busy} type="submit">
              {busy
                ? "Preparando…"
                : online
                  ? `Agregar ${presetLabels[preset]} al equipo`
                  : `Agregar ${presetLabels[preset]} al equipo offline`}
            </button>
          </form>

          {message && <p className="message">{message}</p>}
        </>
      )}
    </section>
  );
}
