import type { OfflineCommand } from "../../domain/sync/types";
import {
  createEquipmentResource,
  createTeamMemberAssignment,
  createTeamPerson,
  type EquipmentResource,
  type EquipmentType,
  type TeamMemberAssignment,
  type TeamMemberRole,
  type TeamPerson
} from "../../domain/operations/team-resource";
import { getEntityCache, putEntityCache } from "../../infra/local/cache";
import { enqueueCommand } from "../../infra/local/outbox";
import { supabase } from "../../infra/supabase/client";

export interface ActiveExecutionContext {
  sessionId: string;
  teamId: string;
  teamName: string;
  agriculturalOperationId: string;
  cropCode: string;
  fieldName: string;
  startedAt: string;
}

export interface TeamCompositionItem {
  assignmentId: string;
  subjectKind: "person" | "equipment";
  subjectId: string;
  displayName: string;
  role: TeamMemberRole | string;
  equipmentType?: string;
  validFrom: string;
  validTo?: string;
}

export type AddTeamMemberInput =
  | {
      actorId: string;
      organizationId: string;
      deviceId: string;
      operationalTeamId: string;
      kind: "equipment";
      equipmentType: EquipmentType;
      displayName: string;
      role: TeamMemberRole;
      validFrom: string;
      make?: string;
      model?: string;
    }
  | {
      actorId: string;
      organizationId: string;
      deviceId: string;
      operationalTeamId: string;
      kind: "person";
      displayName: string;
      role: TeamMemberRole;
      validFrom: string;
    };

function common(input: AddTeamMemberInput) {
  const now = new Date().toISOString();
  return {
    actorId: input.actorId,
    deviceId: input.deviceId,
    tenantScope: input.organizationId,
    occurredAtLocal: now,
    queuedAtLocal: now,
    conflictClass: "C" as const,
    evidenceRefs: [] as string[],
    schemaVersion: 1 as const
  };
}

export async function queueTeamMember(
  input: AddTeamMemberInput
): Promise<{ resourceId: string; assignmentId: string; commandIds: [string, string] }> {
  const base = common(input);
  const resourceCommandId = crypto.randomUUID();
  const assignmentCommandId = crypto.randomUUID();

  if (input.kind === "equipment") {
    const resource = createEquipmentResource({
      equipmentType: input.equipmentType,
      displayName: input.displayName,
      make: input.make,
      model: input.model
    });

    const assignment = createTeamMemberAssignment({
      operationalTeamId: input.operationalTeamId,
      subjectKind: "equipment",
      equipmentId: resource.id,
      role: input.role,
      validFrom: input.validFrom
    });

    const resourceCommand: OfflineCommand<EquipmentResource> = {
      ...base,
      clientOperationId: resourceCommandId,
      commandType: "operations.create_equipment",
      targetRef: resource.id,
      payload: resource,
      dependencies: []
    };

    const assignmentCommand: OfflineCommand<TeamMemberAssignment> = {
      ...base,
      clientOperationId: assignmentCommandId,
      commandType: "operations.assign_team_member",
      targetRef: assignment.id,
      payload: assignment,
      dependencies: [resourceCommandId]
    };

    await enqueueCommand(resourceCommand);
    await enqueueCommand(assignmentCommand);

    return {
      resourceId: resource.id,
      assignmentId: assignment.id,
      commandIds: [resourceCommandId, assignmentCommandId]
    };
  }

  const person = createTeamPerson({ displayName: input.displayName });
  const assignment = createTeamMemberAssignment({
    operationalTeamId: input.operationalTeamId,
    subjectKind: "person",
    partyId: person.id,
    role: input.role,
    validFrom: input.validFrom
  });

  const resourceCommand: OfflineCommand<TeamPerson> = {
    ...base,
    clientOperationId: resourceCommandId,
    commandType: "operations.create_team_person",
    targetRef: person.id,
    payload: person,
    dependencies: []
  };

  const assignmentCommand: OfflineCommand<TeamMemberAssignment> = {
    ...base,
    clientOperationId: assignmentCommandId,
    commandType: "operations.assign_team_member",
    targetRef: assignment.id,
    payload: assignment,
    dependencies: [resourceCommandId]
  };

  await enqueueCommand(resourceCommand);
  await enqueueCommand(assignmentCommand);

  return {
    resourceId: person.id,
    assignmentId: assignment.id,
    commandIds: [resourceCommandId, assignmentCommandId]
  };
}

