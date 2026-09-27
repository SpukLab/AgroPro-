-- SURKARA ContractorJob multi-session contract.
-- Runs after work_session_close_contract.sql, which leaves the first session completed.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_start_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '45000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '73000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-28T08:00:00-03:00',
    '2026-09-28T08:00:00-03:00',
    '2026-09-28T08:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected second work session accepted, got %', v_result;
  end if;

  if (
    select count(*)
      from public.work_sessions
     where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and contractor_job_id = '72000000-0000-0000-0000-000000000001'
  ) <> 2 then
    raise exception 'expected two sessions for the same contractor job';
  end if;

  if not exists (
    select 1
      from public.work_sessions
     where id = '73000000-0000-0000-0000-000000000002'
       and status = 'active'
       and operational_team_id = '71000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'second work session was not created as active';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_start_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '45000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '73000000-0000-0000-0000-000000000003',
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-28T09:00:00-03:00',
    '2026-09-28T09:00:00-03:00',
    '2026-09-28T09:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'conflict'
     or v_result ->> 'errorCode' <> 'job_has_active_session' then
    raise exception 'expected active-session conflict, got %', v_result;
  end if;

  if exists (
    select 1
      from public.work_sessions
     where id = '73000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'conflicting third session was created';
  end if;
end
$$;

do $$
begin
  begin
    perform public.process_start_work_session(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '45000000-0000-0000-0000-000000000003',
      '11111111-1111-1111-1111-111111111111',
      'device-exec',
      '73000000-0000-0000-0000-000000000004',
      '72000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000099',
      '2026-09-29T08:00:00-03:00',
      '2026-09-29T08:00:00-03:00',
      '2026-09-29T08:00:01-03:00',
      1
    );
    raise exception 'expected team mismatch rejection';
  exception
    when foreign_key_violation then
      null;
  end;

  if exists (
    select 1
      from public.command_receipts
     where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and client_operation_id = '45000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'team mismatch left an orphan receipt';
  end if;
end
$$;

reset role;
