/* MENPHIS — Jogo de Narração (visual novel em tempo real): o narrador exibe cenas, fala ao vivo e abre até 5 escolhas */
(function(){
'use strict';
const $ = (s,r=document) => r.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); };
const S = () => window.MENPHIS_SB, me = () => window.MENPHIS_USER;
const staff = () => { const p = window.MENPHIS_PROF; return !!p && (p.role === 'mestre' || p.role === 'admin'); };
window.MENPHIS_VN = true;

let SES = null, SCENES = [], CHOICES = [], chan = null, gen = 0, skip = false, tq = Promise.resolve(), editing = null, edImg = '';
const scene = () => SCENES.find(s => s.id === (SES && SES.current_scene));
async function q(p){ const r = await p; if(r.error){ toast(/vn_|relation|schema cache/i.test(r.error.message) ? 'Rode o update_v5.sql no Supabase.' : r.error.message); throw r.error; } return r.data; }
const key = () => (location.hash.replace(/^#\/?/, '') || '').split('?')[0];

/* ---------- lista de sessões ---------- */
async function loadList(){
  const box = $('#vnList'); if(!box) return;
  if(!me()){ box.innerHTML = '<div class="empty"><span class="big">🎮</span><p>Entre na sua conta para jogar.</p></div>'; return; }
  $('#vnRoom').style.display = 'none'; $('#vnHome').style.display = '';
  const rows = await q(S().from('vn_sessions').select('*').order('created_at', {ascending: false}));
  box.innerHTML = rows.length ? rows.map(r => '<div class="card" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1"><b>🎮 ' + esc(r.title) + '</b><div class="tiny muted">' + new Date(r.created_at).toLocaleDateString('pt-BR') + '</div></div><button class="btn btn-sm btn-primary" data-open="' + r.id + '">Entrar</button>' + (staff() ? '<button class="btn btn-sm" data-del="' + r.id + '">Excluir</button>' : '') + '</div>').join('')
    : '<div class="empty"><span class="big">🎮</span><p>Nenhuma aventura criada ainda.</p></div>';
}
document.addEventListener('click', async e => {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  if(o && o.closest('#vnList')) openSession(o.dataset.open).catch(() => {});
  if(d && d.closest('#vnList') && confirm('Excluir esta aventura e todas as cenas?')){ await q(S().from('vn_sessions').delete().eq('id', d.dataset.del)); loadList(); }
});

/* ---------- sala ---------- */
async function openSession(id){
  SES = await q(S().from('vn_sessions').select('*').eq('id', id).single());
  SCENES = await q(S().from('vn_scenes').select('*').eq('session_id', id).order('position').order('created_at'));
  CHOICES = await q(S().from('vn_choices').select('*').eq('session_id', id));
  $('#vnHome').style.display = 'none'; $('#vnRoom').style.display = ''; $('#vnTitle').textContent = SES.title;
  const mine = (window.MENPHIS_CH ? window.MENPHIS_CH() : []).filter(c => c.owner === me().id);
  $('#vnChar').innerHTML = '<option value="">Jogar como: ' + esc(window.MENPHIS_PROF ? window.MENPHIS_PROF.username : 'jogador') + '</option>' + mine.map(c => '<option>' + esc(c.name) + '</option>').join('');
  if(chan) S().removeChannel(chan);
  chan = S().channel('vn' + id)
    .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'vn_sessions', filter: 'id=eq.' + id}, async p => { const prev = SES.current_scene; SES = p.new; if(prev !== SES.current_scene) await showScene(true); renderChoices(); renderPanel(); })
    .on('postgres_changes', {event: '*', schema: 'public', table: 'vn_scenes', filter: 'session_id=eq.' + id}, async () => { SCENES = await q(S().from('vn_scenes').select('*').eq('session_id', id).order('position').order('created_at')); renderChoices(); renderPanel(); })
    .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'vn_lines', filter: 'session_id=eq.' + id}, p => { if(p.new.scene_id === SES.current_scene) addLine(p.new, true); })
    .on('postgres_changes', {event: '*', schema: 'public', table: 'vn_choices', filter: 'session_id=eq.' + id}, async () => { CHOICES = await q(S().from('vn_choices').select('*').eq('session_id', id)); renderChoices(); renderPanel(); })
    .subscribe();
  await showScene(false); renderChoices(); renderPanel();
}

