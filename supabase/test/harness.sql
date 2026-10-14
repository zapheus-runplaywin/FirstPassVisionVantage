create schema if not exists test;
-- Stand-ins for the Supabase pieces the migrations rely on, so they can be
-- applied and tested on a plain Postgres. Never run this on a real project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema if not exists realtime;
create table if not exists realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  event text,
  payload jsonb,
  private boolean,
  inserted_at timestamptz default now()
);
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$
  insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private);
$$;
create or replace function realtime.topic() returns text
language sql stable as $$ select current_setting('realtime.topic', true); $$;

-- Act as a signed-in user for the rest of the transaction.
create or replace function test.act_as(p_user uuid) returns void
language sql as $$ select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true); $$;

-- Supabase grants the API roles access to public by default.
grant usage on schema public, auth, realtime, test to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
