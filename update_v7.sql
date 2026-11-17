-- MENPHIS — ATUALIZAÇÃO v7: MISSÃO AUTOMÁTICA (missões infinitas geradas pela IA interna; sem API; sem texto livre do jogador)
-- Requer update_v5.sql e update_v6.sql. Pode rodar quantas vezes quiser (substitui qualquer v7 anterior).
--
-- COMO O JOGADOR NÃO CONSEGUE "INDUZIR" A IA:
--  * cada missão é gerada NO SERVIDOR (temas + cenas + desfechos sorteados) e o plano fica numa tabela que ninguém lê pela API;
--  * o jogador só envia o NÚMERO de uma das opções que o servidor mostrou; nenhum texto digitado é interpretado;
--  * dado, bônus (atributos lidos do banco), próximo passo, XP, tarjas, procurado e rastros são decididos pelo servidor;
--  * cada missão paga uma vez; há limite diário e porcentagem de recompensa configuráveis pelo admin.

do $$ begin
  if to_regclass('public.intel_clues') is null or to_regclass('public.reputation') is null then
    raise exception 'Rode o update_v6.sql antes deste arquivo.';
  end if;
end $$;

-- segurança do v6: funções internas não podem ser chamadas pelo navegador
revoke execute on function _rep_add_heat(uuid, int) from public, anon, authenticated;

create table if not exists mission_ai_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  reward_pct int not null default 30 check (reward_pct between 0 and 100),
  daily_limit int not null default 3 check (daily_limit between 0 and 20));
insert into mission_ai_config (id) values (1) on conflict (id) do nothing;

create table if not exists mission_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  char_id uuid not null references characters on delete cascade,
  rank_name text,
  title text,
  vars jsonb not null default '{}',
  node text not null default 'n1',
  hp int not null default 5,
  exposure int not null default 0,
  score int not null default 0,
  rep_h int not null default 0,
  rep_v int not null default 0,
  rep_t int not null default 0,
  base_xp int not null default 0,
  base_tarjas int not null default 0,
  log jsonb not null default '[]',
  status text not null default 'active' check (status in ('active','done')),
  result text,
  reward jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz);
alter table mission_ai_sessions add column if not exists rank_name text;
alter table mission_ai_sessions add column if not exists title text;
alter table mission_ai_sessions add column if not exists score int not null default 0;
alter table mission_ai_sessions add column if not exists rep_h int not null default 0;
alter table mission_ai_sessions add column if not exists rep_v int not null default 0;
alter table mission_ai_sessions add column if not exists rep_t int not null default 0;
alter table mission_ai_sessions add column if not exists base_xp int not null default 0;
alter table mission_ai_sessions add column if not exists base_tarjas int not null default 0;
do $$ begin  -- restos de uma versão anterior
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mission_ai_sessions' and column_name = 'template') then
    alter table mission_ai_sessions alter column template drop not null;
  end if;
end $$;
create unique index if not exists mai_one_active_idx on mission_ai_sessions (char_id) where status = 'active';

-- o plano da missão (cenas, testes e desfechos) NUNCA é lido pelo navegador: sem nenhuma policy
create table if not exists mission_ai_plans (
  session_id uuid primary key references mission_ai_sessions on delete cascade,
  data jsonb not null);

alter table mission_ai_config   enable row level security;
alter table mission_ai_sessions enable row level security;
alter table mission_ai_plans    enable row level security;
drop policy if exists "maic_read" on mission_ai_config;   create policy "maic_read" on mission_ai_config   for select to authenticated using (true);
drop policy if exists "mais_read" on mission_ai_sessions; create policy "mais_read" on mission_ai_sessions for select to authenticated using (owner = auth.uid() or is_staff());
-- sem policy de escrita em sessions/plans: só as funções abaixo mexem nelas

create or replace function _rep_apply(p_char uuid, p_hero int, p_villain int, p_heat int) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select owner into o from characters where id = p_char; if o is null then return; end if;
  insert into reputation (char_id, owner) values (p_char, o) on conflict (char_id) do nothing;
  update reputation set
    hero = greatest(0, hero + coalesce(p_hero, 0)),
    villain = greatest(0, villain + coalesce(p_villain, 0)),
    heat = greatest(0, _heat_eff(heat, heat_at) + coalesce(p_heat, 0)),
    heat_at = now(), updated_at = now()
  where char_id = p_char;
end $$;

