-- SURKARA — Transport Trip lifecycle: departed -> waiting -> unloading.
-- WaitingTime is explicit and append-preserving; trip state uses revision CAS.

alter table public.transport_trips
  add column departed_at timestamptz,
  add column arrived_at timestamptz,
  add column unloading_started_at timestamptz;

create table public.transport_waiting_times (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  trip_id uuid not null,
  cause text not null check (
    cause in (
      'destination_queue',
      'destination_closed',
      'documentation',
      'scale_queue',
      'other'
    )
  ),
  started_at timestamptz not null,
  ended_at timestamptz,
  note text check (note is null or char_length(note) <= 240),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (trip_id, organization_id)
    references public.transport_trips(id, organization_id) on delete cascade,
  check (ended_at is null or ended_at >= started_at)
);

create unique index transport_waiting_times_active_uidx
  on public.transport_waiting_times(organization_id, trip_id)
  where ended_at is null;

create index transport_waiting_times_trip_time_idx
  on public.transport_waiting_times(
    organization_id, trip_id, started_at desc
  );

alter table public.transport_waiting_times enable row level security;

revoke all on table public.transport_waiting_times
from anon, authenticated;

grant select on table public.transport_waiting_times
to authenticated;

grant select, insert, update, delete on table public.transport_waiting_times
to service_role;

create policy transport_waiting_times_member_select
on public.transport_waiting_times
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = transport_waiting_times.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create or replace function public.process_depart_transport_trip(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_trip_id uuid,
  p_expected_revision integer,
  p_departed_at timestamptz,
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
  v_trip public.transport_trips%rowtype;
  v_load public.transport_loads%rowtype;
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
    raise exception 'actor has no active organization membership'
      using errcode = '42501';
  end if;

  select *
    into v_trip
    from public.transport_trips tt
   where tt.id = p_trip_id
     and tt.organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'transport trip not found' using errcode = '23503';
  end if;

  select *
    into v_load
    from public.transport_loads tl
   where tl.id = v_trip.load_id
     and tl.organization_id = p_organization_id;

  if not found then
    raise exception 'transport load not found' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'transport.depart_trip',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'tripId', p_trip_id,
          'expectedRevision', p_expected_revision,
          'departedAt', p_departed_at,
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
      'transport.depart_trip', v_hash, p_trip_id::text,
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

      if v_receipt.command_type <> 'transport.depart_trip'
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
        'serverRevision',
          coalesce((v_receipt.result_json ->> 'serverRevision')::integer, 1),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', 'transport_trip:' || p_trip_id::text
      );
  end;

  if v_trip.revision <> p_expected_revision
     or v_trip.status <> 'loaded' then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_trip.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'transport_trip:' || p_trip_id::text,
      'errorCode', 'trip_state_changed'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'trip_state_changed'
     where id = v_receipt.id;

    return v_result;
  end if;

  if p_departed_at < v_load.loaded_at then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'serverRevision', v_trip.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'transport_trip:' || p_trip_id::text,
      'errorCode', 'departure_before_load'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'departure_before_load'
     where id = v_receipt.id;

    return v_result;
  end if;

  update public.transport_trips
     set status = 'departed',
         departed_at = p_departed_at,
         revision = revision + 1,
         updated_at = v_processed_at
   where id = p_trip_id
     and organization_id = p_organization_id;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', p_expected_revision + 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'transport_trip:' || p_trip_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

