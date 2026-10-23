-- NovaMart Assist schema.
--
-- Every table has row level security on and no public policy: only the Edge
-- Function (service role) reads and writes. The browser never touches a table.

-- Policy documentation. One row per "##" section, so each rule is retrieved whole.
create table public.policy_documents (
  doc_id     text primary key,
  title      text not null,
  summary    text not null default '',
  owner      text not null default 'Operations',
  updated_at timestamptz not null default now()
);

create table public.policy_sections (
  id       bigint generated always as identity primary key,
  doc_id   text not null references public.policy_documents (doc_id) on delete cascade,
  heading  text not null,
  body     text not null,
  position int  not null,
  unique (doc_id, heading)
);

-- Mock of NovaMart's order system: the row is what the order API would return.
create table public.orders (
  order_id text primary key,
  data     jsonb not null
);

-- The knowledge gap loop: every decline and escalation lands here for Operations.
create table public.knowledge_gaps (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  store_id       text,
  question       text not null,
  status         text not null check (status in ('declined', 'escalated')),
  decline_reason text,
  searches       text[] not null default '{}',
  answer         text not null default '',
  ticket_id      text
);
create index knowledge_gaps_created_idx on public.knowledge_gaps (created_at desc);

-- Mock helpdesk.
create table public.tickets (
  ticket_id  text primary key,
  created_at timestamptz not null default now(),
  store_id   text,
  priority   text not null check (priority in ('blocking', 'normal')),
  order_id   text,
  summary    text not null
);

-- Rate limiting for the public demo link. Stores a hash of the client, never the IP.
create table public.ask_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  client     text not null
);
create index ask_log_client_idx on public.ask_log (client, created_at desc);
create index ask_log_created_idx on public.ask_log (created_at desc);

alter table public.policy_documents enable row level security;
alter table public.policy_sections  enable row level security;
alter table public.orders           enable row level security;
alter table public.knowledge_gaps   enable row level security;
alter table public.tickets          enable row level security;
alter table public.ask_log          enable row level security;

-- Atomic check-and-record for the rate limit.
create or replace function public.allow_ask(p_client text, per_minute int, per_day int)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  recent int;
  today  int;
begin
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
