/* MENPHIS — navegação estilo Netflix: barra, destaque, fileiras, perfis ("Quem está jogando?"), busca e menu inferior */
(function(){
'use strict';
const $ = (s,r=document) => r.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const me = () => window.MENPHIS_USER, key = () => (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
const mine = () => (window.MENPHIS_CH ? window.MENPHIS_CH() : []).filter(c => me() && c.owner === me().id);
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3500); };
window.MENPHIS_NF = true;

/* ---------- catálogo de "títulos" (recursos do site) ---------- */
const F = {
 'missao-auto': {icon:'🤖', title:'Missão Automático', badge:'NOVO', g:['#b20710','#2a0507'], route:'#/missao-auto', tags:['Infinito','10 escolhas','IA interna'],
   desc:'Missões infinitas geradas pela IA interna: a cada partida, uma história inédita. São 10 escolhas, você só clica nas opções, e o servidor decide dados, recompensas e consequências.',
   steps:['Entre na sua conta e escolha um personagem','Toque em Missão Automático e escolha a dificuldade','Toque em Gerar missão e faça as 10 escolhas']},
 'jogo': {icon:'🎮', title:'Jogo de Narração', g:['#1d4ed8','#07122e'], route:'#/jogo', tags:['Tempo real','Narrador','5 escolhas'],
   desc:'Aventura interativa ao vivo: o narrador mostra cenas, fala em tempo real e abre até 5 escolhas. Os jogadores veem tudo como um diálogo de jogo.', steps:['Abra Jogo de Narração','Entre em uma aventura criada pelo narrador','Escolha quando as opções aparecerem']},
 'intel': {icon:'🕵️', title:'Informantes', badge:'NOVO', g:['#7c3aed','#1a0b33'], route:'#/intel', tags:['Rastros','Reputação','Procurados'],
   desc:'Toda missão deixa rastros. Compre informações sobre players, NPCs e armas com dinheiro ou métodos arriscados, e cuide da sua reputação para não virar procurado.', steps:['Abra Informantes','Pesquise um nome, arma ou local','Escolha como obter a informação']},
 'tutorial': {icon:'📖', title:'Tutorial', g:['#b45309','#2a1403'], route:'#/tutorial', tags:['Livro de regras','Busca'],
   desc:'O livro de regras completo de Menphis, com busca e seções: mana, EP, runas, atributos, treino, missões e guildas.', steps:['Abra Tutorial','Use a busca ou toque em uma seção','Pergunte ao Guardião na Home para tirar dúvidas']},
 'personagens': {icon:'🧙', title:'Personagens', g:['#0f766e','#04201d'], route:'#/personagens', tags:['Ficha completa','Importar'],
   desc:'Crie fichas completas no modelo Menphis, importe sua ficha em texto e abra uma janela de status estilo Solo Leveling.', steps:['Abra Personagens','Toque em Novo personagem','Preencha ou importe a ficha']},
 'clas': {icon:'🛡️', title:'Clãs', g:['#9f1239','#2a0713'], route:'#/clas', tags:['27 clãs','Atributos'], desc:'Conheça os 27 clãs de Quanti, seus atributos base e todo o texto do livro.', steps:['Abra Clãs','Toque em um clã','Leia ou crie um personagem do clã']},
 'tabletop': {icon:'⚔️', title:'Tabletop', g:['#be123c','#220510'], route:'#/tabletop', tags:['Tokens','Tempo real'], desc:'Mesa virtual com tokens arrastáveis sincronizados em tempo real.', steps:['Abra Tabletop','Entre em uma sessão','Arraste seu token']},
 'narracoes': {icon:'📜', title:'Narrações', g:['#a16207','#241503'], route:'#/narracoes', tags:['Chat narrado'], desc:'Sessões narradas ao vivo, com rolagem de dados direto no texto (/r 1d20+3).', steps:['Abra Narrações','Entre em uma sessão','Escreva sua ação']},
 'mapa': {icon:'🗺️', title:'Mapa de Menphis', g:['#15803d','#04210f'], route:'#/mapa', tags:['Reinos','Viagem'], desc:'Reinos e territórios do mundo, e o deslocamento dos personagens.', steps:['Abra Mapa','Escolha o personagem e o reino','Toque em Viajar']},
 'regioes': {icon:'🧭', title:'Regiões', g:['#0e7490','#03212b'], route:'#/regioes', tags:['Eventos','Perigos'], desc:'Perigos, oportunidades e eventos ativos em cada região.', steps:['Abra Regiões','Veja os eventos ativos']},
 'armaria': {icon:'🗡️', title:'Armaria', g:['#52525b','#121214'], route:'#/armaria', tags:['Equipamentos'], desc:'Equipamentos lendários do mundo de Menphis, por raridade.', steps:['Abra Armaria','Filtre por raridade']},
 'kionstore': {icon:'🛒', title:'KionStore', g:['#c2410c','#2a1004'], route:'#/kionstore', tags:['Loja'], desc:'Loja do mundo de Quanti.', steps:['Abra KionStore','Escolha um item']},
 'missoes': {icon:'📋', title:'Missões das Guildas', g:['#4d7c0f','#0f1f04'], route:'#/missoes', tags:['Guildas','Recompensas'], desc:'Quadro de missões das guildas: aceite, cumpra e ganhe recompensas.', steps:['Abra Missões','Aceite uma missão','Fale com o narrador']},
 'ferramentas': {icon:'🔧', title:'Ferramentas', g:['#4338ca','#0d0a2e'], route:'#/ferramentas', tags:['Dados','Nomes','Loot'], desc:'Dados, iniciativa, cronômetro, nomes, loot, NPCs e encontros.', steps:['Abra Ferramentas','Escolha uma ferramenta']},
 'notas': {icon:'📝', title:'Notas', g:['#ca8a04','#261b02'], route:'#/notas', tags:['Privado'], desc:'Seu diário de campanha, salvo na sua conta.', steps:['Abra Notas','Escreva: salva sozinho']},
 'arte-ia': {icon:'🎨', title:'Arte IA', g:['#db2777','#2a0415'], route:'#/arte-ia', tags:['Imagens'], desc:'Gere imagens de personagens, cenários e cenas do seu RPG.', steps:['Abra Arte IA','Descreva a imagem','Toque em Gerar']}
};
const TUT = [['regras','📜','Regras de Convivência'],['prologo','📖','Prólogo'],['ficha','📝','Ficha de Personagem'],['magia','✨','Magia, Mana e Custo'],['humanos','💎','Humanos e a Gema Quantium'],['casta','👑','Casta Social'],['runas','🔣','Runas e Círculos Arcanos'],['atributos','📊','Atributos e a Escala x'],['ep','💥','Pontos Espirituais (EP)'],['treino','🏋️','Treinamento'],['companhia','🐾','Companhia (Pets)'],['niveis','⭐','Níveis e XP'],['missoes','🗡️','Missões'],['recompensas','🏆','Recompensas'],['guildas','🏰','Guildas']];
const grad = f => '--g1:' + f.g[0] + ';--g2:' + f.g[1];
window.nfGoTut = id => { location.hash = '#/tutorial'; setTimeout(() => { const el = document.getElementById('tut-' + id); if(el){ el.open = true; el.scrollIntoView({behavior: 'smooth', block: 'start'}); } }, 380); };
window.nfNewChar = name => { closeModals && closeModals(); if(!me()){ toast('Entre na sua conta para criar um personagem.'); return; } location.hash = '#/personagens'; setTimeout(() => { if(window.openSheet){ openSheet(); if(name && CLANS[name]){ $('#shClan').value = name; $('#shVariant').dataset.clan = ''; loadBase(); } } }, 350); };

/* ---------- barra superior ---------- */
function buildNav(){
  const bar = $('.topbar'), inner = $('.topbar-inner'), navEl = $('#nav'); if(!bar || !inner || !navEl || navEl.dataset.nf) return; navEl.dataset.nf = 1;
  const map = {}; $$('#nav a').forEach(a => { const k = a.getAttribute('href').replace(/^#\/?/, ''); a.textContent = a.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim(); a.classList.remove('hot'); if(k === '') a.textContent = 'Início'; map[k] = a; });
  const primary = ['', 'missao-auto', 'clas', 'personagens', 'jogo', 'intel', 'tutorial'];
  navEl.innerHTML = ''; primary.forEach(k => map[k] && navEl.appendChild(map[k]));
  const more = document.createElement('div'); more.className = 'nf-more'; more.innerHTML = '<button class="nf-morebtn" type="button">Explorar ▾</button><div class="nf-morebox"></div>'; navEl.appendChild(more);
  Object.keys(map).filter(k => !primary.includes(k)).forEach(k => $('.nf-morebox', more).appendChild(map[k]));
  more.querySelector('.nf-morebtn').onclick = () => more.classList.toggle('open');
  const right = document.createElement('div'); right.className = 'nf-right';
  right.innerHTML = '<button class="nf-ico" id="nfSearchBtn" aria-label="Buscar"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg></button>' +
    '<div class="nf-prof" id="nfProf"><button class="nf-avatar" id="nfAvatar" aria-label="Perfil">👤</button><div class="nf-profbox" id="nfProfBox"><button type="button" id="nfSwitch">Trocar de perfil</button><a href="#/personagens">Meus personagens</a><a href="#/tutorial">Tutorial</a><a class="staff-only" href="#/admin">Admin Studio</a></div></div>';
  inner.appendChild(right); const ub = $('#userBar'); if(ub) $('#nfProfBox').insertBefore(ub, $('#nfProfBox').firstChild);
  $('#nfAvatar').onclick = () => $('#nfProf').classList.toggle('open');
  document.addEventListener('click', e => { if(!e.target.closest('#nfProf')) $('#nfProf').classList.remove('open'); if(!e.target.closest('.nf-more')) more.classList.remove('open'); });
  $('#nfSearchBtn').onclick = () => openSearch();
  const solid = () => bar.classList.toggle('solid', window.scrollY > 10 || key() !== ''); window.addEventListener('scroll', solid, {passive: true}); window.addEventListener('hashchange', solid); solid();
}
function buildTabs(){
  if($('.nf-tabs')) return; const t = document.createElement('nav'); t.className = 'nf-tabs';
  t.innerHTML = '<a href="#/" data-k=""><span class="ic">🏠</span>Início</a><a href="#/missao-auto" data-k="missao-auto"><span class="ic">🤖</span>Missão</a><a href="#/clas" data-k="clas"><span class="ic">🛡️</span>Clãs</a><a href="#/personagens" data-k="personagens"><span class="ic">🧙</span>Fichas</a><button type="button" id="nfMenuTab"><span class="ic">☰</span>Menu</button>';
  document.body.appendChild(t); $('#nfMenuTab').onclick = () => { const mn = $('#mobileNav'); if(mn) mn.classList.toggle('open'); };
  const on = () => $$('.nf-tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === key())); window.addEventListener('hashchange', () => { on(); const mn = $('#mobileNav'); if(mn) mn.classList.remove('open'); }); on();
}

/* ---------- destaque ---------- */
const SLIDES = [{k: 'missao-auto'}, {k: 'jogo'}, {k: 'intel'}, {k: '__menphis'}];
let slide = 0, timer = null;
function bbHtml(i){
  const sl = SLIDES[i]; const emblem = ($('.brand img') || {}).src || '';
  let f = F[sl.k], title, desc, route, tags, play = '▶ Jogar', feat = sl.k;
  if(sl.k === '__menphis'){ f = {g: ['#8a1c1c', '#1a0505'], icon: ''}; title = 'Menphis'; desc = 'Em Quanti, a magia é soberana e os clãs travam uma guerra pelo equilíbrio. Teria você a coragem necessária para encontrar a verdade?'; route = '#/tutorial'; tags = ['RPG de mesa', 'Guerra dos Clãs', '27 clãs']; play = '▶ Começar'; feat = 'tutorial'; }
  else { title = f.title; desc = f.desc; route = f.route; tags = f.tags; }
  return '<div class="nf-bb"><div class="nf-bb-bg" style="' + grad(f) + '">' + (f.icon ? '<div class="nf-bb-emoji">' + f.icon + '</div>' : '') + (sl.k === '__menphis' && emblem ? '<img class="nf-bb-emblem" src="' + esc(emblem) + '" alt="">' : '') + '</div><div class="nf-bb-fade"></div>' +
    '<div class="nf-bb-copy"><div class="nf-orig"><i>M</i> RPG ORIGINAL</div><h1>' + esc(title) + '</h1><div class="nf-meta">' + (F[sl.k] && F[sl.k].badge ? '<span class="nf-new">Novo</span>' : '<span class="nf-new">Disponível</span>') + '<span class="nf-age">16+</span>' + tags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div><p class="nf-desc">' + esc(desc) + '</p>' +
    '<div class="nf-bb-btns"><a class="nf-btn play" href="' + route + '">' + play + '</a><button class="nf-btn info" data-feat="' + feat + '" type="button">ℹ Mais informações</button></div></div><div class="nf-dots">' + SLIDES.map((x, n) => '<button type="button" data-i="' + n + '" class="' + (n === i ? 'on' : '') + '" aria-label="Destaque ' + (n + 1) + '"></button>').join('') + '</div></div>';
}
function showSlide(i){ slide = (i + SLIDES.length) % SLIDES.length; $('#nfBillboard').innerHTML = bbHtml(slide); }
function startRotate(){ clearInterval(timer); timer = setInterval(() => { if(key() === '' && !document.hidden && !$('#nfBillboard:hover')) showSlide(slide + 1); }, 9000); }

/* ---------- fileiras ---------- */
function featCard(k, opt){
  const f = F[k]; return '<div class="nf-card" data-feat="' + k + '" style="' + grad(f) + '"><div class="nf-art"><div class="em">' + f.icon + '</div></div>' + (f.badge ? '<span class="nf-badge">' + f.badge + '</span>' : '') + '<div class="nf-cap">' + esc(f.title) + '</div>' +
    '<div class="nf-info"><div class="acts"><button data-go="' + f.route + '" title="Abrir">▶</button><button data-feat="' + k + '" title="Mais informações">⌄</button></div><div class="tg">' + (f.badge ? '<span class="g">Novo</span>' : '') + f.tags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div></div></div>';
}
function clanCard(name){
  const c = CLANS[name]; const sub = 'Força ' + c.strength + ' · Int ' + c.intelligence;
  return '<div class="nf-card poster" data-clan="' + esc(name) + '" style="--g1:' + c.color + ';--g2:#0b0b0b"><div class="nf-art"><div class="em">' + c.icon + '</div></div><div class="nf-cap">' + esc(name) + '<small>' + sub + '</small></div><div class="nf-info"><div class="acts"><button title="Ver clã">▶</button><button data-newchar="' + esc(name) + '" title="Criar personagem">＋</button></div><div class="tg"><span class="g">' + sub + '</span><span>Mana ' + c.magic_capacity + '</span></div></div></div>';
}
function charCard(c){
  const cl = CLANS[c.clan] || {icon: '⚔️', color: '#e50914'}, sh = c.sheet || {}, pct = Math.min(100, (sh.xp || 0) / (sh.xp_max || 200) * 100);
  return '<div class="nf-card char" data-char="' + c.id + '" style="--g1:' + cl.color + ';--g2:#0b0b0b"><div class="nf-art">' + (sh.avatar ? '<img src="' + esc(sh.avatar) + '" alt="">' : '<div class="em">' + cl.icon + '</div>') + '</div><div class="nf-cap">' + esc(c.name) + '<small>' + esc(c.clan) + ' · Nv ' + (c.level || 1) + '</small></div><div class="nf-prog"><i style="width:' + pct + '%"></i></div><div class="nf-info"><div class="acts"><button title="Abrir ficha">▶</button></div><div class="tg"><span class="g">Nível ' + (c.level || 1) + '</span><span>' + esc(c.clan) + '</span></div></div></div>';
}
const row = (title, html, extra) => '<section class="nf-row"><h2>' + title + (extra ? '<small>' + extra + '</small>' : '') + '</h2><div class="nf-wrap"><button class="nf-arrow l" aria-label="Anterior">‹</button><div class="nf-track">' + html + '</div><button class="nf-arrow r" aria-label="Próximo">›</button></div></section>';
function buildRows(){
  const box = $('#nfRows'); if(!box || typeof CLANS === 'undefined') return;
  const clans = Object.keys(CLANS), my = mine();
  let h = row('Novidades', ['missao-auto', 'intel', 'jogo', 'tutorial', 'personagens'].map(k => featCard(k)).join(''), 'Explorar tudo ›');
  if(me()) h += row(my.length ? 'Continue jogando' : 'Comece sua história', my.map(charCard).join('') + '<div class="nf-card char nf-new-tile" data-newchar=""><div class="nf-art"><div class="em">＋</div></div><div class="nf-cap">Novo personagem</div></div>');
  h += row('Top 10 Clãs de Quanti', clans.slice(0, 10).map((n, i) => '<div class="nf-top"><span class="nf-num">' + (i + 1) + '</span>' + clanCard(n) + '</div>').join(''));
  h += row('Clãs de Quanti', clans.map(clanCard).join(''));
  h += row('Explorar o mundo', ['mapa', 'regioes', 'armaria', 'kionstore', 'missoes', 'clas'].map(k => featCard(k)).join(''));
  h += row('Mesa do narrador', ['tabletop', 'narracoes', 'jogo', 'ferramentas', 'notas', 'arte-ia'].map(k => featCard(k)).join(''));
  h += row('Aprenda a jogar', TUT.map(([id, ic, t], i) => '<div class="nf-card" data-tut="' + id + '" style="--g1:' + ['#b45309', '#7c3aed', '#0f766e', '#be123c', '#1d4ed8'][i % 5] + ';--g2:#0b0b0b"><div class="nf-art"><div class="em">' + ic + '</div></div><div class="nf-cap">' + esc(t) + '<small>Livro de regras</small></div><div class="nf-info"><div class="acts"><button>▶</button></div><div class="tg"><span>Tutorial</span></div></div></div>').join(''));
  box.innerHTML = h;
}
document.addEventListener('click', e => {
  const arr = e.target.closest('.nf-arrow'); if(arr){ const t = arr.parentNode.querySelector('.nf-track'); t.scrollBy({left: (arr.classList.contains('l') ? -1 : 1) * t.clientWidth * .85, behavior: 'smooth'}); return; }
  const go = e.target.closest('[data-go]'); if(go){ e.stopPropagation(); location.hash = go.dataset.go; return; }
  const nc = e.target.closest('[data-newchar]'); if(nc){ e.stopPropagation(); nfNewChar(nc.dataset.newchar); return; }
  const ft = e.target.closest('[data-feat]'); if(ft){ e.preventDefault(); openFeat(ft.dataset.feat); return; }
  const cl = e.target.closest('[data-clan]'); if(cl){ closeSearch(); openClan(cl.dataset.clan); return; }
  const ch = e.target.closest('[data-char]'); if(ch){ closeSearch(); if(window.openChar) openChar(ch.dataset.char); return; }
  const tu = e.target.closest('[data-tut]'); if(tu){ closeSearch(); nfGoTut(tu.dataset.tut); return; }
  const dot = e.target.closest('.nf-dots button'); if(dot){ showSlide(+dot.dataset.i); startRotate(); }
});

/* ---------- janelas ---------- */
function ensureModal(){ let m = $('#nfModal'); if(!m){ m = document.createElement('div'); m.className = 'modal'; m.id = 'nfModal'; m.innerHTML = '<div class="modal-box"><div id="nfModalBody"></div></div>'; document.body.appendChild(m); m.addEventListener('mousedown', e => { if(e.target === m) m.classList.remove('open'); }); } return m; }
function openFeat(k){
  const f = F[k]; if(!f) return; const m = ensureModal();
  $('#nfModalBody').innerHTML = '<button class="nf-mx" onclick="document.getElementById(\'nfModal\').classList.remove(\'open\')" aria-label="Fechar">×</button><div class="nf-mban" style="' + grad(f) + '"><div class="em">' + f.icon + '</div><div class="t"><h2>' + esc(f.title) + '</h2><div class="nf-bb-btns"><a class="nf-btn play" href="' + f.route + '" onclick="document.getElementById(\'nfModal\').classList.remove(\'open\')">▶ Abrir</a></div></div></div>' +
    '<div class="nf-mbody"><div class="nf-meta">' + (f.badge ? '<span class="nf-new">Novo</span>' : '') + '<span class="nf-age">16+</span>' + f.tags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div><p>' + esc(f.desc) + '</p><h4>Como acessar</h4><ol>' + f.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol><h4>Mais como este</h4><div class="nf-more-row">' + Object.keys(F).filter(x => x !== k).sort(() => .5 - Math.random()).slice(0, 4).map(x => '<a href="' + F[x].route + '" style="' + grad(F[x]) + '" onclick="document.getElementById(\'nfModal\').classList.remove(\'open\')">' + F[x].icon + ' ' + esc(F[x].title) + '</a>').join('') + '</div></div>';
  m.classList.add('open'); m.scrollTop = 0;
}
window.openClan = function(name){
  const c = CLANS[name]; if(!c) return; const g = '--g1:' + c.color + ';--g2:#0b0b0b';
  const stats = c.variants ? Object.entries(c.variants).map(([v, st]) => '<h4>' + esc(v) + '</h4>' + statBars(st, c.color)).join('') : statBars(c, c.color);
  $('#clanModalBody').innerHTML = '<button class="nf-mx" onclick="closeModals()" aria-label="Fechar">×</button><div class="nf-mban" style="' + g + '"><div class="em">' + c.icon + '</div><div class="t"><h2>' + esc(name) + '</h2><div class="nf-bb-btns"><button class="nf-btn play" type="button" onclick="nfNewChar(\'' + esc(name).replace(/'/g, "\\'") + '\')">▶ Criar personagem</button></div></div></div>' +
    '<div class="nf-mbody"><div class="nf-meta"><span class="nf-new">Clã</span><span class="nf-age">16+</span><span>Atributos base</span></div>' + stats + (c.note ? '<div class="clan-note">' + esc(c.note) + '</div>' : '') + '<div class="clan-text">' + esc(c.text) + '</div></div>';
  const m = $('#clanModal'); m.classList.add('open'); m.scrollTop = 0;
};
window.renderClans = function(){
  const grid = $('#clanGrid'); if(!grid) return; grid.className = 'nf-sgrid nf-clans'; grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(150px,1fr))';
  grid.innerHTML = Object.keys(CLANS).map(clanCard).join(''); $$('.nf-card', grid).forEach(c => { c.style.width = 'auto'; });
  const count = $('#clanCount'); if(count) count.textContent = Object.keys(CLANS).length + ' clãs disponíveis';
};

/* ---------- busca ---------- */
function openSearch(){
  let s = $('#nfSearch'); if(!s){ s = document.createElement('div'); s.id = 'nfSearch'; s.className = 'nf-search'; s.innerHTML = '<input id="nfQ" placeholder="Títulos, clãs, regras, personagens" autocomplete="off"><div id="nfRes"></div>'; document.body.appendChild(s);
    $('#nfQ').addEventListener('input', e => runSearch(e.target.value)); document.addEventListener('keydown', e => { if(e.key === 'Escape') closeSearch(); if(e.key === '/' && !/input|textarea|select/i.test((e.target.tagName || ''))){ e.preventDefault(); openSearch(); } }); s.addEventListener('mousedown', e => { if(e.target === s) closeSearch(); }); }
  s.classList.add('open'); runSearch(''); setTimeout(() => $('#nfQ').focus(), 50);
}
function closeSearch(){ const s = $('#nfSearch'); if(s) s.classList.remove('open'); }
function runSearch(q){
  const n = norm(q).trim(), out = []; const hit = t => !n || norm(t).includes(n);
  Object.keys(F).forEach(k => { if(hit(F[k].title + ' ' + F[k].tags.join(' '))) out.push(featCard(k)); });
  if(n) Object.keys(CLANS).forEach(c => { if(hit(c)) out.push(clanCard(c)); });
  TUT.forEach(([id, ic, t]) => { if(n && hit(t)) out.push('<div class="nf-card" data-tut="' + id + '" style="--g1:#b45309;--g2:#0b0b0b"><div class="nf-art"><div class="em">' + ic + '</div></div><div class="nf-cap">' + esc(t) + '<small>Tutorial</small></div></div>'); });
  mine().forEach(c => { if(n && hit(c.name + ' ' + c.clan)) out.push(charCard(c)); });
  $('#nfRes').innerHTML = out.length ? '<div class="nf-sgrid">' + out.join('') + '</div>' : '<p class="nf-empty">Nada encontrado para "' + esc(q) + '".</p>';
}

/* ---------- perfis ---------- */
function setAvatar(){
  const id = localStorage.getItem('menphis-profile'), c = mine().find(x => x.id === id), a = $('#nfAvatar'); if(!a) return;
  if(c){ const cl = CLANS[c.clan] || {icon: '⚔️', color: '#e50914'}, av = (c.sheet || {}).avatar; a.style.background = 'linear-gradient(135deg,' + cl.color + ',#111)'; a.innerHTML = av ? '<img src="' + esc(av) + '" style="width:100%;height:100%;object-fit:cover;border-radius:4px" alt="">' : cl.icon; a.title = c.name; } else { a.style.background = ''; a.textContent = '👤'; }
}
function openProfiles(){
  const list = mine(); let p = $('#nfProfiles'); if(!p){ p = document.createElement('div'); p.id = 'nfProfiles'; p.className = 'nf-prof-screen'; document.body.appendChild(p); }
  p.classList.remove('zoom');
  p.innerHTML = '<h1>Quem está jogando?</h1><div class="nf-prof-list">' + list.map(c => { const cl = CLANS[c.clan] || {icon: '⚔️', color: '#e50914'}, av = (c.sheet || {}).avatar; return '<button class="nf-ptile" data-p="' + c.id + '"><div class="nf-pav" style="--c:' + cl.color + '">' + (av ? '<img src="' + esc(av) + '" alt="">' : cl.icon) + '</div>' + esc(c.name) + '</button>'; }).join('') + '<button class="nf-ptile" data-p="__new"><div class="nf-pav" style="--c:#333">＋</div>Novo personagem</button></div><button class="nf-btn ghost" id="nfProfSkip" type="button">Continuar sem escolher</button>';
  p.classList.add('open');
  p.onclick = e => { const b = e.target.closest('[data-p]'), sk = e.target.closest('#nfProfSkip'); if(sk){ p.classList.remove('open'); return; } if(!b) return;
    if(b.dataset.p === '__new'){ p.classList.remove('open'); nfNewChar(''); return; }
    localStorage.setItem('menphis-profile', b.dataset.p); sessionStorage.setItem('nfProf', '1'); setAvatar(); p.classList.add('zoom'); setTimeout(() => p.classList.remove('open', 'zoom'), 520); const c = list.find(x => x.id === b.dataset.p); if(c) toast('Perfil: ' + c.name); };
}
function afterLogin(){ buildRows(); setAvatar(); if(me() && mine().length && !sessionStorage.getItem('nfProf')) openProfiles(); }

/* ---------- abertura ---------- */
function intro(){ if(sessionStorage.getItem('nfIntro') || matchMedia('(prefers-reduced-motion:reduce)').matches) return; sessionStorage.setItem('nfIntro', '1'); const d = document.createElement('div'); d.id = 'nfIntro'; d.innerHTML = '<span>MENPHIS</span>'; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }

function init(){
  buildNav(); buildTabs(); showSlide(0); startRotate(); buildRows(); setAvatar(); intro();
  const sw = $('#nfSwitch'); if(sw) sw.onclick = () => { $('#nfProf').classList.remove('open'); if(me() && mine().length) openProfiles(); else toast('Crie um personagem para ter perfis.'); };
  window.addEventListener('menphis-ready', afterLogin);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);
})();
