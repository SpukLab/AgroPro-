-- SURKARA Harvest session field record contract checks.
-- Runs after operational_execution_contract.sql while the fixture WorkSession is active.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_equipment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '91000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-harvest',
    '91100000-0000-0000-0000-000000000001',
    'harvester',
    'Cosechadora Field Records',
    'Case IH',
    '8250',
    null,
    '2026-09-27T13:33:00-03:00',
    '2026-09-27T13:33:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected field-record equipment accepted, got %', v_result;
  end if;

  v_result := public.process_assign_team_member(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '91000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-harvest',
    '91200000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'equipment',
    null,
    '91100000-0000-0000-0000-000000000001',
    'harvester',
    '2026-09-27T13:33:00-03:00',
    null,
    null,
    '2026-09-27T13:33:00-03:00',
    '2026-09-27T13:33:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected field-record assignment accepted, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_harvest_measurement(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '92000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-harvest',
    '92100000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    null,
    'area_completed_ha',
    24.5,
    'ha',
    'manual',
    '2026-09-27T14:00:00-03:00',
    'sector norte',
    '2026-09-27T14:00:00-03:00',
    '2026-09-27T14:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected area measurement accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.harvest_session_measurements
     where id = '92100000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and work_session_id = '73000000-0000-0000-0000-000000000001'
       and metric_kind = 'area_completed_ha'
       and numeric_value = 24.5
       and unit = 'ha'
       and provenance = 'manual'
  ) then
    raise exception 'area measurement was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_harvest_measurement(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '92000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-harvest',
    '92100000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    null,
    'area_completed_ha',
    24.5,
    'ha',
    'manual',
    '2026-09-27T14:00:00-03:00',
    'sector norte',
    '2026-09-27T14:00:00-03:00',
    '2026-09-27T14:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected measurement duplicate, got %', v_result;
  end if;

  if (
    select count(*)
      from public.harvest_session_measurements
     where id = '92100000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'measurement idempotency failed';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_harvest_measurement(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '92000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-harvest',
    '92100000-0000-0000-0000-000000000002',
    '73000000-0000-0000-0000-000000000001',
    '91100000-0000-0000-0000-000000000001',
    'machine_hours',
    2.75,
    'h',
    'manual',
    '2026-09-27T16:00:00-03:00',
    null,
    '2026-09-27T16:00:00-03:00',
    '2026-09-27T16:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected machine-hours measurement accepted, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_harvest_downtime(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '93000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-harvest',
    '93100000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    '91100000-0000-0000-0000-000000000001',
    'waiting_resource',
    '2026-09-27T16:10:00-03:00',
    '2026-09-27T16:25:00-03:00',
    'manual',
    'esperando cosechadora',
    '2026-09-27T16:25:00-03:00',
    '2026-09-27T16:25:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected downtime accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.harvest_downtime_events
     where id = '93100000-0000-0000-0000-000000000001'
       and cause = 'waiting_resource'
       and blocking_equipment_id = '91100000-0000-0000-0000-000000000001'
       and ended_at - started_at = interval '15 minutes'
  ) then
    raise exception 'downtime was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_equipment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '94000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-harvest',
    '94100000-0000-0000-0000-000000000001',
    'tractor',
    'Equipo no asignado',
    null,
    null,
    null,
    '2026-09-27T16:30:00-03:00',
    '2026-09-27T16:30:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected unassigned equipment creation accepted, got %', v_result;
  end if;

  v_result := public.process_record_harvest_measurement(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '94000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-harvest',
    '94200000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    '94100000-0000-0000-0000-000000000001',
    'fuel_liters',
    100,
    'l',
    'manual',
    '2026-09-27T16:35:00-03:00',
    null,
    '2026-09-27T16:35:00-03:00',
    '2026-09-27T16:35:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'rejected'
     or v_result ->> 'errorCode' <> 'equipment_not_assigned' then
    raise exception 'expected equipment-not-assigned rejection, got %', v_result;
  end if;

  if exists (
    select 1
      from public.harvest_session_measurements
     where id = '94200000-0000-0000-0000-000000000001'
  ) then
    raise exception 'rejected measurement was persisted';
  end if;
end
$$;

reset role;
