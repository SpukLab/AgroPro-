-- SURKARA Milestone B — harvest session field records.
-- Append-only measurements + completed downtime events, captured offline through Sync Gateway.

create table public.harvest_session_measurements (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  work_session_id uuid not null,
  equipment_id uuid,
  metric_kind text not null check (
    metric_kind in ('area_completed_ha','machine_hours','fuel_liters')
  ),
  numeric_value numeric(14,3) not null check (numeric_value > 0),
  unit text not null check (unit in ('ha','h','l')),
  provenance text not null check (
    provenance in ('manual','machine','estimated','calculated')
  ),
  observed_at timestamptz not null,
  note text check (note is null or char_length(note) <= 240),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (work_session_id, organization_id)
    references public.work_sessions(id, organization_id),
  foreign key (equipment_id, organization_id)
    references public.equipment(id, organization_id),
  check (
    (metric_kind = 'area_completed_ha' and unit = 'ha')
    or (metric_kind = 'machine_hours' and unit = 'h' and equipment_id is not null)
    or (metric_kind = 'fuel_liters' and unit = 'l' and equipment_id is not null)
  )
);

create table public.harvest_downtime_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  work_session_id uuid not null,
  blocking_equipment_id uuid,
  cause text not null check (
    cause in ('waiting_resource','breakdown','weather','logistics','maintenance','other')
  ),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  provenance text not null check (
    provenance in ('manual','machine','estimated','calculated')
  ),
  note text check (note is null or char_length(note) <= 240),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (work_session_id, organization_id)
    references public.work_sessions(id, organization_id),
  foreign key (blocking_equipment_id, organization_id)
    references public.equipment(id, organization_id),
  check (ended_at >= started_at),
  check (cause <> 'waiting_resource' or blocking_equipment_id is not null)
);

create index harvest_session_measurements_session_idx
  on public.harvest_session_measurements(
    organization_id, work_session_id, observed_at desc
  );

create index harvest_downtime_events_session_idx
  on public.harvest_downtime_events(
    organization_id, work_session_id, started_at desc
  );

alter table public.harvest_session_measurements enable row level security;
alter table public.harvest_downtime_events enable row level security;

revoke all on table
  public.harvest_session_measurements,
  public.harvest_downtime_events
from anon, authenticated;

grant select on table
  public.harvest_session_measurements,
  public.harvest_downtime_events
to authenticated;

grant select, insert, update, delete on table
  public.harvest_session_measurements,
  public.harvest_downtime_events
to service_role;

