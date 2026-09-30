-- SURKARA — Transport unload result / delivery confirmation.
-- Destination weight/ticket remains distinct from prior estimates.

alter table public.transport_trips
  add column delivered_at timestamptz;

create table public.transport_unload_results (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  trip_id uuid not null,
  load_id uuid not null,
  source_work_session_id uuid not null,
  destination_label text not null check (
    char_length(trim(destination_label)) between 1 and 160
  ),
  quantity_value numeric(14,3) not null check (quantity_value > 0),
  quantity_unit text not null check (quantity_unit in ('kg','t')),
  quantity_kg numeric(16,3) not null check (quantity_kg > 0),
  provenance text not null check (
    provenance in ('scale','ticket','manual')
  ),
  unloaded_at timestamptz not null,
  moisture_percent numeric(6,3) check (
    moisture_percent is null or
    (moisture_percent >= 0 and moisture_percent <= 100)
  ),
  ticket_ref text check (
    ticket_ref is null or char_length(trim(ticket_ref)) between 1 and 80
  ),
  note text check (note is null or char_length(note) <= 240),
  status text not null check (status in ('delivered')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, trip_id),
  foreign key (trip_id, organization_id)
    references public.transport_trips(id, organization_id),
  foreign key (load_id, organization_id)
    references public.transport_loads(id, organization_id),
  foreign key (source_work_session_id, organization_id)
    references public.work_sessions(id, organization_id),
  check (
    (quantity_unit = 'kg' and quantity_kg = quantity_value)
    or
    (quantity_unit = 't' and quantity_kg = quantity_value * 1000)
  )
);

create index transport_unload_results_session_time_idx
  on public.transport_unload_results(
    organization_id, source_work_session_id, unloaded_at desc
  );

alter table public.transport_unload_results enable row level security;

revoke all on table public.transport_unload_results
from anon, authenticated;

grant select on table public.transport_unload_results
to authenticated;

grant select, insert, update, delete on table public.transport_unload_results
to service_role;

create policy transport_unload_results_member_select
on public.transport_unload_results
for select
to authenticated
using (
  exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = transport_unload_results.organization_id
       and m.user_id = (select auth.uid())
       and m.active
  )
);

create or replace function public.process_complete_transport_unload(
  p_organization_id uuid,
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_device_id text,
  p_result_id uuid,
  p_trip_id uuid,
  p_load_id uuid,
  p_expected_revision integer,
  p_destination_label text,
  p_quantity_value numeric,
  p_quantity_unit text,
  p_quantity_kg numeric,
  p_provenance text,
  p_unloaded_at timestamptz,
  p_moisture_percent numeric,
  p_ticket_ref text,
  p_note text,
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

  if p_status <> 'delivered' then
    raise exception 'invalid unload status' using errcode = '22023';
  end if;

  if p_destination_label is null
     or char_length(trim(p_destination_label)) < 1
     or char_length(trim(p_destination_label)) > 160 then
    raise exception 'invalid destination label' using errcode = '22023';
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

  if p_provenance not in ('scale','ticket','manual') then
    raise exception 'invalid unload provenance' using errcode = '22023';
  end if;

  if p_moisture_percent is not null
     and (p_moisture_percent < 0 or p_moisture_percent > 100) then
    raise exception 'invalid moisture percent' using errcode = '22023';
  end if;

  if p_ticket_ref is not null and char_length(trim(p_ticket_ref)) > 80 then
    raise exception 'ticket ref too long' using errcode = '22023';
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

  select *
    into v_load
    from public.transport_loads tl
   where tl.id = p_load_id
     and tl.organization_id = p_organization_id;

  if not found then
    raise exception 'transport load not found' using errcode = '23503';
  end if;

  if v_trip.load_id <> p_load_id
     or v_load.source_work_session_id <> v_trip.source_work_session_id then
    raise exception 'trip/load mismatch' using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'transport.complete_unload',
          'actorId', p_actor_user_id,
          'deviceId', p_device_id,
          'organizationId', p_organization_id,
          'resultId', p_result_id,
          'tripId', p_trip_id,
          'loadId', p_load_id,
          'expectedRevision', p_expected_revision,
          'destinationLabel', trim(p_destination_label),
          'quantityValue', p_quantity_value,
          'quantityUnit', p_quantity_unit,
          'quantityKg', p_quantity_kg,
          'provenance', p_provenance,
          'unloadedAt', p_unloaded_at,
          'moisturePercent', p_moisture_percent,
          'ticketRef', nullif(trim(coalesce(p_ticket_ref, '')), ''),
          'note', p_note,
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
      'transport.complete_unload', v_hash, p_trip_id::text,
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

      if v_receipt.command_type <> 'transport.complete_unload'
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
     or v_trip.status <> 'unloading' then
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

  if v_trip.unloading_started_at is null
     or p_unloaded_at < v_trip.unloading_started_at then
    v_result := jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'serverRevision', v_trip.revision,
      'processedAt', v_processed_at,
      'authoritativeRef', 'transport_trip:' || p_trip_id::text,
      'errorCode', 'unload_before_unloading_start'
    );

    update public.command_receipts
       set status = 'rejected',
           result_json = v_result,
           error_code = 'unload_before_unloading_start'
     where id = v_receipt.id;

    return v_result;
  end if;

  begin
    insert into public.transport_unload_results (
      id, organization_id, trip_id, load_id, source_work_session_id,
      destination_label, quantity_value, quantity_unit, quantity_kg,
      provenance, unloaded_at, moisture_percent, ticket_ref,
      note, status, created_by
    )
    values (
      p_result_id, p_organization_id, p_trip_id, p_load_id,
      v_trip.source_work_session_id, trim(p_destination_label),
      p_quantity_value, p_quantity_unit, p_quantity_kg,
      p_provenance, p_unloaded_at, p_moisture_percent,
      nullif(trim(coalesce(p_ticket_ref, '')), ''),
      nullif(trim(coalesce(p_note, '')), ''),
      p_status, p_actor_user_id
    );
  exception
    when unique_violation then
      v_result := jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'conflict',
        'serverRevision', v_trip.revision,
        'processedAt', v_processed_at,
        'authoritativeRef', 'transport_trip:' || p_trip_id::text,
        'errorCode', 'trip_already_unloaded'
      );

      update public.command_receipts
         set status = 'conflict',
             result_json = v_result,
             error_code = 'trip_already_unloaded'
       where id = v_receipt.id;

      return v_result;
  end;

  update public.transport_trips
     set status = 'delivered',
         delivered_at = p_unloaded_at,
         revision = revision + 1,
         updated_at = v_processed_at
   where id = p_trip_id
     and organization_id = p_organization_id;

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'serverRevision', p_expected_revision + 1,
    'processedAt', v_processed_at,
    'authoritativeRef', 'transport_unload_result:' || p_result_id::text
  );

  update public.command_receipts
     set result_json = v_result
   where id = v_receipt.id;

  return v_result;
end;
$function$;

revoke all on function public.process_complete_transport_unload(
  uuid, uuid, uuid, text, uuid, uuid, uuid, integer, text,
  numeric, text, numeric, text, timestamptz, numeric, text, text, text,
  timestamptz, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_complete_transport_unload(
  uuid, uuid, uuid, text, uuid, uuid, uuid, integer, text,
  numeric, text, numeric, text, timestamptz, numeric, text, text, text,
  timestamptz, timestamptz, integer
) to service_role;
