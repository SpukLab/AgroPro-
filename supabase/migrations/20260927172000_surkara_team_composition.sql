-- SURKARA Team Composition — resources and temporal team assignments.

alter table public.organization_parties
  drop constraint if exists organization_parties_relationship_kind_check;

alter table public.organization_parties
  add constraint organization_parties_relationship_kind_check
  check (
    relationship_kind in (
      'client','supplier','contractor','carrier','advisor','owner','worker','other'
    )
  );

create or replace function public.process_create_equipment(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_equipment_id uuid,
  p_equipment_type text,
  p_display_name text,
  p_make text,
  p_model text,
  p_serial_number text,
  p_occurred_at_local timestamptz,
  p_queued_at_local timestamptz,
  p_schema_version integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_hash text;
  v_receipt public.command_receipts%rowtype;
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;
  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;
  if p_equipment_type not in ('harvester','tractor','grain_cart','truck','implement','other') then
    raise exception 'invalid equipment type' using errcode = '22023';
  end if;
  if p_display_name is null or char_length(trim(p_display_name)) = 0 then
    raise exception 'display name is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.active
  ) then
    raise exception 'actor has no active organization membership' using errcode = '42501';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'operations.create_equipment',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'equipmentId', p_equipment_id,
          'equipmentType', p_equipment_type,
          'displayName', trim(p_display_name),
          'make', nullif(trim(coalesce(p_make, '')), ''),
          'model', nullif(trim(coalesce(p_model, '')), ''),
          'serialNumber', nullif(trim(coalesce(p_serial_number, '')), ''),
          'occurredAtLocal', p_occurred_at_local,
          'schemaVersion', p_schema_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  begin
    insert into public.command_receipts (
      organization_id, client_operation_id, actor_user_id, device_id,
      command_type, command_hash, target_ref, base_revision, conflict_class,
      dependencies, schema_version, occurred_at_local, queued_at_local,
      status, result_json, processed_at
    )
    values (
      p_organization_id, p_client_operation_id, p_actor_user_id, p_device_id,
      'operations.create_equipment', v_hash, p_equipment_id::text, null, 'C',
      '{}', p_schema_version, p_occurred_at_local, p_queued_at_local,
      'accepted', null, v_processed_at
    )
    returning * into v_receipt;
  exception
    when unique_violation then
      select * into v_receipt
      from public.command_receipts r
      where r.organization_id = p_organization_id
        and r.client_operation_id = p_client_operation_id;

      if not found then raise; end if;

      if v_receipt.command_type <> 'operations.create_equipment'
         or v_receipt.command_hash <> v_hash
         or v_receipt.actor_user_id <> p_actor_user_id then
        return jsonb_build_object(
          'clientOperationId', p_client_operation_id,
          'status', 'rejected',
          'processedAt', clock_timestamp(),
          'errorCode', 'idempotency_key_reused'
        );
      end if;

      return jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'duplicate',
        'serverRevision', 1,
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'equipment:' || p_equipment_id::text
        )
      );
  end;

  begin
    insert into public.equipment (
      id, organization_id, equipment_type, display_name, make, model, serial_number
    )
    values (
      p_equipment_id,
      p_organization_id,
      p_equipment_type,
      trim(p_display_name),
      nullif(trim(coalesce(p_make, '')), ''),
      nullif(trim(coalesce(p_model, '')), ''),
      nullif(trim(coalesce(p_serial_number, '')), '')
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'equipment:' || p_equipment_id::text,
        'errorCode', 'equipment_id_exists'
      );
      update public.command_receipts
      set status = 'conflict', result_json = v_result, error_code = 'equipment_id_exists'
      where id = v_receipt.id;
      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'equipment:' || p_equipment_id::text
  );
  update public.command_receipts set result_json = v_result where id = v_receipt.id;
  return v_result;
end;
$function$;

create or replace function public.process_create_team_person(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_party_id uuid,
  p_display_name text,
  p_occurred_at_local timestamptz,
  p_queued_at_local timestamptz,
  p_schema_version integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_hash text;
  v_receipt public.command_receipts%rowtype;
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;
  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;
  if p_display_name is null or char_length(trim(p_display_name)) = 0 then
    raise exception 'display name is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.active
  ) then
    raise exception 'actor has no active organization membership' using errcode = '42501';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'operations.create_team_person',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'partyId', p_party_id,
          'displayName', trim(p_display_name),
          'occurredAtLocal', p_occurred_at_local,
          'schemaVersion', p_schema_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  begin
    insert into public.command_receipts (
      organization_id, client_operation_id, actor_user_id, device_id,
      command_type, command_hash, target_ref, base_revision, conflict_class,
      dependencies, schema_version, occurred_at_local, queued_at_local,
      status, result_json, processed_at
    )
    values (
      p_organization_id, p_client_operation_id, p_actor_user_id, p_device_id,
      'operations.create_team_person', v_hash, p_party_id::text, null, 'C',
      '{}', p_schema_version, p_occurred_at_local, p_queued_at_local,
      'accepted', null, v_processed_at
    )
    returning * into v_receipt;
  exception
    when unique_violation then
      select * into v_receipt
      from public.command_receipts r
      where r.organization_id = p_organization_id
        and r.client_operation_id = p_client_operation_id;

      if not found then raise; end if;

      if v_receipt.command_type <> 'operations.create_team_person'
         or v_receipt.command_hash <> v_hash
         or v_receipt.actor_user_id <> p_actor_user_id then
        return jsonb_build_object(
          'clientOperationId', p_client_operation_id,
          'status', 'rejected',
          'processedAt', clock_timestamp(),
          'errorCode', 'idempotency_key_reused'
        );
      end if;

      return jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'duplicate',
        'serverRevision', 1,
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'party:' || p_party_id::text
        )
      );
  end;

  begin
    insert into public.parties (id, party_type, display_name)
    values (p_party_id, 'person', trim(p_display_name));

    insert into public.organization_parties (
      organization_id, party_id, relationship_kind, valid_from
    )
    values (
      p_organization_id, p_party_id, 'worker', p_occurred_at_local
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'party:' || p_party_id::text,
        'errorCode', 'party_id_exists'
      );
      update public.command_receipts
      set status = 'conflict', result_json = v_result, error_code = 'party_id_exists'
      where id = v_receipt.id;
      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'party:' || p_party_id::text
  );
  update public.command_receipts set result_json = v_result where id = v_receipt.id;
  return v_result;
