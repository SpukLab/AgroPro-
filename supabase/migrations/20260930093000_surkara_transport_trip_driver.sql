-- SURKARA — Transport Trip + Driver foundation.
-- Trip is a Transport-domain aggregate referencing an existing Load.
-- Driver identity is anchored in shared Party while Transport owns driver/trip semantics.

create table public.transport_drivers (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  party_id uuid not null references public.parties(id),
  license_ref text check (
    license_ref is null or char_length(trim(license_ref)) between 1 and 40
  ),
  status text not null check (status in ('active')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, party_id)
);

create table public.transport_trips (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  load_id uuid not null,
  source_work_session_id uuid not null,
  origin_label text not null check (
    char_length(trim(origin_label)) between 1 and 160
  ),
  destination_label text not null check (
    char_length(trim(destination_label)) between 1 and 160
  ),
  planned_departure_at timestamptz not null,
  status text not null check (
    status in (
      'loaded','departed','waiting','unloading',
      'delivered','closed','cancelled'
    )
  ),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, load_id),
  foreign key (load_id, organization_id)
    references public.transport_loads(id, organization_id),
  foreign key (source_work_session_id, organization_id)
    references public.work_sessions(id, organization_id)
);

create table public.transport_trip_vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  trip_id uuid not null,
  vehicle_id uuid not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (trip_id, organization_id)
    references public.transport_trips(id, organization_id) on delete cascade,
  foreign key (vehicle_id, organization_id)
    references public.transport_vehicles(id, organization_id),
  check (valid_to is null or valid_to >= valid_from)
);

create table public.transport_trip_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  trip_id uuid not null,
  driver_id uuid not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (trip_id, organization_id)
    references public.transport_trips(id, organization_id) on delete cascade,
  foreign key (driver_id, organization_id)
    references public.transport_drivers(id, organization_id),
  check (valid_to is null or valid_to >= valid_from)
);

create unique index transport_trip_vehicle_active_uidx
  on public.transport_trip_vehicle_assignments(
    organization_id, trip_id
  )
  where valid_to is null;

create unique index transport_trip_driver_active_uidx
  on public.transport_trip_driver_assignments(
    organization_id, trip_id
  )
  where valid_to is null;

create index transport_trips_session_departure_idx
  on public.transport_trips(
    organization_id, source_work_session_id, planned_departure_at desc
  );

create index transport_trip_vehicle_vehicle_idx
  on public.transport_trip_vehicle_assignments(
    organization_id, vehicle_id, valid_from desc
  );

create index transport_trip_driver_driver_idx
  on public.transport_trip_driver_assignments(
    organization_id, driver_id, valid_from desc
  );

alter table public.transport_drivers enable row level security;
alter table public.transport_trips enable row level security;
alter table public.transport_trip_vehicle_assignments enable row level security;
alter table public.transport_trip_driver_assignments enable row level security;

revoke all on table
  public.transport_drivers,
  public.transport_trips,
  public.transport_trip_vehicle_assignments,
  public.transport_trip_driver_assignments
from anon, authenticated;

grant select on table
  public.transport_drivers,
  public.transport_trips,
  public.transport_trip_vehicle_assignments,
  public.transport_trip_driver_assignments
to authenticated;

grant select, insert, update, delete on table
  public.transport_drivers,
  public.transport_trips,
  public.transport_trip_vehicle_assignments,
  public.transport_trip_driver_assignments
to service_role;

create policy transport_drivers_member_select
on public.transport_drivers
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = transport_drivers.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create policy transport_trips_member_select
on public.transport_trips
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = transport_trips.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create policy transport_trip_vehicle_assignments_member_select
on public.transport_trip_vehicle_assignments
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id =
       transport_trip_vehicle_assignments.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create policy transport_trip_driver_assignments_member_select
