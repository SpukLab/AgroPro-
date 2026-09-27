-- SURKARA Work Session Closure
-- Completes a WorkSession with optimistic revision checking and preserves team history.

create or replace function public.process_end_work_session(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_session_id uuid,
  p_expected_revision integer,
  p_ended_at timestamptz,
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
  v_session public.work_sessions%rowtype;
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;

  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision <= 0 then
    raise exception 'expected revision must be positive' using errcode = '22023';
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
    into v_session
    from public.work_sessions ws
   where ws.id = p_session_id
     and ws.organization_id = p_organization_id;

  if not found then
    raise exception 'work session not found' using errcode = '23503';
  end if;

  if p_ended_at < v_session.started_at then
    raise exception 'ended_at before started_at' using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'contractor.end_work_session',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'sessionId', p_session_id,
          'expectedRevision', p_expected_revision,
          'endedAt', p_ended_at,
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
      'contractor.end_work_session', v_hash, p_session_id::text,
      p_expected_revision, 'C', '{}', p_schema_version,
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

      if v_receipt.command_type <> 'contractor.end_work_session'
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
        'serverRevision', coalesce(
          (v_receipt.result_json ->> 'serverRevision')::integer,
          p_expected_revision + 1
        ),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'work_session:' || p_session_id::text
        )
      );
  end;

  if v_session.status <> 'active' then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_session.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_session_id::text,
      'errorCode', 'session_not_active'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'session_not_active'
     where id = v_receipt.id;

    return v_result;
  end if;

  if v_session.revision <> p_expected_revision then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_session.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_session_id::text,
      'errorCode', 'revision_conflict'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'revision_conflict'
     where id = v_receipt.id;

    return v_result;
  end if;

  update public.work_sessions
     set ended_at = p_ended_at,
         status = 'completed',
         revision = revision + 1,
         updated_at = v_processed_at
   where id = p_session_id
     and organization_id = p_organization_id
     and status = 'active'
     and revision = p_expected_revision;

  if not found then
    select *
      into v_session
      from public.work_sessions ws
     where ws.id = p_session_id
       and ws.organization_id = p_organization_id;

    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_session.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_session_id::text,
      'errorCode', 'concurrent_session_change'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'concurrent_session_change'
     where id = v_receipt.id;

    return v_result;
  end if;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', p_expected_revision + 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'work_session:' || p_session_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_end_work_session(
  uuid, uuid, uuid, text, uuid, integer, timestamptz,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_end_work_session(
  uuid, uuid, uuid, text, uuid, integer, timestamptz,
  timestamptz, timestamptz, integer
) to service_role;
