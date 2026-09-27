-- SURKARA ContractorJob completion contract.
-- Runs after contractor_job_multi_session_contract.sql, which leaves session 2 active.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_complete_contractor_job(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '46000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '72000000-0000-0000-0000-000000000001',
    2,
    '2026-09-28T17:00:00-03:00',
    '2026-09-28T17:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'conflict'
     or v_result ->> 'errorCode' <> 'job_has_active_session' then
    raise exception 'expected active-session completion conflict, got %', v_result;
  end if;

  if (
    select status
      from public.contractor_jobs
     where id = '72000000-0000-0000-0000-000000000001'
  ) <> 'active' then
    raise exception 'job status changed despite active session conflict';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_end_work_session(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '46000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '73000000-0000-0000-0000-000000000002',
    1,
    '2026-09-28T18:00:00-03:00',
    '2026-09-28T18:00:00-03:00',
    '2026-09-28T18:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected second session closure accepted, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_complete_contractor_job(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '46000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '72000000-0000-0000-0000-000000000001',
    2,
    '2026-09-28T18:05:00-03:00',
    '2026-09-28T18:05:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted'
     or (v_result ->> 'serverRevision')::integer <> 3 then
    raise exception 'expected job completion accepted at revision 3, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.contractor_jobs
     where id = '72000000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and status = 'completed'
       and revision = 3
  ) then
    raise exception 'contractor job completion was not persisted';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_complete_contractor_job(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '46000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '72000000-0000-0000-0000-000000000001',
    2,
    '2026-09-28T18:05:00-03:00',
    '2026-09-28T18:05:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected job completion duplicate, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_complete_contractor_job(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '46000000-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'device-exec',
    '72000000-0000-0000-0000-000000000001',
    3,
    '2026-09-28T18:10:00-03:00',
    '2026-09-28T18:10:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'conflict'
     or v_result ->> 'errorCode' <> 'job_already_completed' then
    raise exception 'expected already-completed conflict, got %', v_result;
  end if;
end
$$;

reset role;
