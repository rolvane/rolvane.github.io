/* MENPHIS — camada online (Supabase). Depende das globais definidas no index.html: CLANS, LABELS, statBars, esc, cur, rollDice, closeModals */
(function(){
'use strict';
const cfg = window.MENPHIS_CONFIG || {};
const $ = (s,r=document) => r.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)];
const pick = a => a[Math.floor(Math.random()*a.length)];
const gate = $('#authGate');
if(!cfg.SUPABASE_URL || /COLE/.test(cfg.SUPABASE_URL) || !window.supabase){
  $('#authMsg').textContent = 'Configure o arquivo config.js com a URL e a chave anon do Supabase (veja o README).';
  $('#authForm').style.display = 'none'; return;
}
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
let ME = null, PROF = null, NAMES = {}, CH = [];
const isStaff = () => PROF && (PROF.role==='mestre' || PROF.role==='admin');
const isAdmin = () => PROF && PROF.role==='admin';
function toast(m){ const t=document.createElement('div'); t.className='toast'; t.textContent=m; document.body.appendChild(t); setTimeout(()=>t.remove(),3800); }
async function run(p){ const r = await p; if(r.error){ toast(r.error.message); throw r.error; } return r.data; }
const fmt = d => new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const who = id => NAMES[id] || 'jogador';
function on(sel, ev, fn){ const el=$(sel); if(el) el.addEventListener(ev, fn); }

/* ---------- autenticação ---------- */
let mode = 'login';
function setMode(m){ mode=m; $('#authName').style.display = m==='signup' ? '' : 'none';
  $('#authSubmit').textContent = m==='signup' ? 'Criar conta' : 'Entrar';
  $('#tabLogin').classList.toggle('active', m==='login'); $('#tabSignup').classList.toggle('active', m==='signup'); }
on('#tabLogin','click',()=>setMode('login')); on('#tabSignup','click',()=>setMode('signup')); setMode('login');
on('#authForm','submit', async e => {
  e.preventDefault(); const msg = t => $('#authMsg').textContent = t; msg('');
  const email = $('#authEmail').value.trim(), password = $('#authPass').value;
  if(mode==='login'){ const {error} = await sb.auth.signInWithPassword({email,password}); if(error) msg(error.message); }
  else { const username = $('#authName').value.trim() || email.split('@')[0];
    const {data,error} = await sb.auth.signUp({email,password,options:{data:{username}}});
    if(error) msg(error.message); else if(!data.session) msg('Conta criada! Confirme o e-mail para entrar.'); }
});
window.logout = () => sb.auth.signOut();
sb.auth.onAuthStateChange((ev, s) => {
  setTimeout(() => {
    if(s && s.user){ if(!ME || ME.id !== s.user.id) start(s.user); }
    else { ME=null; PROF=null; document.body.className=''; gate.style.display='flex'; $('#userBar').textContent=''; }
  }, 0);
});

