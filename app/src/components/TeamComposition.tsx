import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  listActiveExecutionContexts,
  listOpenContractorJobs,
  listRecentWorkSessions,
  listTeamComposition,
  queueCorrectTeamAssignmentLabel,
  queueEndTeamAssignment,
  queueReplaceTeamMember,
  queueTeamMember,
  type ActiveExecutionContext,
  type OpenContractorJob,
  type TeamCompositionItem,
  type WorkSessionHistoryItem
} from "../application/operations/team-composition-service";
import type {
  EquipmentType,
  TeamMemberRole
} from "../domain/operations/team-resource";
import {
  queueCompleteContractorJob,
  queueEndWorkSession,
  queueExistingWorkSessionStart
} from "../application/operations/execution-service";
import { getCommandStatus } from "../infra/local/outbox";
import { SessionFieldRecords } from "./SessionFieldRecords";
import { GrainFlow } from "./GrainFlow";

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
  const [openJobs, setOpenJobs] = useState<OpenContractorJob[]>([]);
  const [selectedOpenJobId, setSelectedOpenJobId] = useState("");
  const [sessionHistory, setSessionHistory] = useState<WorkSessionHistoryItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [composition, setComposition] = useState<TeamCompositionItem[]>([]);
  const [sessionCloseOpen, setSessionCloseOpen] = useState(false);
  const [sessionCloseAt, setSessionCloseAt] = useState(localDateTimeInput(new Date()));
  const [sessionCloseBusy, setSessionCloseBusy] = useState(false);
  const [sessionClosePendingId, setSessionClosePendingId] = useState<string>();
  const [sessionClosePendingCommandId, setSessionClosePendingCommandId] =
    useState<string>();
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeAt, setResumeAt] = useState(localDateTimeInput(new Date()));
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumePendingCommandId, setResumePendingCommandId] = useState<string>();
  const [jobCompleteOpen, setJobCompleteOpen] = useState(false);
  const [jobCompleteBusy, setJobCompleteBusy] = useState(false);
  const [jobCompletePendingCommandId, setJobCompletePendingCommandId] =
    useState<string>();
  const [busy, setBusy] = useState(false);
  const [endingAssignmentId, setEndingAssignmentId] = useState<string>();
  const [finalizationTarget, setFinalizationTarget] = useState<TeamCompositionItem>();
  const [finalizationAt, setFinalizationAt] = useState(localDateTimeInput(new Date()));
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

  const selectedOpenJob = useMemo(
    () =>
      openJobs.find((item) => item.jobId === selectedOpenJobId) ??
      openJobs[0],
    [openJobs, selectedOpenJobId]
  );

  const resumePending = Boolean(resumePendingCommandId);
  const jobCompletePending = Boolean(jobCompletePendingCommandId);

  const activeComposition = useMemo(
    () => composition.filter((item) => !item.validTo || item.pendingEnd),
    [composition]
  );

  const historicalComposition = useMemo(
    () => composition.filter((item) => item.validTo && !item.pendingEnd),
    [composition]
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

  async function refreshSessionHistory() {
    try {
      setSessionHistory(await listRecentWorkSessions(organizationId));
    } catch (error) {
      if (online) setMessage(messageOf(error));
    }
  }

  async function refreshOpenJobs() {
    try {
      const next = await listOpenContractorJobs(organizationId);
      setOpenJobs(next);
      setSelectedOpenJobId((current) =>
        current && next.some((item) => item.jobId === current)
          ? current
          : next[0]?.jobId ?? ""
      );
    } catch (error) {
      if (online) setMessage(messageOf(error));
    }
  }

  async function reconcileLifecyclePendingState() {
    const activeStatuses = new Set(["pending", "syncing", "pending_external"]);

    if (resumePendingCommandId) {
      const status = await getCommandStatus(resumePendingCommandId);
      if (!status || !activeStatuses.has(status)) {
        setResumePendingCommandId(undefined);
      }
    }

    if (jobCompletePendingCommandId) {
      const status = await getCommandStatus(jobCompletePendingCommandId);
      if (!status || !activeStatuses.has(status)) {
        setJobCompletePendingCommandId(undefined);
      }
    }

    if (sessionClosePendingCommandId) {
      const status = await getCommandStatus(sessionClosePendingCommandId);
      if (!status || !activeStatuses.has(status)) {
        setSessionClosePendingCommandId(undefined);
        setSessionClosePendingId(undefined);
      }
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
    setOpenJobs([]);
    setComposition([]);
    setSelectedSessionId("");
    setSelectedOpenJobId("");
    void refreshContexts();
    void refreshOpenJobs();
    void refreshSessionHistory();
  }, [organizationId]);

  useEffect(() => {
    setMessage(undefined);
    void refreshContexts();
    void refreshOpenJobs();
    void refreshSessionHistory();
    void reconcileLifecyclePendingState();
  }, [syncVersion]);

  useEffect(() => {
    if (selected?.teamId) {
      void refreshComposition(selected.teamId);
    } else {
      setComposition([]);
    }
  }, [selected?.teamId, syncVersion]);

  useEffect(() => {
    if (!selected?.sessionId) return;

    setValidFrom(localDateTimeInput(new Date()));
    setDisplayName("");
    setPreset("harvester");
  }, [selected?.sessionId]);

  async function handleEndAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const item = finalizationTarget;
    if (!selected || !item || item.validTo || endingAssignmentId) return;

    const validTo = new Date(finalizationAt).toISOString();
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
      setFinalizationTarget(undefined);
      setFinalizationAt(localDateTimeInput(new Date()));
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

  async function handleCloseSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || sessionCloseBusy || sessionClosePendingId === selected.sessionId) {
      return;
    }

    setSessionCloseBusy(true);
    setMessage(undefined);

    try {
      const command = await queueEndWorkSession({
        actorId,
        organizationId,
        deviceId,
        sessionId: selected.sessionId,
        startedAt: selected.startedAt,
        expectedRevision: selected.revision,
        endedAt: new Date(sessionCloseAt).toISOString()
      });

      setSessionClosePendingId(selected.sessionId);
      setSessionClosePendingCommandId(command.clientOperationId);
      setSessionCloseOpen(false);
      await onPendingChanged();
      setMessage(
        online
          ? `Cierre de jornada preparado para ${selected.teamName} y enviado a sincronización.`
          : `Cierre de jornada guardado offline para ${selected.teamName}. Se sincronizará al recuperar conexión.`
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setSessionCloseBusy(false);
    }
  }

  async function handleResumeJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const job = selectedOpenJob;
    if (!job || resumeBusy || resumePending) return;

    setResumeBusy(true);
    setMessage(undefined);

    try {
      const command = await queueExistingWorkSessionStart({
        actorId,
        organizationId,
        deviceId,
        contractorJobId: job.jobId,
        operationalTeamId: job.teamId,
        startedAt: new Date(resumeAt).toISOString()
      });

      setResumePendingCommandId(command.clientOperationId);
      setResumeOpen(false);
      await onPendingChanged();
      setMessage(
        online
          ? `Nueva jornada preparada para ${job.teamName} y enviada a sincronización.`
          : `Nueva jornada guardada offline para ${job.teamName}. Se sincronizará al recuperar conexión.`
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setResumeBusy(false);
    }
  }

  async function handleCompleteJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const job = selectedOpenJob;
    if (!job || jobCompleteBusy || jobCompletePending) return;

    setJobCompleteBusy(true);
    setMessage(undefined);

    try {
      const command = await queueCompleteContractorJob({
        actorId,
        organizationId,
        deviceId,
        jobId: job.jobId,
        expectedRevision: job.revision
      });

      setJobCompletePendingCommandId(command.clientOperationId);
      setJobCompleteOpen(false);
      await onPendingChanged();
      setMessage(
        online
          ? `Finalización del trabajo preparada para ${job.teamName} y enviada a sincronización.`
          : `Finalización del trabajo guardada offline para ${job.teamName}. Se sincronizará al recuperar conexión.`
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setJobCompleteBusy(false);
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

  function formatSessionMoment(value: string) {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function formatSessionDuration(startedAt: string, endedAt: string) {
    const minutes = Math.max(
      0,
      Math.round(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000
      )
    );
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (hours === 0) return `${rest} min`;
    if (rest === 0) return `${hours} h`;
    return `${hours} h ${rest} min`;
  }

  function renderCompositionRow(item: TeamCompositionItem) {
    return (
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
          {item.validTo && !item.pendingStart && (
            <button
              className="assignment-correct"
              type="button"
              disabled={correctionBusy || rotationBusy || Boolean(endingAssignmentId)}
              onClick={() => {
                setCorrectionTarget(item);
                setCorrectedName(item.displayName);
                setRotationTarget(undefined);
                setFinalizationTarget(undefined);
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
                  setFinalizationTarget(undefined);
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
                onClick={() => {
                  setFinalizationTarget(item);
                  setFinalizationAt(localDateTimeInput(new Date()));
                  setCorrectionTarget(undefined);
                  setRotationTarget(undefined);
                  setMessage(undefined);
                }}
              >
                Finalizar
              </button>
            </>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="card">
      <span className="step">EQUIPO DE JORNADA</span>
      <h2>Composición operativa</h2>

      {loading ? (
        <p>Cargando jornadas activas…</p>
      ) : contexts.length === 0 ? (
        <>
          <p>No hay una jornada activa confirmada todavía.</p>

          {openJobs.length > 1 && (
            <label className="standalone-label">
              Trabajo abierto
              <select
                value={selectedOpenJob?.jobId ?? ""}
                onChange={(event) => {
                  setSelectedOpenJobId(event.target.value);
                  setResumeOpen(false);
                  setJobCompleteOpen(false);
                  setMessage(undefined);
                }}
              >
                {openJobs.map((job) => (
                  <option key={job.jobId} value={job.jobId}>
                    {job.cropCode} · {job.fieldName} · {job.teamName}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedOpenJob && (
              <div className="resume-session-card">
                <div>
                  <strong>Trabajo en curso</strong>
                  <span>
                    {selectedOpenJob.cropCode} · {selectedOpenJob.fieldName} · {selectedOpenJob.teamName}
                  </span>
                </div>

                {!resumeOpen && !jobCompleteOpen ? (
                  <div className="job-lifecycle-actions">
                    <button
                      className="resume-session-trigger"
                      type="button"
                      disabled={resumePending || jobCompletePending}
                      onClick={() => {
                        setResumeAt(localDateTimeInput(new Date()));
                        setResumeOpen(true);
                        setJobCompleteOpen(false);
                        setMessage(undefined);
                      }}
                    >
                      {resumePending ? "INICIO PENDIENTE" : "Nueva jornada"}
                    </button>
                    <button
                      className="job-complete-trigger"
                      type="button"
                      disabled={resumePending || jobCompletePending}
                      onClick={() => {
                        setJobCompleteOpen(true);
                        setResumeOpen(false);
                        setMessage(undefined);
                      }}
                    >
                      {jobCompletePending ? "CIERRE PENDIENTE" : "Finalizar trabajo"}
                    </button>
                  </div>
                ) : resumeOpen ? (
                  <form
                    className="form-stack resume-session-form"
                    onSubmit={(event) => void handleResumeJob(event)}
                  >
                    <label>
                      Inicio de nueva jornada
                      <input
                        type="datetime-local"
                        value={resumeAt}
                        onChange={(event) => setResumeAt(event.target.value)}
                        required
                      />
                    </label>
                    <div className="rotation-buttons">
                      <button
                        className="rotation-cancel"
                        type="button"
                        disabled={resumeBusy}
                        onClick={() => setResumeOpen(false)}
                      >
                        Cancelar
                      </button>
                      <button disabled={resumeBusy} type="submit">
                        {resumeBusy
                          ? "Preparando…"
                          : online
                            ? "Iniciar nueva jornada"
                            : "Guardar inicio offline"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form
                    className="form-stack job-complete-form"
                    onSubmit={(event) => void handleCompleteJob(event)}
                  >
                    <div className="rotation-heading">
                      <strong>Finalizar trabajo</strong>
                      <span>
                        Cierra el trabajo completo después de sus jornadas. El historial de jornadas y equipo se conserva.
                      </span>
                    </div>
                    <div className="rotation-buttons">
                      <button
                        className="rotation-cancel"
                        type="button"
                        disabled={jobCompleteBusy}
                        onClick={() => setJobCompleteOpen(false)}
                      >
                        Cancelar
                      </button>
                      <button disabled={jobCompleteBusy} type="submit">
                        {jobCompleteBusy
                          ? "Finalizando…"
                          : online
                            ? "Confirmar finalización"
                            : "Guardar finalización offline"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

          {message && <p className="message">{message}</p>}
        </>
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
            <>
              <div className="execution-summary">
                <div className="session-summary-main">
                  <strong>{selected.teamName}</strong>
                  <span>
                    {selected.cropCode} · {selected.fieldName} · jornada activa
                  </span>
                </div>
                <button
                  className="session-close-trigger"
                  type="button"
                  disabled={sessionClosePendingId === selected.sessionId}
                  onClick={() => {
                    setSessionCloseOpen(true);
                    setSessionCloseAt(localDateTimeInput(new Date()));
                    setCorrectionTarget(undefined);
                    setRotationTarget(undefined);
                    setFinalizationTarget(undefined);
                    setMessage(undefined);
                  }}
                >
                  {sessionClosePendingId === selected.sessionId
                    ? "CIERRE PENDIENTE"
                    : "Cerrar jornada"}
                </button>
              </div>

              {sessionCloseOpen && (
                <form
                  className="form-stack session-close-form"
                  onSubmit={(event) => void handleCloseSession(event)}
                >
                  <div className="rotation-heading">
                    <strong>Cerrar jornada</strong>
                    <span>
                      Finaliza esta sesión de trabajo. No borra el equipo ni sus asignaciones históricas.
                    </span>
                  </div>

                  <label>
                    Fin de jornada
                    <input
                      type="datetime-local"
                      value={sessionCloseAt}
                      onChange={(event) => setSessionCloseAt(event.target.value)}
                      required
                    />
                  </label>

                  <div className="rotation-buttons">
                    <button
                      className="rotation-cancel"
                      type="button"
                      disabled={sessionCloseBusy}
                      onClick={() => setSessionCloseOpen(false)}
                    >
                      Cancelar
                    </button>
                    <button disabled={sessionCloseBusy} type="submit">
                      {sessionCloseBusy
                        ? "Cerrando…"
                        : online
                          ? "Confirmar cierre"
                          : "Guardar cierre offline"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          <SessionFieldRecords
            organizationId={organizationId}
            actorId={actorId}
            deviceId={deviceId}
            workSessionId={selected.sessionId}
            sessionStartedAt={selected.startedAt}
            equipment={activeComposition
              .filter((item) => item.subjectKind === "equipment")
              .map((item) => ({
                id: item.subjectId,
                label: item.displayName
              }))}
            syncVersion={syncVersion}
            online={online}
            onPendingChanged={onPendingChanged}
          />

          <GrainFlow
            organizationId={organizationId}
            actorId={actorId}
            deviceId={deviceId}
            workSessionId={selected.sessionId}
            agriculturalOperationId={selected.agriculturalOperationId}
            equipment={activeComposition
              .filter((item) => item.subjectKind === "equipment")
              .map((item) => ({
                id: item.subjectId,
                label: item.displayName,
                role: item.role
              }))}
            syncVersion={syncVersion}
            online={online}
            onPendingChanged={onPendingChanged}
          />

          <div className="composition-list">
            <div className="composition-section-heading">
              <strong>Equipo activo</strong>
              <span>{activeComposition.length}</span>
            </div>
            {activeComposition.length === 0 ? (
              <p className="empty-note">No hay integrantes activos.</p>
            ) : (
              activeComposition.map(renderCompositionRow)
            )}
          </div>

          {historicalComposition.length > 0 && (
            <details className="composition-history">
              <summary>
                Historial de asignaciones
                <span>{historicalComposition.length}</span>
              </summary>
              <div className="composition-list history-list">
                {historicalComposition.map(renderCompositionRow)}
              </div>
            </details>
          )}

          {finalizationTarget && (
            <form
              className="form-stack finalization-form"
              onSubmit={(event) => void handleEndAssignment(event)}
            >
              <div className="rotation-heading">
                <strong>Finalizar asignación de {finalizationTarget.displayName}</strong>
                <span>
                  Esta acción no borra el historial. El integrante dejará de estar activo desde la fecha indicada.
                </span>
              </div>

              <label>
                Finalizar desde
                <input
                  type="datetime-local"
                  value={finalizationAt}
                  onChange={(event) => setFinalizationAt(event.target.value)}
                  required
                />
              </label>

              <div className="rotation-buttons">
                <button
                  className="rotation-cancel"
                  type="button"
                  disabled={Boolean(endingAssignmentId)}
                  onClick={() => {
                    setFinalizationTarget(undefined);
                    setFinalizationAt(localDateTimeInput(new Date()));
                  }}
                >
                  Cancelar
                </button>
                <button disabled={Boolean(endingAssignmentId)} type="submit">
                  {endingAssignmentId === finalizationTarget.assignmentId
                    ? "Finalizando…"
                    : online
                      ? "Confirmar finalización"
                      : "Guardar finalización offline"}
                </button>
              </div>
            </form>
          )}

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

              <button
                className="rotation-correct-trigger"
                type="button"
                disabled={rotationBusy || correctionBusy}
                onClick={() => {
                  setCorrectionTarget(rotationTarget);
                  setCorrectedName(rotationTarget.displayName);
                  setRotationTarget(undefined);
                  setReplacementName("");
                  setMessage(undefined);
                }}
              >
                Solo corregir el nombre
              </button>

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

      {sessionHistory.length > 0 && (
        <details className="session-history">
          <summary>
            Historial de jornadas
            <span>{sessionHistory.length}</span>
          </summary>
          <div className="session-history-list">
            {sessionHistory.map((session) => (
              <article className="session-history-row" key={session.sessionId}>
                <div>
                  <strong>{session.teamName}</strong>
                  <span>
                    {session.cropCode} · {session.fieldName}
                  </span>
                </div>
                <div className="session-history-meta">
                  <span>{formatSessionMoment(session.startedAt)}</span>
                  <b>{formatSessionDuration(session.startedAt, session.endedAt)}</b>
                  <span>{formatSessionMoment(session.endedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
