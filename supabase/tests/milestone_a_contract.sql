-- SURKARA Milestone A database contract checks.

-- Supabase hosts pgcrypto in the extensions schema. Keep CI aligned with production.
do $surkara$
declare
  v_schema text;
begin
  select n.nspname
    into v_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';

  if v_schema <> 'extensions' then
    raise exception 'pgcrypto schema drift: expected extensions, got %', v_schema;
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in (
         'process_bootstrap_organization',
         'process_create_harvest_operation',
         'process_setup_agronomy_context'
       )
       and p.prosrc like '%public.digest(%'
  ) then
    raise exception 'command function still references public.digest';
  end if;
end
$surkara$;

insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into public.organizations(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B');

insert into public.organization_memberships(organization_id, user_id, role) values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'operator'
  );

insert into public.establishments(id, organization_id, name) values
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Campo A'
  );

insert into public.fields(id, organization_id, establishment_id, name, nominal_area_ha) values
  (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'Lote Norte',
    180
  );

insert into public.campaigns(id, organization_id, name, starts_on, ends_on) values
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '2026/27',
    '2026-07-01',
    '2027-06-30'
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Tenant B 2026/27',
    '2026-07-01',
    '2027-06-30'
  );

set role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_harvest_operation(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '10000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-a',
    '90000000-0000-0000-0000-000000000001',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'SOY',
    180,
    '2026-09-24T10:00:00-03:00',
    '2026-09-25T18:00:00-03:00',
    '2026-09-24T10:00:00-03:00',
    '2026-09-24T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected accepted, got %', v_result;
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_harvest_operation(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '10000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-a',
    '90000000-0000-0000-0000-000000000001',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'SOY',
    180,
    '2026-09-24T10:00:00-03:00',
    '2026-09-25T18:00:00-03:00',
    '2026-09-24T10:00:00-03:00',
    '2026-09-24T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected duplicate, got %', v_result;
  end if;

  if (select count(*) from public.agricultural_operations) <> 1 then
    raise exception 'idempotency failed: duplicate operation created';
  end if;

  if (
    select count(*)
    from public.command_receipts
    where client_operation_id = '10000000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'idempotency failed: duplicate receipt created';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_create_harvest_operation(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '10000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'device-a',
    '90000000-0000-0000-0000-000000000001',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'CORN',
    180,
    '2026-09-24T10:00:00-03:00',
    '2026-09-25T18:00:00-03:00',
    '2026-09-24T10:00:00-03:00',
    '2026-09-24T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'rejected'
     or v_result ->> 'errorCode' <> 'idempotency_key_reused' then
    raise exception 'expected idempotency collision rejection, got %', v_result;
  end if;
end
$$;

do $$
begin
  begin
    perform public.process_create_harvest_operation(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '10000000-0000-0000-0000-000000000002',
      '11111111-1111-1111-1111-111111111111',
      'device-a',
      '90000000-0000-0000-0000-000000000002',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'SOY',
      50,
      '2026-09-24T10:00:00-03:00',
      '2026-09-25T18:00:00-03:00',
      '2026-09-24T10:00:00-03:00',
      '2026-09-24T10:00:01-03:00',
      1
    );
    raise exception 'expected tenant consistency failure';
  exception
    when foreign_key_violation then
      null;
  end;

  if exists (
    select 1
    from public.command_receipts
    where client_operation_id = '10000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'failed command receipt should have rolled back atomically';
  end if;
end
$$;

do $$
begin
  begin
    perform public.process_create_harvest_operation(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '10000000-0000-0000-0000-000000000003',
      '22222222-2222-2222-2222-222222222222',
      'device-b',
      '90000000-0000-0000-0000-000000000003',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'SOY',
      20,
      '2026-09-24T10:00:00-03:00',
      '2026-09-25T18:00:00-03:00',
      '2026-09-24T10:00:00-03:00',
      '2026-09-24T10:00:01-03:00',
      1
    );
    raise exception 'expected membership failure';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_bootstrap_organization(
    '30000000-0000-0000-0000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    'abababab-abab-abab-abab-abababababab',
    'Nueva Empresa Rural',
    '2026-09-25T09:00:00-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected onboarding accepted, got %', v_result;
  end if;

  if not exists (
    select 1
    from public.organization_memberships
    where organization_id = 'abababab-abab-abab-abab-abababababab'
      and user_id = '33333333-3333-3333-3333-333333333333'
      and role = 'owner'
      and active
  ) then
    raise exception 'onboarding owner membership was not created';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_bootstrap_organization(
    '30000000-0000-0000-0000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    'abababab-abab-abab-abab-abababababab',
    'Nueva Empresa Rural',
    '2026-09-25T09:00:00-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected onboarding duplicate, got %', v_result;
  end if;

  if (
    select count(*)
    from public.organization_bootstrap_receipts
    where actor_user_id = '33333333-3333-3333-3333-333333333333'
  ) <> 1 then
    raise exception 'onboarding retry created duplicate receipt';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_bootstrap_organization(
    '30000000-0000-0000-0000-000000000002',
    '33333333-3333-3333-3333-333333333333',
    'acacacac-acac-acac-acac-acacacacacac',
    'Otra Empresa',
    '2026-09-25T09:01:00-03:00',
    1
  );

  if v_result ->> 'status' <> 'rejected'
     or v_result ->> 'errorCode' <> 'already_onboarded' then
    raise exception 'expected already_onboarded rejection, got %', v_result;
  end if;

  if exists (
    select 1
    from public.organizations
    where id = 'acacacac-acac-acac-acac-acacacacacac'
  ) then
    raise exception 'second onboarding unexpectedly created another organization';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_setup_agronomy_context(
    'abababab-abab-abab-abab-abababababab',
    '30000000-0000-0000-0000-000000000010',
    '33333333-3333-3333-3333-333333333333',
    'device-c',
    '44444444-4444-4444-4444-444444444444',
    'Campo Principal',
    '55555555-5555-5555-5555-555555555555',
    'Lote 1',
    180,
    '66666666-6666-6666-6666-666666666666',
    '2026/27',
    '2026-07-01',
    '2027-06-30',
    '2026-09-25T10:00:00-03:00',
    '2026-09-25T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'accepted' then
    raise exception 'expected agronomy setup accepted, got %', v_result;
  end if;

  if not exists (
    select 1 from public.fields
    where id = '55555555-5555-5555-5555-555555555555'
      and organization_id = 'abababab-abab-abab-abab-abababababab'
      and nominal_area_ha = 180
  ) then
    raise exception 'agronomy field was not created';
  end if;

  if not exists (
    select 1 from public.campaigns
    where id = '66666666-6666-6666-6666-666666666666'
      and organization_id = 'abababab-abab-abab-abab-abababababab'
  ) then
    raise exception 'agronomy campaign was not created';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_setup_agronomy_context(
    'abababab-abab-abab-abab-abababababab',
    '30000000-0000-0000-0000-000000000010',
    '33333333-3333-3333-3333-333333333333',
    'device-c',
    '44444444-4444-4444-4444-444444444444',
    'Campo Principal',
    '55555555-5555-5555-5555-555555555555',
    'Lote 1',
    180,
    '66666666-6666-6666-6666-666666666666',
    '2026/27',
    '2026-07-01',
    '2027-06-30',
    '2026-09-25T10:00:00-03:00',
    '2026-09-25T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'duplicate' then
    raise exception 'expected agronomy setup duplicate, got %', v_result;
  end if;

  if (
    select count(*)
    from public.command_receipts
    where organization_id = 'abababab-abab-abab-abab-abababababab'
      and client_operation_id = '30000000-0000-0000-0000-000000000010'
  ) <> 1 then
    raise exception 'agronomy setup retry created duplicate receipt';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.process_setup_agronomy_context(
    'abababab-abab-abab-abab-abababababab',
    '30000000-0000-0000-0000-000000000010',
    '33333333-3333-3333-3333-333333333333',
    'device-c',
    '44444444-4444-4444-4444-444444444444',
    'Campo Cambiado',
    '55555555-5555-5555-5555-555555555555',
    'Lote 1',
    180,
    '66666666-6666-6666-6666-666666666666',
    '2026/27',
    '2026-07-01',
    '2027-06-30',
    '2026-09-25T10:00:00-03:00',
    '2026-09-25T10:00:01-03:00',
    1
  );

  if v_result ->> 'status' <> 'rejected'
     or v_result ->> 'errorCode' <> 'idempotency_key_reused' then
    raise exception 'expected agronomy idempotency collision, got %', v_result;
  end if;
end
$$;

reset role;

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  false
);

set role authenticated;

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible
  from public.organizations;

  if v_visible <> 1 then
    raise exception 'RLS isolation failed: expected 1 visible organization, got %', v_visible;
  end if;

  begin
    insert into public.organizations(name) values ('Browser write must fail');
    raise exception 'authenticated browser unexpectedly wrote directly';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;
