# Role-aware UX and Field Signals v0.1

Status: working architecture note  
Scope: SURKARA operational UX, role projection and low-friction field signalling.

## 1. Principle

SURKARA remains one platform and one operational data model. Different users see different projections of the same authoritative state according to organization membership, permissions, current assignments and work context.

Do not create separate products for owner, operator or transport. Do not duplicate operational facts between role-specific views.

## 2. Initial role projections

### Owner / administrator
Primary needs:
- global operational status;
- fields, campaigns and jobs;
- equipment and people;
- transport and storage;
- historical metrics, costs and exceptions;
- organization and access management.

### Supervisor / foreman
Primary needs:
- today's work;
- team assignments;
- progress and incidents;
- resource replacement;
- jornada and job closure;
- cross-team exceptions.

### Harvester operator
Primary needs:
- current jornada and assigned harvester;
- field record;
- grain transfer;
- call grain-cart operator;
- incidents and waiting;
- minimal navigation.

### Grain-cart operator ("carrero")
Primary needs:
- current team and grain cart;
- incoming unload requests;
- requester + harvester + location/context;
- acknowledge / en route / attended;
- transfer capture.

### Transport driver
Primary needs:
- assigned loads;
- source and destination;
- trip state;
- waiting;
- unload, weight/ticket and documents.

### Other operational roles
Maintenance, storage, dairy, feedlot and inventory should receive dedicated projections later without changing domain authority.

## 3. UX rule

Login resolves organization + role(s) + current assignments. The default landing view is the most relevant active work context.

A user with multiple roles may switch context explicitly. Routine users should not need to choose a role on every launch.

Technical diagnostics, IndexedDB, device IDs and gateway details are not part of the normal field workflow. They belong in a collapsed diagnostic surface.

## 4. Current navigation increment

For an active harvest jornada, the first-level mobile navigation is:

- Parte
- Grano
- Equipo

Inside Grano:

- Transferencia
- Camión
- Silo

Planning and new-work configuration remain available but secondary while a jornada is active.

This is a UI projection change only. Offline-first command identity, sync semantics and domain authority remain unchanged.

## 5. Field signal: "Llamar carrero"

"Llamar carrero" is modeled as an operational signal, not as an unstructured chat message.

Suggested lifecycle:

1. requested
2. acknowledged
3. en_route
4. attended
5. cancelled

Minimum event context:

- organization_id
- work_session_id
- agricultural_operation_id
- requester actor/assignment
- harvester equipment_id
- target grain-cart assignment or team
- requested_at
- optional device location
- optional urgency / note
- lifecycle timestamps

The signal may later link to the resulting GrainTransfer without making the signal itself authoritative for quantity.

## 6. Delivery channels

Primary authority: SURKARA internal event/state.

Possible delivery adapters:
- in-app realtime notification;
- push notification;
- WhatsApp notification as external delivery/fallback;
- future radio/telematics bridge.

WhatsApp must not become the system of record. A delivery adapter may fail or be unavailable while the SURKARA signal remains valid.

## 7. Offline behavior

If the harvester operator has no connectivity:
- the request is stored locally with stable identity;
- UI shows pending delivery;
- sync occurs when connectivity returns;
- duplicates must be idempotent.

For true low-latency field use with intermittent signal, later research should evaluate local radio/mesh/vehicle gateway options. This is outside the current web-PWA increment.

## 8. Telemetry evolution

Manual button first.

Later, machine telemetry may suggest a call when grain tank fill reaches a threshold. Initial automation should remain confirm-before-send. Fully automatic dispatch requires evidence that sensor quality and operational rules are reliable.

## 9. Metrics enabled by this model

Once signals are structured, SURKARA can derive:
- request-to-ack time;
- request-to-arrival time;
- harvester waiting time;
- calls per hectare / batch / jornada;
- repeated or cancelled calls;
- relationship between waiting and harvest throughput.

These are derived metrics; they must not rewrite source operational events.

## 10. Next implementation boundaries

1. Complete mobile navigation refactor and physical validation.
2. Add role/permission projection to Identity & Tenancy.
3. Add field-signal domain contract and local outbox command.
4. Add in-app carrero request UI.
5. Add realtime/push delivery.
6. Add WhatsApp adapter if operationally useful and commercially justified.
7. Add telemetry-assisted suggestion only after the manual flow is validated.
