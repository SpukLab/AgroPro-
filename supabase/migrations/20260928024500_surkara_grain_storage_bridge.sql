-- SURKARA — Grain storage bridge: silo/silobag catalog + receipts.
-- Storage remains its own domain while preserving Harvest GrainBatch lineage.

create table public.grain_storage_units (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  storage_kind text not null check (storage_kind in ('silo','silobag')),
  display_name text not null check (
    char_length(trim(display_name)) between 1 and 120
  ),
  status text not null check (status in ('active')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index grain_storage_units_org_name_uidx
  on public.grain_storage_units(
    organization_id, storage_kind, lower(display_name)
  );

create table public.grain_storage_receipts (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  grain_batch_id uuid not null,
  source_work_session_id uuid not null,
  source_equipment_id uuid not null,
  storage_unit_id uuid not null,
  quantity_value numeric(14,3) not null check (quantity_value > 0),
  quantity_unit text not null check (quantity_unit in ('kg','t')),
  quantity_kg numeric(16,3) not null check (quantity_kg > 0),
  provenance text not null check (
    provenance in ('manual','estimated','machine','scale')
  ),
  received_at timestamptz not null,
  status text not null check (status in ('stored')),
  note text check (note is null or char_length(note) <= 240),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (grain_batch_id, organization_id)
    references public.grain_batches(id, organization_id),
  foreign key (source_work_session_id, organization_id)
    references public.work_sessions(id, organization_id),
  foreign key (source_equipment_id, organization_id)
    references public.equipment(id, organization_id),
  foreign key (storage_unit_id, organization_id)
    references public.grain_storage_units(id, organization_id),
  check (
    (quantity_unit = 'kg' and quantity_kg = quantity_value)
    or
    (quantity_unit = 't' and quantity_kg = quantity_value * 1000)
  )
);

create index grain_storage_receipts_session_time_idx
  on public.grain_storage_receipts(
    organization_id, source_work_session_id, received_at desc
  );

create index grain_storage_receipts_unit_time_idx
  on public.grain_storage_receipts(
    organization_id, storage_unit_id, received_at desc
  );

alter table public.grain_storage_units enable row level security;
alter table public.grain_storage_receipts enable row level security;

revoke all on table
  public.grain_storage_units,
  public.grain_storage_receipts
from anon, authenticated;

grant select on table
  public.grain_storage_units,
  public.grain_storage_receipts
to authenticated;

grant select, insert, update, delete on table
  public.grain_storage_units,
  public.grain_storage_receipts
to service_role;

create policy grain_storage_units_member_select
on public.grain_storage_units
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = grain_storage_units.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create policy grain_storage_receipts_member_select
on public.grain_storage_receipts
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = grain_storage_receipts.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create or replace function public.process_create_grain_storage_unit(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_storage_unit_id uuid,
  p_storage_kind text,
  p_display_name text,
  p_status text,
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
  v_existing public.grain_storage_units%rowtype;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;

  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;

  if p_storage_kind not in ('silo','silobag') or p_status <> 'active' then
    raise exception 'unsupported storage unit state'
      using errcode = '22023';
  end if;

  if p_display_name is null
     or char_length(trim(p_display_name)) < 1
     or char_length(trim(p_display_name)) > 120 then
    raise exception 'invalid display name' using errcode = '22023';
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

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'storage.create_unit',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'storageUnitId', p_storage_unit_id,
          'storageKind', p_storage_kind,
          'displayName', trim(p_display_name),
          'status', p_status,
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
      'storage.create_unit', v_hash, p_storage_unit_id::text, null, 'A',
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

      if v_receipt.command_type <> 'storage.create_unit'
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
        'authoritativeRef', 'grain_storage_unit:' || p_storage_unit_id::text
      );
  end;

  begin
    insert into public.grain_storage_units (
      id, organization_id, storage_kind, display_name, status, created_by
    )
    values (
      p_storage_unit_id, p_organization_id, p_storage_kind,
      trim(p_display_name), p_status, p_actor_user_id
    );
  exception
    when unique_violation then
      select *
        into v_existing
        from public.grain_storage_units su
       where su.organization_id = p_organization_id
         and (
           su.id = p_storage_unit_id
           or (
             su.storage_kind = p_storage_kind
             and lower(su.display_name) = lower(trim(p_display_name))
           )
         )
       limit 1;

      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef',
          case
            when found then 'grain_storage_unit:' || v_existing.id::text
            else null
          end,
        'errorCode',
          case
            when found and v_existing.id = p_storage_unit_id
              then 'storage_unit_id_exists'
            else 'storage_unit_name_exists'
          end
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = v_result ->> 'errorCode'
       where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'grain_storage_unit:' || p_storage_unit_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

create or replace function public.process_record_grain_storage_receipt(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_receipt_id uuid,
  p_grain_batch_id uuid,
  p_source_work_session_id uuid,
  p_source_equipment_id uuid,
  p_storage_unit_id uuid,
  p_quantity_value numeric,
  p_quantity_unit text,
  p_quantity_kg numeric,
  p_provenance text,
  p_received_at timestamptz,
  p_status text,
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

  if p_status <> 'stored' then
    raise exception 'unsupported storage receipt status'
      using errcode = '22023';
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
   where ws.id = p_source_work_session_id
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
          'commandType', 'storage.record_grain_receipt',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'receiptId', p_receipt_id,
          'grainBatchId', p_grain_batch_id,
          'sourceWorkSessionId', p_source_work_session_id,
          'sourceEquipmentId', p_source_equipment_id,
          'storageUnitId', p_storage_unit_id,
          'quantityValue', p_quantity_value,
          'quantityUnit', p_quantity_unit,
          'quantityKg', p_quantity_kg,
          'provenance', p_provenance,
          'receivedAt', p_received_at,
          'status', p_status,
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
      'storage.record_grain_receipt', v_hash, p_receipt_id::text, null, 'A',
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

      if v_receipt.command_type <> 'storage.record_grain_receipt'
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
        'authoritativeRef', 'grain_storage_receipt:' || p_receipt_id::text
      );
  end;

  if v_session.status <> 'active' then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_session.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_source_work_session_id::text,
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
     or v_batch.source_work_session_id <> p_source_work_session_id then
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

  if p_received_at < v_session.started_at then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_source_work_session_id::text,
      'errorCode', 'receipt_before_session'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'receipt_before_session'
     where id = v_receipt.id;

    return v_result;
  end if;

  if not exists (
    select 1
      from public.team_assignments ta
     where ta.organization_id = p_organization_id
       and ta.operational_team_id = v_session.operational_team_id
       and ta.equipment_id = p_source_equipment_id
       and ta.role = 'grain_cart'
       and ta.valid_from <= p_received_at
       and (ta.valid_to is null or ta.valid_to >= p_received_at)
  ) then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'equipment:' || p_source_equipment_id::text,
      'errorCode', 'source_must_be_active_grain_cart'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'source_must_be_active_grain_cart'
     where id = v_receipt.id;

    return v_result;
  end if;

  if not exists (
    select 1
      from public.grain_storage_units su
     where su.organization_id = p_organization_id
       and su.id = p_storage_unit_id
       and su.status = 'active'
  ) then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'grain_storage_unit:' || p_storage_unit_id::text,
      'errorCode', 'storage_unit_not_active'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'storage_unit_not_active'
     where id = v_receipt.id;

    return v_result;
  end if;

  begin
    insert into public.grain_storage_receipts (
      id, organization_id, grain_batch_id, source_work_session_id,
      source_equipment_id, storage_unit_id, quantity_value, quantity_unit,
      quantity_kg, provenance, received_at, status, note, created_by
    )
    values (
      p_receipt_id, p_organization_id, p_grain_batch_id,
      p_source_work_session_id, p_source_equipment_id, p_storage_unit_id,
      p_quantity_value, p_quantity_unit, p_quantity_kg,
      p_provenance, p_received_at, p_status,
      nullif(trim(coalesce(p_note, '')), ''), p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'grain_storage_receipt:' || p_receipt_id::text,
        'errorCode', 'storage_receipt_id_exists'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'storage_receipt_id_exists'
       where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'grain_storage_receipt:' || p_receipt_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_create_grain_storage_unit(
  uuid, uuid, uuid, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_create_grain_storage_unit(
  uuid, uuid, uuid, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_record_grain_storage_receipt(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid,
  numeric, text, numeric, text, timestamptz, text, text,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_record_grain_storage_receipt(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid,
  numeric, text, numeric, text, timestamptz, text, text,
  timestamptz, timestamptz, integer
) to service_role;
