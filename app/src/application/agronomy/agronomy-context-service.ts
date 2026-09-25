import { getEntityCache, putEntityCache } from "../../infra/local/cache";
import { supabase } from "../../infra/supabase/client";

export interface AgronomyField {
  id: string;
  name: string;
  nominalAreaHa: number;
  establishmentId: string;
  establishmentName: string;
}

export interface AgronomyCampaign {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
}

export interface AgronomyContext {
  fields: AgronomyField[];
  campaigns: AgronomyCampaign[];
  source: "remote" | "cache";
}

export interface SetupAgronomyAttempt {
  clientOperationId: string;
  organizationId: string;
  deviceId: string;
  establishment: { id: string; name: string };
  field: { id: string; name: string; nominalAreaHa: number };
  campaign: { id: string; name: string; startsOn: string; endsOn: string };
  occurredAtLocal: string;
  queuedAtLocal: string;
  schemaVersion: 1;
}

export interface SetupAgronomyInput {
  organizationId: string;
  deviceId: string;
  establishmentName: string;
  fieldName: string;
  nominalAreaHa: number;
  campaignName: string;
  campaignStartsOn: string;
  campaignEndsOn: string;
}

interface SetupAgronomyResult {
  clientOperationId: string;
  status: "accepted" | "duplicate" | "conflict" | "rejected";
  establishmentId?: string;
  fieldId?: string;
  campaignId?: string;
  processedAt: string;
  errorCode?: string;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function cacheKey(organizationId: string) {
  return `agronomy-context:${organizationId}`;
}

export function createSetupAgronomyAttempt(
  input: SetupAgronomyInput
): SetupAgronomyAttempt {
  const now = new Date().toISOString();

  return {
    clientOperationId: crypto.randomUUID(),
    organizationId: input.organizationId,
    deviceId: input.deviceId,
    establishment: {
      id: crypto.randomUUID(),
      name: input.establishmentName.trim()
    },
    field: {
      id: crypto.randomUUID(),
      name: input.fieldName.trim(),
      nominalAreaHa: input.nominalAreaHa
    },
    campaign: {
      id: crypto.randomUUID(),
      name: input.campaignName.trim(),
      startsOn: input.campaignStartsOn,
      endsOn: input.campaignEndsOn
    },
    occurredAtLocal: now,
    queuedAtLocal: now,
    schemaVersion: 1
  };
}

export async function setupAgronomyContext(
  attempt: SetupAgronomyAttempt
): Promise<SetupAgronomyResult> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("setup-agronomy-context", {
    body: attempt
  });

  if (error) throw new Error(`Agronomy setup transport error: ${error.message}`);
  if (!data || typeof data !== "object") {
    throw new Error("Agronomy setup returned an invalid response");
  }

  return data as SetupAgronomyResult;
}

export async function listAgronomyContext(
  organizationId: string
): Promise<AgronomyContext> {
  const client = requireSupabase();

  try {
    const [fieldResult, campaignResult] = await Promise.all([
      client
        .from("fields")
        .select(
          "id, name, nominal_area_ha, establishment_id, establishments!inner(name)"
        )
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }),
      client
        .from("campaigns")
        .select("id, name, starts_on, ends_on")
        .eq("organization_id", organizationId)
        .order("starts_on", { ascending: false })
    ]);

    if (fieldResult.error) throw fieldResult.error;
    if (campaignResult.error) throw campaignResult.error;

    const context: AgronomyContext = {
      fields: (fieldResult.data ?? []).map((row) => {
        const establishment = row.establishments as unknown as { name: string };
        return {
          id: row.id as string,
          name: row.name as string,
          nominalAreaHa: Number(row.nominal_area_ha),
          establishmentId: row.establishment_id as string,
          establishmentName: establishment.name
        };
      }),
      campaigns: (campaignResult.data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        startsOn: row.starts_on as string | null,
        endsOn: row.ends_on as string | null
      })),
      source: "remote"
    };

    await putEntityCache(
      cacheKey(organizationId),
      "agronomy-context",
      organizationId,
      context
    );

    return context;
  } catch (error) {
    const cached = await getEntityCache<AgronomyContext>(cacheKey(organizationId));
    if (cached) return { ...cached, source: "cache" };
    throw error;
  }
}
