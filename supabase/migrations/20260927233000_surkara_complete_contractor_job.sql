-- SURKARA ContractorJob completion.
-- Completes the multi-jornada job only when no WorkSession is active.

create or replace function public.process_complete_contractor_job(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_job_id uuid,
  p_expected_revision integer,
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
    into v_job
    from public.contractor_jobs j
   where j.id = p_job_id
     and j.organization_id = p_organization_id;

  if not found then
    raise exception 'contractor job not found' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'contractor.complete_job',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'jobId', p_job_id,
          'expectedRevision', p_expected_revision,
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
      'contractor.complete_job', v_hash, p_job_id::text,
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

      if v_receipt.command_type <> 'contractor.complete_job'
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
          'contractor_job:' || p_job_id::text
        )
      );
  end;

  if v_job.status = 'completed' then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_job.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'contractor_job:' || p_job_id::text,
      'errorCode', 'job_already_completed'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'job_already_completed'
     where id = v_receipt.id;

    return v_result;
  end if;

  if v_job.status = 'cancelled' then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_job.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'contractor_job:' || p_job_id::text,
      'errorCode', 'job_not_completable'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'job_not_completable'
     where id = v_receipt.id;

    return v_result;
  end if;

  if v_job.revision <> p_expected_revision then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_job.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'contractor_job:' || p_job_id::text,
      'errorCode', 'revision_conflict'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'revision_conflict'
     where id = v_receipt.id;

    return v_result;
  end if;

  if exists (
    select 1
      from public.work_sessions ws
     where ws.organization_id = p_organization_id
       and ws.contractor_job_id = p_job_id
       and ws.status = 'active'
  ) then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_job.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'contractor_job:' || p_job_id::text,
      'errorCode', 'job_has_active_session'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'job_has_active_session'
     where id = v_receipt.id;

    return v_result;
  end if;

  update public.contractor_jobs
     set status = 'completed',
         revision = revision + 1,
         updated_at = v_processed_at
   where id = p_job_id
     and organization_id = p_organization_id
     and revision = p_expected_revision
     and status not in ('completed', 'cancelled');

  if not found then
    select *
      into v_job
      from public.contractor_jobs j
     where j.id = p_job_id
       and j.organization_id = p_organization_id;

    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_job.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'contractor_job:' || p_job_id::text,
      'errorCode', 'concurrent_job_change'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'concurrent_job_change'
     where id = v_receipt.id;

    return v_result;
  end if;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', p_expected_revision + 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'contractor_job:' || p_job_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_complete_contractor_job(
  uuid, uuid, uuid, text, uuid, integer, timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_complete_contractor_job(
  uuid, uuid, uuid, text, uuid, integer, timestamptz, timestamptz, integer
) to service_role;
