import { supabase } from "../../infra/supabase/client";

export type OrganizationRole = "owner" | "admin" | "operator" | "viewer";

export interface OrganizationMembership {
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}

export interface BootstrapAttempt {
  clientOperationId: string;
  organizationId: string;
  organizationName: string;
  occurredAtLocal: string;
  schemaVersion: 1;
}

interface BootstrapResult {
  clientOperationId: string;
  status: "accepted" | "duplicate" | "rejected";
  organizationId?: string;
  membershipRole?: OrganizationRole;
  processedAt: string;
  errorCode?: string;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export function createBootstrapAttempt(name: string): BootstrapAttempt {
  return {
    clientOperationId: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    organizationName: name.trim(),
    occurredAtLocal: new Date().toISOString(),
    schemaVersion: 1
  };
}

export async function listOrganizationMemberships(): Promise<OrganizationMembership[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("organization_memberships")
    .select("organization_id, role, organizations!inner(name)")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const organization = row.organizations as unknown as { name: string };
    return {
      organizationId: row.organization_id as string,
      organizationName: organization.name,
      role: row.role as OrganizationRole
    };
  });
}

export async function bootstrapOrganization(
  attempt: BootstrapAttempt
): Promise<BootstrapResult> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("bootstrap-organization", {
    body: attempt
  });

  if (error) throw new Error(`Onboarding transport error: ${error.message}`);
  if (!data || typeof data !== "object") {
    throw new Error("Onboarding returned an invalid response");
  }

  return data as BootstrapResult;
}
