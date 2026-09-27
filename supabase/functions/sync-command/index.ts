import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

type UnknownRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(
  source: UnknownRecord,
  key: string,
  options: { optional?: boolean } = {},
): string | undefined {
  const value = source[key];
  if (value == null && options.optional) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`invalid_${key}`);
  }
  return value;
}

function numberField(source: UnknownRecord, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid_${key}`);
  }
  return value;
}

function targetMismatch(clientOperationId: string) {
  return json(
    {
      clientOperationId,
      status: "rejected",
      processedAt: new Date().toISOString(),
      errorCode: "target_ref_mismatch",
    },
    400,
  );
}

const userHandler = withSupabase({ auth: "user" }, async (req, ctx) => {
  if (req.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }

  let body: UnknownRecord;
  try {
    const parsed = await req.json();
    if (!isRecord(parsed)) throw new Error("invalid_body");
    body = parsed;
  } catch {
    return json({ code: "invalid_json" }, 400);
  }

  const actorUserId =
    typeof ctx.jwtClaims?.sub === "string" ? ctx.jwtClaims.sub : undefined;

  if (!actorUserId) {
    return json({ code: "missing_authenticated_user" }, 401);
  }

  try {
    const clientOperationId = stringField(body, "clientOperationId")!;
    const tenantScope = stringField(body, "tenantScope")!;
    const deviceId = stringField(body, "deviceId")!;
    const commandType = stringField(body, "commandType")!;
    const targetRef = stringField(body, "targetRef")!;
    const occurredAtLocal = stringField(body, "occurredAtLocal")!;
    const queuedAtLocal = stringField(body, "queuedAtLocal")!;
    const schemaVersion = numberField(body, "schemaVersion");

    if (schemaVersion !== 1) {
      return json(
        {
          clientOperationId,
          status: "rejected",
          processedAt: new Date().toISOString(),
          errorCode: "unsupported_schema_version",
        },
        400,
      );
    }

    if (!isRecord(body.payload)) {
      return json(
        {
          clientOperationId,
          status: "rejected",
          processedAt: new Date().toISOString(),
          errorCode: "invalid_payload",
        },
        400,
      );
    }

    const payload = body.payload;
    let rpcName: string;
    let rpcArgs: Record<string, unknown>;

    switch (commandType) {
      case "agronomy.create_harvest_operation": {
        const operationId = stringField(payload, "id")!;
        if (targetRef !== operationId) return targetMismatch(clientOperationId);

        rpcName = "process_create_harvest_operation";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_operation_id: operationId,
          p_field_id: stringField(payload, "fieldId")!,
          p_campaign_id: stringField(payload, "campaignId")!,
          p_crop_code:
            stringField(payload, "cropCode", { optional: true }) ??
            stringField(payload, "cropId")!,
          p_planned_area_ha: numberField(payload, "plannedAreaHa"),
          p_planned_from: stringField(payload, "plannedFrom")!,
          p_planned_to: stringField(payload, "plannedTo")!,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "operations.create_operational_team": {
        const teamId = stringField(payload, "id")!;
        if (targetRef !== teamId) return targetMismatch(clientOperationId);

        rpcName = "process_create_operational_team";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_team_id: teamId,
          p_name: stringField(payload, "name")!,
          p_team_type: stringField(payload, "teamType")!,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "contractor.create_job": {
        const jobId = stringField(payload, "id")!;
        if (targetRef !== jobId) return targetMismatch(clientOperationId);

        rpcName = "process_create_contractor_job";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_job_id: jobId,
          p_agricultural_operation_id: stringField(
            payload,
            "agriculturalOperationId",
          )!,
          p_operational_team_id: stringField(payload, "operationalTeamId")!,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "contractor.start_work_session": {
        const sessionId = stringField(payload, "id")!;
        if (targetRef !== sessionId) return targetMismatch(clientOperationId);

        rpcName = "process_start_work_session";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_session_id: sessionId,
          p_contractor_job_id: stringField(payload, "contractorJobId")!,
          p_operational_team_id:
            stringField(payload, "operationalTeamId", { optional: true }) ?? null,
          p_started_at: stringField(payload, "startedAt")!,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "contractor.end_work_session": {
        const sessionId = stringField(payload, "sessionId")!;
        if (targetRef !== sessionId) return targetMismatch(clientOperationId);

        rpcName = "process_end_work_session";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_session_id: sessionId,
          p_expected_revision: numberField(payload, "expectedRevision"),
          p_ended_at: stringField(payload, "endedAt")!,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "operations.create_equipment": {
        const equipmentId = stringField(payload, "id")!;
        if (targetRef !== equipmentId) return targetMismatch(clientOperationId);

        rpcName = "process_create_equipment";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_equipment_id: equipmentId,
          p_equipment_type: stringField(payload, "equipmentType")!,
          p_display_name: stringField(payload, "displayName")!,
          p_make: stringField(payload, "make", { optional: true }) ?? null,
          p_model: stringField(payload, "model", { optional: true }) ?? null,
          p_serial_number:
            stringField(payload, "serialNumber", { optional: true }) ?? null,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "operations.create_team_person": {
        const partyId = stringField(payload, "id")!;
        if (targetRef !== partyId) return targetMismatch(clientOperationId);

        rpcName = "process_create_team_person";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_party_id: partyId,
          p_display_name: stringField(payload, "displayName")!,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "operations.assign_team_member": {
        const assignmentId = stringField(payload, "id")!;
        if (targetRef !== assignmentId) return targetMismatch(clientOperationId);

        rpcName = "process_assign_team_member";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_assignment_id: assignmentId,
          p_operational_team_id: stringField(payload, "operationalTeamId")!,
          p_subject_kind: stringField(payload, "subjectKind")!,
          p_party_id: stringField(payload, "partyId", { optional: true }) ?? null,
          p_equipment_id:
            stringField(payload, "equipmentId", { optional: true }) ?? null,
          p_role: stringField(payload, "role")!,
          p_valid_from: stringField(payload, "validFrom")!,
          p_valid_to: stringField(payload, "validTo", { optional: true }) ?? null,
          p_reason: stringField(payload, "reason", { optional: true }) ?? null,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "operations.end_team_assignment": {
        const assignmentId = stringField(payload, "assignmentId")!;
        if (targetRef !== assignmentId) return targetMismatch(clientOperationId);

        rpcName = "process_end_team_assignment";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_assignment_id: assignmentId,
          p_operational_team_id: stringField(payload, "operationalTeamId")!,
          p_valid_to: stringField(payload, "validTo")!,
          p_reason: stringField(payload, "reason", { optional: true }) ?? null,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      case "operations.correct_team_assignment_label": {
        const assignmentId = stringField(payload, "assignmentId")!;
        if (targetRef !== assignmentId) return targetMismatch(clientOperationId);

        rpcName = "process_correct_team_assignment_label";
        rpcArgs = {
          p_organization_id: tenantScope,
          p_client_operation_id: clientOperationId,
          p_actor_user_id: actorUserId,
          p_device_id: deviceId,
          p_assignment_id: assignmentId,
          p_operational_team_id: stringField(payload, "operationalTeamId")!,
          p_display_label: stringField(payload, "displayLabel")!,
          p_occurred_at_local: occurredAtLocal,
          p_queued_at_local: queuedAtLocal,
          p_schema_version: schemaVersion,
        };
        break;
      }

      default:
        return json(
          {
            clientOperationId,
            status: "rejected",
            processedAt: new Date().toISOString(),
            errorCode: "unsupported_command",
          },
          400,
        );
    }

    const { data, error } = await ctx.supabaseAdmin.rpc(rpcName, rpcArgs);

    if (error) {
      const code = error.code ?? "database_command_failed";

      if (code === "42501") {
        return json(
          {
            clientOperationId,
            status: "rejected",
            processedAt: new Date().toISOString(),
            errorCode: "forbidden",
          },
          403,
        );
      }

      if (code === "23503") {
        return json(
          {
            clientOperationId,
            status: "rejected",
            processedAt: new Date().toISOString(),
            errorCode: "invalid_reference",
          },
          409,
        );
      }

      console.error("sync-command database error", {
        code,
        message: error.message,
        commandType,
        clientOperationId,
      });

      return json(
        {
          clientOperationId,
          status: "rejected",
          processedAt: new Date().toISOString(),
          errorCode: "database_command_failed",
        },
        500,
      );
    }

    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_request";
    return json({ code: message }, 400);
  }
});

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    return userHandler(req);
  },
};
