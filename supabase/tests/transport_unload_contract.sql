-- SURKARA Transport Unload contract checks.
-- Runs after transport_trip_lifecycle_contract.sql and completes its unloading Trip.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_complete_transport_unload(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'e4000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-unload',
    'e4100000-0000-0000-0000-000000000001',
    'c2100000-0000-0000-0000-000000000001',
    'a2100000-0000-0000-0000-000000000001',
    4,
    'Acopio Centro',
    27.9,
    't',
    27900,
    'scale',
    '2026-09-30T12:20:00-03:00',
    13.4,
    'TKT-1024',
    'peso neto',
    'delivered',
    '2026-09-30T12:20:00-03:00',
    '2026-09-30T12:20:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted'
     or (v_result ->> 'serverRevision')::integer <> 5 then
    raise exception 'expected unload accepted revision 5, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.transport_unload_results
     where id = 'e4100000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and trip_id = 'c2100000-0000-0000-0000-000000000001'
       and load_id = 'a2100000-0000-0000-0000-000000000001'
       and source_work_session_id =
         '95400000-0000-0000-0000-000000000001'
       and quantity_value = 27.9
       and quantity_unit = 't'
       and quantity_kg = 27900
       and provenance = 'scale'
       and moisture_percent = 13.4
       and ticket_ref = 'TKT-1024'
       and status = 'delivered'
  ) then
    raise exception 'unload result was not persisted';
  end if;

  if not exists (
    select 1
      from public.transport_trips
     where id = 'c2100000-0000-0000-0000-000000000001'
       and status = 'delivered'
       and revision = 5
       and delivered_at = '2026-09-30T12:20:00-03:00'
  ) then
    raise exception 'trip delivery state was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_complete_transport_unload(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'e4000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-unload',
    'e4100000-0000-0000-0000-000000000001',
    'c2100000-0000-0000-0000-000000000001',
    'a2100000-0000-0000-0000-000000000001',
    4,
    'Acopio Centro',
    27.9,
    't',
    27900,
    'scale',
    '2026-09-30T12:20:00-03:00',
    13.4,
    'TKT-1024',
    'peso neto',
    'delivered',
    '2026-09-30T12:20:00-03:00',
    '2026-09-30T12:20:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected unload duplicate, got %', v_result;
  end if;

  if (
    select count(*)
      from public.transport_unload_results
     where id = 'e4100000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'unload idempotency failed';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_complete_transport_unload(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'e4000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-unload',
    'e4100000-0000-0000-0000-000000000002',
    'c2100000-0000-0000-0000-000000000001',
    'a2100000-0000-0000-0000-000000000001',
    4,
    'Acopio Centro',
    28,
    't',
    28000,
    'manual',
    '2026-09-30T12:25:00-03:00',
    null,
    null,
    'stale attempt',
    'delivered',
    '2026-09-30T12:25:00-03:00',
    '2026-09-30T12:25:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'conflict'
     or v_result ->> 'errorCode' <> 'trip_state_changed' then
    raise exception 'expected stale unload conflict, got %', v_result;
  end if;
end
$$;

reset role;
