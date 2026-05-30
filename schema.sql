-- ================================================================
--  KaizenHub — Supabase Schema
--  Run this entire file in: supabase.com → SQL Editor → New query
-- ================================================================

-- 1. PROFILES (linked to Supabase Auth users)
create table profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  emp_id      text unique not null,
  full_name   text not null,
  role        text not null check (role in ('admin','manager','operator')),
  unit        text,
  created_at  timestamptz default now()
);

-- 2. SUBMISSIONS
create table submissions (
  id          bigserial primary key,
  user_id     uuid references profiles(id) on delete cascade,
  emp_id      text not null,
  full_name   text not null,
  unit        text not null,
  type        text not null,
  title       text not null,
  description text not null,
  saving      integer default 0,
  status      text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  points      integer default 0,
  feedback    text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at  timestamptz default now()
);

-- 3. ROW LEVEL SECURITY
alter table profiles    enable row level security;
alter table submissions enable row level security;

-- Profiles: everyone can read their own; admins can read all
create policy "Own profile" on profiles
  for select using (auth.uid() = id);

create policy "Admin sees all profiles" on profiles
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Submissions: operators see only their own; managers/admins see all
create policy "Operator sees own" on submissions
  for select using (user_id = auth.uid());

create policy "Manager sees all" on submissions
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role in ('manager','admin'))
  );

create policy "Insert own" on submissions
  for insert with check (user_id = auth.uid());

create policy "Manager can update" on submissions
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('manager','admin'))
  );

-- 4. HELPER: create a profile automatically when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, emp_id, full_name, role, unit)
  values (
    new.id,
    new.raw_user_meta_data->>'emp_id',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'unit'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
