-- SURKARA Milestone A — persistence draft v0.2
-- NOT APPLIED. Convert to a real Supabase migration only after provisioning
-- an isolated SURKARA project and re-running the security review.
--
-- Core rules:
-- 1. organization_id is the security/tenancy boundary, not business identity.
-- 2. Party is global; OrganizationParty expresses contextual business relationships.
-- 3. Cross-table tenant consistency is enforced with composite foreign keys.
-- 4. Browser users receive read access only. Authoritative writes go through the Sync Gateway.

create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','operator','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('person','organization')),
  display_name text not null check (char_length(trim(display_name)) > 0),
  external_ref text,
  created_at timestamptz not null default now()
);

create table public.organization_parties (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  relationship_kind text not null check (
    relationship_kind in ('client','supplier','contractor','carrier','advisor','owner','other')
  ),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  primary key (organization_id, party_id, relationship_kind),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_party_id uuid references public.parties(id),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  establishment_id uuid not null,
  name text not null check (char_length(trim(name)) > 0),
  nominal_area_ha numeric(12,3) check (nominal_area_ha is null or nominal_area_ha > 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (establishment_id, organization_id)
    references public.establishments(id, organization_id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) > 0),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  owner_party_id uuid references public.parties(id),
  equipment_type text not null,
  display_name text not null check (char_length(trim(display_name)) > 0),
  make text,
  model text,
  serial_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.agricultural_operations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  field_id uuid not null,
  campaign_id uuid not null,
  crop_code text not null,
  operation_type text not null check (operation_type in ('harvest')),
  planned_area_ha numeric(12,3) not null check (planned_area_ha > 0),
  planned_from timestamptz not null,
  planned_to timestamptz not null,
  status text not null check (status in ('planned','ready','active','completed','cancelled')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (field_id, organization_id)
    references public.fields(id, organization_id),
  foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id),
  check (planned_to >= planned_from)
);

create table public.operational_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) > 0),
  team_type text not null check (
    team_type in ('harvest','seeding','spraying','maintenance','other')
  ),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.team_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  operational_team_id uuid not null,
  party_id uuid references public.parties(id),
  equipment_id uuid,
  role text not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (operational_team_id, organization_id)
    references public.operational_teams(id, organization_id) on delete cascade,
  foreign key (equipment_id, organization_id)
    references public.equipment(id, organization_id),
  check ((party_id is not null) <> (equipment_id is not null)),
  check (valid_to is null or valid_to >= valid_from)
);

create table public.contractor_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  agricultural_operation_id uuid not null,
  client_party_id uuid references public.parties(id),
  operational_team_id uuid,
  status text not null check (status in ('planned','ready','active','completed','cancelled')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (agricultural_operation_id, organization_id)
    references public.agricultural_operations(id, organization_id),
  foreign key (operational_team_id, organization_id)
    references public.operational_teams(id, organization_id)
);

create table public.work_sessions (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  contractor_job_id uuid not null,
  operational_team_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('active','completed','cancelled')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (contractor_job_id, organization_id)
    references public.contractor_jobs(id, organization_id),
  foreign key (operational_team_id, organization_id)
    references public.operational_teams(id, organization_id),
  check (ended_at is null or ended_at >= started_at)
);

create table public.command_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_operation_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  device_id text not null,
  command_type text not null,
  target_ref text,
  base_revision integer,
  status text not null check (
    status in ('accepted','duplicate','conflict','rejected','blocked_dependency','pending_external')
  ),
  result_json jsonb,
  error_code text,
  processed_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, client_operation_id)
);

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  command_receipt_id uuid not null,
  conflict_class text not null check (conflict_class in ('A','B','C','D','E')),
  reason text not null,
  target_ref text,
  client_base_revision integer,
  server_revision integer,
  details jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (command_receipt_id, organization_id)
    references public.command_receipts(id, organization_id)
);

create index organization_memberships_user_idx
  on public.organization_memberships(user_id)
  where active;

