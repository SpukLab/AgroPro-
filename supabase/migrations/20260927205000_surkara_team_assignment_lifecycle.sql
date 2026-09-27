-- SURKARA Team Assignment Lifecycle — close temporal assignments without deleting history.

create or replace function public.process_end_team_assignment(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_assignment_id uuid,
  p_operational_team_id uuid,
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
  v_assignment public.team_assignments%rowtype;
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;
  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
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

  select *
    into v_assignment
    from public.team_assignments ta
   where ta.id = p_assignment_id
     and ta.organization_id = p_organization_id
     and ta.operational_team_id = p_operational_team_id;

  if not found then
    raise exception 'team assignment not found' using errcode = '23503';
  end if;

  if p_valid_to < v_assignment.valid_from then
    raise exception 'valid_to before valid_from' using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'operations.end_team_assignment',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'assignmentId', p_assignment_id,
          'operationalTeamId', p_operational_team_id,
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
      'operations.end_team_assignment', v_hash, p_assignment_id::text, null, 'C',
      '{}', p_schema_version, p_occurred_at_local, p_queued_at_local,
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

      if v_receipt.command_type <> 'operations.end_team_assignment'
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
     set valid_to = p_valid_to,
         reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), reason)
   where id = p_assignment_id
     and organization_id = p_organization_id
     and operational_team_id = p_operational_team_id
     and valid_to is null;

  if not found then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'processedAt', v_processed_at,
      'authoritativeRef', 'team_assignment:' || p_assignment_id::text,
      'errorCode', 'assignment_already_closed'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'assignment_already_closed'
     where id = v_receipt.id;

    return v_result;
  end if;

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

revoke all on function public.process_end_team_assignment(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz, text,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_end_team_assignment(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz, text,
  timestamptz, timestamptz, integer
) to service_role;
