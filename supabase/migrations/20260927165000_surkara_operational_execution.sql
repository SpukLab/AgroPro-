-- SURKARA Operational Execution — authoritative commands for team/job/session creation.
-- Adds idempotent Sync Gateway targets without exposing browser writes.

create or replace function public.process_create_operational_team(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_team_id uuid,
  p_name text,
  p_team_type text,
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
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'team name is required' using errcode = '22023';
  end if;
  if p_team_type not in ('harvest','seeding','spraying','maintenance','other') then
    raise exception 'invalid team type' using errcode = '22023';
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
          'commandType', 'operations.create_operational_team',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'teamId', p_team_id,
          'name', trim(p_name),
          'teamType', p_team_type,
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
      'operations.create_operational_team', v_hash, p_team_id::text, null, 'C',
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

      if v_receipt.command_type <> 'operations.create_operational_team'
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
        'serverRevision', coalesce((v_receipt.result_json ->> 'serverRevision')::integer, 1),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'operational_team:' || p_team_id::text
        )
      );
  end;

  begin
    insert into public.operational_teams (
      id, organization_id, name, team_type, revision
    )
    values (
      p_team_id, p_organization_id, trim(p_name), p_team_type, 1
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'serverRevision', (
          select t.revision from public.operational_teams t where t.id = p_team_id
        ),
        'processedAt', v_processed_at,
        'authoritativeRef', 'operational_team:' || p_team_id::text,
        'errorCode', 'team_id_exists'
      );
      update public.command_receipts
      set status = 'conflict', result_json = v_result, error_code = 'team_id_exists'
      where id = v_receipt.id;
      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'operational_team:' || p_team_id::text
  );
  update public.command_receipts set result_json = v_result where id = v_receipt.id;
  return v_result;
end;
$function$;

create or replace function public.process_create_contractor_job(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_job_id uuid,
  p_agricultural_operation_id uuid,
  p_operational_team_id uuid,
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
          'commandType', 'contractor.create_job',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'jobId', p_job_id,
          'agriculturalOperationId', p_agricultural_operation_id,
          'operationalTeamId', p_operational_team_id,
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
      'contractor.create_job', v_hash, p_job_id::text, null, 'C',
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

      if v_receipt.command_type <> 'contractor.create_job'
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
        'serverRevision', coalesce((v_receipt.result_json ->> 'serverRevision')::integer, 1),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'contractor_job:' || p_job_id::text
        )
      );
  end;

  begin
    insert into public.contractor_jobs (
      id, organization_id, agricultural_operation_id, operational_team_id,
      status, revision
    )
    values (
      p_job_id, p_organization_id, p_agricultural_operation_id, p_operational_team_id,
      'ready', 1
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'serverRevision', (
          select j.revision from public.contractor_jobs j where j.id = p_job_id
        ),
        'processedAt', v_processed_at,
        'authoritativeRef', 'contractor_job:' || p_job_id::text,
        'errorCode', 'job_id_exists'
      );
      update public.command_receipts
      set status = 'conflict', result_json = v_result, error_code = 'job_id_exists'
      where id = v_receipt.id;
      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'contractor_job:' || p_job_id::text
  );
  update public.command_receipts set result_json = v_result where id = v_receipt.id;
  return v_result;
end;
$function$;

create or replace function public.process_start_work_session(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_session_id uuid,
  p_contractor_job_id uuid,
  p_operational_team_id uuid,
  p_started_at timestamptz,
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
          'commandType', 'contractor.start_work_session',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'sessionId', p_session_id,
          'contractorJobId', p_contractor_job_id,
          'operationalTeamId', p_operational_team_id,
          'startedAt', p_started_at,
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
      'contractor.start_work_session', v_hash, p_session_id::text, null, 'C',
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

      if v_receipt.command_type <> 'contractor.start_work_session'
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
        'serverRevision', coalesce((v_receipt.result_json ->> 'serverRevision')::integer, 1),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'work_session:' || p_session_id::text
        )
      );
  end;

  begin
    insert into public.work_sessions (
      id, organization_id, contractor_job_id, operational_team_id,
      started_at, status, revision, created_by
    )
    values (
      p_session_id, p_organization_id, p_contractor_job_id, p_operational_team_id,
      p_started_at, 'active', 1, p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'serverRevision', (
          select s.revision from public.work_sessions s where s.id = p_session_id
        ),
        'processedAt', v_processed_at,
        'authoritativeRef', 'work_session:' || p_session_id::text,
        'errorCode', 'session_id_exists'
      );
      update public.command_receipts
      set status = 'conflict', result_json = v_result, error_code = 'session_id_exists'
      where id = v_receipt.id;
      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'work_session:' || p_session_id::text
  );
  update public.command_receipts set result_json = v_result where id = v_receipt.id;
  return v_result;
end;
$function$;

revoke all on function public.process_create_operational_team(
  uuid, uuid, uuid, text, uuid, text, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.process_create_operational_team(
  uuid, uuid, uuid, text, uuid, text, text, timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_create_contractor_job(
  uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.process_create_contractor_job(
  uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_start_work_session(
  uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.process_start_work_session(
  uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, integer
) to service_role;
