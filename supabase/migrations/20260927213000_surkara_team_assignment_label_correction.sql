-- SURKARA Team Assignment Label Correction
-- Corrects the visible label for one historical assignment without mutating
-- the underlying Party or Equipment master identity.

alter table public.team_assignments
  add column if not exists display_label_override text;

alter table public.team_assignments
  drop constraint if exists team_assignments_display_label_override_check;

alter table public.team_assignments
  add constraint team_assignments_display_label_override_check
  check (
    display_label_override is null
    or char_length(trim(display_label_override)) > 0
  );

create or replace function public.process_correct_team_assignment_label(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_assignment_id uuid,
  p_operational_team_id uuid,
  p_display_label text,
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

  if p_display_label is null or char_length(trim(p_display_label)) = 0 then
    raise exception 'display label is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = p_organization_id
       and m.user_id = p_actor_user_id
       and m.active
  ) then
    raise exception 'actor has no active organization membership' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.team_assignments ta
     where ta.id = p_assignment_id
       and ta.organization_id = p_organization_id
       and ta.operational_team_id = p_operational_team_id
  ) then
    raise exception 'team assignment not found' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'operations.correct_team_assignment_label',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'assignmentId', p_assignment_id,
          'operationalTeamId', p_operational_team_id,
          'displayLabel', trim(p_display_label),
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
      'operations.correct_team_assignment_label', v_hash,
      p_assignment_id::text, null, 'C', '{}', p_schema_version,
      p_occurred_at_local, p_queued_at_local,
      'accepted', null, v_processed_at
    )
    returning * into v_receipt;
  exception
    when unique_violation then
      select *
        into v_receipt
        from public.command_receipts r
       where r.organization_id = p_organization_id
         and r.client_operation_id = p_client_operation_id;

      if not found then raise; end if;

      if v_receipt.command_type <> 'operations.correct_team_assignment_label'
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
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'team_assignment:' || p_assignment_id::text
        )
      );
  end;

  update public.team_assignments
     set display_label_override = trim(p_display_label)
   where id = p_assignment_id
     and organization_id = p_organization_id
     and operational_team_id = p_operational_team_id;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'processedAt', v_processed_at,
    'authoritativeRef', 'team_assignment:' || p_assignment_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_correct_team_assignment_label(
  uuid, uuid, uuid, text, uuid, uuid, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_correct_team_assignment_label(
  uuid, uuid, uuid, text, uuid, uuid, text, timestamptz, timestamptz, integer
) to service_role;
