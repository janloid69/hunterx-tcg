-- Minimal stand-in for the parts of Supabase the migration relies on, so the
-- schema and its security rules can be tested on a plain Postgres server.
-- Not used in production: Supabase already provides all of this.

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
