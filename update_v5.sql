-- MENPHIS — ATUALIZAÇÃO v5: ficha completa + Jogo de Narração (pode rodar quantas vezes quiser)

-- 1) Ficha completa: todos os campos extras ficam em characters.sheet
alter table characters add column if not exists sheet jsonb not null default '{}';

-- 2) Jogo de Narração (visual novel em tempo real)
create table if not exists vn_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid default auth.uid(),
  current_scene uuid,
  choices_open boolean not null default false,
  created_at timestamptz not null default now());

create table if not exists vn_scenes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references vn_sessions on delete cascade,
  position int not null default 0,
  name text not null,
  description text not null default '',
  image_url text not null default '',
  status text not null default '',
  choices jsonb not null default '[]',      -- até 5: [{"text":"...","next":"<id da cena>|null"}]
  created_at timestamptz not null default now());

create table if not exists vn_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references vn_sessions on delete cascade,
  scene_id uuid,
  speaker text not null default '',
  text text not null,
  created_at timestamptz not null default now());

create table if not exists vn_choices (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references vn_sessions on delete cascade,
  scene_id uuid not null,
  user_id uuid not null default auth.uid(),
  username text,
  character_name text,
  choice_index int not null,
  choice_text text,
  created_at timestamptz not null default now(),
  unique (scene_id, user_id));

alter table vn_sessions enable row level security;
alter table vn_scenes   enable row level security;
alter table vn_lines    enable row level security;
alter table vn_choices  enable row level security;

drop policy if exists "vns_read" on vn_sessions;  create policy "vns_read"  on vn_sessions for select to authenticated using (true);
drop policy if exists "vns_staff" on vn_sessions; create policy "vns_staff" on vn_sessions for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "vnc_read" on vn_scenes;    create policy "vnc_read"  on vn_scenes for select to authenticated using (true);
drop policy if exists "vnc_staff" on vn_scenes;   create policy "vnc_staff" on vn_scenes for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "vnl_read" on vn_lines;     create policy "vnl_read"  on vn_lines for select to authenticated using (true);
drop policy if exists "vnl_staff" on vn_lines;    create policy "vnl_staff" on vn_lines for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "vno_read" on vn_choices;   create policy "vno_read"  on vn_choices for select to authenticated using (true);
drop policy if exists "vno_ins" on vn_choices;    create policy "vno_ins"   on vn_choices for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "vno_upd" on vn_choices;    create policy "vno_upd"   on vn_choices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "vno_del" on vn_choices;    create policy "vno_del"   on vn_choices for delete to authenticated using (user_id = auth.uid() or is_staff());

-- tempo real
do $$ begin
  begin alter publication supabase_realtime add table vn_sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table vn_scenes;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table vn_lines;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table vn_choices;  exception when duplicate_object then null; end;
end $$;