create or replace function _mai_ranks() returns jsonb language sql immutable as $$
  select '{"Pacífica":{"xp":20,"tj":500,"lv":1},"Fácil":{"xp":70,"tj":2500,"lv":1},"Média":{"xp":120,"tj":6000,"lv":2},"Arriscada":{"xp":130,"tj":8000,"lv":3},"Difícil":{"xp":200,"tj":20000,"lv":4}}'::jsonb $$;

create or replace function _mai_pick(arr jsonb) returns jsonb language sql volatile as
$$ select arr -> (floor(random() * jsonb_array_length(arr)))::int $$;

create or replace function _mai_render(t text, v jsonb) returns text language plpgsql immutable as $$
declare k text; val text;
begin
  if t is null then return ''; end if;
  for k, val in select key, value from jsonb_each_text(v) loop t := replace(t, '{' || k || '}', val); end loop;
  return t;
end $$;

create or replace function _mai_bonus(p_stats jsonb, p_stat text) returns int language sql immutable as
$$ select least(6, floor(coalesce((p_stats ->> p_stat)::numeric, 0) / 20))::int $$;

create or replace function _mai_hint(p_dc int, p_bonus int) returns text language sql immutable as $$
  select case when p_dc is null then 'Sem teste'
              when 21 - (p_dc - p_bonus) >= 15 then 'Favorável'
              when 21 - (p_dc - p_bonus) >= 10 then 'Arriscado'
              when 21 - (p_dc - p_bonus) >= 5  then 'Difícil'
              else 'Quase impossível' end $$;

