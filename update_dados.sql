-- Rode UMA vez no SQL Editor se você JÁ executou o schema.sql antes desta versão.

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
create policy "dice_read" on dice_rolls for select to authenticated using (true);
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

alter publication supabase_realtime add table dice_rolls;
