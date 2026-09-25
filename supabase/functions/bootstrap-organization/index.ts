import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

type UnknownRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(source: UnknownRecord, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`invalid_${key}`);
  }
  return value.trim();
}

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
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
    const clientOperationId = requiredString(body, "clientOperationId");
    const organizationId = requiredString(body, "organizationId");
    const organizationName = requiredString(body, "organizationName");
    const occurredAtLocal = requiredString(body, "occurredAtLocal");
    const schemaVersion = body.schemaVersion;

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

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "process_bootstrap_organization",
      {
        p_client_operation_id: clientOperationId,
        p_actor_user_id: actorUserId,
        p_organization_id: organizationId,
        p_organization_name: organizationName,
        p_occurred_at_local: occurredAtLocal,
        p_schema_version: 1,
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

      if (code === "22023") {
        return json(
          {
            clientOperationId,
            status: "rejected",
            processedAt: new Date().toISOString(),
            errorCode: "invalid_input",
          },
          400,
        );
      }

      console.error("bootstrap-organization database error", {
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
    return handler(req);
  },
};
