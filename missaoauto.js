/* MENPHIS — Missão Automático: a IA interna gera missões infinitas (10 escolhas cada). O navegador só mostra o que o servidor devolve
   e envia o NÚMERO da opção escolhida; nada digitado é interpretado, então não há como "induzir" a IA. */
(function(){
'use strict';
const $ = (s,r=document) => r.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
const S = () => window.MENPHIS_SB, me = () => window.MENPHIS_USER;
const money = n => Number(n || 0).toLocaleString('pt-BR');
const key = () => (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
window.MENPHIS_MAI = true;

const STAT = {strength: ['💪', 'Força'], speed: ['⚡', 'Velocidade'], intelligence: ['🧠', 'Inteligência'], magic_capacity: ['✨', 'Mana'], weapon_mastery: ['⚔️', 'Maestria'], physical_resistance: ['🛡️', 'Res. Física'], magic_resistance: ['🔮', 'Res. Mágica']};
const HINT = {'Favorável': 'good', 'Arriscado': 'mid', 'Difícil': 'hard', 'Quase impossível': 'bad', 'Sem teste': 'none'};
const RESULT = {win: ['✅', 'Vitória'], partial: ['🟡', 'Sucesso parcial'], lose: ['❌', 'Derrota'], abandon: ['🏳️', 'Missão abandonada'], flee: ['🏃', 'Fuga']};
let VIEW = null, busy = false, tgen = 0, skip = false, chars = [];

async function rpc(name, args){
  const r = await S().rpc(name, args);
  if(r.error){ const m = r.error.message || ''; toast(/mission_ai|function|schema cache|does not exist/i.test(m) ? 'Rode o update_v7.sql no Supabase.' : m); throw r.error; }
  return r.data;
}

/* ---------- digitação ---------- */
function typeInto(el, text){
  const g = ++tgen; skip = false;
  return new Promise(res => { let i = 0; el.classList.add('typing');
    (function step(){ if(g !== tgen){ res(); return; } if(skip || i >= text.length){ el.textContent = text; el.classList.remove('typing'); res(); return; }
      el.textContent = text.slice(0, ++i); const b = $('#maBox'); if(b) b.scrollTop = b.scrollHeight; setTimeout(step, 12 + Math.random() * 12); })(); });
}
document.addEventListener('click', e => { if(e.target.closest('#maBox')) skip = true; });

/* ---------- lista / início ---------- */
async function load(){
  if(!$('#maAuto')) return;
  if(!me()){ $('#maHome').innerHTML = '<div class="empty"><span class="big">🤖</span><p>Entre na sua conta para jogar as missões automáticas.</p></div>'; $('#maPlay').style.display = 'none'; return; }
  chars = (window.MENPHIS_CH ? window.MENPHIS_CH() : []).filter(c => c.owner === me().id);
  const sel = $('#maChar'), prev = sel.value;
  sel.innerHTML = chars.length ? chars.map(c => '<option value="' + c.id + '">' + esc(c.name) + ' · Nv ' + (c.level || 1) + '</option>').join('') : '<option value="">Crie um personagem primeiro</option>';
  if(prev && chars.some(c => c.id === prev)) sel.value = prev;
  else { const pp = localStorage.getItem('menphis-profile'); if(pp && chars.some(c => c.id === pp)) sel.value = pp; }
  $('#maRanks').innerHTML = ''; $('#maInfo').textContent = '';
  if(!sel.value){ $('#maRanks').innerHTML = '<div class="empty"><span class="big">🧙</span><p>Você precisa de um personagem. Vá em <a href="#/personagens">Personagens</a>.</p></div>'; return; }
  const L = await rpc('mission_ai_list', {p_char: sel.value});
  $('#maInfo').innerHTML = '📅 Missões nas últimas 24h: <b>' + L.used + '/' + L.limit + '</b> · 🎁 Recompensa: <b>' + L.pct + '%</b> do valor do livro' + (L.enabled ? '' : ' · <b style="color:#fca5a5">desativado pelo admin</b>');
  if(L.active){
    $('#maRanks').innerHTML = '<div class="ma-resume"><b>🧭 Você tem uma missão em andamento.</b><button class="btn btn-primary" id="maResume" type="button">Continuar missão</button></div>';
    $('#maResume').onclick = () => start(null, L.active);
    return;
  }
  $('#maRanks').innerHTML = L.ranks.sort((a, b) => a.xp - b.xp).map(r => '<div class="ma-rank' + (r.locked ? ' lock' : '') + '"><div><b>' + esc(r.rank) + '</b><small>' + (r.locked ? '🔒 exige nível ' + r.min_level : '10 escolhas · missão inédita') + '</small></div><div class="ma-rw">⭐ ' + r.xp + ' XP · 💰 ' + money(r.tarjas) + '</div><button class="btn btn-sm btn-primary" data-rank="' + esc(r.rank) + '"' + (r.locked || !L.enabled || L.used >= L.limit ? ' disabled' : '') + '>Gerar missão</button></div>').join('');
}

async function start(rank, sessionId){
  if(busy) return; busy = true;
  try {
    VIEW = sessionId ? await rpc('mission_ai_view', {p_session: sessionId}) : await rpc('mission_ai_start', {p_char: $('#maChar').value, p_rank: rank});
    $('#maHome').style.display = 'none'; $('#maPlay').style.display = ''; $('#maLog').innerHTML = ''; (VIEW.log || []).forEach(addLog);
    await renderView(true);
  } catch(e){} busy = false;
}

/* ---------- jogo ---------- */
function addLog(s){ $('#maLog').insertAdjacentHTML('beforeend', '<div class="ma-lg ' + (s.success ? 'ok' : 'no') + '"><b>' + esc(s.choice) + '</b> ' + (s.roll != null ? '🎲 ' + s.roll + (s.bonus ? '+' + s.bonus : '') + ' vs ' + s.dc + ' — ' : '') + esc(s.text) + '</div>'); }
function head(v){
  const total = v.total || 10, made = v.made || 0;
  $('#maTitle').textContent = v.title || 'Missão'; $('#maRankTag').textContent = v.rank || '';
  $('#maProg').style.width = Math.min(100, made / total * 100) + '%'; $('#maProgTxt').textContent = v.status === 'done' ? 'Missão encerrada' : 'Escolha ' + Math.min(made + 1, total) + ' de ' + total;
  const hp = Math.max(0, v.hp); $('#maHp').textContent = '♥'.repeat(hp) + '♡'.repeat(Math.max(0, 5 - hp));
}
async function renderView(animate){
  const v = VIEW; head(v); const box = $('#maBox'); $('#maOpts').innerHTML = ''; $('#maEnd').style.display = 'none';
  const line = document.createElement('p'); line.className = 'ma-narr'; box.innerHTML = ''; box.appendChild(line);
  if(animate) await typeInto(line, v.text); else line.textContent = v.text;
  if(v.status === 'done') return showEnd(v);
  $('#maOpts').innerHTML = (v.options || []).map(o => { const st = STAT[o.stat]; return '<button class="ma-opt ' + (HINT[o.hint] || 'none') + '" data-opt="' + o.i + '"><span class="ma-t">' + esc(o.text) + '</span><span class="ma-m">' + (st ? st[0] + ' ' + st[1] : '🕊️ sem teste') + ' · <em>' + esc(o.hint) + '</em></span></button>'; }).join('');
}
async function choose(i){
  if(busy || !VIEW) return; busy = true; $$('#maOpts .ma-opt').forEach(b => b.disabled = true);
  try {
    const r = await rpc('mission_ai_choose', {p_session: VIEW.session, p_opt: i}); const s = r.step;
    const box = $('#maBox'); box.innerHTML = '';
    const roll = document.createElement('div'); roll.className = 'ma-roll ' + (s.success ? 'ok' : 'no');
    roll.innerHTML = '<b>' + esc(s.choice) + '</b><br>' + (s.roll != null ? '🎲 d20 <b>' + s.roll + '</b>' + (s.bonus ? ' +' + s.bonus : '') + ' contra <b>' + s.dc + '</b> — ' : '') + (s.success ? '<span class="g">sucesso</span>' : '<span class="r">falha</span>');
    box.appendChild(roll); const p = document.createElement('p'); p.className = 'ma-narr'; box.appendChild(p); await typeInto(p, s.text);
    addLog(s); VIEW = r.view; await new Promise(res => setTimeout(res, 450)); await renderView(true);
  } catch(e){ $$('#maOpts .ma-opt').forEach(b => b.disabled = false); } busy = false;
}
function showEnd(v){
  const r = RESULT[v.result] || ['🏁', 'Fim']; const rw = v.reward || {}; const e = $('#maEnd'); e.style.display = '';
  e.innerHTML = '<h3>' + r[0] + ' ' + r[1] + '</h3><div class="ma-rwd"><span>⭐ +' + (rw.xp || 0) + ' XP</span><span>💰 +' + money(rw.tarjas) + ' tarjas</span>' + (rw.hero ? '<span>🕊️ herói +' + rw.hero + '</span>' : '') + (rw.villain ? '<span>😈 vilão +' + rw.villain + '</span>' : '') + (rw.heat ? '<span>🚨 procurado +' + rw.heat + '</span>' : '') + '</div>' +
    (v.result !== 'abandon' ? '<p class="tiny muted" style="margin-top:8px">🕵️ Suas ações deixaram rastros (visibilidade: <b>' + esc(rw.visibility || 'discreto') + '</b>). Outros jogadores podem comprar informações sobre você na Rede de Informantes.</p>' : '') +
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary" id="maAgain" type="button">🎲 Nova missão</button><a class="btn" href="#/personagens">📜 Ver ficha</a></div>';
  $('#maAgain').onclick = () => { VIEW = null; $('#maPlay').style.display = 'none'; $('#maHome').style.display = ''; load().catch(() => {}); if(window.MENPHIS_REFRESH) window.MENPHIS_REFRESH(); };
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const r = e.target.closest('#maRanks [data-rank]'); if(r) start(r.dataset.rank);
  const o = e.target.closest('#maOpts [data-opt]'); if(o) choose(+o.dataset.opt);
  if(e.target.closest('#maLogBtn')){ const l = $('#maLog'); l.style.display = l.style.display === 'none' ? '' : 'none'; }
  if(e.target.closest('#maAbandon') && VIEW && VIEW.status === 'active' && confirm('Abandonar a missão? Você perde a recompensa (e a tentativa conta no limite diário).')){
    rpc('mission_ai_abandon', {p_session: VIEW.session}).then(() => rpc('mission_ai_view', {p_session: VIEW.session})).then(v => { VIEW = v; renderView(false); }).catch(() => {}); }
});
document.addEventListener('change', e => { if(e.target.id === 'maChar') load().catch(() => {}); });
function modes(){ const auto = key() === 'missao-auto'; const a = $('#maAuto'), mn = $('#vnManual'); if(!a || !mn) return;
  a.style.display = auto ? '' : 'none'; mn.style.display = auto ? 'none' : ''; $('#modeAuto').classList.toggle('active', auto); $('#modeManual').classList.toggle('active', !auto);
  const h = $('#view-jogo .page-title'); if(h) h.textContent = auto ? '🤖 Missão Automático' : '🎮 Jogo de Narração';
  const sub = $('#view-jogo .page-sub'); if(sub) sub.textContent = auto ? 'Missões infinitas geradas pela IA interna: 10 escolhas, só clicar' : 'Aventura interativa em tempo real: o narrador fala, mostra cenas e abre até 5 escolhas'; }
function route(){ modes(); if(key() === 'missao-auto') load().catch(() => {}); if(key() === 'admin') adminCard().catch(() => {}); }
window.addEventListener('hashchange', route); window.addEventListener('menphis-ready', route);

/* ---------- painel do admin: liga/desliga, % de recompensa, limite diário ---------- */
async function adminCard(){
  const p = window.MENPHIS_PROF; if(!p || p.role !== 'admin' || !$('#adminBody')) return;
  if(!$('#maAdminCard')){
    $('#adminBody').insertAdjacentHTML('afterbegin', '<div class="card admin-only" id="maAdminCard" style="margin-bottom:14px"><b>🤖 Missão Automático</b><p class="tiny muted" style="margin:6px 0 10px">Controla as missões geradas pela IA interna.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><label class="tiny muted"><input type="checkbox" id="maOn"> ativado</label><label class="tiny muted">Recompensa (% do livro)<input class="field" id="maPct" type="number" min="0" max="100" style="width:110px"></label><label class="tiny muted">Máx. missões / 24h por personagem<input class="field" id="maLim" type="number" min="0" max="20" style="width:110px"></label><button class="btn btn-primary" id="maSaveCfg" type="button">Salvar</button></div><p class="tiny" id="maCfgMsg" style="margin-top:8px;color:#fcd34d"></p></div>');
    $('#maSaveCfg').onclick = async () => { try { await rpc('admin_mai_config', {p_enabled: $('#maOn').checked, p_pct: +$('#maPct').value || 0, p_limit: +$('#maLim').value || 0}); $('#maCfgMsg').textContent = 'Configuração salva.'; } catch(e){} };
  }
  const {data} = await S().from('mission_ai_config').select('*').eq('id', 1).maybeSingle();
  if(data){ $('#maOn').checked = data.enabled; $('#maPct').value = data.reward_pct; $('#maLim').value = data.daily_limit; }
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', modes); else modes();
})();
