/* MENPHIS — IA (Gemini): assistente do livro de regras + geração de imagens */
(function(){
'use strict';
const cfg = window.MENPHIS_CONFIG || {};
const KB = window.RPG_KB || [];
const $ = (s,r=document) => r.querySelector(s);
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const TEXT_MODEL = cfg.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const IMG_MODEL  = cfg.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const hasKey = () => cfg.GEMINI_API_KEY && !/COLE/.test(cfg.GEMINI_API_KEY);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function gemini(model, body){
  const r = await fetch(API + model + ':generateContent', {
    method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':cfg.GEMINI_API_KEY}, body:JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error((j.error && j.error.message) || ('Erro ' + r.status));
  return j;
}

/* ---------- busca nos trechos do livro (RAG simples, sem servidor) ---------- */
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const STOP = new Set('para como qual quais quem onde quando que uma uns umas dos das nos nas com sem por mais menos isso esse essa este esta ele ela eles elas pode podem ser tem ter sao foi sua seu suas seus meu minha muito sobre entre sobre ate tambem ainda cada todo toda todos todas qual voce voces'.split(' '));
const tok = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
const stem = w => w.replace(/(es|s)$/,'');
const index = KB.map(c => { const words = tok(c.t + ' ' + c.x).map(stem); const tf = {}; words.forEach(w => tf[w] = (tf[w]||0) + 1); return {c, tf, len: words.length}; });
const df = {}; index.forEach(d => Object.keys(d.tf).forEach(w => df[w] = (df[w]||0) + 1));
const CLAN_TITLES = [...new Set(KB.filter(c => c.t.startsWith('Clã ')).map(c => norm(c.t.replace(/\s*\(.*\)/,'').replace('Clã ','')).trim()))];
function retrieve(q, k){
  const qs = [...new Set(tok(q).map(stem))];
  const nq = ' ' + norm(q) + ' ';
  const named = CLAN_TITLES.filter(t => t.split(' / ').some(n => n.length > 3 && nq.includes(n.slice(0, Math.max(4, n.length - 1)))));
  const scored = index.map(d => {
    let s = 0;
    qs.forEach(w => { if(d.tf[w]) s += (1 + Math.log(d.tf[w])) * Math.log(1 + index.length / (df[w]||1)); });
    if(d.c.t.startsWith('Clã ')){
      const title = norm(d.c.t.replace(/\s*\(.*\)/,'').replace('Clã ','')).trim();
      if(named.includes(title)) s += 14; else s *= named.length ? 0.3 : 0.4;
    } else if(s > 0) s *= 1.25;
    return {d, s};
  }).filter(x => x.s > 0).sort((a,b) => b.s - a.s).slice(0, k);
  return scored.map(x => x.d.c);
}

const SYSTEM = `Você é o "Guardião de Quanti", assistente do RPG de mesa MENPHIS (mundo de Quanti, clãs, mana, EP, runas, guildas, missões).
Responda SEMPRE em português do Brasil, de forma clara e objetiva, usando SOMENTE os trechos do livro fornecidos abaixo como fonte.
- Se a resposta não estiver nos trechos, diga que isso não consta no livro de regras e sugira perguntar ao narrador/admin. Nunca invente regras, números ou habilidades.
- Ao citar valores (atributos "x", custos, XP, recompensas), copie exatamente do livro.
- Pode fazer contas simples quando o livro der a fórmula (ex.: mana inicial, EP), mostrando o passo a passo.
- Seja conciso; use listas curtas quando ajudar. Não mencione "trechos" nem "contexto" ao usuário; fale como quem conhece o livro.`;

const history = [];
async function ask(question){
  const ctx = retrieve(question + ' ' + (history.slice(-2).map(h => h.q).join(' ')), 7);
  const context = ctx.map(c => '### ' + c.t + '\n' + c.x).join('\n\n');
  const contents = [];
  history.slice(-6).forEach(h => { contents.push({role:'user',parts:[{text:h.q}]}); contents.push({role:'model',parts:[{text:h.a}]}); });
  contents.push({role:'user', parts:[{text: 'TRECHOS DO LIVRO:\n' + context + '\n\nPERGUNTA DO JOGADOR: ' + question}]});
  const j = await gemini(TEXT_MODEL, { systemInstruction:{parts:[{text:SYSTEM}]}, contents, generationConfig:{temperature:0.3, maxOutputTokens:1200} });
  const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const text = parts ? parts.map(p => p.text || '').join('').trim() : '';
  if(!text) throw new Error('A IA não retornou resposta (pode ter sido bloqueada). Reformule a pergunta.');
  history.push({q:question, a:text});
  return text;
}
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/^\s*[-*•]\s+/gm,'• ').replace(/\n/g,'<br>');

/* ---------- interface do chat ---------- */
const fab = $('#chatFab'), panel = $('#chatPanel'), log = $('#chatLog'), input = $('#chatInput');
function addMsg(role, html){ const d = document.createElement('div'); d.className = 'msg ' + role; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
function toggleChat(open){ const o = open === undefined ? !panel.classList.contains('open') : open; panel.classList.toggle('open', o); fab.classList.toggle('open', o); if(o) setTimeout(() => input.focus(), 300); }
if(fab){
  fab.addEventListener('click', () => toggleChat());
  $('#chatClose').addEventListener('click', () => toggleChat(false));
  addMsg('bot', 'Olá! Sou o <b>Guardião de Quanti</b>. Pergunte sobre clãs, atributos, mana, EP, runas, missões, guildas, treino e mais — respondo com base no livro de regras. ⚔️');
  $('#chatSugg').addEventListener('click', e => { const b = e.target.closest('button'); if(b){ input.value = b.textContent; send(); } });
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); send(); });
  let busy = false;
  async function send(){
    const q = input.value.trim(); if(!q || busy) return;
    if(!hasKey()){ addMsg('bot','Configure <code>GEMINI_API_KEY</code> no config.js para ativar o assistente.'); return; }
    busy = true; input.value = ''; $('#chatSugg').style.display = 'none';
    addMsg('me', esc(q));
    const typing = addMsg('bot typing', '<i></i><i></i><i></i>');
    try { const a = await ask(q); typing.remove(); addMsg('bot', md(a)); }
    catch(err){ typing.remove(); addMsg('bot err', '⚠️ ' + esc(err.message)); }
    busy = false;
  }
}

/* ---------- Arte IA (Gemini) — usada pelo app.js ---------- */
window.geminiImage = async function(prompt){
  const j = await gemini(IMG_MODEL, { contents:[{parts:[{text:prompt}]}], generationConfig:{responseModalities:['TEXT','IMAGE']} });
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const img = parts.find(p => p.inlineData || p.inline_data);
  if(!img){ const t = parts.map(p => p.text||'').join(' ').trim(); throw new Error(t || 'O Gemini não retornou imagem (conteúdo bloqueado ou cota esgotada).'); }
  const d = img.inlineData || img.inline_data;
  return 'data:' + (d.mimeType || d.mime_type || 'image/png') + ';base64,' + d.data;
};
window.hasGeminiKey = hasKey;
})();
