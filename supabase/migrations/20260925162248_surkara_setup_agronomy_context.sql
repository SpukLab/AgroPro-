create or replace function public.process_setup_agronomy_context(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_establishment_id uuid,
  p_establishment_name text,
  p_field_id uuid,
  p_field_name text,
  p_nominal_area_ha numeric,
  p_campaign_id uuid,
  p_campaign_name text,
  p_campaign_starts_on date,
  p_campaign_ends_on date,
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
    raise exception 'unsupported schema version: %', p_schema_version using errcode = '22023';
  end if;

  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;

  if p_establishment_name is null
     or char_length(trim(p_establishment_name)) < 2
     or char_length(trim(p_establishment_name)) > 120 then
    raise exception 'invalid establishment name' using errcode = '22023';
  end if;

  if p_field_name is null
     or char_length(trim(p_field_name)) < 1
     or char_length(trim(p_field_name)) > 120 then
    raise exception 'invalid field name' using errcode = '22023';
  end if;

  if p_nominal_area_ha is null or p_nominal_area_ha <= 0 then
    raise exception 'nominal area must be greater than zero' using errcode = '22023';
  end if;

  if p_campaign_name is null
     or char_length(trim(p_campaign_name)) < 2
     or char_length(trim(p_campaign_name)) > 120 then
    raise exception 'invalid campaign name' using errcode = '22023';
  end if;

  if p_campaign_ends_on < p_campaign_starts_on then
    raise exception 'campaign end must not precede start' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = p_organization_id
       and m.user_id = p_actor_user_id
       and m.active
       and m.role in ('owner','admin')
  ) then
    raise exception 'actor is not allowed to configure agronomy context' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text, 0)
  );

  v_command_hash := encode(
    public.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'agronomy.setup_context',
          'organizationId', p_organization_id,
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'establishmentId', p_establishment_id,
          'establishmentName', trim(p_establishment_name),
          'fieldId', p_field_id,
          'fieldName', trim(p_field_name),
          'nominalAreaHa', p_nominal_area_ha,
          'campaignId', p_campaign_id,
          'campaignName', trim(p_campaign_name),
          'campaignStartsOn', p_campaign_starts_on,
          'campaignEndsOn', p_campaign_ends_on,
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
      'agronomy.setup_context', v_command_hash, p_establishment_id::text,
      null, 'C', '{}', p_schema_version, p_occurred_at_local,
      p_queued_at_local, 'accepted', null, v_processed_at
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

      if v_receipt.command_type <> 'agronomy.setup_context'
         or v_receipt.command_hash <> v_command_hash
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
        'establishmentId', p_establishment_id,
        'fieldId', p_field_id,
        'campaignId', p_campaign_id,
        'processedAt', v_receipt.processed_at
      );
  end;

  begin
    insert into public.establishments(id, organization_id, name)
    values (p_establishment_id, p_organization_id, trim(p_establishment_name));

    insert into public.fields(
      id, organization_id, establishment_id, name, nominal_area_ha
    )
    values (
      p_field_id, p_organization_id, p_establishment_id,
      trim(p_field_name), p_nominal_area_ha
    );

    insert into public.campaigns(
      id, organization_id, name, starts_on, ends_on
    )
    values (
      p_campaign_id, p_organization_id, trim(p_campaign_name),
      p_campaign_starts_on, p_campaign_ends_on
    );
  exception
    when unique_violation or foreign_key_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'errorCode', 'context_identity_conflict'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'context_identity_conflict'
       where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'establishmentId', p_establishment_id,
    'fieldId', p_field_id,
    'campaignId', p_campaign_id,
    'processedAt', v_processed_at
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_setup_agronomy_context(
  uuid, uuid, uuid, text, uuid, text, uuid, text, numeric,
  uuid, text, date, date, timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_setup_agronomy_context(
  uuid, uuid, uuid, text, uuid, text, uuid, text, numeric,
  uuid, text, date, date, timestamptz, timestamptz, integer
) to service_role;