/* ---------- efeito de digitação ---------- */
function typeInto(el, text, g){
  return new Promise(res => { let i = 0; skip = false; el.classList.add('typing');
    (function step(){ if(g !== gen){ res(); return; } if(skip){ el.textContent = text; el.classList.remove('typing'); res(); return; }
      el.textContent = text.slice(0, ++i); const b = $('#vnBox'); b.scrollTop = b.scrollHeight;
      if(i >= text.length){ el.classList.remove('typing'); res(); return; } setTimeout(step, 14 + Math.random() * 14); })(); });
}
function addLine(l, animate){
  const box = $('#vnBox'), d = document.createElement('div'); d.className = 'vn-line';
  d.innerHTML = (l.speaker ? '<b>' + esc(l.speaker) + ':</b> ' : '') + '<span></span>'; box.appendChild(d);
  const sp = d.querySelector('span'), g = gen;
  if(animate) tq = tq.then(() => typeInto(sp, l.text, g)); else sp.textContent = l.text;
  box.scrollTop = box.scrollHeight;
}
async function showScene(animate){
  gen++; tq = Promise.resolve(); const g = gen, sc = scene(), box = $('#vnBox'); box.innerHTML = '';
  const img = $('#vnImg'); $('#vnSceneName').textContent = sc ? sc.name : ''; $('#vnStatus').textContent = sc ? sc.status : '';
  if(sc && sc.image_url){ img.src = sc.image_url; img.style.display = ''; } else img.style.display = 'none';
  $('#vnStage').classList.toggle('empty', !sc);
  if(!sc){ box.innerHTML = '<p class="muted" style="text-align:center">⏳ Aguardando o narrador exibir a próxima cena...</p>'; return; }
  const lines = await q(S().from('vn_lines').select('*').eq('scene_id', sc.id).order('created_at'));
  if(g !== gen) return;
  const d = document.createElement('div'); d.className = 'vn-line'; d.innerHTML = '<span></span>'; box.appendChild(d);
  if(animate){ tq = tq.then(() => typeInto(d.firstChild, sc.description, g)); lines.forEach(l => addLine(l, true)); }
  else { d.firstChild.textContent = sc.description; lines.forEach(l => addLine(l, false)); }
}
document.addEventListener('click', e => { if(e.target.closest('#vnBox')) skip = true; });

/* ---------- escolhas (jogador) ---------- */
function renderChoices(){
  const box = $('#vnChoices'); if(!box || !SES) return; const sc = scene();
  const mineSel = sc && CHOICES.find(c => c.scene_id === sc.id && c.user_id === me().id);
  if(!sc || !(sc.choices || []).length){ box.innerHTML = ''; return; }
  if(!SES.choices_open){ box.innerHTML = mineSel ? '<p class="tiny muted" style="text-align:center">Você escolheu: <b>' + esc(mineSel.choice_text) + '</b></p>' : ''; return; }
  box.innerHTML = '<p class="tiny muted" style="text-align:center;margin-bottom:6px">Faça sua escolha:</p>' + sc.choices.map((c, i) => '<button class="vn-choice' + (mineSel && mineSel.choice_index === i ? ' on' : '') + '" data-ch="' + i + '">' + esc(c.text) + '</button>').join('');
}
document.addEventListener('click', async e => {
  const b = e.target.closest('#vnChoices [data-ch]'); if(!b || !SES) return; const sc = scene(), i = +b.dataset.ch; if(!sc || !SES.choices_open) return;
  const row = {session_id: SES.id, scene_id: sc.id, choice_index: i, choice_text: sc.choices[i].text, username: window.MENPHIS_PROF ? window.MENPHIS_PROF.username : '', character_name: $('#vnChar').value || ''};
  await q(S().from('vn_choices').upsert(row, {onConflict: 'scene_id,user_id'}));
});

