-- SURKARA Operational Execution contract checks.
-- Runs after milestone_a_contract.sql and reuses its Tenant A fixtures.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_operational_team(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '41000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '71000000-0000-0000-0000-000000000001',
    'Equipo Cosecha A',
    'harvest',
    '2026-09-27T13:30:00-03:00',
    '2026-09-27T13:30:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected team accepted, got %', v_result;
  end if;

  if not exists (
    select 1
    from public.operational_teams
    where id = '71000000-0000-0000-0000-000000000001'
      and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and team_type = 'harvest'
      and revision = 1
  ) then
    raise exception 'operational team was not created';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_operational_team(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '41000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '71000000-0000-0000-0000-000000000001',
    'Equipo Cosecha A',
    'harvest',
    '2026-09-27T13:30:00-03:00',
    '2026-09-27T13:30:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected team duplicate, got %', v_result;
  end if;

  if (
    select count(*) from public.operational_teams
    where id = '71000000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'team idempotency failed';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_contractor_job(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '42000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '72000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-27T13:31:00-03:00',
    '2026-09-27T13:31:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected contractor job accepted, got %', v_result;
  end if;

  if not exists (
    select 1
    from public.contractor_jobs
    where id = '72000000-0000-0000-0000-000000000001'
      and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and agricultural_operation_id = '90000000-0000-0000-0000-000000000001'
      and operational_team_id = '71000000-0000-0000-0000-000000000001'
      and status = 'ready'
  ) then
    raise exception 'contractor job was not created';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_start_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '43000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '73000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-27T13:32:00-03:00',
    '2026-09-27T13:32:00-03:00',
    '2026-09-27T13:32:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected work session accepted, got %', v_result;
  end if;

  if not exists (
    select 1
    from public.work_sessions
    where id = '73000000-0000-0000-0000-000000000001'
      and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and contractor_job_id = '72000000-0000-0000-0000-000000000001'
      and operational_team_id = '71000000-0000-0000-0000-000000000001'
      and status = 'active'
      and revision = 1
  ) then
    raise exception 'work session was not created';
  end if;

  if not exists (
    select 1
      from public.contractor_jobs
     where id = '72000000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and status = 'active'
       and revision = 2
  ) then
    raise exception 'starting work session did not advance contractor job';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_start_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '43000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '73000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-27T13:32:00-03:00',
    '2026-09-27T13:32:00-03:00',
    '2026-09-27T13:32:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected work session duplicate, got %', v_result;
  end if;

  if (
    select count(*) from public.work_sessions
    where id = '73000000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'work session idempotency failed';
  end if;
end
$$;

do $$
begin
  begin
    perform public.process_create_contractor_job(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '42000000-0000-0000-0000-000000000099',
      '11111111-1111-1111-1111-111111111111',
      'device-exec',
      '72000000-0000-0000-0000-000000000099',
      '90000000-0000-0000-0000-000000000001',
      '81000000-0000-0000-0000-000000000099',
      '2026-09-27T13:40:00-03:00',
      '2026-09-27T13:40:01-03:00',
      1
    );
    raise exception 'expected invalid team reference';
  exception
    when foreign_key_violation then
      null;
  end;

  if exists (
    select 1 from public.command_receipts
    where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and client_operation_id = '42000000-0000-0000-0000-000000000099'
  ) then
    raise exception 'failed contractor job left an orphan receipt';
  end if;
end
$$;

reset role;
