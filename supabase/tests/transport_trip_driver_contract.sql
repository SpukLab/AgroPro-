-- SURKARA Transport Trip + Driver contract checks.
-- Runs after transport_load_contract.sql and reuses its accepted vehicle/load.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_driver(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'c1000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-trip',
    'c1100000-0000-0000-0000-000000000001',
    'Juan Pérez',
    'LIC-123',
    'active',
    '2026-09-30T10:00:00-03:00',
    '2026-09-30T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected driver accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.transport_drivers td
      join public.parties p on p.id = td.party_id
     where td.id = 'c1100000-0000-0000-0000-000000000001'
       and td.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and td.status = 'active'
       and p.party_type = 'person'
       and p.display_name = 'Juan Pérez'
  ) then
    raise exception 'driver/party was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_driver(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'c1000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-trip',
    'c1100000-0000-0000-0000-000000000001',
    'Juan Pérez',
    'LIC-123',
    'active',
    '2026-09-30T10:00:00-03:00',
    '2026-09-30T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected driver duplicate, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_trip(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'c2000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-trip',
    'c2100000-0000-0000-0000-000000000001',
    'a2100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    'a1100000-0000-0000-0000-000000000001',
    'c1100000-0000-0000-0000-000000000001',
    'Lote 2',
    'Acopio Centro',
    '2026-09-30T10:30:00-03:00',
    'loaded',
    1,
    '2026-09-30T10:05:00-03:00',
    '2026-09-30T10:05:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected trip accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.transport_trips
     where id = 'c2100000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and load_id = 'a2100000-0000-0000-0000-000000000001'
       and source_work_session_id =
         '95400000-0000-0000-0000-000000000001'
       and origin_label = 'Lote 2'
       and destination_label = 'Acopio Centro'
       and status = 'loaded'
       and revision = 1
  ) then
    raise exception 'transport trip was not persisted';
  end if;

  if not exists (
    select 1
      from public.transport_trip_vehicle_assignments
     where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and trip_id = 'c2100000-0000-0000-0000-000000000001'
       and vehicle_id = 'a1100000-0000-0000-0000-000000000001'
       and valid_to is null
  ) then
    raise exception 'trip vehicle assignment was not persisted';
  end if;

  if not exists (
    select 1
      from public.transport_trip_driver_assignments
     where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and trip_id = 'c2100000-0000-0000-0000-000000000001'
       and driver_id = 'c1100000-0000-0000-0000-000000000001'
       and valid_to is null
  ) then
    raise exception 'trip driver assignment was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_trip(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'c2000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-trip',
    'c2100000-0000-0000-0000-000000000001',
    'a2100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    'a1100000-0000-0000-0000-000000000001',
    'c1100000-0000-0000-0000-000000000001',
    'Lote 2',
    'Acopio Centro',
    '2026-09-30T10:30:00-03:00',
    'loaded',
    1,
    '2026-09-30T10:05:00-03:00',
    '2026-09-30T10:05:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected trip duplicate, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_trip(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'c2000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-trip',
    'c2100000-0000-0000-0000-000000000002',
    'a2100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    'a1100000-0000-0000-0000-000000000001',
    'c1100000-0000-0000-0000-000000000001',
    'Lote 2',
    'Otro destino',
    '2026-09-30T11:00:00-03:00',
    'loaded',
    1,
    '2026-09-30T10:10:00-03:00',
    '2026-09-30T10:10:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'conflict'
     or v_result ->> 'errorCode' <> 'load_already_has_trip' then
    raise exception 'expected one-trip-per-load conflict, got %', v_result;
  end if;
end
$$;

reset role;
