-- SURKARA — continue an existing ContractorJob across multiple WorkSessions.
-- Hardens start_work_session so one job cannot have two active sessions and
-- the session team must match the job team.

create unique index if not exists work_sessions_one_active_per_job_idx
  on public.work_sessions (organization_id, contractor_job_id)
  where status = 'active';

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
  v_job public.contractor_jobs%rowtype;
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
    into v_job
    from public.contractor_jobs j
   where j.id = p_contractor_job_id
     and j.organization_id = p_organization_id;

  if not found then
    raise exception 'contractor job not found' using errcode = '23503';
  end if;

  if v_job.operational_team_id is distinct from p_operational_team_id then
    raise exception 'operational team does not match contractor job' using errcode = '23503';
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
      select *
        into v_receipt
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
        'serverRevision', coalesce(
          (v_receipt.result_json ->> 'serverRevision')::integer,
          1
        ),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'work_session:' || p_session_id::text
        )
      );
  end;

  if v_job.status in ('completed', 'cancelled') then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_job.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'contractor_job:' || p_contractor_job_id::text,
      'errorCode', 'job_not_startable'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'job_not_startable'
     where id = v_receipt.id;

    return v_result;
  end if;

  if exists (
    select 1
      from public.work_sessions ws
     where ws.organization_id = p_organization_id
       and ws.contractor_job_id = p_contractor_job_id
       and ws.status = 'active'
  ) then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_job.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'contractor_job:' || p_contractor_job_id::text,
      'errorCode', 'job_has_active_session'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'job_has_active_session'
     where id = v_receipt.id;

    return v_result;
  end if;

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
      if exists (
        select 1
          from public.work_sessions ws
         where ws.id = p_session_id
           and ws.organization_id = p_organization_id
      ) then
        v_result := jsonb_build_object(
          'clientOperationId', p_client_operation_id,
          'status', 'conflict',
          'processedAt', v_processed_at,
          'authoritativeRef', 'work_session:' || p_session_id::text,
          'errorCode', 'session_id_exists'
        );
      else
        v_result := jsonb_build_object(
          'clientOperationId', p_client_operation_id,
          'status', 'conflict',
          'serverRevision', v_job.revision,
          'processedAt', v_processed_at,
          'authoritativeRef', 'contractor_job:' || p_contractor_job_id::text,
          'errorCode', 'job_has_active_session'
        );
      end if;

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = v_result ->> 'errorCode'
       where id = v_receipt.id;

      return v_result;
  end;

  update public.contractor_jobs
     set status = case when status = 'ready' then 'active' else status end,
         revision = case when status = 'ready' then revision + 1 else revision end,
         updated_at = case when status = 'ready' then v_processed_at else updated_at end
   where id = p_contractor_job_id
     and organization_id = p_organization_id;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'work_session:' || p_session_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_start_work_session(
  uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_start_work_session(
  uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz,
  timestamptz, timestamptz, integer
) to service_role;
