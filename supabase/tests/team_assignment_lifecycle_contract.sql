-- SURKARA Team Assignment Lifecycle contract checks.
-- Reuses the equipment assignment created by team_composition_contract.sql.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_end_team_assignment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '66000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '82000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-27T16:00:00-03:00',
    'Fin de turno',
    '2026-09-27T16:00:00-03:00',
    '2026-09-27T16:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected assignment closure accepted, got %', v_result;
  end if;

  if not exists (
    select 1
      from public.team_assignments
     where id = '82000000-0000-0000-0000-000000000001'
       and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and valid_to = '2026-09-27T16:00:00-03:00'::timestamptz
       and reason = 'Fin de turno'
  ) then
    raise exception 'assignment was not closed';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_end_team_assignment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '66000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '82000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-27T16:00:00-03:00',
    'Fin de turno',
    '2026-09-27T16:00:00-03:00',
    '2026-09-27T16:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected closure duplicate, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_end_team_assignment(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '66000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '82000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-09-27T17:00:00-03:00',
    'Segundo cierre',
    '2026-09-27T17:00:00-03:00',
    '2026-09-27T17:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'conflict'
     or v_result ->> 'errorCode' <> 'assignment_already_closed' then
    raise exception 'expected already-closed conflict, got %', v_result;
  end if;

  if (
    select valid_to
      from public.team_assignments
     where id = '82000000-0000-0000-0000-000000000001'
  ) <> '2026-09-27T16:00:00-03:00'::timestamptz then
    raise exception 'second closure mutated historical valid_to';
  end if;
end
$$;

do $$
begin
  begin
    perform public.process_end_team_assignment(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '66000000-0000-0000-0000-000000000003',
      '22222222-2222-2222-2222-222222222222',
      'device-team-b',
      '84000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      '2026-09-27T16:10:00-03:00',
      'Unauthorized',
      '2026-09-27T16:10:00-03:00',
      '2026-09-27T16:10:01-03:00',
      1
    );
    raise exception 'expected membership failure';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;
