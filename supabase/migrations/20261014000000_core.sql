-- FirstPass core schema: clubs and roles, games, the event log, pairing.
--
-- Every game is an append-only log of events with one writer per stream.
-- Clients never insert into `events` directly; Vantage calls `append_events`,
-- which checks the recorder lease and is safe to retry. An insert trigger
-- broadcasts primary-stream events to the private Realtime topic game:<id>,
-- which Vision subscribes to.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.club_role as enum ('club_admin', 'statistician', 'coach');
create type public.game_status as enum ('setup', 'live', 'final');
create type public.game_role as enum ('recorder', 'shadow', 'viewer');

-- ---------------------------------------------------------------------------
-- Clubs and people
-- ---------------------------------------------------------------------------

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  playhq_org_id text unique,
  created_at timestamptz not null default now()
);

-- FirstPass staff who create clubs and their first admin.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  playhq_team_id text unique,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  number text,
  playhq_profile_id text,
  created_at timestamptz not null default now(),
  unique (team_id, playhq_profile_id)
);

-- One row per person per club. Coaches are limited to the teams listed.
create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.club_role not null,
  team_ids uuid[] not null default '{}',
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- Access granted ahead of the person's first Google sign-in.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  role public.club_role not null,
  team_ids uuid[] not null default '{}',
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz
);
create index invites_email_idx on public.invites (lower(email));

