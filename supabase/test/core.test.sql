-- Exercises roles, leases, pairing, append_events and RLS as the apps use them.
-- Each `do` block raises on the first failed check.
begin;

-- People
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'staff@firstpass.test'),
  ('00000000-0000-0000-0000-000000000002', 'admin@hawks.test'),
  ('00000000-0000-0000-0000-000000000003', 'stats@hawks.test'),
  ('00000000-0000-0000-0000-000000000004', 'coach@hawks.test'),
  ('00000000-0000-0000-0000-000000000005', 'shadow@hawks.test'),
  ('00000000-0000-0000-0000-000000000006', 'coach@kestrels.test');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-000000000001');

-- The platform admin creates the club and its first admin.
select test.act_as('00000000-0000-0000-0000-000000000001');
set local role authenticated;
insert into public.clubs (id, name) values ('10000000-0000-0000-0000-000000000001', 'Hawks');
reset role;
insert into public.club_members (club_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'club_admin');

-- The club admin invites a statistician, a coach and a shadow.
select test.act_as('00000000-0000-0000-0000-000000000002');
set local role authenticated;
insert into public.teams (id, club_id, name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Hawks 1');
insert into public.teams (id, club_id, name) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Hawks 2');
insert into public.invites (email, club_id, role, invited_by) values
  ('stats@hawks.test', '10000000-0000-0000-0000-000000000001', 'statistician', '00000000-0000-0000-0000-000000000002'),
  ('shadow@hawks.test', '10000000-0000-0000-0000-000000000001', 'statistician', '00000000-0000-0000-0000-000000000002');
insert into public.invites (email, club_id, role, team_ids, invited_by) values
  ('coach@hawks.test', '10000000-0000-0000-0000-000000000001', 'coach', '{20000000-0000-0000-0000-000000000002}', '00000000-0000-0000-0000-000000000002');
reset role;

-- Invites are accepted on sign-in.
do $$ begin
  perform test.act_as('00000000-0000-0000-0000-000000000003');
  if public.accept_invites() <> 1 then raise exception 'statistician invite not accepted'; end if;
  perform test.act_as('00000000-0000-0000-0000-000000000004');
  if public.accept_invites() <> 1 then raise exception 'coach invite not accepted'; end if;
  perform test.act_as('00000000-0000-0000-0000-000000000005');
  if public.accept_invites() <> 1 then raise exception 'shadow invite not accepted'; end if;
  if public.accept_invites() <> 0 then raise exception 'invite accepted twice'; end if;
  if (select count(*) from public.role_audit) <> 3 then raise exception 'audit rows missing'; end if;
end $$;

-- The statistician creates a game from the tablet and holds the lease.
do $$
declare g public.games;
begin
  perform test.act_as('00000000-0000-0000-0000-000000000003');
  g := public.create_game('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
                          '{"us":"Hawks","them":"Kestrels"}', 'tablet-a', '20000000-0000-0000-0000-000000000002');
  if g.status <> 'live' or g.pair_code !~ '^\d{6}$' then raise exception 'game not live with a pair code'; end if;
  if g.recorder_user_id <> '00000000-0000-0000-0000-000000000003' then raise exception 'lease not taken'; end if;

  -- A coach cannot create games.
  perform test.act_as('00000000-0000-0000-0000-000000000004');
  begin
    perform public.create_game('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '{}', 'phone');
    raise exception 'coach created a game';
  exception when insufficient_privilege then null;
  end;
end $$;

-- append_events: the lease holder writes, retries are harmless, others are refused.
do $$
declare
  v int;
  batch jsonb := '[
    {"seq":1,"id":"40000000-0000-0000-0000-000000000001","type":"period_start","payload":{"period":1},"recordedAt":"2026-10-14T09:00:00Z"},
    {"seq":2,"id":"40000000-0000-0000-0000-000000000002","type":"clock_start","payload":{"period":1},"recordedAt":"2026-10-14T09:00:01Z"}
  ]';
begin
  perform test.act_as('00000000-0000-0000-0000-000000000003');
  v := public.append_events('30000000-0000-0000-0000-000000000001', 'primary', batch);
  if v <> 2 then raise exception 'expected contiguous seq 2, got %', v; end if;
  v := public.append_events('30000000-0000-0000-0000-000000000001', 'primary', batch);
  if v <> 2 then raise exception 'resend changed the result: %', v; end if;
  if (select count(*) from public.events) <> 2 then raise exception 'duplicates stored'; end if;

  -- A gap: seq 4 without 3 does not advance the contiguous mark.
  v := public.append_events('30000000-0000-0000-0000-000000000001', 'primary',
        '[{"seq":4,"id":"40000000-0000-0000-0000-000000000004","type":"action","payload":{},"recordedAt":"2026-10-14T09:00:04Z"}]');
  if v <> 2 then raise exception 'gap advanced the mark to %', v; end if;
  v := public.append_events('30000000-0000-0000-0000-000000000001', 'primary',
        '[{"seq":3,"id":"40000000-0000-0000-0000-000000000003","type":"action","payload":{},"recordedAt":"2026-10-14T09:00:03Z"}]');
  if v <> 4 then raise exception 'gap fill did not advance to 4, got %', v; end if;

  -- Primary events were broadcast to the game's topic.
  if (select count(*) from realtime.messages where topic = 'game:30000000-0000-0000-0000-000000000001' and private) <> 4 then
    raise exception 'broadcast count wrong';
  end if;

  -- Another statistician cannot write the primary stream without the lease.
  perform test.act_as('00000000-0000-0000-0000-000000000005');
  begin
    perform public.append_events('30000000-0000-0000-0000-000000000001', 'primary',
      '[{"seq":5,"id":"40000000-0000-0000-0000-000000000005","type":"action","payload":{},"recordedAt":"2026-10-14T09:00:05Z"}]');
    raise exception 'wrote without the lease';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Pairing with the code.
do $$
declare
  code text := (select pair_code from public.games where id = '30000000-0000-0000-0000-000000000001');
  g public.games;
  v int;
begin
  -- The coach of Hawks 2 pairs as a viewer.
  perform test.act_as('00000000-0000-0000-0000-000000000004');
  g := public.pair_game(substring(code, 1, 3) || ' ' || substring(code, 4));
  if g.id <> '30000000-0000-0000-0000-000000000001' then raise exception 'pair returned wrong game'; end if;
  if not public.is_game_member(g.id) then raise exception 'coach not a member after pairing'; end if;

  -- The shadow pairs and writes their own stream, which is not broadcast.
  perform test.act_as('00000000-0000-0000-0000-000000000005');
  g := public.pair_game(code, true);
  v := public.append_events(g.id, 'shadow:00000000-0000-0000-0000-000000000005',
        '[{"seq":1,"id":"40000000-0000-0000-0000-000000000011","type":"action","payload":{},"recordedAt":"2026-10-14T09:00:05Z"}]');
  if v <> 1 then raise exception 'shadow write failed'; end if;
  if (select count(*) from realtime.messages) <> 4 then raise exception 'shadow event was broadcast'; end if;

  -- Someone from another club gets nothing, and five misses lock them out.
  perform test.act_as('00000000-0000-0000-0000-000000000006');
  for i in 1..5 loop
    if public.pair_game(code) is not null then raise exception 'outsider paired'; end if;
  end loop;
  begin
    perform public.pair_game(code);
    raise exception 'sixth attempt allowed';
  exception when program_limit_exceeded then null;
  end;
end $$;

-- Row level security as the apps read it.
do $$
declare n int;
begin
  -- The paired coach sees the primary log but not the shadow stream.
  perform test.act_as('00000000-0000-0000-0000-000000000004');
  set local role authenticated;
  select count(*) into n from public.events;
  if n <> 4 then raise exception 'coach sees % events, expected 4', n; end if;
  select count(*) into n from public.games;
  if n <> 1 then raise exception 'coach sees % games', n; end if;

  -- The shadow sees primary plus their own.
  perform test.act_as('00000000-0000-0000-0000-000000000005');
  select count(*) into n from public.events;
  if n <> 5 then raise exception 'shadow sees % events, expected 5', n; end if;

  -- The outsider sees nothing.
  perform test.act_as('00000000-0000-0000-0000-000000000006');
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'outsider sees events'; end if;
  select count(*) into n from public.games;
  if n <> 0 then raise exception 'outsider sees games'; end if;

  -- Direct inserts into the log are refused.
  perform test.act_as('00000000-0000-0000-0000-000000000003');
  begin
    insert into public.events (game_id, stream, seq, id, type, payload, recorded_at)
    values ('30000000-0000-0000-0000-000000000001', 'primary', 9, gen_random_uuid(), 'x', '{}', now());
    raise exception 'direct insert allowed';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- Removing a role cuts off access even though the pairing row remains.
do $$
declare n int;
begin
  delete from public.club_members where user_id = '00000000-0000-0000-0000-000000000004';
  perform test.act_as('00000000-0000-0000-0000-000000000004');
  set local role authenticated;
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'removed coach still sees events'; end if;
  reset role;
end $$;

-- Full time: the code expires later, and only admins can append afterwards.
do $$
declare g public.games;
begin
  perform test.act_as('00000000-0000-0000-0000-000000000003');
  g := public.set_game_status('30000000-0000-0000-0000-000000000001', 'final');
  if g.finished_at is null or g.pair_code_expires_at is null then raise exception 'final not recorded'; end if;
  begin
    perform public.append_events(g.id, 'primary', '[]');
    raise exception 'append after final allowed';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;

rollback;
