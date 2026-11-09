/* MENPHIS — IA (Gemini): assistente do livro de regras + geração de imagens */
(function(){
'use strict';
const KB = window.RPG_KB || [];
const $ = (s,r=document) => r.querySelector(s);
const aiReady = () => !!(window.MENPHIS_SB && window.MENPHIS_USER && window.MENPHIS_AI_READY);
const hasKey = aiReady;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* chamada ao Gemini via Edge Function "gemini" (a chave fica no servidor; só o admin a define) */
async function gemini(kind, body){
  const sb = window.MENPHIS_SB;
  if(!sb || !window.MENPHIS_USER) throw new Error('Entre na sua conta para usar a IA.');
  const {data, error} = await sb.functions.invoke('gemini', {body:{kind, payload:body}});
  if(error){
    let msg = error.message || 'Falha ao chamar a IA.';
    try { const j = await error.context.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch(e){}
    if(/not found|404|Failed to send|fetch/i.test(msg) && !/chave|login|IA/i.test(msg)) msg = 'A função "gemini" não está publicada no Supabase (veja o README, passo da Edge Function).';
    throw new Error(String(msg));
  }
  if(data && data.error) throw new Error(data.error.message || data.error);
  return data;
}
window.geminiPing = () => gemini('text', {contents:[{parts:[{text:'Responda apenas com a palavra OK.'}]}], generationConfig:{maxOutputTokens:20}});

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
  const j = await gemini('text', { systemInstruction:{parts:[{text:SYSTEM}]}, contents, generationConfig:{temperature:0.3, maxOutputTokens:1200} });
  const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const text = parts ? parts.map(p => p.text || '').join('').trim() : '';
  if(!text) throw new Error('A IA não retornou resposta (pode ter sido bloqueada). Reformule a pergunta.');
  history.push({q:question, a:text});
  return text;
}
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/^\s*[-*•]\s+/gm,'• ').replace(/\n/g,'<br>');

/* ---------- interface do chat (embutido na Home) ---------- */
const log = $('#chatLog'), input = $('#chatInput');
function addMsg(role, html){ const d = document.createElement('div'); d.className = 'msg ' + role; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
if(log && input){
  addMsg('bot', 'Olá! Sou o <b>Guardião de Quanti</b>. Pergunte sobre clãs, atributos, mana, EP, runas, missões, guildas, treino e mais — respondo com base no livro de regras. ⚔️');
  $('#chatSugg').addEventListener('click', e => { const b = e.target.closest('button'); if(b){ input.value = b.textContent; send(); } });
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); send(); });
  let busy = false;
  async function send(){
    const q = input.value.trim(); if(!q || busy) return;
    if(!window.MENPHIS_USER){ addMsg('bot err','Entre na sua conta para conversar com o Guardião.'); return; }
    if(!window.MENPHIS_AI_READY){ addMsg('bot err','A IA ainda não foi ativada. Peça ao administrador para salvar a chave do Gemini em <b>Painel Admin → IA</b>.'); return; }
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
  const j = await gemini('image', { contents:[{parts:[{text:prompt}]}], generationConfig:{responseModalities:['TEXT','IMAGE']} });
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const img = parts.find(p => p.inlineData || p.inline_data);
  if(!img){ const t = parts.map(p => p.text||'').join(' ').trim(); throw new Error(t || 'O Gemini não retornou imagem (conteúdo bloqueado ou cota esgotada).'); }
  const d = img.inlineData || img.inline_data;
  return 'data:' + (d.mimeType || d.mime_type || 'image/png') + ';base64,' + d.data;
};
window.hasGeminiKey = hasKey;
})();