-- ===== o gerador: monta uma missão inédita com 10 escolhas =====
create or replace function _mai_generate(p_rank text) returns jsonb language plpgsql volatile as $$
declare
  P jsonb := $p${"scenes":{"arrival":{"intro":["{player} chega {place_a} sob {weather}.","O contrato leva {player} até {place}, sob {weather}.","Depois de uma longa viagem, {player} avista {place}."],"problem":["Hora de decidir como começar.","Há várias formas de abordar a situação.","O primeiro passo pode definir o resto da missão."],"arch":[{"stat":"intelligence","t":["Observar o local antes de agir","Estudar o terreno e as pessoas ao redor"],"ok":["Você percebe detalhes úteis que outros ignorariam.","Cada movimento ao redor fica claro para você."],"fail":["Você não percebe nada de útil e perde tempo.","A observação se arrasta sem render nada."],"ok_fx":{"exp":-1},"fail_fx":{"exp":1}},{"stat":"speed","t":["Percorrer a área rapidamente atrás de sinais","Dar uma volta rápida pelos arredores"],"ok":["Em poucos minutos você já conhece os caminhos principais.","Seus passos rápidos revelam atalhos e becos."],"fail":["Você corre à toa e chama atenção de curiosos.","Você se perde em ruas que parecem iguais."],"fail_fx":{"exp":1}},{"stat":"strength","t":["Mostrar presença e se impor logo de cara","Entrar de peito aberto, sem rodeios"],"ok":["Sua postura firme faz todos abrirem caminho.","O recado é entendido: ninguém quer problemas com {player}."],"fail":["Sua pose gera mais desconfiança que respeito.","A entrada barulhenta irrita as pessoas erradas."],"ok_fx":{"exp":1},"fail_fx":{"exp":2}},{"stat":"magic_capacity","t":["Sentir o fluxo de mana da região","Estender a percepção mágica ao redor"],"ok":["O fluxo de mana revela onde as coisas importantes se escondem.","Você sente a mana vibrar mais forte em um ponto específico."],"fail":["A mana ali está confusa e atrapalha sua percepção.","Você gasta energia e só sente ruído."],"fail_fx":{"exp":1}}]},"investigate":{"intro":["Você examina o que restou de um recente incidente.","Pistas se espalham {place_por}.","Há marcas recentes por toda parte."],"problem":["Algo ali não bate com o que {npc} contou.","Alguém tentou apagar os rastros {foe_de}.","Uma pista parece importante, mas está bem escondida."],"arch":[{"stat":"intelligence","t":["Analisar as pistas com calma","Juntar os detalhes numa conclusão"],"ok":["As peças se encaixam e um padrão surge.","Você chega a uma conclusão que faz sentido."],"fail":["As pistas se contradizem e você desiste do raciocínio.","Você tira conclusões apressadas e erradas."],"fail_fx":{"exp":1}},{"stat":"speed","t":["Seguir o rastro mais fresco","Correr atrás da trilha antes que esfrie"],"ok":["O rastro leva a um ponto útil.","Você encontra o ponto onde a trilha se divide e escolhe o lado certo."],"fail":["O rastro some antes de dar em algum lugar.","Você acaba seguindo uma pista falsa."],"fail_fx":{"exp":1}},{"stat":"magic_capacity","t":["Ler resíduos de mana no ambiente","Invocar a memória da mana do lugar"],"ok":["Resíduos de mana contam o que aconteceu ali.","A mana do ambiente sussurra o caminho."],"fail":["Os resíduos são fracos demais para ler.","A leitura mágica se mistura com ruído."],"ok_fx":{"exp":1},"fail_fx":{"exp":1}},{"stat":"strength","t":["Revirar tudo à força até achar algo","Arrancar os tapumes e escombros do caminho"],"ok":["No meio dos escombros, algo importante aparece.","O trabalho bruto revela um esconderijo."],"fail":["Você só faz bagunça e chama atenção.","Nada de útil, e o barulho se espalha."],"ok_fx":{"exp":1},"fail_fx":{"exp":2}}]},"social":{"intro":["Você encontra {helper} no caminho.","Um grupo desconfiado observa {player} de longe.","Alguém ali parece saber mais do que diz."],"problem":["Uma conversa pode abrir portas, ou fechá-las.","Convencê-lo vai exigir jeito.","O tempo corre e ele não parece ter pressa."],"arch":[{"stat":"intelligence","t":["Argumentar com calma","Fazer as perguntas certas"],"ok":["A conversa flui e você sai com informações valiosas.","Ele acaba confiando em você e conta o que sabe."],"fail":["A conversa não leva a nada e ele fecha a cara.","Suas perguntas o deixam desconfiado."],"fail_fx":{"exp":1}},{"stat":"strength","t":["Impor respeito com a presença","Pressionar sem tocar em ninguém"],"ok":["O recado é entendido e a resposta vem rápido.","Ele cede, mas não esquecerá a pressão."],"fail":["Ele não se intimida e chama reforços.","A pressão sai pela culatra."],"ok_fx":{"exp":1},"fail_fx":{"exp":2}},{"stat":"magic_capacity","t":["Impressionar com uma pequena demonstração de magia","Mostrar um truque de mana para quebrar o gelo"],"ok":["O truque impressiona e as portas se abrem.","A demonstração gera confiança e curiosidade."],"fail":["O truque assusta mais do que impressiona.","Ninguém se impressiona e os olhares ficam frios."],"ok_fx":{"exp":1},"fail_fx":{"exp":2}},{"stat":"weapon_mastery","t":["Provar sua habilidade com um desafio amigável","Exibir seu treino com a arma"],"ok":["Você ganha respeito e uma pista de bônus.","A demonstração conquista o grupo."],"fail":["O desafio vira constrangimento.","Você erra feio na frente de todos."],"fail_fx":{"exp":1}}]},"travel":{"intro":["O caminho até o próximo ponto é longo e a região é hostil.","A estrada se divide perto {place_de}.","Falta cruzar uma região perigosa antes de continuar."],"problem":["Escolher o caminho errado custará tempo.","O terreno exige atenção.","Há sinais da presença {foe_de} por ali."],"arch":[{"stat":"speed","t":["Atravessar correndo","Cruzar o trecho no ritmo mais rápido"],"ok":["Você ganha tempo e chega antes do esperado.","A travessia sai mais rápida que o previsto."],"fail":["Você tropeça e perde parte do tempo ganho.","O terreno ruim te atrasa."],"fail_fx":{"hp":-1}},{"stat":"physical_resistance","t":["Seguir em marcha forçada aguentando o cansaço","Aguentar o frio e a fome e continuar"],"ok":["Seu corpo resiste e você segue firme.","Você chega exausto, mas inteiro."],"fail":["O cansaço cobra seu preço.","O corpo reclama e você perde o ritmo."],"fail_fx":{"hp":-1}},{"stat":"intelligence","t":["Traçar o melhor caminho pelo mapa","Escolher a rota mais segura"],"ok":["O atalho escolhido economiza horas.","A rota é segura e discreta."],"fail":["A rota escolhida é mais longa do que parecia.","Você erra uma bifurcação."],"ok_fx":{"exp":-1},"fail_fx":{"exp":1}},{"stat":"speed","t":["Seguir por trilhas escondidas","Evitar a estrada e cortar caminho pela mata"],"ok":["Ninguém vê você passar.","A trilha escondida é silenciosa e rápida."],"fail":["A mata fechada te atrasa e arranha.","A trilha termina num beco sem saída."],"ok_fx":{"exp":-1},"fail_fx":{"exp":1}}]},"obstacle":{"intro":["Uma barreira bloqueia a passagem.","O caminho termina em uma estrutura danificada.","Um desmoronamento fecha a única saída."],"problem":["Não há tempo para dar a volta.","Passar vai exigir algo mais que paciência.","Há várias maneiras de superar isso."],"arch":[{"stat":"strength","t":["Abrir caminho à força","Empurrar os escombros um a um"],"ok":["O caminho se abre com um estrondo.","Com esforço, você afasta o que bloqueava a passagem."],"fail":["O peso é demais e você se machuca.","A estrutura resiste e te fere."],"ok_fx":{"exp":1},"fail_fx":{"hp":-1,"exp":1}},{"stat":"intelligence","t":["Encontrar o ponto fraco e desmontar","Estudar a estrutura antes de mexer"],"ok":["Um único ponto cede e libera tudo.","A estrutura desmonta como você previu."],"fail":["Você erra o ponto fraco e a estrutura estala.","A análise falha e você perde tempo."],"fail_fx":{"exp":1}},{"stat":"speed","t":["Escalar por onde ninguém pensaria","Passar por um vão estreito"],"ok":["Você passa por cima sem ser notado.","O vão é apertado, mas você passa."],"fail":["Você escorrega e se arranha todo.","O vão é apertado demais e você volta."],"ok_fx":{"exp":-1},"fail_fx":{"hp":-1}},{"stat":"magic_capacity","t":["Moldar mana para desfazer o obstáculo","Concentrar energia para abrir caminho"],"ok":["A mana dissolve a barreira em poucos segundos.","Uma onda de energia abre a passagem."],"fail":["A magia falha e solta uma faísca.","A energia se dispersa sem efeito."],"ok_fx":{"exp":1},"fail_fx":{"exp":1}}]},"stealth":{"intro":["Vigias cobrem a próxima área.","Um corredor estreito é patrulhado.","Luzes e sombras alternam no caminho."],"problem":["Ser visto agora complicaria tudo.","O silêncio vale mais que a força.","Cada passo precisa ser medido."],"arch":[{"stat":"speed","t":["Passar rente às sombras","Atravessar durante o intervalo da patrulha"],"ok":["Você passa como uma sombra, sem deixar rastro.","Ninguém percebe que você esteve ali."],"fail":["Seu passo estala no silêncio.","Uma sombra mexe na hora errada."],"ok_fx":{"exp":-1},"fail_fx":{"exp":2,"hp":-1}},{"stat":"intelligence","t":["Esperar o ritmo da patrulha e cruzar no tempo certo","Usar uma distração para desviar a atenção"],"ok":["O momento certo chega e você passa.","A distração funciona direitinho."],"fail":["A patrulha muda o ritmo e você hesita.","A distração chama atenção demais."],"ok_fx":{"exp":-1},"fail_fx":{"exp":2}},{"stat":"magic_capacity","t":["Dobrar a luz com mana para se ocultar","Abafar o som dos passos com magia"],"ok":["A magia te esconde por completo.","Seus passos somem do mundo por um instante."],"fail":["A magia falha e cria um brilho suspeito.","A mana vaza e denuncia sua posição."],"ok_fx":{"exp":-1},"fail_fx":{"exp":2}},{"stat":"weapon_mastery","t":["Neutralizar o vigia mais próximo em silêncio","Surpreender o primeiro vigia por trás"],"ok":["O vigia cai sem fazer barulho.","A abordagem é limpa e silenciosa."],"fail":["O vigia reage e solta um grito curto.","Você erra o golpe e ele escapa."],"ok_fx":{"exp":1},"fail_fx":{"exp":2,"hp":-1}}]},"combat":{"intro":["Um confronto com {foe} se torna inevitável.","O som de armas se aproxima rápido.","Não há mais como evitar a luta contra {foe}."],"problem":["Não dá para fugir agora.","Cada golpe conta.","Um deslize pode custar caro."],"arch":[{"stat":"weapon_mastery","t":["Atacar com precisão","Procurar a abertura certa e golpear"],"ok":["Seus golpes acertam o ponto certo e a luta vira.","A abertura aparece e você não perde a chance."],"fail":["Seus golpes erram e você é contra-atacado.","Você hesita e paga caro."],"ok_fx":{"exp":1},"fail_fx":{"hp":-1,"exp":1}},{"stat":"strength","t":["Partir para cima com força bruta","Quebrar a guarda com golpes pesados"],"ok":["A força bruta decide o confronto.","A guarda adversária se desfaz."],"fail":["Você exagera na força e se expõe.","O golpe pesado erra e te desequilibra."],"ok_fx":{"exp":2},"fail_fx":{"hp":-1,"exp":2}},{"stat":"magic_capacity","t":["Lançar magia à distância","Concentrar mana em uma rajada"],"ok":["A magia atinge em cheio e a luta muda de rumo.","A rajada de mana abre uma brecha."],"fail":["A magia sai fraca e dispersa.","O feitiço falha no pior momento."],"ok_fx":{"exp":2},"fail_fx":{"hp":-1,"exp":2}},{"stat":"physical_resistance","t":["Aguentar a investida e contra-atacar","Segurar a linha até o inimigo cansar"],"ok":["Você aguenta o tranco e vira a luta.","A resistência paga: o inimigo cansa primeiro."],"fail":["O peso dos golpes é demais.","Você não segura a linha e recua ferido."],"ok_fx":{"exp":1},"fail_fx":{"hp":-1,"exp":1}},{"stat":"speed","t":["Esquivar e atacar de lado","Dançar em volta e golpear nas brechas"],"ok":["Você é rápido demais para ser atingido.","Cada esquiva abre um golpe limpo."],"fail":["Você erra o tempo da esquiva.","O inimigo prevê seus passos."],"ok_fx":{"exp":1},"fail_fx":{"hp":-1,"exp":1}}]},"puzzle":{"intro":["Uma antiga inscrição trava o caminho.","Um mecanismo estranho responde ao toque.","Símbolos brilham em sequência na parede."],"problem":["A solução está à vista, mas não é óbvia.","Errar aqui pode ativar alguma armadilha.","Há um padrão que precisa ser entendido."],"arch":[{"stat":"intelligence","t":["Decifrar o padrão","Testar as combinações com método"],"ok":["O padrão se revela e o mecanismo cede.","A sequência certa aparece."],"fail":["Você erra a sequência e algo estala.","O mecanismo trava de vez."],"fail_fx":{"hp":-1,"exp":1}},{"stat":"magic_capacity","t":["Responder ao mecanismo com mana","Alimentar os símbolos com energia"],"ok":["Os símbolos aceitam sua energia e se abrem.","A mana resolve o que a lógica não resolvia."],"fail":["O mecanismo rejeita sua energia.","Os símbolos apagam de uma vez."],"ok_fx":{"exp":1},"fail_fx":{"hp":-1,"exp":1}},{"stat":"strength","t":["Forçar uma alavanca no ponto certo","Quebrar o ponto fraco do mecanismo"],"ok":["O mecanismo cede com um estalo seco.","A força bruta funciona melhor do que a lógica."],"fail":["A alavanca não se mexe e você se machuca.","O mecanismo trava de vez."],"ok_fx":{"exp":1},"fail_fx":{"hp":-1,"exp":1}},{"stat":"speed","t":["Passar pelo mecanismo antes que feche","Cruzar na janela de tempo certa"],"ok":["Você passa no último segundo.","O tempo é curto, mas você consegue."],"fail":["A passagem fecha no seu ombro.","Você chega tarde demais."],"fail_fx":{"hp":-1}}]},"twist":{"intro":["Nada é o que parecia ser: {twist}.","Uma revelação muda os planos de {player}: {twist}.","Você descobre algo importante: {twist}."],"problem":["Agora é preciso decidir em quem confiar.","A missão ganhou novo rumo.","Ignorar isso seria perigoso."],"arch":[{"stat":"intelligence","t":["Reavaliar o plano e se adaptar","Montar um novo plano com o que sabe agora"],"ok":["O novo plano é melhor que o primeiro.","Você se adapta rápido e retoma a iniciativa."],"fail":["O novo plano tem furos e custa tempo.","A mudança de rumo te desorganiza."],"fail_fx":{"exp":1}},{"stat":"speed","t":["Agir antes que os outros percebam","Se antecipar ao próximo passo dos outros"],"ok":["Você sai na frente de todos.","Seu movimento surpreende quem observava."],"fail":["Alguém já esperava seu movimento.","Você corre e esbarra em um problema."],"ok_fx":