end;
$function$;

create or replace function public.process_assign_team_member(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_assignment_id uuid,
  p_operational_team_id uuid,
  p_subject_kind text,
  p_party_id uuid,
  p_equipment_id uuid,
  p_role text,
  p_valid_from timestamptz,
  p_valid_to timestamptz,
  p_reason text,
  p_occurred_at_local timestamptz,
  p_queued_at_local timestamptz,
  p_schema_version integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_hash text;
  v_receipt public.command_receipts%rowtype;
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;
  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;
  if p_subject_kind not in ('person','equipment') then
    raise exception 'invalid subject kind' using errcode = '22023';
  end if;
  if p_role not in (
    'harvester','tractor','grain_cart',
    'harvester_operator','tractor_operator','support_operator','other'
  ) then
    raise exception 'invalid team role' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to < p_valid_from then
    raise exception 'valid_to before valid_from' using errcode = '22023';
  end if;
  if p_subject_kind = 'person' and (p_party_id is null or p_equipment_id is not null) then
    raise exception 'person assignment requires party only' using errcode = '22023';
  end if;
  if p_subject_kind = 'equipment' and (p_equipment_id is null or p_party_id is not null) then
    raise exception 'equipment assignment requires equipment only' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.active
  ) then
    raise exception 'actor has no active organization membership' using errcode = '42501';
  end if;
  if p_subject_kind = 'person' and not exists (
    select 1 from public.organization_parties op
    where op.organization_id = p_organization_id
      and op.party_id = p_party_id
  ) then
    raise exception 'person is not related to organization' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'operations.assign_team_member',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'assignmentId', p_assignment_id,
          'operationalTeamId', p_operational_team_id,
          'subjectKind', p_subject_kind,
          'partyId', p_party_id,
          'equipmentId', p_equipment_id,
          'role', p_role,
          'validFrom', p_valid_from,
          'validTo', p_valid_to,
          'reason', nullif(trim(coalesce(p_reason, '')), ''),
          'occurredAtLocal', p_occurred_at_local,
          'schemaVersion', p_schema_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  begin
    insert into public.command_receipts (
      organization_id, client_operation_id, actor_user_id, device_id,
      command_type, command_hash, target_ref, base_revision, conflict_class,
      dependencies, schema_version, occurred_at_local, queued_at_local,
      status, result_json, processed_at
    )
    values (
      p_organization_id, p_client_operation_id, p_actor_user_id, p_device_id,
      'operations.assign_team_member', v_hash, p_assignment_id::text, null, 'C',
      '{}', p_schema_version, p_occurred_at_local, p_queued_at_local,
      'accepted', null, v_processed_at
    )
    returning * into v_receipt;
  exception
    when unique_violation then
      select * into v_receipt
      from public.command_receipts r
      where r.organization_id = p_organization_id
        and r.client_operation_id = p_client_operation_id;

      if not found then raise; end if;

      if v_receipt.command_type <> 'operations.assign_team_member'
         or v_receipt.command_hash <> v_hash
         or v_receipt.actor_user_id <> p_actor_user_id then
        return jsonb_build_object(
          'clientOperationId', p_client_operation_id,
          'status', 'rejected',
          'processedAt', clock_timestamp(),
          'errorCode', 'idempotency_key_reused'
        );
      end if;

      return jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'duplicate',
        'serverRevision', 1,
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'team_assignment:' || p_assignment_id::text
        )
      );
  end;

  begin
    insert into public.team_assignments (
      id, organization_id, operational_team_id, party_id, equipment_id,
      role, valid_from, valid_to, reason
    )
    values (
      p_assignment_id, p_organization_id, p_operational_team_id, p_party_id, p_equipment_id,
      p_role, p_valid_from, p_valid_to, nullif(trim(coalesce(p_reason, '')), '')
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'team_assignment:' || p_assignment_id::text,
        'errorCode', 'assignment_id_exists'
      );
      update public.command_receipts
      set status = 'conflict', result_json = v_result, error_code = 'assignment_id_exists'
      where id = v_receipt.id;
      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'team_assignment:' || p_assignment_id::text
  );
  update public.command_receipts set result_json = v_result where id = v_receipt.id;
  return v_result;
end;
$function$;

revoke all on function public.process_create_equipment(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.process_create_equipment(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text,
  timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_create_team_person(
  uuid, uuid, uuid, text, uuid, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.process_create_team_person(
  uuid, uuid, uuid, text, uuid, text, timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_assign_team_member(
  uuid, uuid, uuid, text, uuid, uuid, text, uuid, uuid, text,
  timestamptz, timestamptz, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.process_assign_team_member(
  uuid, uuid, uuid, text, uuid, uuid, text, uuid, uuid, text,
  timestamptz, timestamptz, text, timestamptz, timestamptz, integer
) to service_role;
