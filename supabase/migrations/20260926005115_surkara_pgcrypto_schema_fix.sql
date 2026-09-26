create schema if not exists extensions;

do $$
declare
  v_schema text;
begin
  select n.nspname
    into v_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';

  if v_schema is null then
    execute 'create extension pgcrypto with schema extensions';
  elsif v_schema <> 'extensions' then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end
$$;

grant usage on schema extensions to authenticated, service_role;
grant execute on function extensions.digest(bytea, text) to service_role;

do $$
declare
  r record;
  v_definition text;
  v_count integer := 0;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in (
         'process_bootstrap_organization',
         'process_create_harvest_operation',
         'process_setup_agronomy_context'
       )
  loop
    v_definition := replace(
      pg_get_functiondef(r.oid),
      'public.digest(',
      'extensions.digest('
    );
    execute v_definition;
    v_count := v_count + 1;
  end loop;

  if v_count <> 3 then
    raise exception 'expected 3 SURKARA command functions, found %', v_count;
  end if;
end
$$;

do $$
begin
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
    raise exception 'SURKARA command function still references public.digest';
  end if;
end
$$;