create index organization_parties_party_idx
  on public.organization_parties(party_id, organization_id);

create index establishments_org_idx on public.establishments(organization_id);
create index fields_org_establishment_idx
  on public.fields(organization_id, establishment_id);
create index campaigns_org_idx on public.campaigns(organization_id);
create index equipment_org_idx on public.equipment(organization_id);
create index agricultural_operations_org_status_idx
  on public.agricultural_operations(organization_id, status);
create index operational_teams_org_idx on public.operational_teams(organization_id);
create index team_assignments_team_time_idx
  on public.team_assignments(organization_id, operational_team_id, valid_from);
create index contractor_jobs_org_status_idx
  on public.contractor_jobs(organization_id, status);
create index work_sessions_org_status_idx
  on public.work_sessions(organization_id, status);
create index command_receipts_actor_idx
  on public.command_receipts(organization_id, actor_user_id, processed_at desc);
create index sync_conflicts_open_idx
  on public.sync_conflicts(organization_id, created_at desc)
  where resolved_at is null;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.parties enable row level security;
alter table public.organization_parties enable row level security;
alter table public.establishments enable row level security;
alter table public.fields enable row level security;
alter table public.campaigns enable row level security;
alter table public.equipment enable row level security;
alter table public.agricultural_operations enable row level security;
alter table public.operational_teams enable row level security;
alter table public.team_assignments enable row level security;
alter table public.contractor_jobs enable row level security;
alter table public.work_sessions enable row level security;
alter table public.command_receipts enable row level security;
alter table public.sync_conflicts enable row level security;

revoke all on table
  public.organizations,
  public.organization_memberships,
  public.parties,
  public.organization_parties,
  public.establishments,
  public.fields,
  public.campaigns,
  public.equipment,
  public.agricultural_operations,
  public.operational_teams,
  public.team_assignments,
  public.contractor_jobs,
  public.work_sessions,
  public.command_receipts,
  public.sync_conflicts
from anon, authenticated;

grant select on table
  public.organizations,
  public.organization_memberships,
  public.parties,
  public.organization_parties,
  public.establishments,
  public.fields,
  public.campaigns,
  public.equipment,
  public.agricultural_operations,
  public.operational_teams,
  public.team_assignments,
  public.contractor_jobs,
  public.work_sessions,
  public.command_receipts,
  public.sync_conflicts
to authenticated;

grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.organizations,
  public.organization_memberships,
  public.parties,
  public.organization_parties,
  public.establishments,
  public.fields,
  public.campaigns,
  public.equipment,
  public.agricultural_operations,
  public.operational_teams,
  public.team_assignments,
  public.contractor_jobs,
  public.work_sessions,
  public.command_receipts,
  public.sync_conflicts
to service_role;

create policy memberships_self_select
on public.organization_memberships
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy organizations_member_select
on public.organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy organization_parties_member_select
on public.organization_parties
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = organization_parties.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy parties_related_member_select
on public.parties
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_parties op
    join public.organization_memberships m
      on m.organization_id = op.organization_id
    where op.party_id = parties.id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy establishments_member_select
on public.establishments
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = establishments.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy fields_member_select
on public.fields
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = fields.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy campaigns_member_select
on public.campaigns
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = campaigns.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy equipment_member_select
on public.equipment
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = equipment.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy agricultural_operations_member_select
on public.agricultural_operations
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = agricultural_operations.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy operational_teams_member_select
on public.operational_teams
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = operational_teams.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy team_assignments_member_select
on public.team_assignments
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = team_assignments.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy contractor_jobs_member_select
on public.contractor_jobs
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = contractor_jobs.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy work_sessions_member_select
on public.work_sessions
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = work_sessions.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy command_receipts_member_select
on public.command_receipts
for select
to authenticated
using (
  actor_user_id = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = command_receipts.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

create policy sync_conflicts_member_select
on public.sync_conflicts
for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = sync_conflicts.organization_id
      and m.user_id = (select auth.uid())
      and m.active
  )
);
