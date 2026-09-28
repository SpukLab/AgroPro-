-- SURKARA Transport Load contract checks.
-- Runs after grain_batch_transfer_contract.sql and reuses its active session/batch/grain cart.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_vehicle(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-transport',
    'a1100000-0000-0000-0000-000000000001',
    'truck',
    'Camión 12',
    'AA123BB',
    'active',
    '2026-09-28T10:30:00-03:00',
    '2026-09-28T10:30:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected transport vehicle accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.transport_vehicles
     where id = 'a1100000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and vehicle_kind = 'truck'
       and display_name = 'Camión 12'
       and plate = 'AA123BB'
       and status = 'active'
  ) then
    raise exception 'transport vehicle was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_vehicle(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-transport',
    'a1100000-0000-0000-0000-000000000001',
    'truck',
    'Camión 12',
    'AA123BB',
    'active',
    '2026-09-28T10:30:00-03:00',
    '2026-09-28T10:30:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected transport vehicle duplicate, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_load(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a2000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-transport',
    'a2100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    'a1100000-0000-0000-0000-000000000001',
    28.5,
    't',
    28500,
    'estimated',
    '2026-09-28T10:35:00-03:00',
    'loaded',
    'primera carga',
    '2026-09-28T10:35:00-03:00',
    '2026-09-28T10:35:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected transport load accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.transport_loads
     where id = 'a2100000-0000-0000-0000-000000000001'
       and grain_batch_id = '95400000-0000-0000-0000-000000000001'
       and source_work_session_id = '95400000-0000-0000-0000-000000000001'
       and source_equipment_id = '95100000-0000-0000-0000-000000000001'
       and vehicle_id = 'a1100000-0000-0000-0000-000000000001'
       and quantity_value = 28.5
       and quantity_unit = 't'
       and quantity_kg = 28500
       and provenance = 'estimated'
       and status = 'loaded'
  ) then
    raise exception 'transport load was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_load(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a2000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-transport',
    'a2100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    'a1100000-0000-0000-0000-000000000001',
    28.5,
    't',
    28500,
    'estimated',
    '2026-09-28T10:35:00-03:00',
    'loaded',
    'primera carga',
    '2026-09-28T10:35:00-03:00',
    '2026-09-28T10:35:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected transport load duplicate, got %', v_result;
  end if;

  if (
    select count(*)
      from public.transport_loads
     where id = 'a2100000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'transport load idempotency failed';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_transport_load(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a2000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-transport',
    'a2100000-0000-0000-0000-000000000002',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    'a1100000-0000-0000-0000-000000000001',
    10,
    't',
    10000,
    'manual',
    '2026-09-28T10:40:00-03:00',
    'loaded',
    'invalid source',
    '2026-09-28T10:40:00-03:00',
    '2026-09-28T10:40:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'rejected'
     or v_result ->> 'errorCode' <> 'source_must_be_active_grain_cart' then
    raise exception 'expected grain-cart-source rejection, got %', v_result;
  end if;

  if exists (
    select 1
      from public.transport_loads
     where id = 'a2100000-0000-0000-0000-000000000002'
  ) then
    raise exception 'invalid-source transport load was persisted';
  end if;
end
$$;

reset role;