on public.transport_trip_driver_assignments
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id =
       transport_trip_driver_assignments.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create or replace function public.process_create_transport_driver(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_driver_id uuid,
  p_display_name text,
  p_license_ref text,
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
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;

  if p_device_id is null or char_length(trim(p_device_id)) = 0 then
    raise exception 'device id is required' using errcode = '22023';
  end if;

  if p_display_name is null
     or char_length(trim(p_display_name)) < 1
     or char_length(trim(p_display_name)) > 120 then
    raise exception 'invalid display name' using errcode = '22023';
  end if;

  if p_license_ref is not null
     and char_length(trim(p_license_ref)) > 40 then
    raise exception 'invalid license ref' using errcode = '22023';
  end if;

  if p_status <> 'active' then
    raise exception 'unsupported driver status' using errcode = '22023';
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
          'commandType', 'transport.create_driver',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'driverId', p_driver_id,
          'displayName', trim(p_display_name),
          'licenseRef', nullif(trim(coalesce(p_license_ref, '')), ''),
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
      'transport.create_driver', v_hash, p_driver_id::text, null, 'C',
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

      if v_receipt.command_type <> 'transport.create_driver'
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
        'authoritativeRef', 'transport_driver:' || p_driver_id::text
      );
  end;

  begin
    insert into public.parties (
      id, party_type, display_name
    )
    values (
      p_driver_id, 'person', trim(p_display_name)
    );

    insert into public.organization_parties (
      organization_id, party_id, relationship_kind, valid_from
    )
    values (
      p_organization_id, p_driver_id, 'other', p_occurred_at_local
    );

    insert into public.transport_drivers (
      id, organization_id, party_id, license_ref, status, created_by
    )
    values (
      p_driver_id, p_organization_id, p_driver_id,
      nullif(trim(coalesce(p_license_ref, '')), ''),
      p_status, p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'transport_driver:' || p_driver_id::text,
        'errorCode', 'driver_identity_exists'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'driver_identity_exists'
       where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'transport_driver:' || p_driver_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

create or replace function public.process_create_transport_trip(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_trip_id uuid,
  p_load_id uuid,
  p_source_work_session_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_origin_label text,
  p_destination_label text,
  p_planned_departure_at timestamptz,
  p_status text,
  p_revision integer,
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

  if p_status <> 'loaded' or p_revision <> 1 then
    raise exception 'invalid initial trip state' using errcode = '22023';
  end if;

  if p_origin_label is null
     or char_length(trim(p_origin_label)) < 1
     or char_length(trim(p_origin_label)) > 160 then
    raise exception 'invalid origin label' using errcode = '22023';
  end if;

  if p_destination_label is null
     or char_length(trim(p_destination_label)) < 1
     or char_length(trim(p_destination_label)) > 160 then
    raise exception 'invalid destination label' using errcode = '22023';
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
    into v_load
    from public.transport_loads tl
   where tl.id = p_load_id
     and tl.organization_id = p_organization_id;

  if not found then
    raise exception 'transport load not found' using errcode = '23503';
  end if;

  if v_load.source_work_session_id <> p_source_work_session_id then
    raise exception 'load/session mismatch' using errcode = '22023';
  end if;

  if v_load.vehicle_id <> p_vehicle_id then
    raise exception 'trip vehicle must match loaded vehicle'
      using errcode = '22023';
  end if;

  if p_planned_departure_at < v_load.loaded_at then
    raise exception 'planned departure precedes load'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.transport_vehicles tv
     where tv.id = p_vehicle_id
       and tv.organization_id = p_organization_id
       and tv.vehicle_kind = 'truck'
       and tv.status = 'active'
  ) then
    raise exception 'vehicle is not active' using errcode = '23503';
  end if;

  if not exists (
    select 1
      from public.transport_drivers td
     where td.id = p_driver_id
       and td.organization_id = p_organization_id
       and td.status = 'active'
  ) then
    raise exception 'driver is not active' using errcode = '23503';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'transport.create_trip',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'tripId', p_trip_id,
          'loadId', p_load_id,
          'sourceWorkSessionId', p_source_work_session_id,
          'vehicleId', p_vehicle_id,
          'driverId', p_driver_id,
          'originLabel', trim(p_origin_label),
          'destinationLabel', trim(p_destination_label),
          'plannedDepartureAt', p_planned_departure_at,
          'status', p_status,
          'revision', p_revision,
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
      'transport.create_trip', v_hash, p_trip_id::text, null, 'C',
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

      if v_receipt.command_type <> 'transport.create_trip'
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
        'authoritativeRef', 'transport_trip:' || p_trip_id::text
      );
  end;

  begin
    insert into public.transport_trips (
      id, organization_id, load_id, source_work_session_id,
      origin_label, destination_label, planned_departure_at,
      status, revision, created_by
    )
    values (
      p_trip_id, p_organization_id, p_load_id, p_source_work_session_id,
      trim(p_origin_label), trim(p_destination_label),
      p_planned_departure_at, p_status, p_revision, p_actor_user_id
    );

    insert into public.transport_trip_vehicle_assignments (
      organization_id, trip_id, vehicle_id, valid_from, created_by
    )
    values (
      p_organization_id, p_trip_id, p_vehicle_id,
      v_load.loaded_at, p_actor_user_id
    );

    insert into public.transport_trip_driver_assignments (
      organization_id, trip_id, driver_id, valid_from, created_by
    )
    values (
      p_organization_id, p_trip_id, p_driver_id,
      v_load.loaded_at, p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'processedAt', v_processed_at,
        'authoritativeRef', 'transport_load:' || p_load_id::text,
        'errorCode', 'load_already_has_trip'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'load_already_has_trip'
       where id = v_receipt.id;

      return v_result;
  end;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'transport_trip:' || p_trip_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_create_transport_driver(
  uuid, uuid, uuid, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_create_transport_driver(
  uuid, uuid, uuid, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) to service_role;

revoke all on function public.process_create_transport_trip(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid,
  text, text, timestamptz, text, integer,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_create_transport_trip(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid,
  text, text, timestamptz, text, integer,
  timestamptz, timestamptz, integer
) to service_role;
