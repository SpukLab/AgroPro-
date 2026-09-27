-- SURKARA Team Assignment Label Correction contract checks.
-- Reuses person assignment 840... from team_composition_contract.sql.

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_correct_team_assignment_label(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '67000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '84000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'Operador corregido',
    '2026-09-27T17:10:00-03:00',
    '2026-09-27T17:10:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected label correction accepted, got %', v_result;
  end if;

  if (
    select display_label_override
      from public.team_assignments
     where id = '84000000-0000-0000-0000-000000000001'
  ) <> 'Operador corregido' then
    raise exception 'assignment label override was not persisted';
  end if;

  if (
    select display_name
      from public.parties
     where id = '83000000-0000-0000-0000-000000000001'
  ) <> 'Operador 1' then
    raise exception 'assignment correction mutated party master identity';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_correct_team_assignment_label(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '67000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-team',
    '84000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'Operador corregido',
    '2026-09-27T17:10:00-03:00',
    '2026-09-27T17:10:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected label correction duplicate, got %', v_result;
  end if;
end
$$;

do $$
begin
  begin
    perform public.process_correct_team_assignment_label(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '67000000-0000-0000-0000-000000000002',
      '11111111-1111-1111-1111-111111111111',
      'device-team',
      '87000000-0000-0000-0000-000000000099',
      '71000000-0000-0000-0000-000000000001',
      'No existe',
      '2026-09-27T17:11:00-03:00',
      '2026-09-27T17:11:01-03:00',
      1
    );
    raise exception 'expected missing assignment rejection';
  exception
    when foreign_key_violation then
      null;
  end;

  if exists (
    select 1
      from public.command_receipts
     where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and client_operation_id = '67000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'missing assignment correction left a receipt';
  end if;
end
$$;

reset role;
