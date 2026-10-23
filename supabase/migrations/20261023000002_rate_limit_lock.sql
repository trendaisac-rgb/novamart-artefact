-- Make the rate limit check-and-record atomic: concurrent requests used to be able
-- to read the same count before either inserted. A transaction-level advisory lock
-- serializes the check; at this volume the wait is negligible.
create or replace function public.allow_ask(p_client text, per_minute int, per_day int)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  recent int;
  today  int;
begin
  perform pg_advisory_xact_lock(hashtext('novamart.allow_ask'));
  select count(*) into recent from public.ask_log
   where client = p_client and created_at > now() - interval '1 minute';
  select count(*) into today from public.ask_log
   where created_at > now() - interval '1 day';
  if recent >= per_minute or today >= per_day then
    return false;
  end if;
  insert into public.ask_log (client) values (p_client);
  return true;
end;
$$;

revoke execute on function public.allow_ask(text, int, int) from public, anon, authenticated;