export async function listActiveExecutionContexts(
  organizationId: string
): Promise<ActiveExecutionContext[]> {
  if (!supabase) throw new Error("Supabase is not configured");
  const key = `active-execution-contexts:${organizationId}`;

  try {
    const { data, error } = await supabase
      .from("work_sessions")
      .select(
        "id, started_at, operational_team_id, operational_teams!inner(name), contractor_jobs!inner(agricultural_operation_id, agricultural_operations!inner(crop_code, fields!inner(name)))"
      )
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("started_at", { ascending: false });

    if (error) throw error;

    const contexts = (data ?? []).map((row) => {
      const team = row.operational_teams as unknown as { name: string };
      const job = row.contractor_jobs as unknown as {
        agricultural_operation_id: string;
        agricultural_operations: { crop_code: string; fields: { name: string } };
      };

      return {
        sessionId: row.id as string,
        teamId: row.operational_team_id as string,
        teamName: team.name,
        agriculturalOperationId: job.agricultural_operation_id,
        cropCode: job.agricultural_operations.crop_code,
        fieldName: job.agricultural_operations.fields.name,
        startedAt: row.started_at as string
      };
    });

    await putEntityCache(key, "active-execution-contexts", organizationId, contexts);
    return contexts;
  } catch (error) {
    const cached = await getEntityCache<ActiveExecutionContext[]>(key);
    if (cached) return cached;
    throw error;
  }
}

export async function listTeamComposition(
  organizationId: string,
  operationalTeamId: string
): Promise<TeamCompositionItem[]> {
  if (!supabase) throw new Error("Supabase is not configured");
  const key = `team-composition:${organizationId}:${operationalTeamId}`;

  try {
    const { data: assignments, error: assignmentError } = await supabase
      .from("team_assignments")
      .select("id, party_id, equipment_id, role, valid_from, valid_to")
      .eq("organization_id", organizationId)
      .eq("operational_team_id", operationalTeamId)
      .order("valid_from", { ascending: true });

    if (assignmentError) throw assignmentError;

    const partyIds = (assignments ?? [])
      .map((row) => row.party_id as string | null)
      .filter((value): value is string => Boolean(value));
    const equipmentIds = (assignments ?? [])
      .map((row) => row.equipment_id as string | null)
      .filter((value): value is string => Boolean(value));

    const [partyResult, equipmentResult] = await Promise.all([
      partyIds.length
        ? supabase.from("parties").select("id, display_name").in("id", partyIds)
        : Promise.resolve({ data: [], error: null }),
      equipmentIds.length
        ? supabase
            .from("equipment")
            .select("id, display_name, equipment_type")
            .eq("organization_id", organizationId)
            .in("id", equipmentIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (partyResult.error) throw partyResult.error;
    if (equipmentResult.error) throw equipmentResult.error;

    const partyNames = new Map(
      (partyResult.data ?? []).map((row) => [row.id as string, row.display_name as string])
    );
    const equipment = new Map(
      (equipmentResult.data ?? []).map((row) => [
        row.id as string,
        {
          displayName: row.display_name as string,
          equipmentType: row.equipment_type as string
        }
      ])
    );

    const items: TeamCompositionItem[] = (assignments ?? []).map((row) => {
      const partyId = row.party_id as string | null;
      const equipmentId = row.equipment_id as string | null;

      if (partyId) {
        return {
          assignmentId: row.id as string,
          subjectKind: "person",
          subjectId: partyId,
          displayName: partyNames.get(partyId) ?? "Persona",
          role: row.role as string,
          validFrom: row.valid_from as string,
          validTo: (row.valid_to as string | null) ?? undefined
        };
      }

      const equipmentData = equipment.get(equipmentId!);
      return {
        assignmentId: row.id as string,
        subjectKind: "equipment",
        subjectId: equipmentId!,
        displayName: equipmentData?.displayName ?? "Equipo",
        equipmentType: equipmentData?.equipmentType,
        role: row.role as string,
        validFrom: row.valid_from as string,
        validTo: (row.valid_to as string | null) ?? undefined
      };
    });

    await putEntityCache(key, "team-composition", operationalTeamId, items);
    return items;
  } catch (error) {
    const cached = await getEntityCache<TeamCompositionItem[]>(key);
    if (cached) return cached;
    throw error;
  }
}