create policy harvest_session_measurements_member_select
on public.harvest_session_measurements
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = harvest_session_measurements.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create policy harvest_downtime_events_member_select
on public.harvest_downtime_events
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = harvest_downtime_events.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create or replace function public.process_record_harvest_measurement(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_measurement_id uuid,
  p_work_session_id uuid,
  p_equipment_id uuid,
  p_metric_kind text,
  p_numeric_value numeric,
  p_unit text,
  p_provenance text,
  p_observed_at timestamptz,
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
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;

  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;

  if p_numeric_value is null or p_numeric_value <= 0 then
    raise exception 'numeric value must be positive' using errcode = '22023';
  end if;

  if p_metric_kind not in ('area_completed_ha','machine_hours','fuel_liters') then
    raise exception 'invalid metric kind' using errcode = '22023';
  end if;

  if p_provenance not in ('manual','machine','estimated','calculated') then
    raise exception 'invalid provenance' using errcode = '22023';
  end if;

  if (p_metric_kind = 'area_completed_ha' and p_unit <> 'ha')
     or (p_metric_kind = 'machine_hours' and (p_unit <> 'h' or p_equipment_id is null))
     or (p_metric_kind = 'fuel_liters' and (p_unit <> 'l' or p_equipment_id is null)) then
    raise exception 'metric/unit/equipment mismatch' using errcode = '22023';
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
    raise exception 'actor has no active organization membership' using errcode = '42501';
  end if;

  select *
    into v_session
    from public.work_sessions ws
   where ws.id = p_work_session_id
     and ws.organization_id = p_organization_id;

  if not found then
    raise exception 'work session not found' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'harvest.record_measurement',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'measurementId', p_measurement_id,
          'workSessionId', p_work_session_id,
          'equipmentId', p_equipment_id,
          'metricKind', p_metric_kind,
          'numericValue', p_numeric_value,
          'unit', p_unit,
          'provenance', p_provenance,
          'observedAt', p_observed_at,
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
      'harvest.record_measurement', v_hash, p_measurement_id::text, null, 'A',
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

      if v_receipt.command_type <> 'harvest.record_measurement'
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
        'authoritativeRef', 'harvest_measurement:' || p_measurement_id::text
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

  if p_observed_at < v_session.started_at then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_work_session_id::text,
      'errorCode', 'measurement_before_session'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'measurement_before_session'
     where id = v_receipt.id;

    return v_result;
  end if;

  if p_equipment_id is not null and not exists (
    select 1
      from public.team_assignments ta
     where ta.organization_id = p_organization_id
       and ta.operational_team_id = v_session.operational_team_id
       and ta.equipment_id = p_equipment_id
       and ta.valid_from <= p_observed_at
       and (ta.valid_to is null or ta.valid_to >= p_observed_at)
  ) then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'equipment:' || p_equipment_id::text,
      'errorCode', 'equipment_not_assigned'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'equipment_not_assigned'
     where id = v_receipt.id;

    return v_result;
  end if;

  begin
    insert into public.harvest_session_measurements (
      id, organization_id, work_session_id, equipment_id, metric_kind,
      numeric_value, unit, provenance, observed_at, note, created_by
    )
    values (
      p_measurement_id, p_organization_id, p_work_session_id, p_equipment_id,
      p_metric_kind, p_numeric_value, p_unit, p_provenance, p_observed_at,
      nullif(trim(coalesce(p_note, '')), ''), p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'harvest_measurement:' || p_measurement_id::text,
        'errorCode', 'measurement_id_exists'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'measurement_id_exists'
       where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'harvest_measurement:' || p_measurement_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

create or replace function public.process_record_harvest_downtime(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_downtime_id uuid,
  p_work_session_id uuid,
  p_blocking_equipment_id uuid,
  p_cause text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_provenance text,
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
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;

  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;

  if p_cause not in ('waiting_resource','breakdown','weather','logistics','maintenance','other') then
    raise exception 'invalid downtime cause' using errcode = '22023';
  end if;

  if p_provenance not in ('manual','machine','estimated','calculated') then
    raise exception 'invalid provenance' using errcode = '22023';
  end if;

  if p_ended_at < p_started_at then
    raise exception 'downtime ends before it starts' using errcode = '22023';
  end if;

  if p_cause = 'waiting_resource' and p_blocking_equipment_id is null then
    raise exception 'blocking equipment is required' using errcode = '22023';
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
    raise exception 'actor has no active organization membership' using errcode = '42501';
  end if;

  select *
    into v_session
    from public.work_sessions ws
   where ws.id = p_work_session_id
     and ws.organization_id = p_organization_id;

  if not found then
    raise exception 'work session not found' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'harvest.record_downtime',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'downtimeId', p_downtime_id,
          'workSessionId', p_work_session_id,
          'blockingEquipmentId', p_blocking_equipment_id,
          'cause', p_cause,
          'startedAt', p_started_at,
          'endedAt', p_ended_at,
          'provenance', p_provenance,
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
      'harvest.record_downtime', v_hash, p_downtime_id::text, null, 'A',
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

      if v_receipt.command_type <> 'harvest.record_downtime'
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
        'authoritativeRef', 'harvest_downtime:' || p_downtime_id::text
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

  if p_started_at < v_session.started_at then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'work_session:' || p_work_session_id::text,
      'errorCode', 'downtime_before_session'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'downtime_before_session'
     where id = v_receipt.id;

    return v_result;
  end if;

  if p_blocking_equipment_id is not null and not exists (
    select 1
      from public.team_assignments ta
     where ta.organization_id = p_organization_id
       and ta.operational_team_id = v_session.operational_team_id
       and ta.equipment_id = p_blocking_equipment_id
       and ta.valid_from <= p_started_at
       and (ta.valid_to is null or ta.valid_to >= p_started_at)
  ) then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'authoritativeRef', 'equipment:' || p_blocking_equipment_id::text,
      'errorCode', 'blocking_equipment_not_assigned'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'blocking_equipment_not_assigned'
     where id = v_receipt.id;

    return v_result;
  end if;

  begin
    insert into public.harvest_downtime_events (
      id, organization_id, work_session_id, blocking_equipment_id,
      cause, started_at, ended_at, provenance, note, created_by
    )
    values (
      p_downtime_id, p_organization_id, p_work_session_id,
      p_blocking_equipment_id, p_cause, p_started_at, p_ended_at,
      p_provenance, nullif(trim(coalesce(p_note, '')), ''), p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'harvest_downtime:' || p_downtime_id::text,
        'errorCode', 'downtime_id_exists'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'downtime_id_exists'
       where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'harvest_downtime:' || p_downtime_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_record_harvest_measurement(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, numeric, text, text,
  timestamptz, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_record_harvest_measurement(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, numeric, text, text,
  timestamptz, text, timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_record_harvest_downtime(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, timestamptz, timestamptz,
  text, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_record_harvest_downtime(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, timestamptz, timestamptz,
  text, text, timestamptz, timestamptz, integer
) to service_role;
