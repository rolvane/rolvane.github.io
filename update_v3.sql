-- MENPHIS — ATUALIZAÇÃO v3 (pode rodar quantas vezes quiser; é idempotente)
-- 1) Login com Google: o perfil usa o nome da conta Google.
-- 2) Cria perfis para quem já se cadastrou antes (corrige "Perfil não encontrado").
-- 3) Registro de dados (rolagens gravadas no servidor).

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, role) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), nullif(new.raw_user_meta_data->>'full_name',''), nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
    case when (select count(*) from profiles) = 0 then 'admin' else 'jogador' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

insert into profiles (id, username, role)
select u.id,
  coalesce(nullif(u.raw_user_meta_data->>'username',''), nullif(u.raw_user_meta_data->>'full_name',''), nullif(u.raw_user_meta_data->>'name',''), split_part(u.email,'@',1)),
  case when not exists (select 1 from profiles) and u.id = (select id from auth.users order by created_at limit 1) then 'admin' else 'jogador' end
from auth.users u where not exists (select 1 from profiles p where p.id = u.id);

-- ===== REGISTRO DE DADOS (rolagens gravadas no servidor) =====
create table if not exists dice_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  username text not null,
  expr text not null,
  rolls jsonb not null,
  bonus int not null default 0,
  total int not null,
  context text default '',
  created_at timestamptz not null default now());
create index if not exists dice_rolls_created_idx on dice_rolls (created_at desc);
alter table dice_rolls enable row level security;
drop policy if exists "dice_read" on dice_rolls;
create policy "dice_read" on dice_rolls for select to authenticated using (true);
drop policy if exists "dice_admin_del" on dice_rolls;
create policy "dice_admin_del" on dice_rolls for delete to authenticated using (is_admin());
-- sem policy de INSERT: só a função abaixo grava (o dado é sorteado no servidor, ninguém forja resultado)

create or replace function roll_dice(p_count int, p_sides int, p_bonus int default 0, p_context text default '')
returns dice_rolls language plpgsql security definer set search_path = public as $$
declare r int[] := '{}'; t int := 0; v int; i int; uname text; res dice_rolls;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_count < 1 or p_count > 50 or p_sides < 2 or p_sides > 1000 or abs(p_bonus) > 1000 then raise exception 'Rolagem inválida'; end if;
  for i in 1..p_count loop v := 1 + floor(random() * p_sides)::int; r := r || v; t := t + v; end loop;
  select username into uname from profiles where id = auth.uid();
  insert into dice_rolls (user_id, username, expr, rolls, bonus, total, context)
  values (auth.uid(), coalesce(uname,'jogador'),
          p_count || 'd' || p_sides || case when p_bonus > 0 then '+' || p_bonus when p_bonus < 0 then p_bonus::text else '' end,
          to_jsonb(r), p_bonus, t + p_bonus, left(coalesce(p_context,''), 40))
  returning * into res;
  return res;
end $$;
grant execute on function roll_dice(int,int,int,text) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table dice_rolls; exception when duplicate_object then null; end;
end $$;
