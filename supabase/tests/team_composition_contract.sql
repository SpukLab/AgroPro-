-- SURKARA Team Composition contract checks.
-- Reuses Tenant A fixtures and operational team created by operational_execution_contract.sql.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_equipment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '61000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '81000000-0000-0000-0000-000000000001',
    'harvester',
    'Cosechadora 1',
    'Case IH',
    '8250',
    null,
    '2026-09-27T14:00:00-03:00',
    '2026-09-27T14:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected equipment accepted, got %', v_result;
  end if;

  if not exists (
    select 1 from public.equipment
    where id = '81000000-0000-0000-0000-000000000001'
      and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and equipment_type = 'harvester'
      and display_name = 'Cosechadora 1'
  ) then
    raise exception 'equipment was not created';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_equipment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '61000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '81000000-0000-0000-0000-000000000001',
    'harvester',
    'Cosechadora 1',
    'Case IH',
    '8250',
    null,
    '2026-09-27T14:00:00-03:00',
    '2026-09-27T14:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected equipment duplicate, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_assign_team_member(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '62000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '82000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'equipment',
    null,
    '81000000-0000-0000-0000-000000000001',
    'harvester',
    '2026-09-27T14:00:00-03:00',
    null,
    null,
    '2026-09-27T14:00:00-03:00',
    '2026-09-27T14:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected equipment assignment accepted, got %', v_result;
  end if;

  if not exists (
    select 1 from public.team_assignments
    where id = '82000000-0000-0000-0000-000000000001'
      and operational_team_id = '71000000-0000-0000-0000-000000000001'
      and equipment_id = '81000000-0000-0000-0000-000000000001'
      and role = 'harvester'
  ) then
    raise exception 'equipment assignment missing';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_team_person(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '63000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '83000000-0000-0000-0000-000000000001',
    'Operador 1',
    '2026-09-27T14:05:00-03:00',
    '2026-09-27T14:05:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected person accepted, got %', v_result;
  end if;

  if not exists (
    select 1
    from public.organization_parties
    where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and party_id = '83000000-0000-0000-0000-000000000001'
      and relationship_kind = 'worker'
  ) then
    raise exception 'worker relationship missing';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_assign_team_member(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '64000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '84000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'person',
    '83000000-0000-0000-0000-000000000001',
    null,
    'harvester_operator',
    '2026-09-27T14:05:00-03:00',
    null,
    null,
    '2026-09-27T14:05:00-03:00',
    '2026-09-27T14:05:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected person assignment accepted, got %', v_result;
  end if;
end
$$;

do $$
begin
  insert into public.parties(id, party_type, display_name)
  values (
    '85000000-0000-0000-0000-000000000001',
    'person',
    'Tenant B Worker'
  );

  insert into public.organization_parties(
    organization_id,
    party_id,
    relationship_kind
  )
  values (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '85000000-0000-0000-0000-000000000001',
    'worker'
  );

  begin
    perform public.process_assign_team_member(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '65000000-0000-0000-0000-000000000001',
      '11111111-1111-1111-1111-111111111111',
      'device-team',
      '86000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      'person',
      '85000000-0000-0000-0000-000000000001',
      null,
      'support_operator',
      '2026-09-27T14:10:00-03:00',
      null,
      null,
      '2026-09-27T14:10:00-03:00',
      '2026-09-27T14:10:01-03:00',
      1
    );
    raise exception 'expected cross-tenant person rejection';
  exception
    when foreign_key_violation then
      null;
  end;

  if exists (
    select 1 from public.command_receipts
    where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and client_operation_id = '65000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'rejected cross-tenant assignment left a receipt';
  end if;
end
$$;

reset role;