create table public.role_audit (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  actor uuid,
  subject uuid,
  subject_email text,
  change text not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

-- Net Points values and alert thresholds a club has changed from the defaults.
create table public.club_config (
  club_id uuid not null references public.clubs (id) on delete cascade,
  version int not null default 1,
  values jsonb not null default '{}',
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (club_id, version)
);

-- ---------------------------------------------------------------------------
-- Games and the log
-- ---------------------------------------------------------------------------

create table public.games (
  -- Made on the tablet (UUIDv7), so a game can be set up with no signal.
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  playhq_game_id text,
  config jsonb not null,
  status public.game_status not null default 'setup',
  -- The one device allowed to write the primary stream.
  recorder_user_id uuid references auth.users (id),
  recorder_device_id text,
  lease_taken_at timestamptz,
  pair_code char(6),
  pair_code_expires_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index games_club_idx on public.games (club_id, created_at desc);
create unique index games_pair_code_idx on public.games (pair_code) where pair_code is not null;

-- Who has paired with a game, and in what capacity.
create table public.game_members (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.game_role not null,
  paired_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
create index game_members_user_idx on public.game_members (user_id);

create table public.events (
  game_id uuid not null references public.games (id) on delete cascade,
  stream text not null check (stream = 'primary' or stream like 'shadow:%'),
  seq int not null check (seq > 0),
  id uuid not null unique,
  type text not null,
  payload jsonb not null,
  -- Device wall-clock time the event was recorded.
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  user_id uuid references auth.users (id),
  primary key (game_id, stream, seq)
);

-- Engine state at each break and full time, so a late joiner needs only the tail.
create table public.snapshots (
  game_id uuid not null references public.games (id) on delete cascade,
  through_seq int not null,
  engine_version text not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, through_seq)
);

-- Failed pair attempts, for the 5-per-10-minutes limit.
create table public.pair_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index pair_attempts_idx on public.pair_attempts (user_id, at);

-- ---------------------------------------------------------------------------
-- Who is who
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.club_role_of(p_club_id uuid)
returns public.club_role
language sql stable security definer set search_path = public
as $$
  select role from public.club_members where club_id = p_club_id and user_id = auth.uid();
$$;

create or replace function public.is_club_admin(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_platform_admin() or public.club_role_of(p_club_id) = 'club_admin';
$$;

-- A coach may see games of the teams they were granted; a statistician or
-- admin may see any game in the club.
create or replace function public.may_view_game(p_game_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    join public.club_members m on m.club_id = g.club_id and m.user_id = auth.uid()
    where g.id = p_game_id
      and (m.role in ('club_admin', 'statistician') or g.team_id = any (m.team_ids))
  ) or public.is_platform_admin();
$$;

-- Paired with the game, and still holding a role in its club.
create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.game_members gm
    where gm.game_id = p_game_id and gm.user_id = auth.uid()
  ) and public.may_view_game(p_game_id);
$$;

-- ---------------------------------------------------------------------------
-- Invites: accepted on first sign-in by the matching email
-- ---------------------------------------------------------------------------

create or replace function public.accept_invites()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_count int := 0;
  inv record;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;
  for inv in
    select * from public.invites
    where lower(email) = lower(v_email) and accepted_at is null and expires_at > now()
  loop
    insert into public.club_members (club_id, user_id, role, team_ids, granted_by)
    values (inv.club_id, auth.uid(), inv.role, inv.team_ids, inv.invited_by)
    on conflict (club_id, user_id) do update
      set role = excluded.role, team_ids = excluded.team_ids, granted_by = excluded.granted_by;
    update public.invites set accepted_at = now() where id = inv.id;
    insert into public.role_audit (club_id, actor, subject, subject_email, change, detail)
    values (inv.club_id, inv.invited_by, auth.uid(), v_email, 'invite accepted',
            jsonb_build_object('role', inv.role, 'team_ids', inv.team_ids));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Games: create, lease, pair
-- ---------------------------------------------------------------------------

create or replace function public.new_pair_code()
returns char(6)
language plpgsql
as $$
declare
  code char(6);
begin
  loop
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.games where pair_code = code);
  end loop;
  return code;
end;
$$;

-- Vantage creates the game (id made on the tablet) and takes the recorder
-- lease in one call. Calling it again for the same game from the same user
-- renews the lease, which is how a device swap works.
create or replace function public.create_game(
  p_id uuid,
  p_club_id uuid,
  p_config jsonb,
  p_device_id text,
  p_team_id uuid default null,
  p_playhq_game_id text default null
)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.club_role := public.club_role_of(p_club_id);
  g public.games;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if v_role is distinct from 'statistician' and v_role is distinct from 'club_admin' then
    raise exception 'no statistician role in this club' using errcode = '42501';
  end if;

  insert into public.games (id, club_id, team_id, playhq_game_id, config, status,
                            recorder_user_id, recorder_device_id, lease_taken_at,
                            pair_code, created_by)
  values (p_id, p_club_id, p_team_id, p_playhq_game_id, p_config, 'live',
          auth.uid(), p_device_id, now(), public.new_pair_code(), auth.uid())
  on conflict (id) do update
    set recorder_user_id = auth.uid(),
        recorder_device_id = excluded.recorder_device_id,
        lease_taken_at = now()
    where public.games.club_id = excluded.club_id
  returning * into g;

  if g.id is null then raise exception 'game belongs to another club' using errcode = '42501'; end if;

  insert into public.game_members (game_id, user_id, role)
  values (p_id, auth.uid(), 'recorder')
  on conflict (game_id, user_id) do update set role = 'recorder';
  return g;
end;
$$;

-- A coach or shadow statistician joins a live game with its 6-digit code.
-- Works only with a role in that game's club, so a guessed code is useless
-- to anyone outside it. A miss returns null (an exception would roll back
-- the attempt record); five misses per user per ten minutes lock them out.
create or replace function public.pair_game(p_code text, p_as_shadow boolean default false)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  g public.games;
  v_role public.club_role;
  v_game_role public.game_role;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if (select count(*) from public.pair_attempts
      where user_id = auth.uid() and at > now() - interval '10 minutes') >= 5 then
    raise exception 'too many attempts, try again later' using errcode = '54000';
  end if;

  select * into g from public.games
  where pair_code = regexp_replace(p_code, '\D', '', 'g')
    and (pair_code_expires_at is null or pair_code_expires_at > now());

  if g.id is null or not public.may_view_game(g.id) then
    insert into public.pair_attempts (user_id) values (auth.uid());
    return null;
  end if;

  v_role := public.club_role_of(g.club_id);
  if p_as_shadow then
    if v_role not in ('statistician', 'club_admin') then
      raise exception 'shadow needs a statistician role' using errcode = '42501';
    end if;
    v_game_role := 'shadow';
  else
    v_game_role := 'viewer';
  end if;

  insert into public.game_members (game_id, user_id, role)
  values (g.id, auth.uid(), v_game_role)
  on conflict (game_id, user_id) do update
    set role = case when public.game_members.role = 'recorder' then 'recorder' else excluded.role end;
  return g;
end;
$$;

-- The lease holder (or a club admin) moves the game on; full time starts the
-- pair code's 24-hour expiry.
create or replace function public.set_game_status(p_game_id uuid, p_status public.game_status)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'no such game' using errcode = 'P0002'; end if;
  if g.recorder_user_id is distinct from auth.uid() and not public.is_club_admin(g.club_id) then
    raise exception 'not the recorder' using errcode = '42501';
  end if;
  update public.games
  set status = p_status,
      finished_at = case when p_status = 'final' then coalesce(finished_at, now()) else finished_at end,
      pair_code_expires_at = case when p_status = 'final' then coalesce(pair_code_expires_at, now() + interval '24 hours') else pair_code_expires_at end
  where id = p_game_id
  returning * into g;
  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- The log
-- ---------------------------------------------------------------------------

-- Appends a batch of events in seq order. Duplicates are ignored, so a resend
-- after a timeout is harmless. Returns the highest contiguous seq stored for
-- the stream, which the tablet uses to clear its outbox.
create or replace function public.append_events(p_game_id uuid, p_stream text, p_events jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  g public.games;
  e jsonb;
  v_last int;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'no such game' using errcode = 'P0002'; end if;
  if g.status = 'final' and not public.is_club_admin(g.club_id) then
    raise exception 'game is final' using errcode = '55000';
  end if;

  if p_stream = 'primary' then
    if g.recorder_user_id is distinct from auth.uid() then
      raise exception 'another device holds the recorder lease' using errcode = '42501';
    end if;
  elsif p_stream = 'shadow:' || auth.uid()::text then
    if not exists (select 1 from public.game_members
                   where game_id = p_game_id and user_id = auth.uid() and role in ('shadow', 'recorder')) then
      raise exception 'not paired as a shadow' using errcode = '42501';
    end if;
  else
    raise exception 'cannot write stream %', p_stream using errcode = '42501';
  end if;

  for e in select * from jsonb_array_elements(p_events)
  loop
    insert into public.events (game_id, stream, seq, id, type, payload, recorded_at, user_id)
    values (p_game_id, p_stream, (e->>'seq')::int, (e->>'id')::uuid, e->>'type',
            e->'payload', (e->>'recordedAt')::timestamptz, auth.uid())
    on conflict do nothing;
  end loop;

  -- Highest seq with no gap below it.
  select coalesce(max(seq), 0) into v_last
  from (
    select seq, row_number() over (order by seq) as rn
    from public.events where game_id = p_game_id and stream = p_stream
  ) s
  where seq = rn;
  return v_last;
end;
$$;

-- Primary-stream events reach Vision through Realtime's private topic
-- game:<id>. Shadow events are stored but not broadcast.
create or replace function public.broadcast_event()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.stream = 'primary' then
    perform realtime.send(
      jsonb_build_object(
        'id', new.id, 'gameId', new.game_id, 'stream', new.stream, 'seq', new.seq,
        'type', new.type, 'payload', new.payload, 'recordedAt', new.recorded_at
      ),
      'event',
      'game:' || new.game_id::text,
      true
    );
  end if;
  return new;
end;
$$;

create trigger events_broadcast
after insert on public.events
for each row execute function public.broadcast_event();

create or replace function public.save_snapshot(p_game_id uuid, p_through_seq int, p_engine_version text, p_state jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'no such game' using errcode = 'P0002'; end if;
  if g.recorder_user_id is distinct from auth.uid() and not public.is_club_admin(g.club_id) then
    raise exception 'not the recorder' using errcode = '42501';
  end if;
  insert into public.snapshots (game_id, through_seq, engine_version, state)
  values (p_game_id, p_through_seq, p_engine_version, p_state)
  on conflict (game_id, through_seq) do update
    set engine_version = excluded.engine_version, state = excluded.state, created_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.platform_admins enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.club_members enable row level security;
alter table public.invites enable row level security;
alter table public.role_audit enable row level security;
alter table public.club_config enable row level security;
alter table public.games enable row level security;
alter table public.game_members enable row level security;
alter table public.events enable row level security;
alter table public.snapshots enable row level security;
alter table public.pair_attempts enable row level security;

-- Clubs: members see their own club; platform admins see and create all.
create policy clubs_select on public.clubs for select
  using (public.is_platform_admin() or public.club_role_of(id) is not null);
create policy clubs_insert on public.clubs for insert
  with check (public.is_platform_admin());
create policy clubs_update on public.clubs for update
  using (public.is_club_admin(id));

create policy platform_admins_select on public.platform_admins for select
  using (user_id = auth.uid() or public.is_platform_admin());

-- Teams and players: visible to the club, managed by club admins.
create policy teams_select on public.teams for select
  using (public.is_platform_admin() or public.club_role_of(club_id) is not null);
create policy teams_write on public.teams for all
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

create policy players_select on public.players for select
  using (exists (select 1 from public.teams t where t.id = team_id
                 and (public.is_platform_admin() or public.club_role_of(t.club_id) is not null)));
create policy players_write on public.players for all
  using (exists (select 1 from public.teams t where t.id = team_id and public.is_club_admin(t.club_id)))
  with check (exists (select 1 from public.teams t where t.id = team_id and public.is_club_admin(t.club_id)));

-- Members: everyone sees their own rows; admins see and manage the club's.
create policy club_members_select on public.club_members for select
  using (user_id = auth.uid() or public.is_club_admin(club_id));
create policy club_members_write on public.club_members for all
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

create policy invites_admin on public.invites for all
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

create policy role_audit_select on public.role_audit for select
  using (public.is_club_admin(club_id));

create policy club_config_select on public.club_config for select
  using (public.is_platform_admin() or public.club_role_of(club_id) is not null);
create policy club_config_write on public.club_config for all
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

-- Games: coaches see their teams' games, statisticians and admins the club's.
-- Rows are created and changed through the functions above, not directly.
create policy games_select on public.games for select
  using (public.may_view_game(id));
create policy games_update on public.games for update
  using (public.is_club_admin(club_id));

create policy game_members_select on public.game_members for select
  using (user_id = auth.uid() or public.may_view_game(game_id));

-- The log: paired members read the primary stream; a shadow also reads their
-- own; admins read everything. Writes go through append_events only.
create policy events_select on public.events for select
  using (
    (public.is_game_member(game_id) and (stream = 'primary' or stream = 'shadow:' || auth.uid()::text))
    or exists (select 1 from public.games g where g.id = game_id and public.is_club_admin(g.club_id))
  );

create policy snapshots_select on public.snapshots for select
  using (public.is_game_member(game_id)
         or exists (select 1 from public.games g where g.id = game_id and public.is_club_admin(g.club_id)));

-- No direct writes from clients.
revoke insert, update, delete on public.events from anon, authenticated;
revoke insert, update, delete on public.snapshots from anon, authenticated;
revoke insert, delete on public.games from anon, authenticated;
revoke insert, update, delete on public.game_members from anon, authenticated;
revoke all on public.pair_attempts from anon, authenticated;
revoke execute on function public.new_pair_code() from anon, authenticated, public;
