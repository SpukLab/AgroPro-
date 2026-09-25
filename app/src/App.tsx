import { useEffect, useState } from "react";
import { createHarvestOperation } from "./domain/operations/agricultural-operation";
import type { OfflineCommand } from "./domain/sync/types";
import { surkaraDb } from "./infra/local/db";
import { enqueueCommand } from "./infra/local/outbox";
import { isSupabaseConfigured } from "./infra/supabase/client";
import "./styles.css";

function makeDemoCommand(): OfflineCommand {
  const now = new Date().toISOString();
  const operation = createHarvestOperation({
    fieldId: "field-demo",
    campaignId: "campaign-demo",
    cropId: "soy-demo",
    plannedAreaHa: 180,
    plannedFrom: now,
    plannedTo: new Date(Date.now() + 86_400_000).toISOString()
  });

  return {
    clientOperationId: crypto.randomUUID(),
    actorId: "local-demo",
    deviceId: "browser-demo",
    tenantScope: "surkara-demo",
    commandType: "agronomy.create_harvest_operation",
    targetRef: operation.id,
    occurredAtLocal: now,
    queuedAtLocal: now,
    payload: operation,
    conflictClass: "C",
    dependencies: [],
    evidenceRefs: [],
    schemaVersion: 1
  };
}

export default function App() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [lastOperation, setLastOperation] = useState<string>();

  async function refreshPending() {
    setPending(await surkaraDb.outbox.where("status").equals("pending").count());
  }

  useEffect(() => {
    void refreshPending();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function createLocalOperation() {
    const command = makeDemoCommand();
    await enqueueCommand(command);
    setLastOperation(command.targetRef);
    await refreshPending();
  }

  return (
    <main className="shell">
      <header>
        <div>
          <span className="eyebrow">SURKARA</span>
          <h1>Operational Core</h1>
        </div>
        <span className={online ? "status online" : "status offline"}>
          {online ? "ONLINE" : "OFFLINE"}
        </span>
      </header>

      <section className="hero">
        <p>Milestone A · offline-first scaffold</p>
        <strong>{pending}</strong>
        <span>comandos pendientes en este dispositivo</span>
      </section>

      <section className="card">
        <h2>Prueba local</h2>
        <p>
          Crea una operación de cosecha de 180 ha y la guarda en el outbox de IndexedDB.
          No requiere backend ni conexión.
        </p>
        <button onClick={() => void createLocalOperation()}>
          Crear operación local
        </button>
        {lastOperation && <small>Última operación: {lastOperation}</small>}
      </section>

      <section className="grid">
        <article>
          <span>Persistencia local</span>
          <b>Dexie / IndexedDB</b>
        </article>
        <article>
          <span>Backend</span>
          <b>{isSupabaseConfigured ? "Supabase configurado" : "Pendiente de proyecto SURKARA"}</b>
        </article>
        <article>
          <span>Sincronización</span>
          <b>Outbox propio</b>
        </article>
        <article>
          <span>Realtime</span>
          <b>Secundario</b>
        </article>
      </section>
    </main>
  );
}
