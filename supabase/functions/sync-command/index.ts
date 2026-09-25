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

    if (commandType !== "agronomy.create_harvest_operation") {
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
    const operationId = stringField(payload, "id")!;
    const fieldId = stringField(payload, "fieldId")!;
    const campaignId = stringField(payload, "campaignId")!;
    const cropCode =
      stringField(payload, "cropCode", { optional: true }) ??
      stringField(payload, "cropId")!;
    const plannedAreaHa = numberField(payload, "plannedAreaHa");
    const plannedFrom = stringField(payload, "plannedFrom")!;
    const plannedTo = stringField(payload, "plannedTo")!;

    if (targetRef !== operationId) {
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

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "process_create_harvest_operation",
      {
        p_organization_id: tenantScope,
        p_client_operation_id: clientOperationId,
        p_actor_user_id: actorUserId,
        p_device_id: deviceId,
        p_operation_id: operationId,
        p_field_id: fieldId,
        p_campaign_id: campaignId,
        p_crop_code: cropCode,
        p_planned_area_ha: plannedAreaHa,
        p_planned_from: plannedFrom,
        p_planned_to: plannedTo,
        p_occurred_at_local: occurredAtLocal,
        p_queued_at_local: queuedAtLocal,
        p_schema_version: schemaVersion,
      },
    );

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
