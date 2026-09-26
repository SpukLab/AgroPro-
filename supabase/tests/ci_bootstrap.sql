-- PostgreSQL-only stubs used by GitHub Actions.
-- This file is NOT a Supabase migration.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;

create table auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
grant select on auth.users to service_role;

grant usage on schema extensions to authenticated, service_role;
grant execute on function extensions.digest(bytea, text) to service_role;
