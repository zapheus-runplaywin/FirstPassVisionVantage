-- Broadcast authorisation: a paired member may subscribe to their game's
-- private topic. Guarded so the migration also applies to a plain Postgres
-- without Supabase Realtime (the local test harness).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy game_topic_read on realtime.messages for select
      to authenticated
      using (
        realtime.topic() like 'game:%'
        and public.is_game_member(substring(realtime.topic() from 6)::uuid)
      )
    $p$;
  end if;
end $$;
