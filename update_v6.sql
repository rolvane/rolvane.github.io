-- MENPHIS — ATUALIZAÇÃO v6: Rede de Informantes (rastros das missões) + Reputação / Procurados
-- Pode rodar quantas vezes quiser. Requer is_staff()/is_admin() (schema.sql) e a coluna characters.sheet (update_v5.sql).

create extension if not exists unaccent with schema extensions;

-- ---------- relatórios de missão (texto original; só o narrador vê) ----------
create table if not exists intel_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now());

-- ---------- pistas extraídas (só o narrador lê; jogadores só recebem o que comprarem) ----------
create table if not exists intel_clues (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references intel_reports on delete cascade,
  subject_name text not null,
  subject_type text not null default 'npc',      -- player | npc
  subject_char uuid,                             -- personagem, quando for player
  action_cat text not null default 'other',
  action_label text not null default '',
  object_name text,
  object_type text,
  item_name text,
  place text,
  visibility text not null default 'discreto',   -- oculto | discreto | exposto
  tier int not null default 2 check (tier between 1 and 3),   -- 1 rumor · 2 testemunho · 3 segredo
  price int not null default 1500,
  excerpt text,
  happened_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now());
create index if not exists intel_clues_subject_idx on intel_clues (lower(subject_name));

-- ---------- caderno do jogador (cópia do que ele comprou) ----------
create table if not exists intel_owned (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  char_id uuid not null references characters on delete cascade,
  clue_id uuid,
  tier int not null,
  subject_name text, action_label text, object_name text, item_name text, place text, excerpt text,
  method text,
  happened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (char_id, clue_id));

-- ---------- reputação ----------
create table if not exists reputation (
  char_id uuid primary key references characters on delete cascade,
  owner uuid not null,
  hero int not null default 0,
  villain int not null default 0,
  heat int not null default 0,                   -- "procurado": cai 1 ponto por dia
  bounty bigint not null default 0,
  heat_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

alter table intel_reports enable row level security;
alter table intel_clues   enable row level security;
alter table intel_owned   enable row level security;
alter table reputation    enable row level security;

drop policy if exists "ir_staff" on intel_reports; create policy "ir_staff" on intel_reports for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "ic_staff" on intel_clues;   create policy "ic_staff" on intel_clues   for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "io_read" on intel_owned;    create policy "io_read"  on intel_owned   for select to authenticated using (owner = auth.uid() or is_staff());
drop policy if exists "io_del" on intel_owned;     create policy "io_del"   on intel_owned   for delete to authenticated using (is_staff());
drop policy if exists "rep_read" on reputation;    create policy "rep_read" on reputation    for select to authenticated using (owner = auth.uid() or is_staff());
-- sem policy de escrita em intel_owned / reputation: só as funções abaixo alteram

create or replace function _norm(t text) returns text language sql immutable as
$$ select lower(extensions.unaccent(coalesce(t,''))) $$;

create or replace function _heat_eff(h int, at timestamptz) returns int language sql immutable as
$$ select greatest(0, h - floor(extract(epoch from (now() - at)) / 86400)::int) $$;

-- soma procurado (uso interno)
create or replace function _rep_add_heat(p_char uuid, p_heat int) returns void language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select owner into o from characters where id = p_char; if o is null then return; end if;
  insert into reputation (char_id, owner, heat, heat_at) values (p_char, o, greatest(0, p_heat), now())
  on conflict (char_id) do update set heat = greatest(0, _heat_eff(reputation.heat, reputation.heat_at) + p_heat), heat_at = now(), updated_at = now();
end $$;

-- narrador ajusta reputação
create or replace function rep_adjust(p_char uuid, p_hero int default 0, p_villain int default 0, p_heat int default 0, p_bounty bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if not is_staff() then raise exception 'Apenas narradores.'; end if;
  select owner into o from characters where id = p_char; if o is null then raise exception 'Personagem não encontrado.'; end if;
  insert into reputation (char_id, owner) values (p_char, o) on conflict (char_id) do nothing;
  update reputation set
    hero = greatest(0, hero + coalesce(p_hero,0)),
    villain = greatest(0, villain + coalesce(p_villain,0)),
    heat = greatest(0, _heat_eff(heat, heat_at) + coalesce(p_heat,0)),
    heat_at = now(),
    bounty = coalesce(p_bounty, bounty),
    updated_at = now()
  where char_id = p_char;
end $$;

-- quadro público de procurados
create or replace function wanted_board() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'bounty')::bigint desc), '[]'::jsonb) from (
    select jsonb_build_object('name', c.name, 'clan', c.clan, 'stars', least(5, e.eff / 10), 'bounty', greatest(r.bounty, e.eff * 100)) as x
    from reputation r join characters c on c.id = r.char_id
    cross join lateral (select _heat_eff(r.heat, r.heat_at) as eff) e
    where e.eff >= 5 or r.bounty > 0) s
$$;

