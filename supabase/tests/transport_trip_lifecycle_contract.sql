-- SURKARA Transport Trip lifecycle contract checks.
-- Runs after transport_trip_driver_contract.sql and advances its accepted Trip.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_depart_transport_trip(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'd3000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-trip-life',
    'c2100000-0000-0000-0000-000000000001',
    1,
    '2026-09-30T10:35:00-03:00',
    '2026-09-30T10:35:00-03:00',
    '2026-09-30T10:35:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted'
     or (v_result ->> 'serverRevision')::integer <> 2 then
    raise exception 'expected departure accepted revision 2, got %', v_result;
  end if;

  if not exists (
    select 1 from public.transport_trips
     where id='c2100000-0000-0000-0000-000000000001'
       and status='departed'
       and revision=2
       and departed_at='2026-09-30T10:35:00-03:00'
  ) then
    raise exception 'departure was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_depart_transport_trip(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'd3000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-trip-life',
    'c2100000-0000-0000-0000-000000000001',
    1,
    '2026-09-30T10:35:00-03:00',
    '2026-09-30T10:35:00-03:00',
    '2026-09-30T10:35:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected departure duplicate, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_arrive_transport_trip(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'd3000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-trip-life',
    'd3100000-0000-0000-0000-000000000001',
    'c2100000-0000-0000-0000-000000000001',
    2,
    '2026-09-30T11:35:00-03:00',
    'destination_queue',
    'espera de descarga',
    '2026-09-30T11:35:00-03:00',
    '2026-09-30T11:35:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted'
     or (v_result ->> 'serverRevision')::integer <> 3 then
    raise exception 'expected arrival accepted revision 3, got %', v_result;
  end if;

  if not exists (
    select 1 from public.transport_waiting_times
     where id='d3100000-0000-0000-0000-000000000001'
       and trip_id='c2100000-0000-0000-0000-000000000001'
       and cause='destination_queue'
       and ended_at is null
  ) then
    raise exception 'waiting time was not persisted';
  end if;

  if not exists (
    select 1 from public.transport_trips
     where id='c2100000-0000-0000-0000-000000000001'
       and status='waiting'
       and revision=3
       and arrived_at='2026-09-30T11:35:00-03:00'
  ) then
    raise exception 'arrival state was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_start_unloading_transport_trip(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'd3000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'device-trip-life',
    'c2100000-0000-0000-0000-000000000001',
    'd3100000-0000-0000-0000-000000000001',
    3,
    '2026-09-30T12:00:00-03:00',
    '2026-09-30T12:00:00-03:00',
    '2026-09-30T12:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted'
     or (v_result ->> 'serverRevision')::integer <> 4 then
    raise exception 'expected unloading accepted revision 4, got %', v_result;
  end if;

  if not exists (
    select 1 from public.transport_waiting_times
     where id='d3100000-0000-0000-0000-000000000001'
       and ended_at='2026-09-30T12:00:00-03:00'
  ) then
    raise exception 'waiting time was not closed';
  end if;

  if not exists (
    select 1 from public.transport_trips
     where id='c2100000-0000-0000-0000-000000000001'
       and status='unloading'
       and revision=4
       and unloading_started_at='2026-09-30T12:00:00-03:00'
  ) then
    raise exception 'unloading state was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_depart_transport_trip(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'd3000000-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'device-trip-life',
    'c2100000-0000-0000-0000-000000000001',
    1,
    '2026-09-30T12:05:00-03:00',
    '2026-09-30T12:05:00-03:00',
    '2026-09-30T12:05:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'conflict'
     or v_result ->> 'errorCode' <> 'trip_state_changed' then
    raise exception 'expected stale lifecycle conflict, got %', v_result;
  end if;
end
$$;

reset role;
