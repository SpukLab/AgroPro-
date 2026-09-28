-- SURKARA GrainBatch + GrainTransfer contract checks.
-- Runs after team_composition_contract.sql while the fixture WorkSession is active.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_contractor_job(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '95300000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '95300000-0000-0000-0000-000000000002',
    '90000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-28T10:00:00-03:00',
    '2026-09-28T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected grain test job accepted, got %', v_result;
  end if;

  v_result := public.process_start_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '95300000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '95400000-0000-0000-0000-000000000001',
    '95300000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-28T10:00:00-03:00',
    '2026-09-28T10:00:00-03:00',
    '2026-09-28T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected grain test session accepted, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_equipment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '95000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '95100000-0000-0000-0000-000000000001',
    'grain_cart',
    'Monotolva 1',
    null,
    null,
    null,
    '2026-09-27T14:00:00-03:00',
    '2026-09-27T14:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected grain cart accepted, got %', v_result;
  end if;

  v_result := public.process_assign_team_member(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '95000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '95200000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'equipment',
    null,
    '95100000-0000-0000-0000-000000000001',
    'grain_cart',
    '2026-09-27T14:00:00-03:00',
    null,
    null,
    '2026-09-27T14:00:00-03:00',
    '2026-09-27T14:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected grain cart assignment accepted, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_grain_batch(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '96000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '95400000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    'session_primary',
    'open',
    '2026-09-28T10:05:00-03:00',
    '2026-09-28T10:05:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected grain batch accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.grain_batches
     where id = '95400000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and agricultural_operation_id = '90000000-0000-0000-0000-000000000001'
       and source_work_session_id = '95400000-0000-0000-0000-000000000001'
       and batch_key = 'session_primary'
       and status = 'open'
  ) then
    raise exception 'grain batch was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  -- A second device independently derives the same session-primary batch id.
  v_result := public.process_create_grain_batch(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '96000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-grain-b',
    '95400000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    'session_primary',
    'open',
    '2026-09-28T10:06:00-03:00',
    '2026-09-28T10:06:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected convergent batch creation accepted, got %', v_result;
  end if;

  if (
    select count(*)
      from public.grain_batches
     where source_work_session_id = '95400000-0000-0000-0000-000000000001'
       and batch_key = 'session_primary'
  ) <> 1 then
    raise exception 'convergent batch creation duplicated the batch';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_grain_transfer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '97000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '97100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    8.5,
    't',
    8500,
    'estimated',
    '2026-09-28T10:10:00-03:00',
    'descarga parcial',
    '2026-09-28T10:10:00-03:00',
    '2026-09-28T10:10:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected grain transfer accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.grain_transfers
     where id = '97100000-0000-0000-0000-000000000001'
       and grain_batch_id = '95400000-0000-0000-0000-000000000001'
       and source_equipment_id = '81000000-0000-0000-0000-000000000001'
       and destination_equipment_id = '95100000-0000-0000-0000-000000000001'
       and quantity_value = 8.5
       and quantity_unit = 't'
       and quantity_kg = 8500
       and provenance = 'estimated'
  ) then
    raise exception 'grain transfer was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_grain_transfer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '97000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '97100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    8.5,
    't',
    8500,
    'estimated',
    '2026-09-28T10:10:00-03:00',
    'descarga parcial',
    '2026-09-28T10:10:00-03:00',
    '2026-09-28T10:10:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected grain transfer duplicate, got %', v_result;
  end if;

  if (
    select count(*)
      from public.grain_transfers
     where id = '97100000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'grain transfer idempotency failed';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_equipment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '98000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '98100000-0000-0000-0000-000000000001',
    'tractor',
    'Tractor no asignado',
    null,
    null,
    null,
    '2026-09-28T10:20:00-03:00',
    '2026-09-28T10:20:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected unassigned equipment accepted, got %', v_result;
  end if;

  v_result := public.process_record_grain_transfer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '98000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-grain',
    '98200000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '98100000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    1000,
    'kg',
    1000,
    'manual',
    '2026-09-28T10:25:00-03:00',
    null,
    '2026-09-28T10:25:00-03:00',
    '2026-09-28T10:25:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'rejected'
     or v_result ->> 'errorCode' <> 'source_equipment_not_assigned' then
    raise exception 'expected source-equipment rejection, got %', v_result;
  end if;

  if exists (
    select 1
      from public.grain_transfers
     where id = '98200000-0000-0000-0000-000000000001'
  ) then
    raise exception 'rejected grain transfer was persisted';
  end if;
end
$$;

reset role;
