-- SURKARA Work Session Closure contract checks.
-- Reuses work session created by operational_execution_contract.sql.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_end_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '44000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '73000000-0000-0000-0000-000000000001',
    1,
    '2026-09-27T18:00:00-03:00',
    '2026-09-27T18:00:00-03:00',
    '2026-09-27T18:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted'
     or (v_result ->> 'serverRevision')::integer <> 2 then
    raise exception 'expected session closure accepted at revision 2, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.work_sessions
     where id = '73000000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and status = 'completed'
       and revision = 2
       and ended_at = '2026-09-27T18:00:00-03:00'::timestamptz
  ) then
    raise exception 'work session closure was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_end_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '44000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '73000000-0000-0000-0000-000000000001',
    1,
    '2026-09-27T18:00:00-03:00',
    '2026-09-27T18:00:00-03:00',
    '2026-09-27T18:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected session closure duplicate, got %', v_result;
  end if;

  if (
    select revision
      from public.work_sessions
     where id = '73000000-0000-0000-0000-000000000001'
  ) <> 2 then
    raise exception 'duplicate closure changed session revision';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_end_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '44000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '73000000-0000-0000-0000-000000000001',
    1,
    '2026-09-27T19:00:00-03:00',
    '2026-09-27T19:00:00-03:00',
    '2026-09-27T19:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'conflict'
     or v_result ->> 'errorCode' <> 'session_not_active' then
    raise exception 'expected already-completed session conflict, got %', v_result;
  end if;
end
$$;

reset role;
