-- LabelDesk web platform - run this once in Supabase: SQL Editor -> New query -> paste -> Run
create table if not exists tl_users(
  id bigint generated always as identity primary key,
  username text unique not null,
  pass_hash text not null,
  salt text not null,
  role text not null default 'worker',        -- 'admin' | 'worker'
  grade text not null default '',             -- manual tier set by admin (T1/T2/T3...)
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists tl_tasks(
  id bigint generated always as identity primary key,
  title text not null,
  filename text not null,                     -- client-platform video filename
  duration real,                              -- seconds, captured from local file
  owner bigint references tl_users(id) on delete set null,
  status text not null default 'new',         -- new / submitted / approved / rework
  segments jsonb not null default '[]',
  review_note text not null default '',
  draft_status text not null default '',      -- '' / working / done / error
  draft jsonb,                                -- AI draft result or error message
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tl_tasks_owner on tl_tasks(owner);
create index if not exists tl_tasks_status on tl_tasks(status);

-- lock both tables down: only the service key (used by Netlify functions) can access
alter table tl_users enable row level security;
alter table tl_tasks enable row level security;
