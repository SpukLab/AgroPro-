-- SURKARA — enforce the first harvest grain-flow direction.
-- The first slice only models harvester -> grain cart. Load/Storage adds the next hops.

create or replace function public.process_record_grain_transfer(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_transfer_id uuid,
  p_grain_batch_id uuid,
  p_work_session_id uuid,
  p_source_equipment_id uuid,
  p_destination_equipment_id uuid,
  p_quantity_value numeric,
  p_quantity_unit text,
  p_quantity_kg numeric,
  p_provenance text,
  p_occurred_at timestamptz,
  p_note text,
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
  v_batch public.grain_batches%rowtype;
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;

  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;

  if p_quantity_value is null or p_quantity_value <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  if p_quantity_unit not in ('kg','t') then
    raise exception 'invalid quantity unit' using errcode = '22023';
  end if;

  if p_quantity_kg is null
     or p_quantity_kg <= 0
     or (p_quantity_unit = 'kg' and p_quantity_kg <> p_quantity_value)
     or (p_quantity_unit = 't' and p_quantity_kg <> p_quantity_value * 1000) then
    raise exception 'invalid normalized quantity' using errcode = '22023';
  end if;

  if p_provenance not in ('manual','estimated','machine','scale') then
    raise exception 'invalid provenance' using errcode = '22023';
  end if;

  if p_source_equipment_id = p_destination_equipment_id then
    raise exception 'source and destination equipment must differ'
      using errcode = '22023';
  end if;

  if p_note is not null and char_length(p_note) > 240 then
    raise exception 'note too long' using errcode = '22023';
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

  select *
    into v_session
    from public.work_sessions ws
   where ws.id = p_work_session_id
     and ws.organization_id = p_organization_id;

  if not found then
    raise exception 'work session not found' using errcode = '23503';
  end if;

  select *
    into v_batch
    from public.grain_batches gb
   where gb.id = p_grain_batch_id
     and gb.organization_id = p_organization_id;

  if not found then
    raise exception 'grain batch not found' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'harvest.record_grain_transfer',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'transferId', p_transfer_id,
          'grainBatchId', p_grain_batch_id,
          'workSessionId', p_work_session_id,
          'sourceEquipmentId', p_source_equipment_id,
          'destinationEquipmentId', p_destination_equipment_id,
          'quantityValue', p_quantity_value,
          'quantityUnit', p_quantity_unit,
          'quantityKg', p_quantity_kg,
          'provenance', p_provenance,
          'occurredAt', p_occurred_at,
          'note', p_note,
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
      'harvest.record_grain_transfer', v_hash, p_transfer_id::text, null, 'A',
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

      if v_receipt.command_type <> 'harvest.record_grain_transfer'
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
        'authoritativeRef', 'grain_transfer:' || p_transfer_id::text
      );
  end;

  if v_session.status <> 'active' then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_session.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_work_session_id::text,
      'errorCode', 'session_not_active'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'session_not_active'
     where id = v_receipt.id;

    return v_result;
  end if;

  if v_batch.status <> 'open'
     or v_batch.source_work_session_id <> p_work_session_id then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'processedAt', v_processed_at,
      'authoritativeRef', 'grain_batch:' || p_grain_batch_id::text,
      'errorCode', 'batch_not_open_for_session'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'batch_not_open_for_session'
     where id = v_receipt.id;

    return v_result;
  end if;

  if p_occurred_at < v_session.started_at then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_work_session_id::text,
      'errorCode', 'transfer_before_session'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'transfer_before_session'
     where id = v_receipt.id;

    return v_result;
  end if;

  if not exists (
    select 1
      from public.team_assignments ta
     where ta.organization_id = p_organization_id
       and ta.operational_team_id = v_session.operational_team_id
       and ta.equipment_id = p_source_equipment_id
       and ta.role = 'harvester'
       and ta.valid_from <= p_occurred_at
       and (ta.valid_to is null or ta.valid_to >= p_occurred_at)
  ) then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'equipment:' || p_source_equipment_id::text,
      'errorCode', 'source_must_be_active_harvester'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'source_must_be_active_harvester'
     where id = v_receipt.id;

    return v_result;
  end if;

  if not exists (
    select 1
      from public.team_assignments ta
     where ta.organization_id = p_organization_id
       and ta.operational_team_id = v_session.operational_team_id
       and ta.equipment_id = p_destination_equipment_id
       and ta.role = 'grain_cart'
       and ta.valid_from <= p_occurred_at
       and (ta.valid_to is null or ta.valid_to >= p_occurred_at)
  ) then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'equipment:' || p_destination_equipment_id::text,
      'errorCode', 'destination_must_be_active_grain_cart'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'destination_must_be_active_grain_cart'
     where id = v_receipt.id;

    return v_result;
  end if;

  begin
    insert into public.grain_transfers (
      id, organization_id, grain_batch_id, work_session_id,
      source_equipment_id, destination_equipment_id,
      quantity_value, quantity_unit, quantity_kg,
      provenance, occurred_at, note, created_by
    )
    values (
      p_transfer_id, p_organization_id, p_grain_batch_id, p_work_session_id,
      p_source_equipment_id, p_destination_equipment_id,
      p_quantity_value, p_quantity_unit, p_quantity_kg,
      p_provenance, p_occurred_at,
      nullif(trim(coalesce(p_note, '')), ''), p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'grain_transfer:' || p_transfer_id::text,
        'errorCode', 'transfer_id_exists'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'transfer_id_exists'
       where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'grain_transfer:' || p_transfer_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;


revoke all on function public.process_record_grain_transfer(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid,
  numeric, text, numeric, text, timestamptz, text,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_record_grain_transfer(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid,
  numeric, text, numeric, text, timestamptz, text,
  timestamptz, timestamptz, integer
) to service_role;