-- o que existe sobre um assunto (sem revelar o conteúdo)
create or replace function intel_catalog(p_char uuid, p_query text) returns jsonb language plpgsql security definer set search_path = public as $$
declare q text; res jsonb;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  perform 1 from characters where id = p_char and owner = auth.uid(); if not found then raise exception 'Personagem inválido'; end if;
  q := btrim(coalesce(p_query,'')); if length(q) < 3 then raise exception 'Digite ao menos 3 letras.'; end if;
  select jsonb_build_object(
    'available', count(*) filter (where o.id is null),
    'owned',     count(*) filter (where o.id is not null),
    't1', count(*) filter (where o.id is null and c.tier = 1),
    't2', count(*) filter (where o.id is null and c.tier = 2),
    't3', count(*) filter (where o.id is null and c.tier = 3))
  into res
  from intel_clues c left join intel_owned o on o.clue_id = c.id and o.char_id = p_char
  where _norm(c.subject_name) like '%' || _norm(q) || '%' or _norm(c.object_name) like '%' || _norm(q) || '%'
     or _norm(c.item_name) like '%' || _norm(q) || '%' or _norm(c.place) like '%' || _norm(q) || '%';
  -- cotação das (até) 3 pistas mais recentes que ainda não são dele
  res := res || jsonb_build_object('quote', coalesce((select sum(price) from (
    select c.price from intel_clues c where (_norm(c.subject_name) like '%' || _norm(q) || '%' or _norm(c.object_name) like '%' || _norm(q) || '%'
      or _norm(c.item_name) like '%' || _norm(q) || '%' or _norm(c.place) like '%' || _norm(q) || '%')
      and not exists (select 1 from intel_owned o where o.char_id = p_char and o.clue_id = c.id)
    order by c.happened_at desc limit 3) z), 0));
  return res;
end $$;

-- comprar / obter informação (rolagem e preço decididos no servidor)
create or replace function buy_intel(p_char uuid, p_query text, p_method text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ch characters; q text; mult numeric; dc int; failheat int; bal bigint; cost bigint := 0;
  r int := null; bonus int := 0; succ boolean := true; ids uuid[]; uname text; clues jsonb := '[]'::jsonb; heat_add int := 0;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into ch from characters where id = p_char and owner = auth.uid(); if not found then raise exception 'Personagem inválido'; end if;
  q := btrim(coalesce(p_query,'')); if length(q) < 3 then raise exception 'Digite ao menos 3 letras.'; end if;
  case p_method
    when 'pagar'     then mult := 1;    dc := null; failheat := 0;
    when 'espionar'  then mult := 0.25; dc := 12;   failheat := 2;
    when 'interrogar' then mult := 0;   dc := 14;   failheat := 5;
    when 'invadir'   then mult := 0.10; dc := 16;   failheat := 8;
    else raise exception 'Método inválido';
  end case;
  bal := coalesce((ch.sheet->>'tarjas')::bigint, 0);
  ids := array(select c.id from intel_clues c
    where (_norm(c.subject_name) like '%' || _norm(q) || '%' or _norm(c.object_name) like '%' || _norm(q) || '%'
        or _norm(c.item_name) like '%' || _norm(q) || '%' or _norm(c.place) like '%' || _norm(q) || '%')
      and not exists (select 1 from intel_owned o where o.char_id = p_char and o.clue_id = c.id)
    order by c.happened_at desc limit 3);
  if coalesce(array_length(ids,1),0) = 0 then
    return jsonb_build_object('ok', true, 'success', false, 'none', true, 'msg', 'Os informantes não têm nada novo sobre isso.', 'balance', bal);
  end if;
  select coalesce(sum(price),0) into cost from intel_clues where id = any(ids); cost := round(cost * mult);
  if cost > bal then return jsonb_build_object('ok', false, 'msg', 'Tarjas insuficientes: essa busca custa ' || cost || '.', 'cost', cost, 'balance', bal); end if;
  if dc is not null then
    r := 1 + floor(random() * 20)::int;
    bonus := least(5, floor(coalesce((ch.stats->>'intelligence')::int, 0) / 50.0)::int);
    succ := (r + bonus >= dc) and r <> 1;
    select username into uname from profiles where id = auth.uid();
    insert into dice_rolls (user_id, username, expr, rolls, bonus, total, context)
      values (auth.uid(), coalesce(uname,'jogador'), '1d20' || case when bonus > 0 then '+' || bonus else '' end, to_jsonb(array[r]), bonus, r + bonus, 'informante');
  end if;
  if cost > 0 then update characters set sheet = jsonb_set(coalesce(sheet,'{}'::jsonb), '{tarjas}', to_jsonb(bal - cost)) where id = p_char; end if;
  if succ then
    insert into intel_owned (owner, char_id, clue_id, tier, subject_name, action_label, object_name, item_name, place, excerpt, method, happened_at)
      select auth.uid(), p_char, c.id, c.tier, c.subject_name, c.action_label, c.object_name, c.item_name, c.place, case when c.tier = 3 then c.excerpt else null end, p_method, c.happened_at
      from intel_clues c where c.id = any(ids) on conflict (char_id, clue_id) do nothing;
    select coalesce(jsonb_agg(jsonb_build_object('id', o.clue_id, 'tier', o.tier, 'subject', o.subject_name, 'action', o.action_label, 'object', o.object_name,
        'item', o.item_name, 'place', o.place, 'excerpt', o.excerpt, 'when', o.happened_at) order by o.happened_at desc), '[]'::jsonb)
      into clues from intel_owned o where o.char_id = p_char and o.clue_id = any(ids);
  else
    heat_add := failheat + case when r = 1 then 3 else 0 end;
    perform _rep_add_heat(p_char, heat_add);
  end if;
  return jsonb_build_object('ok', true, 'success', succ, 'roll', r, 'bonus', bonus, 'dc', dc, 'cost', cost, 'balance', bal - cost, 'clues', clues, 'heat_added', heat_add,
    'msg', case when succ then 'Informação obtida.' when r = 1 then 'Falha crítica! Você foi notado.' else 'Você não conseguiu nada e deixou rastros.' end);
end $$;

revoke execute on function rep_adjust(uuid,int,int,int,bigint), wanted_board(), intel_catalog(uuid,text), buy_intel(uuid,text,text) from public, anon;
grant execute on function rep_adjust(uuid,int,int,int,bigint), wanted_board(), intel_catalog(uuid,text), buy_intel(uuid,text,text) to authenticated;