create or replace function public.process_arrive_transport_trip(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_waiting_time_id uuid,
  p_trip_id uuid,
  p_expected_revision integer,
  p_arrived_at timestamptz,
  p_cause text,
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
  v_trip public.transport_trips%rowtype;
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

  if p_cause not in (
    'destination_queue',
    'destination_closed',
    'documentation',
    'scale_queue',
    'other'
  ) then
    raise exception 'invalid waiting cause' using errcode = '22023';
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
    into v_trip
    from public.transport_trips tt
   where tt.id = p_trip_id
     and tt.organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'transport trip not found' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'transport.arrive_trip',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'waitingTimeId', p_waiting_time_id,
          'tripId', p_trip_id,
          'expectedRevision', p_expected_revision,
          'arrivedAt', p_arrived_at,
          'cause', p_cause,
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
      'transport.arrive_trip', v_hash, p_trip_id::text,
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

      if v_receipt.command_type <> 'transport.arrive_trip'
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
        'serverRevision',
          coalesce((v_receipt.result_json ->> 'serverRevision')::integer, 1),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', 'transport_trip:' || p_trip_id::text
      );
  end;

  if v_trip.revision <> p_expected_revision
     or v_trip.status <> 'departed' then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_trip.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'transport_trip:' || p_trip_id::text,
      'errorCode', 'trip_state_changed'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'trip_state_changed'
     where id = v_receipt.id;

    return v_result;
  end if;

  if v_trip.departed_at is null or p_arrived_at < v_trip.departed_at then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'serverRevision', v_trip.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'transport_trip:' || p_trip_id::text,
      'errorCode', 'arrival_before_departure'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'arrival_before_departure'
     where id = v_receipt.id;

    return v_result;
  end if;

  begin
    insert into public.transport_waiting_times (
      id, organization_id, trip_id, cause,
      started_at, note, created_by
    )
    values (
      p_waiting_time_id, p_organization_id, p_trip_id, p_cause,
      p_arrived_at, nullif(trim(coalesce(p_note, '')) , ''),
      p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'serverRevision', v_trip.revision,
        'processedAt', v_processed_at,
        'authoritativeRef', 'transport_trip:' || p_trip_id::text,
        'errorCode', 'active_waiting_time_exists'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'active_waiting_time_exists'
       where id = v_receipt.id;

      return v_result;
  end;

  update public.transport_trips
     set status = 'waiting',
         arrived_at = p_arrived_at,
         revision = revision + 1,
         updated_at = v_processed_at
   where id = p_trip_id
     and organization_id = p_organization_id;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', p_expected_revision + 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'transport_trip:' || p_trip_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

create or replace function public.process_start_unloading_transport_trip(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_trip_id uuid,
  p_waiting_time_id uuid,
  p_expected_revision integer,
  p_unloading_started_at timestamptz,
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
  v_trip public.transport_trips%rowtype;
  v_wait public.transport_waiting_times%rowtype;
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
    raise exception 'actor has no active organization membership'
      using errcode = '42501';
  end if;

  select *
    into v_trip
    from public.transport_trips tt
   where tt.id = p_trip_id
     and tt.organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'transport trip not found' using errcode = '23503';
  end if;

  select *
    into v_wait
    from public.transport_waiting_times wt
   where wt.id = p_waiting_time_id
     and wt.organization_id = p_organization_id
     and wt.trip_id = p_trip_id
   for update;

  if not found then
    raise exception 'waiting time not found' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'transport.start_unloading',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'tripId', p_trip_id,
          'waitingTimeId', p_waiting_time_id,
          'expectedRevision', p_expected_revision,
          'unloadingStartedAt', p_unloading_started_at,
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
      'transport.start_unloading', v_hash, p_trip_id::text,
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

      if v_receipt.command_type <> 'transport.start_unloading'
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
        'serverRevision',
          coalesce((v_receipt.result_json ->> 'serverRevision')::integer, 1),
        'processedAt', v_receipt.processed_at,
        'authoritativeRef', 'transport_trip:' || p_trip_id::text
      );
  end;

  if v_trip.revision <> p_expected_revision
     or v_trip.status <> 'waiting'
     or v_wait.ended_at is not null then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'conflict',
      'serverRevision', v_trip.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'transport_trip:' || p_trip_id::text,
      'errorCode', 'trip_state_changed'
    );

    update public.command_receipts
       set status = 'conflict',
           result_json = v_result,
           error_code = 'trip_state_changed'
     where id = v_receipt.id;

    return v_result;
  end if;

  if p_unloading_started_at < v_wait.started_at then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'serverRevision', v_trip.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'transport_trip:' || p_trip_id::text,
      'errorCode', 'unloading_before_waiting'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'unloading_before_waiting'
     where id = v_receipt.id;

    return v_result;
  end if;

  update public.transport_waiting_times
     set ended_at = p_unloading_started_at
   where id = p_waiting_time_id
     and organization_id = p_organization_id;

  update public.transport_trips
     set status = 'unloading',
         unloading_started_at = p_unloading_started_at,
         revision = revision + 1,
         updated_at = v_processed_at
   where id = p_trip_id
     and organization_id = p_organization_id;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', p_expected_revision + 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'transport_trip:' || p_trip_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_depart_transport_trip(
  uuid, uuid, uuid, text, uuid, integer, timestamptz,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_depart_transport_trip(
  uuid, uuid, uuid, text, uuid, integer, timestamptz,
  timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_arrive_transport_trip(
  uuid, uuid, uuid, text, uuid, uuid, integer, timestamptz, text, text,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_arrive_transport_trip(
  uuid, uuid, uuid, text, uuid, uuid, integer, timestamptz, text, text,
  timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_start_unloading_transport_trip(
  uuid, uuid, uuid, text, uuid, uuid, integer, timestamptz,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_start_unloading_transport_trip(
  uuid, uuid, uuid, text, uuid, uuid, integer, timestamptz,
  timestamptz, timestamptz, integer
) to service_role;