async function start(user){
  ME = user;
  let rows = await run(sb.from('profiles').select('*'));
  NAMES = Object.fromEntries(rows.map(r => [r.id, r.username]));
  PROF = rows.find(r => r.id === user.id);
  if(!PROF){ toast('Perfil não encontrado. Rode o schema.sql no Supabase.'); return; }
  document.body.className = (isStaff() ? 'is-staff ' : '') + (isAdmin() ? 'is-admin' : '');
  gate.style.display = 'none';
  $('#userBar').innerHTML = '👤 <b>'+esc(PROF.username)+'</b> · '+PROF.role+' · <a href="#" onclick="logout();return false">Sair</a>';
  CH = await run(sb.from('characters').select('*').order('created_at'));
  loadView();
}
async function refreshChars(){ CH = await run(sb.from('characters').select('*').order('created_at')); return CH; }
const mine = () => CH.filter(c => c.owner === ME.id);
const viewKey = () => (location.hash.replace(/^#\/?/,'') || '').split('?')[0];
function loadView(){ if(!ME) return; const k = viewKey(); const f = {'':loadHome, personagens:renderChars, tabletop:loadTable, narracoes:loadNarr, mapa:loadMap, notas:loadNotes, regioes:loadRegions, armaria:loadItems, missoes:loadMissions, admin:loadAdmin}[k]; if(f) f().catch(()=>{}); }
window.addEventListener('hashchange', loadView);

/* ---------- personagens ---------- */
const charCard = (c, del) => { const cl = CLANS[c.clan] || {icon:'',color:'#e50914'};
  return '<div class="char-card"><b>'+cl.icon+' '+esc(c.name)+'</b> <span class="tiny muted">· '+esc(c.clan)+(c.variant?' ('+esc(c.variant)+')':'')+' · Nível '+c.level+(c.kingdom?' · 📍 '+esc(c.kingdom):'')+(c.owner!==ME.id?' · de '+esc(who(c.owner)):'')+'</span>'+
  statBars(c.stats, cl.color) + (del && (c.owner===ME.id || isStaff()) ? '<button class="btn btn-sm" onclick="delChar(\''+c.id+'\')">Excluir</button>' : '') + '</div>'; };
window.renderChars = async function(){
  if(!ME) return; await refreshChars();
  const list = isStaff() ? CH : mine();
  $('#charList').innerHTML = list.map(c => charCard(c,true)).join('');
  $('#charEmpty').style.display = list.length ? 'none' : '';
  $('#charCount').textContent = list.length + ' personagem(ns) · fichas, mana, EP e treino de poderes';
};
window.saveChar = async function(){
  const name = $('#shName').value.trim(); if(!name) return toast('Dê um nome ao personagem.');
  const clan = $('#shClan').value, c = CLANS[clan];
  await run(sb.from('characters').insert({name, clan, variant: c.variants ? $('#shVariant').value : '', stats: cur, level: 1}));
  closeModals(); toast('Personagem salvo!'); renderChars();
};
window.delChar = async id => { if(!confirm('Excluir este personagem?')) return; await run(sb.from('characters').delete().eq('id',id)); renderChars(); };

/* ---------- home / notícias ---------- */
async function loadHome(){
  await refreshChars(); const m = mine();
  $('#homeChars').innerHTML = m.length ? m.map(c => '<div class="char-card"><b>'+(CLANS[c.clan]||{}).icon+' '+esc(c.name)+'</b> <span class="tiny muted">· '+esc(c.clan)+' · Nível '+c.level+'</span></div>').join('') : '<div class="empty"><span class="big">⚔️</span><p>Nenhum personagem criado ainda.</p></div>';
  const news = await run(sb.from('news').select('*').order('created_at',{ascending:false}).limit(8));
  $('#homeNews').innerHTML = news.length ? news.map(n => '<div class="card" style="margin-bottom:8px"><p style="font-size:13px;white-space:pre-line">'+esc(n.text)+'</p><p class="tiny muted" style="margin-top:4px">'+esc(who(n.author))+' · '+fmt(n.created_at)+'</p></div>').join('') : '<div class="empty"><span class="big">🔔</span><p>Sem notícias por enquanto.</p></div>';
}

/* ---------- notas ---------- */
let noteTimer;
async function loadNotes(){
  const r = await run(sb.from('notes').select('text').eq('owner',ME.id).maybeSingle());
  $('#notesText').value = r ? r.text : '';
}
on('#notesText','input', () => { clearTimeout(noteTimer); $('#noteState').textContent='salvando...';
  noteTimer = setTimeout(async () => { await run(sb.from('notes').upsert({owner:ME.id, text:$('#notesText').value})); $('#noteState').textContent='salvo ✓'; }, 800); });

/* ---------- narrações ---------- */
let narrChan = null, seen = new Set();
async function loadNarr(){
  $('#narrRoom').style.display='none'; $('#narrHome').style.display='';
  const rows = await run(sb.from('narrations').select('*').order('created_at',{ascending:false}));
  $('#narrList').innerHTML = rows.length ? rows.map(n => '<div class="card" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1"><b>📜 '+esc(n.title)+'</b><div class="tiny muted">por '+esc(who(n.created_by))+' · '+fmt(n.created_at)+'</div></div><button class="btn btn-sm btn-primary" onclick="openNarr(\''+n.id+'\',\''+esc(n.title).replace(/'/g,'')+'\')">Entrar</button>'+(isStaff()?'<button class="btn btn-sm" onclick="delRow(\'narrations\',\''+n.id+'\',loadNarrG)">Excluir</button>':'')+'</div>').join('') : '<div class="empty"><span class="big">📜</span><p>Nenhuma sessão de narração ainda.</p></div>';
}
window.loadNarrG = () => loadNarr();
window.delRow = async (t,id,cb) => { if(!confirm('Excluir?')) return; await run(sb.from(t).delete().eq('id',id)); cb(); };
on('#narrNew','click', async () => { const t = $('#narrTitle').value.trim(); if(!t) return; await run(sb.from('narrations').insert({title:t})); $('#narrTitle').value=''; loadNarr(); });
const turnHtml = t => '<div class="turn '+t.kind+'"><b>'+(t.kind==='narrador'?'🎭 ':'⚔️ ')+esc(t.author_name)+'</b> <span class="tiny muted">'+fmt(t.created_at)+'</span><p>'+esc(t.text)+'</p></div>';
function addTurn(t){ if(seen.has(t.id)) return; seen.add(t.id); const f=$('#feed'); f.insertAdjacentHTML('beforeend', turnHtml(t)); f.scrollTop=f.scrollHeight; }
window.openNarr = async (id,title) => {
  $('#narrHome').style.display='none'; $('#narrRoom').style.display=''; $('#narrRoom').dataset.id=id; $('#roomTitle').textContent=title; $('#feed').innerHTML=''; seen=new Set();
  await refreshChars();
  $('#turnChar').innerHTML = (isStaff()?'<option value="">🎭 Narrador</option>':'') + mine().map(c => '<option>'+esc(c.name)+'</option>').join('');
  (await run(sb.from('narration_turns').select('*').eq('narration_id',id).order('created_at'))).forEach(addTurn);
  if(narrChan) sb.removeChannel(narrChan);
  narrChan = sb.channel('narr'+id).on('postgres_changes',{event:'INSERT',schema:'public',table:'narration_turns',filter:'narration_id=eq.'+id}, p => addTurn(p.new)).subscribe();
};
on('#roomBack','click', () => { if(narrChan){ sb.removeChannel(narrChan); narrChan=null; } loadNarr(); });
on('#turnSend','click', async () => {
  let text = $('#turnText').value.trim(); if(!text) return;
  const m = text.match(/^\/r\s*(\d*)d(\d+)([+-]\d+)?/i);
  if(m){ const r = rollDice(Math.min(1000,+m[2]), Math.min(50,+(m[1]||1))); const b = +(m[3]||0); text += '  🎲 ['+r.rolls.join(', ')+']'+(b?' '+m[3]:'')+' = '+(r.total+b); }
  const ch = $('#turnChar').value;
  const t = await run(sb.from('narration_turns').insert({narration_id:$('#narrRoom').dataset.id, author_name: ch || (isStaff()?'Narrador':PROF.username), kind: ch ? 'acao' : 'narrador', text}).select().single());
  addTurn(t); $('#turnText').value='';
});

/* ---------- tabletop ---------- */
const GW = 20, GH = 14; let TT = null, ttChan = null, dragging = false;
async function loadTable(){
  $('#ttRoom').style.display='none'; $('#ttHome').style.display='';
  const rows = await run(sb.from('tabletop_sessions').select('*').order('created_at',{ascending:false}));
  $('#ttList').innerHTML = rows.length ? rows.map(s => '<div class="card" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1"><b>🗺️ '+esc(s.name)+'</b><div class="tiny muted">mestre: '+esc(who(s.created_by))+'</div></div><button class="btn btn-sm btn-primary" onclick="openTT(\''+s.id+'\')">Entrar</button>'+(isStaff()?'<button class="btn btn-sm" onclick="delRow(\'tabletop_sessions\',\''+s.id+'\',loadTableG)">Excluir</button>':'')+'</div>').join('') : '<div class="empty"><span class="big">🗺️</span><p>Nenhuma sessão criada ainda</p></div>';
}
window.loadTableG = () => loadTable();
on('#ttNew','click', async () => { const n=$('#ttName').value.trim(); if(!n) return; await run(sb.from('tabletop_sessions').insert({name:n, state:{tokens:[]}})); $('#ttName').value=''; loadTable(); });
window.openTT = async id => {
  const s = await run(sb.from('tabletop_sessions').select('*').eq('id',id).single()); TT = s;
  $('#ttHome').style.display='none'; $('#ttRoom').style.display=''; $('#ttTitle').textContent = s.name;
  await refreshChars();
  $('#ttChar').innerHTML = mine().map(c => '<option value="'+esc(c.name)+'">'+esc(c.name)+'</option>').join('') + (isStaff()?'<option value="">— NPC / inimigo —</option>':'');
  drawBoard();
  if(ttChan) sb.removeChannel(ttChan);
  ttChan = sb.channel('tt'+id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'tabletop_sessions',filter:'id=eq.'+id}, p => { if(!dragging){ TT.state = p.new.state; drawBoard(); } }).subscribe();
};
on('#ttBack','click', () => { if(ttChan){ sb.removeChannel(ttChan); ttChan=null; } loadTable(); });
const saveTT = () => run(sb.from('tabletop_sessions').update({state:TT.state}).eq('id',TT.id));
function drawBoard(){
  const b = $('#board'); b.innerHTML = '';
  (TT.state.tokens||[]).forEach(t => {
    const e = document.createElement('div'); e.className='token'; e.title = t.name;
    e.style.cssText = 'left:'+(t.x*100/GW)+'%;top:'+(t.y*100/GH)+'%;width:'+(100/GW)+'%;height:'+(100/GH)+'%;background:'+t.color;
    e.innerHTML = '<span>'+esc(t.name.slice(0,2).toUpperCase())+'</span>';
    if(t.owner===ME.id || isStaff()){
      e.style.cursor='grab';
      e.addEventListener('pointerdown', ev => { dragging=true; e.setPointerCapture(ev.pointerId);
        const mv = m => { const r=b.getBoundingClientRect(); t.x=Math.max(0,Math.min(GW-1,Math.floor((m.clientX-r.left)/r.width*GW))); t.y=Math.max(0,Math.min(GH-1,Math.floor((m.clientY-r.top)/r.height*GH)));
          e.style.left=(t.x*100/GW)+'%'; e.style.top=(t.y*100/GH)+'%'; };
        const up = async () => { e.removeEventListener('pointermove',mv); e.removeEventListener('pointerup',up); await saveTT(); dragging=false; };
        e.addEventListener('pointermove',mv); e.addEventListener('pointerup',up); });
      e.addEventListener('dblclick', async () => { if(!confirm('Remover '+t.name+'?')) return; TT.state.tokens = TT.state.tokens.filter(x=>x!==t); await saveTT(); drawBoard(); });
    }
    b.appendChild(e);
  });
}
on('#ttAdd','click', async () => {
  let name = $('#ttChar').value || $('#ttNpc').value.trim(); if(!name) return toast('Informe o nome do NPC.');
  TT.state.tokens = (TT.state.tokens||[]).concat({id:Date.now().toString(36), name, x:0, y:0, color:$('#ttColor').value, owner: $('#ttChar').value ? ME.id : null});
  await saveTT(); drawBoard(); $('#ttNpc').value='';
});

/* ---------- mapa ---------- */
let KS = [], pend = null;
async function loadMap(){
  KS = await run(sb.from('kingdoms').select('*').order('name')); await refreshChars();
  $('#mapChar').innerHTML = mine().map(c => '<option value="'+c.id+'">'+esc(c.name)+(c.kingdom?' (📍 '+esc(c.kingdom)+')':'')+'</option>').join('') || '<option value="">Sem personagens</option>';
  $('#mapKingdom').innerHTML = KS.map(k => '<option>'+esc(k.name)+'</option>').join('') || '<option value="">Nenhum reino</option>';
  $('#mapPins').innerHTML = KS.map(k => '<div class="pin" style="left:'+k.x+'%;top:'+k.y+'%" title="'+esc(k.description||'')+'">📍<span>'+esc(k.name)+'</span></div>').join('');
  $('#mapEmpty').style.display = KS.length ? 'none' : '';
  $('#kingList').innerHTML = KS.length ? KS.map(k => '<div class="card" style="margin-bottom:8px"><b>🏰 '+esc(k.name)+'</b>'+(isStaff()?' <button class="btn btn-sm" style="float:right" onclick="delRow(\'kingdoms\',\''+k.id+'\',loadMapG)">Excluir</button>':'')+'<p class="tiny muted" style="margin-top:4px">'+esc(k.description||'')+'</p></div>').join('') : '<div class="empty"><span class="big">🏰</span><p>Nenhum reino cadastrado ainda.</p></div>';
}
window.loadMapG = () => loadMap();
on('#mapBox','click', e => { if(!isStaff() || e.target.closest('.pin')) return; const r=$('#mapBox').getBoundingClientRect();
  pend = {x:+((e.clientX-r.left)/r.width*100).toFixed(1), y:+((e.clientY-r.top)/r.height*100).toFixed(1)}; $('#kingForm').style.display='block'; $('#kingPos').textContent='Posição: '+pend.x+'%, '+pend.y+'%'; });
on('#kingSave','click', async () => { const n=$('#kingName').value.trim(); if(!n||!pend) return toast('Clique no mapa e informe o nome.');
  await run(sb.from('kingdoms').insert({name:n, description:$('#kingDesc').value, ...pend})); $('#kingName').value=''; $('#kingDesc').value=''; $('#kingForm').style.display='none'; pend=null; loadMap(); });
on('#mapGo','click', async () => { const id=$('#mapChar').value, k=$('#mapKingdom').value; if(!id||!k) return;
  await run(sb.from('characters').update({kingdom:k}).eq('id',id)); toast('Personagem viajou para '+k); loadMap(); });

/* ---------- regiões ---------- */
const DANGER = ['','★ Seguro','★★ Baixo','★★★ Moderado','★★★★ Alto','★★★★★ Mortal'];
async function loadRegions(){
  const rows = await run(sb.from('regions').select('*').order('name'));
  $('#regList').innerHTML = rows.length ? rows.map(r => '<div class="card" style="margin-bottom:10px"><b>🧭 '+esc(r.name)+'</b> <span class="tiny muted">· '+esc(r.climate)+' · '+DANGER[r.danger]+'</span>'+(isStaff()?' <button class="btn btn-sm" style="float:right" onclick="delRow(\'regions\',\''+r.id+'\',loadRegionsG)">Excluir</button>':'')+
    '<p class="tiny muted" style="margin:6px 0">'+esc(r.description||'')+'</p>'+
    (r.events||[]).map((ev,i) => '<div class="ev '+ev.kind+(ev.active?'':' off')+'">'+({perigo:'⚠️',oportunidade:'✨',neutro:'ℹ️'}[ev.kind])+' '+esc(ev.text)+(isStaff()?' <a href="#" onclick="toggleEv(\''+r.id+'\','+i+');return false">['+(ev.active?'encerrar':'reabrir')+']</a>':'')+'</div>').join('')+
    (isStaff()?'<div style="margin-top:8px"><button class="btn btn-sm" onclick="addEv(\''+r.id+'\',\'perigo\')">＋ Perigo</button> <button class="btn btn-sm" onclick="addEv(\''+r.id+'\',\'oportunidade\')">＋ Oportunidade</button> <button class="btn btn-sm" onclick="addEv(\''+r.id+'\',\'neutro\')">＋ Neutro</button></div>':'')+'</div>').join('') : '<div class="empty"><span class="big">🧭</span><p>Nenhuma região cadastrada ainda.</p></div>';
}
window.loadRegionsG = () => loadRegions();
async function evUpdate(id, fn){ const r = await run(sb.from('regions').select('events').eq('id',id).single()); const ev = r.events||[]; fn(ev); await run(sb.from('regions').update({events:ev}).eq('id',id)); loadRegions(); }
window.addEv = (id,kind) => { const t = prompt('Descreva o evento:'); if(t) evUpdate(id, ev => ev.push({kind, text:t, active:true})); };
window.toggleEv = (id,i) => evUpdate(id, ev => ev[i].active = !ev[i].active);
on('#regSave','click', async () => { const name=$('#regName').value.trim(); if(!name) return;
  await run(sb.from('regions').insert({name, climate:$('#regClimate').value, danger:+$('#regDanger').value, description:$('#regDesc').value, events:[]})); $('#regName').value=''; $('#regDesc').value=''; loadRegions(); });

/* ---------- armaria ---------- */
const RAR = {Artefato:'#78716c',Consumível:'#22c55e',Superior:'#3b82f6',Épico:'#a855f7',Lendário:'#f59e0b',Único:'#ef4444',Herança:'#06b6d4'};
let itemFilter = 'Todos';
async function loadItems(){
  const rows = await run(sb.from('items').select('*').order('created_at',{ascending:false}));
  $('#itemChips').innerHTML = ['Todos',...Object.keys(RAR)].map(r => '<button class="chip'+(r===itemFilter?' active':'')+'" data-r="'+r+'">'+r+(r==='Todos'?' ('+rows.length+')':'')+'</button>').join('');
  $$('#itemChips .chip').forEach(b => b.onclick = () => { itemFilter=b.dataset.r; loadItems(); });
  const list = rows.filter(i => itemFilter==='Todos' || i.rarity===itemFilter);
  $('#itemList').innerHTML = list.length ? list.map(i => '<div class="shop-card" style="border-color:'+RAR[i.rarity]+'66"><div class="row"><span class="ic">⚔️</span><div><h3 style="color:'+RAR[i.rarity]+'">'+esc(i.name)+'</h3><div class="cat">'+esc(i.rarity)+'</div></div></div><p>'+esc(i.description||'')+'</p>'+(isStaff()?'<button class="btn btn-sm" onclick="delRow(\'items\',\''+i.id+'\',loadItemsG)">Excluir</button>':'')+'</div>').join('') : '<div class="empty" style="grid-column:1/-1"><span class="big">⚔️</span><p>Nenhum equipamento cadastrado ainda.</p></div>';
}
window.loadItemsG = () => loadItems();
on('#itemSave','click', async () => { const name=$('#itemName').value.trim(); if(!name) return;
  await run(sb.from('items').insert({name, rarity:$('#itemRarity').value, description:$('#itemDesc').value})); $('#itemName').value=''; $('#itemDesc').value=''; loadItems(); });

/* ---------- missões ---------- */
async function loadMissions(){
  const rows = await run(sb.from('missions').select('*').order('created_at',{ascending:false}));
  const st = {aberta:'🟢 Aberta', aceita:'🟡 Em andamento', concluida:'✅ Concluída'};
  $('#misList').innerHTML = rows.length ? rows.map(m => '<div class="card" style="margin-bottom:10px"><b>📜 '+esc(m.title)+'</b> <span class="tiny muted">· '+esc(m.type)+' · '+esc(m.difficulty)+' · '+esc(m.guild)+'</span><div class="tiny" style="margin:4px 0">'+st[m.status]+(m.accepted_name?' — '+esc(m.accepted_name):'')+(m.reward?' · 💰 '+esc(m.reward):'')+'</div><p class="tiny muted" style="white-space:pre-line">'+esc(m.description||'')+'</p><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+
    (m.status==='aberta'?'<button class="btn btn-sm btn-primary" onclick="misAccept(\''+m.id+'\')">Aceitar</button>':'')+
    (isStaff()&&m.status!=='concluida'?'<button class="btn btn-sm" onclick="misDone(\''+m.id+'\')">Concluir</button>':'')+
    (isStaff()?'<button class="btn btn-sm" onclick="delRow(\'missions\',\''+m.id+'\',loadMissionsG)">Excluir</button>':'')+'</div></div>').join('') : '<div class="empty"><span class="big">📜</span><p>Nenhuma missão no quadro.</p></div>';
}
window.loadMissionsG = () => loadMissions();
window.misAccept = async id => { await run(sb.from('missions').update({status:'aceita', accepted_by:ME.id, accepted_name:PROF.username}).eq('id',id)); loadMissions(); };
window.misDone = async id => { await run(sb.from('missions').update({status:'concluida'}).eq('id',id)); loadMissions(); };
on('#misSave','click', async () => { const title=$('#misTitle').value.trim(); if(!title) return;
  await run(sb.from('missions').insert({title, type:$('#misType').value, difficulty:$('#misDiff').value, guild:$('#misGuild').value, reward:$('#misReward').value, description:$('#misDesc').value}));
  ['#misTitle','#misReward','#misDesc'].forEach(s => $(s).value=''); loadMissions(); });

/* ---------- admin ---------- */
async function loadAdmin(){
  $('#adminDenied').style.display = isStaff() ? 'none' : '';
  $('#adminBody').style.display = isStaff() ? '' : 'none'; if(!isStaff()) return;
  const rows = await run(sb.from('profiles').select('*').order('created_at'));
  $('#userList').innerHTML = rows.map(p => '<div class="card" style="margin-bottom:8px;display:flex;gap:10px;align-items:center"><b style="flex:1">👤 '+esc(p.username)+'</b><select class="field" style="width:130px" '+(isAdmin()?'':'disabled')+' onchange="setRole(\''+p.id+'\',this.value)">'+['jogador','mestre','admin'].map(r => '<option'+(r===p.role?' selected':'')+'>'+r+'</option>').join('')+'</select></div>').join('');
  const news = await run(sb.from('news').select('*').order('created_at',{ascending:false}).limit(10));
  $('#newsList').innerHTML = news.map(n => '<div class="card" style="margin-bottom:8px"><p style="font-size:13px;white-space:pre-line">'+esc(n.text)+'</p><button class="btn btn-sm" onclick="delRow(\'news\',\''+n.id+'\',loadAdminG)">Excluir</button></div>').join('');
}
window.loadAdminG = () => loadAdmin();
window.setRole = async (id,role) => { await run(sb.from('profiles').update({role}).eq('id',id)); toast('Papel atualizado.'); };
on('#newsSave','click', async () => { const t=$('#newsText').value.trim(); if(!t) return; await run(sb.from('news').insert({text:t, author:ME.id})); $('#newsText').value=''; loadAdmin(); });

/* ---------- arte IA (Pollinations, sem chave) ---------- */
let artType = 'Personagem', artStyle = 'Fantasy Art';
$$('#artTypes .quick-card').forEach(c => c.onclick = () => { $$('#artTypes .quick-card').forEach(x=>x.style.borderColor=''); c.style.borderColor='var(--accent)'; artType=c.dataset.t; });
$$('#artStyles .chip').forEach(c => c.onclick = () => { $$('#artStyles .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active'); artStyle=c.textContent; });
on('#artGo','click', () => { const d=$('#artDesc').value.trim(); if(!d) return toast('Descreva a imagem.');
  const p = artType+', '+d+', '+artStyle+', rpg, highly detailed';
  const img = $('#artImg'); img.style.display='none'; $('#artState').textContent='Gerando imagem...';
  img.onload = () => { img.style.display='block'; $('#artState').textContent=''; }; img.onerror = () => $('#artState').textContent='Falha ao gerar. Tente de novo.';
  img.src = 'https://image.pollinations.ai/prompt/'+encodeURIComponent(p)+'?width=768&height=768&nologo=true&seed='+Math.floor(Math.random()*1e6); });

/* ---------- ferramentas (offline) ---------- */
const SYL = ['ka','ra','el','mor','thal','vin','dra','zul','ia','nor','is','gar','len','os','ba','ur'];
const gen = f => () => { const box = $('#toolOut'); box.innerHTML = '<div style="white-space:pre-line">'+esc(f())+'</div><button class="btn btn-sm" style="margin-top:10px" onclick="this.closest(\'#toolPanel\').querySelector(\'.regen\').click()">🔁 Gerar de novo</button>'; };
const TOOLS = [
 ['✨','Nomes', () => Array.from({length:6},()=>{ const n=2+Math.floor(Math.random()*2); let s=''; for(let i=0;i<n;i++) s+=pick(SYL); return s[0].toUpperCase()+s.slice(1); }).join('\n')],
 ['🌦️','Clima', () => pick(['☀️ Céu limpo','🌧️ Chuva fina','⛈️ Tempestade com raios','🌫️ Neblina densa','❄️ Nevasca','🌪️ Vendaval','🔥 Calor sufocante','🌑 Noite sem lua'])],
 ['💎','Loot', () => pick(['Poção menor de cura','Adaga com runas fracas','Bolsa com '+(20+Math.floor(Math.random()*180))+' Kion','Fragmento de Ferrus','Pergaminho misterioso','Anel sem brilho (maldito?)','Cristal de Banla','Mapa rasgado de uma região'])],
 ['🧑‍🌾','NPC', () => 'Clã: '+pick(Object.keys(CLANS))+'\nOfício: '+pick(['mercador','guarda','curandeiro','ladrão','estalajadeiro','ferreiro','caçador','sábio'])+'\nTraço: '+pick(['desconfiado','generoso','covarde','ambicioso','leal','falastrão','sombrio'])+'\nSegredo: '+pick(['deve dinheiro a uma guilda','é espião','esconde um artefato','perdeu alguém querido'])],
 ['⚡','Plot Twist', () => pick(['O aliado é um traidor.','A missão foi plantada por um inimigo.','O alvo é inocente.','Uma guilda rival chega primeiro.','O item procurado já foi destruído.','O mestre da missão está morto há dias.','Um clã ancestral reivindica o local.'])],
 ['📜','Encontros', () => pick(['Bando de '+(2+Math.floor(Math.random()*5))+' goblins','Lobisomem solitário','Patrulha de vampiros','Mercador ferido na estrada','Zumbis saindo do solo','Anjo caído pedindo ajuda','Sentrie sem hospedeiro','Dragão ao longe'])],
 ['🎲','Dados', null], ['⏱️','Cronômetro', null], ['⬆️','Iniciativa', null], ['💥','Dano', null],
 ['🛒','Preços', '#/kionstore'], ['📋','Missões', '#/missoes'], ['📖','Notas', '#/notas']
];
window.renderTools = function(){
  const g = $('#toolGrid'); if(!g) return;
  g.innerHTML = TOOLS.map((t,i) => '<div class="tool-card" data-i="'+i+'"><div class="ic">'+t[0]+'</div><b>'+t[1]+'</b></div>').join('');
  $$('.tool-card', g).forEach(c => c.onclick = () => openTool(+c.dataset.i));
};
let clock = null;
function openTool(i){
  const [ic,name,f] = TOOLS[i], p = $('#toolPanel'); clearInterval(clock);
  if(typeof f === 'string'){ location.hash = f; return; }
  p.innerHTML = '<b style="display:block;margin-bottom:8px">'+ic+' '+name+'</b><div id="toolOut"></div>';
  if(f){ const go = gen(f); const r = document.createElement('button'); r.className='regen'; r.style.display='none'; r.onclick=go; p.appendChild(r); go(); return; }
  const o = $('#toolOut');
  if(name==='Dados'){ o.innerHTML = '<div class="chips">'+[4,6,8,10,12,20,100].map(s=>'<button class="chip" data-s="'+s+'">d'+s+'</button>').join('')+'</div><div class="die-result" style="margin-top:10px"><div class="num" id="tdn">—</div></div>'; $$('[data-s]',o).forEach(b => b.onclick = () => $('#tdn').textContent = rollDice(+b.dataset.s,1).total); }
  if(name==='Cronômetro'){ let s=0; o.innerHTML='<div class="die-result"><div class="num" id="tck">00:00</div></div><button class="btn btn-sm btn-primary" id="tgo">Iniciar</button> <button class="btn btn-sm" id="trs">Zerar</button>'; const show=()=>$('#tck').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    $('#tgo').onclick = () => { if(clock){ clearInterval(clock); clock=null; $('#tgo').textContent='Iniciar'; } else { clock=setInterval(()=>{s++;show()},1000); $('#tgo').textContent='Pausar'; } }; $('#trs').onclick = () => { s=0; show(); }; }
  if(name==='Iniciativa'){ o.innerHTML='<textarea class="field" id="ini" rows="4" placeholder="Um nome por linha"></textarea><button class="btn btn-sm btn-primary" id="inigo" style="margin-top:8px">Rolar iniciativa</button><div id="inir" style="margin-top:10px;white-space:pre-line"></div>';
    $('#inigo').onclick = () => { $('#inir').textContent = $('#ini').value.split('\n').map(s=>s.trim()).filter(Boolean).map(n=>({n,r:rollDice(20,1).total})).sort((a,b)=>b.r-a.r).map((x,k)=>(k+1)+'. '+x.n+' — '+x.r).join('\n'); }; }
  if(name==='Dano'){ o.innerHTML='<div class="sheet-row"><div><label class="tiny muted">Potência do ataque (x)</label><input class="field" id="dp" type="number" value="50"></div><div><label class="tiny muted">Resistência do alvo (x)</label><input class="field" id="dr" type="number" value="20"></div></div><div class="die-result"><div class="num" id="dres">—</div><div class="lbl" id="dlbl">Diferença entre potência e resistência</div></div>';
    const upd=()=>{ const d=(+$('#dp').value||0)-(+$('#dr').value||0); $('#dres').textContent=(d>0?'+':'')+d+'x'; $('#dlbl').textContent=d>0?'O ataque supera a resistência':'Resistência absorve o ataque'; }; $('#dp').oninput=upd; $('#dr').oninput=upd; upd(); }
}

/* ---------- limpeza de legado ---------- */
window.initNotes = () => {};
})();
