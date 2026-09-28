-- SURKARA Grain Storage contract checks.
-- Runs after grain_batch_transfer_contract.sql while its fixture session/batch stay active.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_grain_storage_unit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'b1000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-storage',
    'b1100000-0000-0000-0000-000000000001',
    'silo',
    'Silo campo',
    'active',
    '2026-09-28T10:45:00-03:00',
    '2026-09-28T10:45:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected storage unit accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.grain_storage_units
     where id = 'b1100000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and storage_kind = 'silo'
       and display_name = 'Silo campo'
       and status = 'active'
  ) then
    raise exception 'storage unit was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_grain_storage_unit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'b1000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-storage',
    'b1100000-0000-0000-0000-000000000001',
    'silo',
    'Silo campo',
    'active',
    '2026-09-28T10:45:00-03:00',
    '2026-09-28T10:45:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected storage unit duplicate, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_grain_storage_receipt(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'b2000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-storage',
    'b2100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    'b1100000-0000-0000-0000-000000000001',
    20,
    't',
    20000,
    'estimated',
    '2026-09-28T10:50:00-03:00',
    'stored',
    'descarga parcial',
    '2026-09-28T10:50:00-03:00',
    '2026-09-28T10:50:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected storage receipt accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.grain_storage_receipts
     where id = 'b2100000-0000-0000-0000-000000000001'
       and grain_batch_id = '95400000-0000-0000-0000-000000000001'
       and source_work_session_id = '95400000-0000-0000-0000-000000000001'
       and source_equipment_id = '95100000-0000-0000-0000-000000000001'
       and storage_unit_id = 'b1100000-0000-0000-0000-000000000001'
       and quantity_value = 20
       and quantity_unit = 't'
       and quantity_kg = 20000
       and provenance = 'estimated'
       and status = 'stored'
  ) then
    raise exception 'storage receipt was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_grain_storage_receipt(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'b2000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-storage',
    'b2100000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    'b1100000-0000-0000-0000-000000000001',
    20,
    't',
    20000,
    'estimated',
    '2026-09-28T10:50:00-03:00',
    'stored',
    'descarga parcial',
    '2026-09-28T10:50:00-03:00',
    '2026-09-28T10:50:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected storage receipt duplicate, got %', v_result;
  end if;

  if (
    select count(*)
      from public.grain_storage_receipts
     where id = 'b2100000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'storage receipt idempotency failed';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_record_grain_storage_receipt(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'b2000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-storage',
    'b2100000-0000-0000-0000-000000000002',
    '95400000-0000-0000-0000-000000000001',
    '95400000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    'b1100000-0000-0000-0000-000000000001',
    5,
    't',
    5000,
    'manual',
    '2026-09-28T10:55:00-03:00',
    'stored',
    'invalid source',
    '2026-09-28T10:55:00-03:00',
    '2026-09-28T10:55:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'rejected'
     or v_result ->> 'errorCode' <> 'source_must_be_active_grain_cart' then
    raise exception 'expected storage source rejection, got %', v_result;
  end if;

  if exists (
    select 1
      from public.grain_storage_receipts
     where id = 'b2100000-0000-0000-0000-000000000002'
  ) then
    raise exception 'invalid-source storage receipt was persisted';
  end if;
end
$$;

reset role;