/* ---------- painel do narrador ---------- */
function renderPanel(){
  const p = $('#vnScenes'); if(!p || !staff() || !SES) return; const cur = SES.current_scene;
  p.innerHTML = SCENES.length ? SCENES.map((s, i) => '<div class="vn-sc' + (s.id === cur ? ' on' : '') + '"><b>' + (i + 1) + '. ' + esc(s.name) + '</b><small>' + ((s.choices || []).length) + ' escolha(s)</small><div><button class="btn btn-sm btn-primary" data-show="' + s.id + '">▶ Exibir</button> <button class="btn btn-sm" data-edit="' + s.id + '">✎</button> <button class="btn btn-sm" data-rm="' + s.id + '">🗑</button></div></div>').join('') : '<p class="tiny muted">Nenhuma cena criada. Clique em "+ Nova cena".</p>';
  const sc = scene(), tally = $('#vnTally'); $('#vnToggle').textContent = SES.choices_open ? '🔒 Fechar escolhas' : '🗳️ Abrir escolhas'; $('#vnToggle').disabled = !sc || !(sc.choices || []).length;
  if(!sc || !(sc.choices || []).length){ tally.innerHTML = ''; return; }
  const votes = CHOICES.filter(c => c.scene_id === sc.id);
  tally.innerHTML = sc.choices.map((c, i) => { const v = votes.filter(x => x.choice_index === i); return '<div class="vn-vote"><div><b>' + (i + 1) + ') ' + esc(c.text) + '</b> — ' + v.length + ' voto(s)<br><small>' + (v.map(x => esc(x.character_name || x.username)).join(', ') || '—') + '</small></div><button class="btn btn-sm" data-follow="' + i + '">➡ Seguir</button></div>'; }).join('');
}
document.addEventListener('click', async e => {
  if(!SES || !staff()) return; const t = e.target;
  const show = t.closest('[data-show]'), ed = t.closest('[data-edit]'), rm = t.closest('[data-rm]'), fo = t.closest('[data-follow]');
  if(show){ await q(S().from('vn_sessions').update({current_scene: show.dataset.show, choices_open: false}).eq('id', SES.id)); }
  if(ed) openEditor(SCENES.find(s => s.id === ed.dataset.edit));
  if(rm && confirm('Excluir esta cena?')){ await q(S().from('vn_scenes').delete().eq('id', rm.dataset.rm)); }
  if(fo){ const sc = scene(), c = sc.choices[+fo.dataset.follow];
    await q(S().from('vn_lines').insert({session_id: SES.id, scene_id: sc.id, speaker: 'Sistema', text: 'O grupo escolheu: ' + c.text}));
    if(c.next && SCENES.find(s => s.id === c.next)) await q(S().from('vn_sessions').update({current_scene: c.next, choices_open: false}).eq('id', SES.id));
    else await q(S().from('vn_sessions').update({choices_open: false}).eq('id', SES.id)); }
});
function say(){
  const sc = scene(); const t = $('#vnSay').value.trim(); if(!t) return;
  if(!sc) return toast('Exiba uma cena primeiro.');
  q(S().from('vn_lines').insert({session_id: SES.id, scene_id: sc.id, speaker: $('#vnSpeaker').value.trim(), text: t})).then(() => { $('#vnSay').value = ''; });
}
function bind(){
  const on = (id, ev, fn) => { const el = $(id); if(el) el.addEventListener(ev, fn); };
  on('#vnNew', 'click', async () => { const t = $('#vnNewTitle').value.trim(); if(!t) return; await q(S().from('vn_sessions').insert({title: t})); $('#vnNewTitle').value = ''; loadList(); });
  on('#vnBack', 'click', () => { if(chan){ S().removeChannel(chan); chan = null; } SES = null; loadList(); });
  on('#vnSayBtn', 'click', say); on('#vnSay', 'keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); say(); } });
  on('#vnToggle', 'click', async () => { await q(S().from('vn_sessions').update({choices_open: !SES.choices_open}).eq('id', SES.id)); });
  on('#vnAddScene', 'click', () => openEditor(null));
  on('#edCancel', 'click', () => { $('#vnEditor').style.display = 'none'; });
  on('#edFile', 'change', async e => { const f = e.target.files[0]; if(!f) return; try { edImg = await window.MENPHIS_IMG(f, 800, .8); $('#edPrev').src = edImg; $('#edPrev').style.display = 'block'; $('#edUrl').value = ''; } catch(err){ toast('Não consegui ler essa imagem.'); } });
  on('#edUrl', 'input', e => { if(e.target.value){ edImg = ''; $('#edPrev').src = e.target.value; $('#edPrev').style.display = 'block'; } });
  on('#edSave', 'click', saveScene);
}
function openEditor(sc){
  editing = sc ? sc.id : null; edImg = ''; const ed = $('#vnEditor'); ed.style.display = 'block';
  $('#edName').value = sc ? sc.name : ''; $('#edDesc').value = sc ? sc.description : ''; $('#edStatus').value = sc ? sc.status : '';
  const img = sc ? sc.image_url : ''; edImg = img && img.startsWith('data:') ? img : ''; $('#edUrl').value = img && !img.startsWith('data:') ? img : '';
  $('#edPrev').src = img || ''; $('#edPrev').style.display = img ? 'block' : 'none';
  const opts = '<option value="">(continua na mesma cena)</option>' + SCENES.filter(s => s.id !== editing).map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
  $('#edChoices').innerHTML = [0, 1, 2, 3, 4].map(i => { const c = sc && (sc.choices || [])[i] || {}; return '<div class="ed-ch"><input class="field" placeholder="Escolha ' + (i + 1) + (i ? ' (opcional)' : '') + '" value="' + esc(c.text || '') + '"><select class="field">' + opts.replace('value="' + (c.next || '__') + '"', 'value="' + c.next + '" selected') + '</select></div>'; }).join('');
  ed.scrollIntoView({behavior: 'smooth', block: 'center'});
}
async function saveScene(){
  const name = $('#edName').value.trim(); if(!name) return toast('Dê um nome à cena.');
  const choices = $$('#edChoices .ed-ch').map(r => ({text: r.querySelector('input').value.trim(), next: r.querySelector('select').value || null})).filter(c => c.text).slice(0, 5);
  const row = {session_id: SES.id, name, description: $('#edDesc').value.trim(), status: $('#edStatus').value.trim(), image_url: edImg || $('#edUrl').value.trim(), choices};
  if(editing) await q(S().from('vn_scenes').update(row).eq('id', editing)); else await q(S().from('vn_scenes').insert(Object.assign(row, {position: SCENES.length})));
  $('#vnEditor').style.display = 'none'; toast('Cena salva.');
  SCENES = await q(S().from('vn_scenes').select('*').eq('session_id', SES.id).order('position').order('created_at')); renderPanel(); renderChoices();
}

function route(){ if(key() === 'jogo') loadList().catch(() => {}); }
window.addEventListener('hashchange', route); window.addEventListener('menphis-ready', route);
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
