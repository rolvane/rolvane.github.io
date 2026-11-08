-- MENPHIS RPG — rode este arquivo inteiro em Supabase → SQL Editor → New query → Run

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null,
  role text not null default 'jogador' check (role in ('jogador','mestre','admin')),
  created_at timestamptz default now()
);

create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role in ('mestre','admin')) $$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- cria o perfil ao cadastrar; o PRIMEIRO usuário vira admin
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, role) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    case when (select count(*) from profiles) = 0 then 'admin' else 'jogador' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, clan text not null, variant text default '',
  stats jsonb not null, level int not null default 1, kingdom text,
  created_at timestamptz default now());
create table if not exists narrations (
  id uuid primary key default gen_random_uuid(), title text not null,
  created_by uuid default auth.uid(), created_at timestamptz default now());
create table if not exists narration_turns (
  id uuid primary key default gen_random_uuid(),
  narration_id uuid not null references narrations on delete cascade,
  author_id uuid default auth.uid(), author_name text not null,
  kind text not null default 'acao', text text not null, created_at timestamptz default now());
create table if not exists tabletop_sessions (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_by uuid default auth.uid(), state jsonb not null default '{"tokens":[]}',
  created_at timestamptz default now());
create table if not exists missions (
  id uuid primary key default gen_random_uuid(), title text not null,
  type text, difficulty text, guild text, reward text, description text,
  status text not null default 'aberta' check (status in ('aberta','aceita','concluida')),
  created_by uuid default auth.uid(), accepted_by uuid, accepted_name text,
  created_at timestamptz default now());
create table if not exists kingdoms (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  x numeric not null, y numeric not null);
create table if not exists regions (
  id uuid primary key default gen_random_uuid(), name text not null, climate text,
  danger int default 1, description text, events jsonb not null default '[]');
create table if not exists items (
  id uuid primary key default gen_random_uuid(), name text not null, rarity text not null,
  description text, created_at timestamptz default now());
create table if not exists notes (
  owner uuid primary key default auth.uid() references auth.users on delete cascade, text text default '');
create table if not exists news (
  id uuid primary key default gen_random_uuid(), text text not null,
  author uuid default auth.uid(), created_at timestamptz default now());

-- RLS
do $$ declare t text; begin
  foreach t in array array['profiles','characters','narrations','narration_turns','tabletop_sessions','missions','kingdoms','regions','items','notes','news']
  loop execute format('alter table %I enable row level security', t); end loop; end $$;

create policy "profiles_read"   on profiles for select to authenticated using (true);
create policy "profiles_admin"  on profiles for update to authenticated using (is_admin()) with check (is_admin());

create policy "char_read"   on characters for select to authenticated using (owner = auth.uid() or is_staff());
create policy "char_ins"    on characters for insert to authenticated with check (owner = auth.uid());
create policy "char_upd"    on characters for update to authenticated using (owner = auth.uid() or is_staff());
create policy "char_del"    on characters for delete to authenticated using (owner = auth.uid() or is_staff());

create policy "narr_read"   on narrations for select to authenticated using (true);
create policy "narr_write"  on narrations for all to authenticated using (is_staff()) with check (is_staff());
create policy "turn_read"   on narration_turns for select to authenticated using (true);
create policy "turn_ins"    on narration_turns for insert to authenticated with check (author_id = auth.uid() and (kind <> 'narrador' or is_staff()));
create policy "turn_del"    on narration_turns for delete to authenticated using (is_staff());

create policy "tt_read"     on tabletop_sessions for select to authenticated using (true);
create policy "tt_ins"      on tabletop_sessions for insert to authenticated with check (is_staff());
create policy "tt_upd"      on tabletop_sessions for update to authenticated using (true) with check (true);
create policy "tt_del"      on tabletop_sessions for delete to authenticated using (is_staff());

create policy "mis_read"    on missions for select to authenticated using (true);
create policy "mis_ins"     on missions for insert to authenticated with check (is_staff());
create policy "mis_upd"     on missions for update to authenticated using (is_staff() or accepted_by is null) with check (is_staff() or accepted_by = auth.uid());
create policy "mis_del"     on missions for delete to authenticated using (is_staff());

create policy "king_read"   on kingdoms for select to authenticated using (true);
create policy "king_write"  on kingdoms for all to authenticated using (is_staff()) with check (is_staff());
create policy "reg_read"    on regions for select to authenticated using (true);
create policy "reg_write"   on regions for all to authenticated using (is_staff()) with check (is_staff());
create policy "item_read"   on items for select to authenticated using (true);
create policy "item_write"  on items for all to authenticated using (is_staff()) with check (is_staff());
create policy "news_read"   on news for select to authenticated using (true);
create policy "news_write"  on news for all to authenticated using (is_staff()) with check (is_staff());
create policy "notes_own"   on notes for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- tempo real (narrações e tabletop)
alter publication supabase_realtime add table narration_turns, tabletop_sessions;
