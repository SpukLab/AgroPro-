create table public.organization_bootstrap_receipts (
  actor_user_id uuid primary key references auth.users(id) on delete cascade,
  client_operation_id uuid not null,
  organization_id uuid not null references public.organizations(id)
    deferrable initially deferred,
  command_hash text not null check (char_length(command_hash) = 64),
  schema_version integer not null default 1 check (schema_version > 0),
  occurred_at_local timestamptz not null,
  result_json jsonb,
  processed_at timestamptz not null default now()
);

alter table public.organization_bootstrap_receipts enable row level security;

revoke all on table public.organization_bootstrap_receipts from anon, authenticated;
grant select, insert, update, delete on table public.organization_bootstrap_receipts to service_role;

create or replace function public.process_bootstrap_organization(
  p_client_operation_id uuid,
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_organization_name text,
  p_occurred_at_local timestamptz,
  p_schema_version integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_command_hash text;
  v_receipt public.organization_bootstrap_receipts%rowtype;
  v_processed_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_schema_version <> 1 then
    raise exception 'unsupported schema version: %', p_schema_version using errcode = '22023';
  end if;

  if p_organization_name is null
     or char_length(trim(p_organization_name)) < 2
     or char_length(trim(p_organization_name)) > 120 then
    raise exception 'organization name must contain 2 to 120 characters' using errcode = '22023';
  end if;

  perform 1 from auth.users where id = p_actor_user_id for update;
  if not found then
    raise exception 'actor not found' using errcode = '42501';
  end if;

  v_command_hash := encode(
    public.digest(
      convert_to(
        jsonb_build_object(
          'commandType', 'onboarding.bootstrap_organization',
          'actorId', p_actor_user_id,
          'organizationId', p_organization_id,
          'organizationName', trim(p_organization_name),
          'occurredAtLocal', p_occurred_at_local,
          'schemaVersion', p_schema_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select *
    into v_receipt
    from public.organization_bootstrap_receipts r
   where r.actor_user_id = p_actor_user_id;

  if found then
    if v_receipt.client_operation_id = p_client_operation_id
       and v_receipt.command_hash = v_command_hash then
      return jsonb_build_object(
        'clientOperationId', p_client_operation_id,
        'status', 'duplicate',
        'organizationId', v_receipt.organization_id,
        'membershipRole', 'owner',
        'processedAt', v_receipt.processed_at
      );
    end if;

    return jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'errorCode', 'already_onboarded'
    );
  end if;

  if exists (
    select 1
      from public.organization_memberships m
     where m.user_id = p_actor_user_id
       and m.active
  ) then
    return jsonb_build_object(
      'clientOperationId', p_client_operation_id,
      'status', 'rejected',
      'processedAt', v_processed_at,
      'errorCode', 'membership_already_exists'
    );
  end if;

  insert into public.organization_bootstrap_receipts (
    actor_user_id,
    client_operation_id,
    organization_id,
    command_hash,
    schema_version,
    occurred_at_local,
    processed_at
  )
  values (
    p_actor_user_id,
    p_client_operation_id,
    p_organization_id,
    v_command_hash,
    p_schema_version,
    p_occurred_at_local,
    v_processed_at
  );

  insert into public.organizations(id, name)
  values (p_organization_id, trim(p_organization_name));

  insert into public.organization_memberships(
    organization_id,
    user_id,
    role,
    active
  )
  values (
    p_organization_id,
    p_actor_user_id,
    'owner',
    true
  );

  v_result := jsonb_build_object(
    'clientOperationId', p_client_operation_id,
    'status', 'accepted',
    'organizationId', p_organization_id,
    'membershipRole', 'owner',
    'processedAt', v_processed_at
  );

  update public.organization_bootstrap_receipts
     set result_json = v_result
   where actor_user_id = p_actor_user_id;

  return v_result;
end;
$function$;

revoke all on function public.process_bootstrap_organization(
  uuid, uuid, uuid, text, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.process_bootstrap_organization(
  uuid, uuid, uuid, text, timestamptz, integer
) to service_role;
