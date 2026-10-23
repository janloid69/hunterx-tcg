-- Optional: imitates a Supabase project with "Automatically expose new tables"
-- turned on, where new tables are granted to the website roles by default.
-- The checks run both with and without this file, so the migration must give
-- the same access either way.

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
