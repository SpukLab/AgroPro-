-- SURKARA Milestone A — first atomic command draft.
-- NOT APPLIED to any Supabase project.

create or replace function public.process_create_harvest_operation(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_operation_id uuid,
  p_field_id uuid,
  p_campaign_id uuid,
  p_crop_code text,
  p_planned_area_ha numeric,
  p_planned_from timestamptz,
  p_planned_to timestamptz,
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
  v_command_hash text;
  v_receipt public.command_receipts%rowtype;
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version: %', p_schema_version
      using errcode = '22023';
  end if;

  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required'
      using errcode = '22023';
  end if;

  if p_crop_code is null or char_length(trim(p_crop_code)) = 0 then
    raise exception 'crop code is required'
      using errcode = '22023';
  end if;

  if p_planned_area_ha is null or p_planned_area_ha <= 0 then
    raise exception 'planned area must be greater than zero'
      using errcode = '22023';
  end if;

  if p_planned_to < p_planned_from then
    raise exception 'planned_to must not be before planned_from'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.active
  ) then
    raise exception 'actor has no active organization membership'
      using errcode = '42501';
  end if;

  v_command_hash := encode(
    public.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'agronomy.create_harvest_operation',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'operationId', p_operation_id,
          'fieldId', p_field_id,
          'campaignId', p_campaign_id,
          'cropCode', p_crop_code,
          'plannedAreaHa', p_planned_area_ha,
          'plannedFrom', p_planned_from,
          'plannedTo', p_planned_to,
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
      organization_id,
      client_operation_id,
      actor_user_id,
      device_id,
      command_type,
      command_hash,
      target_ref,
      base_revision,
      conflict_class,
      dependencies,
      schema_version,
      occurred_at_local,
      queued_at_local,
      status,
      result_json,
      processed_at
    )
    values (
      p_organization_id,
      p_client_operation_id,
      p_actor_user_id,
      p_device_id,
      'agronomy.create_harvest_operation',
      v_command_hash,
      p_operation_id::text,
      null,
      'C',
      '{}',
      p_schema_version,
      p_occurred_at_local,
      p_queued_at_local,
      'accepted',
      null,
      v_processed_at
    )
    returning * into v_receipt;
  exception
    when unique_violation then
      select *
      into v_receipt
      from public.command_receipts r
      where r.organization_id = p_organization_id
        and r.client_operation_id = p_client_operation_id;

      if not found then
        raise;
      end if;

      if v_receipt.command_type <> 'agronomy.create_harvest_operation'
         or v_receipt.command_hash <> v_command_hash
         or v_receipt.actor_user_id <> p_actor_user_id then
        return jsonb_build_object(
          'clientOperationId', p_client_operation_id,
          'status', 'rejected',
          'processedAt', clock_timestamp(),
          'errorCode', 'idempotency_key_reused',
          'message', 'clientOperationId was already used for different intent'
        );
      end if;

      return jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'duplicate',
        'serverRevision', coalesce((v_receipt.result_json ->> 'serverRevision')::integer, 1),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', coalesce(
          v_receipt.result_json ->> 'authoritativeRef',
          'agricultural_operation:' || p_operation_id::text
        )
      );
  end;

  begin
    insert into public.agricultural_operations (
      id,
      organization_id,
      field_id,
      campaign_id,
      crop_code,
      operation_type,
      planned_area_ha,
      planned_from,
      planned_to,
      status,
      revision,
      created_by
    )
    values (
      p_operation_id,
      p_organization_id,
      p_field_id,
      p_campaign_id,
      trim(p_crop_code),
      'harvest',
      p_planned_area_ha,
      p_planned_from,
      p_planned_to,
      'planned',
      1,
      p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'serverRevision', (
          select o.revision
          from public.agricultural_operations o
          where o.id = p_operation_id
        ),
        'processedAt', v_processed_at,
        'authoritativeRef', 'agricultural_operation:' || p_operation_id::text,
        'errorCode', 'operation_id_exists'
      );

      update public.command_receipts
      set status = 'conflict',
          result_json = v_result,
          error_code = 'operation_id_exists'
      where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'agricultural_operation:' || p_operation_id::text
  );

  update public.command_receipts
  set result_json = v_result
  where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_create_harvest_operation(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, numeric,
  timestamptz, timestamptz, timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_create_harvest_operation(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, numeric,
  timestamptz, timestamptz, timestamptz, timestamptz, integer
) to service_role;
