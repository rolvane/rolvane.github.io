/* MENPHIS — Rede de Informantes: IA INTERNA (sem API) que lê relatórios de missão e anota os passos de players e NPCs,
   loja de informações (dinheiro ou métodos heterodoxos) e reputação / procurados. */
(function(){
'use strict';
const $ = (s,r=document) => r.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 4200); };
const S = () => window.MENPHIS_SB, me = () => window.MENPHIS_USER;
const staff = () => { const p = window.MENPHIS_PROF; return !!p && (p.role === 'mestre' || p.role === 'admin'); };
const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const money = n => Number(n || 0).toLocaleString('pt-BR');
window.MENPHIS_INTEL = true;

const TIER = {1: {name: 'Rumor', price: 300, icon: '💬'}, 2: {name: 'Testemunho', price: 1500, icon: '👁️'}, 3: {name: 'Segredo', price: 6000, icon: '🗝️'}};
const METHODS = {
  pagar:      {label: '💰 Pagar um informante', mult: 1,    dc: null, risk: 'sem risco · preço cheio'},
  espionar:   {label: '🕵️ Espionar / seguir',    mult: .25,  dc: 12,   risk: '25% do preço · d20 ≥ 12 · falha: +2 procurado'},
  interrogar: {label: '🗡️ Interrogar na força',  mult: 0,    dc: 14,   risk: 'grátis · d20 ≥ 14 · falha: +5 procurado'},
  invadir:    {label: '🔓 Invadir arquivos',      mult: .10,  dc: 16,   risk: '10% do preço · d20 ≥ 16 · falha: +8 procurado'}
};

/* ============================================================
   IA INTERNA — analisador de relatórios (regras + léxico, roda no navegador)
   ============================================================ */
const VERBS = [
  ['kill', ['matou','mataram','assassinou','assassinaram','executou','executaram','degolou','abateu','eliminou','esfaqueou','estrangulou','decapitou','envenenou','fuzilou','empalou']],
  ['attack', ['atacou','atacaram','feriu','feriram','golpeou','agrediu','espancou','emboscou']],
  ['defeat', ['derrotou','derrotaram','venceu','venceram','subjugou','capturou','prendeu','dominou']],
  ['steal', ['roubou','roubaram','furtou','saqueou','surrupiou','pilhou','invadiu','arrombou']],
  ['acquire', ['obteve','adquiriu','comprou','encontrou','recebeu','ganhou','conseguiu','forjou','herdou','recuperou','apanhou','pegou','coletou','vendeu']],
  ['use', ['usou','empunhou','sacou','equipou','lancou','disparou','conjurou','brandiu','ativou','invocou','manejou','vestiu']],
  ['help', ['ajudou','curou','protegeu','defendeu','acolheu','sustentou']],
  ['rescue', ['salvou','resgatou','libertou']],
  ['travel', ['viajou','chegou','partiu','fugiu','entrou','escapou','atravessou','visitou','retornou','voltou','seguiu']],
  ['social', ['negociou','conversou','ameacou','subornou','traiu','contratou','interrogou','extorquiu','chantageou','aliou-se','encontrou-se','reuniu-se','combinou']],
  ['stealth', ['ocultou','escondeu','disfarcou','mascarou','infiltrou','infiltrou-se','esgueirou-se']]
];
const VERB_MAP = {}; VERBS.forEach(([cat, forms]) => forms.forEach(f => { [f, f.replace(/ou(-se)?$/, 'aram$1'), f.replace(/iu(-se)?$/, 'iram$1')].forEach(g => { if(!VERB_MAP[g]) VERB_MAP[g] = cat; }); }));
const OBJ_CATS = new Set(['kill', 'attack', 'defeat', 'steal', 'help', 'rescue', 'social']);
const PARTICIPLES = {morto:'kill', morta:'kill', mortos:'kill', assassinado:'kill', assassinada:'kill', ferido:'attack', ferida:'attack', derrotado:'defeat', derrotada:'defeat', capturado:'defeat', capturada:'defeat', preso:'defeat', presa:'defeat', roubado:'steal', roubada:'steal', salvo:'rescue', salva:'rescue', resgatado:'rescue', resgatada:'rescue'};
const PART_LABEL = {kill:'matou', attack:'feriu', defeat:'derrotou', steal:'roubou', rescue:'salvou'};
const WEAPONS = new Set('espada adaga punhal faca lamina arco besta flecha machado lanca cajado varinha katana foice martelo maca escudo armadura rifle pistola revolver granada bomba grimorio artefato anel amuleto pocao reliquia tridente chicote manopla orbe cristal gema cetro cajado sabre florete clava corrente'.split(' '));
const STARTERS = new Set('o a os as um uma uns umas ele ela eles elas depois entao quando mas porem em no na nos nas de do da ao apos durante enquanto logo tambem ali la aqui seu sua seus suas isso essa esse esta este aquele aquela se com sem por para como ate mesmo antes dai assim la entretanto contudo ninguem todos todas alguem nada tudo cada nesse nessa naquela naquele durante primeiro segundo terceiro ja ainda nunca sempre agora hoje ontem rank nivel missao'.split(' '));
const PLACE_PREP = new Set(['em','na','no','nas','nos','para','pela','pelo','ate','a','ao','aos','a','de','do','da']);
const CONNECT = new Set(['de','da','do','dos','das','del','van','von','e']);
const EXPOSED = /testemunha|multid[aã]o|pra[cç]a|publicamente|guardas? (?:viram|viu)|\bviram\b|gritou|alarme|luz do dia|diante de todos|todos viram|mercado cheio|plateia/i;
const HIDDEN = /ningu[eé]m viu|sem testemunhas|em sil[eê]ncio|discretamente|disfar[cç]ad|mascarad|encapuzad|nas sombras|na calada|escondid|furtivamente|sem deixar rastros?|sem ser visto|sem ser notad/i;
const NEG = new Set(['nao','nunca','jamais','nem']);

function tokenize(s){ const out = [], re = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu; let m; while((m = re.exec(s))) out.push({t: m[0], n: norm(m[0]), s: m.index, e: m.index + m[0].length, cap: /^\p{Lu}/u.test(m[0])}); return out; }
function splitSentences(text){
  const parts = []; String(text || '').replace(/\r/g, '').split(/\n+/).forEach(par => {
    const re = /[^.!?…]+[.!?…]*/g; let m; while((m = re.exec(par))){ const x = m[0].trim(); if(x.length > 2) parts.push(x); } });
  return parts;
}
function findSeq(tokens, words, from = 0){ // posição onde a sequência de palavras normalizadas aparece
  for(let i = from; i <= tokens.length - words.length; i++){ let ok = true; for(let j = 0; j < words.length; j++){ if(tokens[i + j].n !== words[j]){ ok = false; break; } } if(ok) return i; }
  return -1;
}
function analyze(text, ctx){
  ctx = ctx || {}; const pcs = (ctx.players || []).map(p => ({id: p.id, name: p.name, words: norm(p.name).split(/\s+/).filter(Boolean)}));
  const known = {item: (ctx.items || []).map(n => ({name: n, words: norm(n).split(/\s+/)})), place: (ctx.places || []).map(n => ({name: n, words: norm(n).split(/\s+/)})), npc: (ctx.npcs || []).map(n => ({name: n, words: norm(n).split(/\s+/)}))};
  const sentences = splitSentences(text), steps = []; let lastSubj = [], lastPlace = '';
  sentences.forEach((sent, si) => {
    const tk = tokenize(sent); if(!tk.length) return;
    const ents = [], taken = new Array(tk.length).fill(false);
    const add = (type, name, i, len, extra) => { for(let k = i; k < i + len; k++) taken[k] = true; ents.push(Object.assign({type, name, i, len, s: tk[i].s, e: tk[i + len - 1].e}, extra || {})); };
    // jogadores (nome completo ou primeiro nome)
    pcs.forEach(p => { let i = findSeq(tk, p.words); if(i >= 0 && !taken[i]) add('player', p.name, i, p.words.length, {id: p.id}); else { const f = p.words[0]; if(f && f.length >= 3){ const j = tk.findIndex((x, k) => !taken[k] && x.n === f && x.cap); if(j >= 0) add('player', p.name, j, 1, {id: p.id}); } } });
    // itens / locais / npcs conhecidos
    ['item', 'place', 'npc'].forEach(kind => known[kind].forEach(k => { const i = findSeq(tk, k.words); if(i >= 0 && !taken[i]) add(kind, k.name, i, k.words.length); }));
    // armas pelo léxico: palavra + (de|da|do X) ou nome próprio logo depois
    tk.forEach((x, i) => { if(taken[i] || !WEAPONS.has(x.n)) return; let len = 1, name = x.t;
      if(tk[i + 1] && ['de', 'da', 'do'].includes(tk[i + 1].n) && tk[i + 2] && !taken[i + 2]){ len = 3; name = tk.slice(i, i + 3).map(y => y.t).join(' '); }
      else if(tk[i + 1] && tk[i + 1].cap && !taken[i + 1]){ let j = i + 1; const parts = []; while(tk[j] && !taken[j] && (tk[j].cap || (CONNECT.has(tk[j].n) && tk[j + 1] && tk[j + 1].cap))){ parts.push(tk[j].t); j++; } len = 1 + parts.length; name = parts.join(' '); }
      else if(i > 0 && ['uma', 'um', 'a', 'o'].includes(tk[i - 1].n)) name = x.t.toLowerCase();
      add('item', name, i, len); });
    // nomes próprios desconhecidos
    for(let i = 0; i < tk.length; i++){
      if(taken[i] || !tk[i].cap) continue;
      if(i === 0 && (STARTERS.has(tk[0].n) || VERB_MAP[tk[1] && tk[1].n] === undefined && false)) continue;
      if(STARTERS.has(tk[i].n) || (ctx.clans || []).includes(tk[i].n)) continue;
      let j = i, parts = [];
      while(tk[j] && !taken[j] && (tk[j].cap || (CONNECT.has(tk[j].n) && tk[j].n !== 'e' && tk[j + 1] && tk[j + 1].cap && !taken[j + 1]))){ if(!tk[j].cap && !tk[j + 1]) break; parts.push(tk[j].t); j++; if(parts.length >= 4) break; }
      if(!parts.length) continue;
      const prev = tk[i - 1] ? tk[i - 1].n : '';
      const isPlace = PLACE_PREP.has(prev) && !(VERB_MAP[tk[j] && tk[j].n]);
      add(isPlace ? 'place' : 'npc', parts.join(' '), i, parts.length);
      i = j - 1;
    }
    ents.sort((a, b) => a.s - b.s);
    // verbos
    const verbs = []; tk.forEach((x, i) => { const cat = VERB_MAP[x.n]; if(cat && !taken[i]) verbs.push({i, cat, label: x.t.toLowerCase()}); });
    // passiva: "X foi morto por Y"
    const passive = [];
    tk.forEach((x, i) => { if(!['foi', 'foram'].includes(x.n) || !tk[i + 1]) return; const cat = PARTICIPLES[tk[i + 1].n]; if(!cat) return;
      const por = tk.findIndex((y, k) => k > i + 1 && y.n === 'por'); if(por < 0) return;
      const obj = ents.filter(e => e.e <= x.s && (e.type === 'player' || e.type === 'npc')).pop(), subj = ents.find(e => e.s >= tk[por].e && (e.type === 'player' || e.type === 'npc'));
      if(subj) passive.push({cat, label: PART_LABEL[cat], subj, obj, i: tk[i + 1].s}); });
    const visCtx = [sentences[si - 1] || '', sent, sentences[si + 1] || ''].join(' ');
    const visibility = HIDDEN.test(visCtx) && !EXPOSED.test(sent) ? 'oculto' : EXPOSED.test(visCtx) && !HIDDEN.test(sent) ? 'exposto' : 'discreto';
    const place = (ents.find(e => e.type === 'place') || {}).name || lastPlace;
    const mk = (subj, cat, label, obj, item) => {
      const st = {subject: subj.name, subject_type: subj.type === 'player' ? 'player' : 'npc', subject_char: subj.id || null, action_cat: cat, action_label: label,
        object_name: obj ? obj.name : '', object_type: obj ? obj.type : '', item_name: item ? item.name : '', place: cat === 'travel' && obj && obj.type === 'place' ? obj.name : place,
        visibility, excerpt: sent.length > 260 ? sent.slice(0, 257) + '…' : sent};
      if(cat === 'travel' && obj && obj.type === 'place') st.object_name = obj.name;
      steps.push(finish(st)); };
    passive.forEach(p => mk(p.subj, p.cat, p.label, p.obj, null));
    verbs.forEach(v => {
      const vs = tk[v.i].s; if(passive.some(p => Math.abs(p.i - vs) < 2)) return;
      for(let k = Math.max(0, v.i - 2); k < v.i; k++) if(NEG.has(tk[k].n)) return;   // "não matou"
      let subs = ents.filter(e => e.e <= vs && (e.type === 'player' || e.type === 'npc'));
      let chosen = [];
      if(subs.length){ const last = subs[subs.length - 1]; chosen = [last]; const before = subs[subs.length - 2];
        if(before){ const between = sent.slice(before.e, last.s); if(/^\s*(?:,|\se\s)\s*$/i.test(between)) chosen.unshift(before); } }
      else chosen = lastSubj;
      if(!chosen.length) chosen = [{name: 'Alguém', type: 'npc'}];
      const nextV = verbs.find(x => x.i > v.i), limit = nextV ? tk[nextV.i].s : Infinity;
      const win = ents.filter(e => e.s >= tk[v.i].e && e.s < limit);
      const obj = OBJ_CATS.has(v.cat) ? win.find(e => (e.type === 'player' || e.type === 'npc') && !chosen.some(c => c.name === e.name))
        : v.cat === 'travel' ? win.find(e => e.type === 'place') : null;
      let item = win.find(e => e.type === 'item');
      if(!item && verbs.length === 1) item = ents.find(e => e.type === 'item');
      chosen.forEach(c => mk(c, v.cat, v.label, obj, item));
      if(subs.length) lastSubj = chosen;
    });
    const pl = ents.find(e => e.type === 'place'); if(pl) lastPlace = pl.name;
  });
  // remove duplicatas idênticas
  const seen = new Set(); return steps.filter(s => { const k = [s.subject, s.action_cat, s.object_name, s.item_name, s.excerpt].join('|'); if(seen.has(k)) return false; seen.add(k); return true; });
}
const BASE_TIER = {kill: 3, steal: 3, stealth: 3, defeat: 2, attack: 2, use: 2, acquire: 2, social: 2, rescue: 2, help: 1, travel: 1};
function finish(st){
  let t = BASE_TIER[st.action_cat] || 2;
  if(st.visibility === 'oculto') t++; if(st.visibility === 'exposto') t--;
  if(st.item_name && ['use', 'acquire', 'steal'].includes(st.action_cat)) t = Math.max(t, 2);
  st.tier = Math.max(1, Math.min(3, t)); st.price = TIER[st.tier].price;
  const vis = st.visibility, ex = st.excerpt || '';
  let heat = 0, hero = 0, villain = 0;
  if(st.action_cat === 'kill'){ villain = /inocente|civil|crian[cç]a|sem piedade|miseric/i.test(ex) ? 5 : 2; heat = vis === 'exposto' ? 8 : vis === 'oculto' ? 1 : 4; }
  else if(st.action_cat === 'attack') heat = vis === 'exposto' ? 3 : vis === 'oculto' ? 0 : 1;
  else if(st.action_cat === 'defeat'){ hero = /amea[cç]a|monstro|criatura|bandid|besta|dem[oô]nio|inimigo/i.test(ex) ? 5 : 1; }
  else if(st.action_cat === 'steal'){ villain = 1; heat = vis === 'exposto' ? 5 : vis === 'oculto' ? 1 : 2; }
  else if(st.action_cat === 'help') hero = 1;
  else if(st.action_cat === 'rescue') hero = 3;
  else if(st.action_cat === 'social' && /amea[cç]|extors|chantag|suborn|traiu/i.test(ex)){ villain = 1; heat = 1; }
  if(st.subject_type !== 'player'){ heat = hero = villain = 0; }
  st.heat = heat; st.hero = hero; st.villain = villain; return st;
}
window.MENPHIS_analyze = analyze;

/* ---------- relatório narrativo gerado a partir de uma pista ---------- */
function ago(d){ const dd = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return dd <= 0 ? 'hoje' : dd === 1 ? 'ontem' : 'há ' + dd + ' dias'; }
function narrate(o){
  const lead = o.tier === 1 ? 'Corre o boato de que' : o.tier === 2 ? 'Uma testemunha afirma que' : 'Registros e fontes confiáveis confirmam que';
  const a = o.action || o.action_label || 'agiu';
  return lead + ' <b>' + esc(o.subject || o.subject_name) + '</b> ' + esc(a) + (o.object || o.object_name ? ' <b>' + esc(o.object || o.object_name) + '</b>' : '') + ((o.item || o.item_name) ? ' usando <i>' + esc(o.item || o.item_name) + '</i>' : '') + ((o.place) ? ', em ' + esc(o.place) : '') + ' (' + ago(o.when || o.happened_at) + ').';
}
const alignment = (h, v) => (!h && !v) ? 'Neutro' : (h > 0 && v > 0 && Math.abs(h - v) <= 5) ? 'Justiceiro' : h >= v ? 'Herói' : 'Vilão';
const effHeat = r => r ? Math.max(0, r.heat - Math.floor((Date.now() - new Date(r.heat_at).getTime()) / 86400000)) : 0;
const stars = n => '★'.repeat(Math.min(5, Math.floor(n / 10))) + '☆'.repeat(5 - Math.min(5, Math.floor(n / 10)));
window.MENPHIS_repHtml = async function(charId){
  try {
    const {data} = await S().from('reputation').select('*').eq('char_id', charId).maybeSingle(); const r = data || {hero: 0, villain: 0, heat: 0, bounty: 0, heat_at: new Date()};
    const eh = effHeat(r), bounty = Math.max(r.bounty || 0, eh * 100);
    return '<div class="sl-sec"><h5>[ REPUTAÇÃO ]</h5><div class="sl-row"><div class="sl-chip">ALINHAMENTO <b>' + alignment(r.hero, r.villain) + '</b></div><div class="sl-chip">HERÓI <b>' + r.hero + '</b></div><div class="sl-chip">VILÃO <b>' + r.villain + '</b></div>' +
      (eh >= 5 || r.bounty > 0 ? '<div class="sl-chip gold">PROCURADO <b>' + stars(eh) + '</b> · recompensa <b>' + money(bounty) + '</b></div>' : '<div class="sl-chip">PROCURADO <b>não</b></div>') + '</div></div>';
  } catch(e){ return ''; }
};

/* ============================================================
   INTERFACE
   ============================================================ */
let tab = 'buy', ownChars = [], analyzed = [], lastReportTitle = '';
const q = async p => { const r = await p; if(r.error){ toast(/intel_|reputation|function|schema cache|does not exist/i.test(r.error.message) ? 'Rode o update_v6.sql no Supabase.' : r.error.message); throw r.error; } return r.data; };
const key = () => (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
function showTab(t){ tab = t; $$('#inTabs .chip').forEach(c => c.classList.toggle('active', c.dataset.t === t)); ['buy', 'book', 'wanted', 'central'].forEach(x => { const p = $('#in' + x[0].toUpperCase() + x.slice(1)); if(p) p.style.display = x === t ? '' : 'none'; });
  ({buy: loadBuy, book: loadBook, wanted: loadWanted, central: loadCentral}[t] || (() => {}))().catch(() => {}); }
async function route(){ if(key() !== 'intel') return; if(!me()){ $('#inBuy').innerHTML = '<div class="empty"><span class="big">🕵️</span><p>Entre na sua conta para usar a Rede de Informantes.</p></div>'; return; } if(!$('#inTabs').dataset.ok){ $('#inTabs').dataset.ok = 1; } showTab(tab); }

/* ----- comprar ----- */
async function loadBuy(){
  const all = window.MENPHIS_CH ? window.MENPHIS_CH() : []; ownChars = all.filter(c => c.owner === me().id);
  $('#inChar').innerHTML = ownChars.length ? ownChars.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') : '<option value="">Crie um personagem primeiro</option>';
  { const pp = localStorage.getItem('menphis-profile'); if(pp && ownChars.some(c => c.id === pp)) $('#inChar').value = pp; }
  $('#inMethods').innerHTML = Object.entries(METHODS).map(([k, m], i) => '<label class="in-m"><input type="radio" name="inMethod" value="' + k + '"' + (i ? '' : ' checked') + '><span><b>' + m.label + '</b><small>' + m.risk + '</small></span></label>').join('');
  await refreshBalance();
}
async function refreshBalance(){
  const c = ownChars.find(x => x.id === $('#inChar').value); if(!c){ $('#inBalance').textContent = ''; return; }
  const {data} = await S().from('characters').select('sheet').eq('id', c.id).maybeSingle(); const t = data && data.sheet ? data.sheet.tarjas : (c.sheet || {}).tarjas;
  const rep = (await S().from('reputation').select('*').eq('char_id', c.id).maybeSingle()).data; const eh = effHeat(rep);
  $('#inBalance').innerHTML = '💰 <b>' + money(t) + '</b> tarjas' + (eh >= 5 ? ' · 🚨 procurado ' + stars(eh) : eh > 0 ? ' · 👀 atenção: ' + eh : '');
}
async function catalog(){
  const qv = $('#inQuery').value.trim(); if(qv.length < 3) return toast('Digite ao menos 3 letras.'); if(!$('#inChar').value) return toast('Escolha um personagem.');
  const r = await q(S().rpc('intel_catalog', {p_char: $('#inChar').value, p_query: qv})); const box = $('#inCatalog');
  if(!r.available && !r.owned){ box.innerHTML = '<p class="muted">Nenhum informante ouviu falar disso.</p>'; $('#inBuyBtn').disabled = true; return; }
  const m = METHODS[(document.querySelector('input[name=inMethod]:checked') || {}).value || 'pagar'];
  box.innerHTML = '<p>Os informantes têm <b>' + r.available + '</b> informação(ões) nova(s) sobre isso' + (r.owned ? ' (você já possui ' + r.owned + ')' : '') + ': ' + (r.t1 ? r.t1 + ' rumor(es) ' : '') + (r.t2 ? r.t2 + ' testemunho(s) ' : '') + (r.t3 ? r.t3 + ' segredo(s)' : '') + '.</p><p class="tiny muted">Cada busca revela até 3. Cotação das 3 mais recentes: <b>' + money(r.quote) + '</b> tarjas no preço cheio.</p>';
  $('#inBuyBtn').disabled = !r.available;
}
async function buy(){
  const qv = $('#inQuery').value.trim(), method = (document.querySelector('input[name=inMethod]:checked') || {}).value;
  if(qv.length < 3 || !$('#inChar').value) return toast('Informe o personagem e o que procura.');
  $('#inBuyBtn').disabled = true; const out = $('#inResult'); out.innerHTML = '<p class="muted">Consultando a rede de informantes...</p>';
  try {
    const r = await q(S().rpc('buy_intel', {p_char: $('#inChar').value, p_query: qv, p_method: method}));
    let h = '';
    if(!r.ok) h = '<div class="in-card bad">❌ ' + esc(r.msg) + '</div>';
    else if(r.none) h = '<div class="in-card">🤷 ' + esc(r.msg) + '</div>';
    else {
      h += '<div class="in-card ' + (r.success ? 'good' : 'bad') + '">' + (r.roll != null ? '🎲 d20 = <b>' + r.roll + '</b>' + (r.bonus ? ' +' + r.bonus + ' (inteligência)' : '') + ' contra <b>' + r.dc + '</b> — ' : '') + esc(r.msg) + (r.cost ? ' · custou <b>' + money(r.cost) + '</b>' : '') + (r.heat_added ? ' · 🚨 procurado +' + r.heat_added : '') + '</div>';
      (r.clues || []).forEach(c => { h += '<div class="in-clue t' + c.tier + '"><span class="in-t">' + TIER[c.tier].icon + ' ' + TIER[c.tier].name + '</span><p>' + narrate(c) + '</p>' + (c.excerpt ? '<blockquote>' + esc(c.excerpt) + '</blockquote>' : '') + '</div>'; });
    }
    out.innerHTML = h; await refreshBalance(); if(window.MENPHIS_REFRESH) window.MENPHIS_REFRESH();
  } catch(e){ out.innerHTML = ''; }
  $('#inBuyBtn').disabled = false;
}

/* ----- caderno ----- */
async function loadBook(){
  const rows = await q(S().from('intel_owned').select('*').eq('owner', me().id).order('created_at', {ascending: false}));
  const f = norm($('#inFilter').value || ''); const list = rows.filter(r => !f || norm([r.subject_name, r.object_name, r.item_name, r.place].join(' ')).includes(f));
  const names = {}; (window.MENPHIS_CH ? window.MENPHIS_CH() : []).forEach(c => names[c.id] = c.name);
  $('#inBookList').innerHTML = list.length ? list.map(r => '<div class="in-clue t' + r.tier + '"><span class="in-t">' + TIER[r.tier].icon + ' ' + TIER[r.tier].name + ' · caderno de ' + esc(names[r.char_id] || '—') + '</span><p>' + narrate(r) + '</p>' + (r.excerpt ? '<blockquote>' + esc(r.excerpt) + '</blockquote>' : '') + '</div>').join('') : '<div class="empty"><span class="big">📓</span><p>Seu caderno está vazio. Compre informações na aba Informantes.</p></div>';
}

/* ----- procurados / reputação ----- */
async function loadWanted(){
  const w = await q(S().rpc('wanted_board'));
  $('#inWantedList').innerHTML = w.length ? w.map(x => '<div class="in-wanted"><div class="in-stars">' + stars(x.stars * 10) + '</div><div><b>' + esc(x.name) + '</b><small>' + esc(x.clan) + '</small></div><div class="in-bounty">' + money(x.bounty) + ' <small>tarjas</small></div></div>').join('') : '<div class="empty"><span class="big">🚨</span><p>Ninguém é procurado no momento.</p></div>';
  const mine = (window.MENPHIS_CH ? window.MENPHIS_CH() : []).filter(c => c.owner === me().id); const rep = await q(S().from('reputation').select('*').eq('owner', me().id));
  $('#inMyRep').innerHTML = mine.map(c => { const r = rep.find(x => x.char_id === c.id) || {hero: 0, villain: 0, heat: 0, bounty: 0, heat_at: new Date()}; const eh = effHeat(r);
    return '<div class="in-card"><b>' + esc(c.name) + '</b> — ' + alignment(r.hero, r.villain) + ' · Herói ' + r.hero + ' · Vilão ' + r.villain + ' · ' + (eh >= 5 ? '🚨 procurado ' + stars(eh) : 'sem procura') + '</div>'; }).join('');
}

/* ----- central do narrador ----- */
async function loadCentral(){
  if(!staff()){ $('#inCentral').innerHTML = '<div class="empty"><span class="big">🔒</span><p>Apenas narradores.</p></div>'; return; }
  const all = window.MENPHIS_CH ? window.MENPHIS_CH() : [];
  $('#inRepChar').innerHTML = all.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
  await loadClues(); await loadRepTable();
}
async function context(){
  const [items, kingdoms, regions, npcs] = await Promise.all([S().from('items').select('name'), S().from('kingdoms').select('name'), S().from('regions').select('name'), S().from('intel_clues').select('subject_name').eq('subject_type', 'npc').limit(300)]);
  const clans = Object.keys(window.CLANS || {}).map(norm);
  return {players: (window.MENPHIS_CH ? window.MENPHIS_CH() : []).map(c => ({id: c.id, name: c.name})), items: (items.data || []).map(x => x.name), places: [...(kingdoms.data || []), ...(regions.data || [])].map(x => x.name),
    npcs: [...new Set((npcs.data || []).map(x => x.subject_name))], clans: clans.concat(clans.map(c => c.replace(/s$/, '')))};
}
async function runAnalyze(){
  const text = $('#inText').value.trim(); if(text.length < 20) return toast('Cole o texto da missão (mínimo 20 caracteres).');
  lastReportTitle = $('#inTitle').value.trim() || 'Missão ' + new Date().toLocaleDateString('pt-BR');
  analyzed = analyze(text, await context()); renderPreview();
}
const CATS = {kill: 'matou', attack: 'atacou', defeat: 'derrotou', steal: 'roubou', acquire: 'obteve', use: 'usou', help: 'ajudou', rescue: 'salvou', travel: 'viajou', social: 'negociou', stealth: 'ocultou', other: 'agiu'};
function renderPreview(){
  const box = $('#inPreview'); $('#inSaveBar').style.display = analyzed.length ? '' : 'none';
  if(!analyzed.length){ box.innerHTML = '<div class="empty"><span class="big">🧠</span><p>A IA interna não achou ações no texto. Verifique se os nomes estão com inicial maiúscula e os verbos no passado ("matou", "roubou"...). Você também pode adicionar passos manualmente.</p></div>'; return; }
  const bySubj = {}; analyzed.forEach(s => bySubj[s.subject] = (bySubj[s.subject] || 0) + 1);
  box.innerHTML = '<p class="tiny muted" style="margin-bottom:8px">🧠 ' + analyzed.length + ' passo(s) anotado(s): ' + Object.entries(bySubj).map(([k, v]) => esc(k) + ' (' + v + ')').join(', ') + '. Revise e edite antes de salvar.</p>' +
    analyzed.map((s, i) => '<div class="in-step" data-i="' + i + '"><div class="in-row"><input class="field" data-f="subject" value="' + esc(s.subject) + '" title="Quem"><select class="field" data-f="subject_type"><option value="player"' + (s.subject_type === 'player' ? ' selected' : '') + '>player</option><option value="npc"' + (s.subject_type === 'npc' ? ' selected' : '') + '>npc</option></select>' +
      '<select class="field" data-f="action_cat">' + Object.entries(CATS).map(([k, v]) => '<option value="' + k + '"' + (s.action_cat === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><input class="field" data-f="action_label" value="' + esc(s.action_label) + '" title="Verbo"></div>' +
      '<div class="in-row"><input class="field" data-f="object_name" placeholder="Alvo" value="' + esc(s.object_name) + '"><input class="field" data-f="item_name" placeholder="Arma/item" value="' + esc(s.item_name) + '"><input class="field" data-f="place" placeholder="Local" value="' + esc(s.place) + '"></div>' +
      '<div class="in-row"><select class="field" data-f="visibility">' + ['oculto', 'discreto', 'exposto'].map(v => '<option' + (s.visibility === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><select class="field" data-f="tier">' + [1, 2, 3].map(t => '<option value="' + t + '"' + (s.tier === t ? ' selected' : '') + '>' + TIER[t].icon + ' ' + TIER[t].name + '</option>').join('') + '</select><input class="field" data-f="price" type="number" min="0" value="' + s.price + '" title="Preço"><button class="btn btn-sm" data-rm="' + i + '" type="button">🗑</button></div>' +
      (s.subject_type === 'player' ? '<div class="in-row tiny muted">Reputação: herói <input class="field mini" data-f="hero" type="number" value="' + s.hero + '"> vilão <input class="field mini" data-f="villain" type="number" value="' + s.villain + '"> procurado <input class="field mini" data-f="heat" type="number" value="' + s.heat + '"></div>' : '') +
      '<blockquote>' + esc(s.excerpt) + '</blockquote></div>').join('');
}
document.addEventListener('input', e => { const st = e.target.closest('.in-step'); if(!st || !e.target.dataset.f) return; const s = analyzed[+st.dataset.i], f = e.target.dataset.f; s[f] = ['tier', 'price', 'hero', 'villain', 'heat'].includes(f) ? +e.target.value : e.target.value; if(f === 'tier' && e.type === 'input'){ s.price = TIER[s.tier].price; const p = st.querySelector('[data-f=price]'); if(p) p.value = s.price; } });
document.addEventListener('click', e => { const r = e.target.closest('.in-step [data-rm]'); if(r){ analyzed.splice(+r.dataset.rm, 1); renderPreview(); } });
async function saveReport(){
  if(!analyzed.length) return;
  const rep = await q(S().from('intel_reports').insert({title: lastReportTitle, body: $('#inText').value}).select().single());
  const rows = analyzed.map(s => ({report_id: rep.id, subject_name: s.subject, subject_type: s.subject_type, subject_char: s.subject_char || null, action_cat: s.action_cat, action_label: s.action_label || CATS[s.action_cat], object_name: s.object_name || null, object_type: s.object_type || null,
    item_name: s.item_name || null, place: s.place || null, visibility: s.visibility, tier: s.tier, price: s.price, excerpt: s.excerpt}));
  await q(S().from('intel_clues').insert(rows));
  if($('#inApplyRep').checked){ const agg = {}; analyzed.forEach(s => { if(s.subject_type === 'player' && s.subject_char){ const a = agg[s.subject_char] || (agg[s.subject_char] = {h: 0, v: 0, t: 0}); a.h += s.hero || 0; a.v += s.villain || 0; a.t += s.heat || 0; } });
    for(const [id, a] of Object.entries(agg)) if(a.h || a.v || a.t) await q(S().rpc('rep_adjust', {p_char: id, p_hero: a.h, p_villain: a.v, p_heat: a.t, p_bounty: null})); }
  toast('Relatório salvo: ' + rows.length + ' rastro(s) anotado(s).'); analyzed = []; $('#inText').value = ''; renderPreview(); loadClues(); loadRepTable();
}
async function loadClues(){
  const f = norm($('#inClueFilter').value || ''); const rows = await q(S().from('intel_clues').select('*').order('created_at', {ascending: false}).limit(120));
  const list = rows.filter(r => !f || norm([r.subject_name, r.object_name, r.item_name, r.place].join(' ')).includes(f)).slice(0, 60);
  $('#inClues').innerHTML = list.length ? list.map(r => '<div class="in-clue t' + r.tier + '"><span class="in-t">' + TIER[r.tier].icon + ' ' + TIER[r.tier].name + ' · ' + money(r.price) + ' · ' + esc(r.visibility) + '</span><p>' + narrate(r) + '</p><button class="btn btn-sm" data-delclue="' + r.id + '" type="button">Excluir</button></div>').join('') : '<p class="tiny muted">Nenhum rastro registrado ainda.</p>';
}
document.addEventListener('click', async e => { const d = e.target.closest('[data-delclue]'); if(d && confirm('Excluir este rastro?')){ await q(S().from('intel_clues').delete().eq('id', d.dataset.delclue)); loadClues(); } });
async function loadRepTable(){
  const rep = await q(S().from('reputation').select('*')); const names = {}; (window.MENPHIS_CH ? window.MENPHIS_CH() : []).forEach(c => names[c.id] = c.name);
  $('#inRepTable').innerHTML = rep.length ? rep.map(r => '<div class="in-card">' + esc(names[r.char_id] || '—') + ': ' + alignment(r.hero, r.villain) + ' · herói ' + r.hero + ' · vilão ' + r.villain + ' · procurado ' + effHeat(r) + ' · recompensa ' + money(Math.max(r.bounty, effHeat(r) * 100)) + '</div>').join('') : '<p class="tiny muted">Ninguém tem reputação registrada.</p>';
}
async function repApply(){
  const n = id => parseInt($(id).value, 10) || 0, b = $('#inRepBounty').value.trim();
  await q(S().rpc('rep_adjust', {p_char: $('#inRepChar').value, p_hero: n('#inRepHero'), p_villain: n('#inRepVillain'), p_heat: n('#inRepHeat'), p_bounty: b === '' ? null : parseInt(b, 10)}));
  ['#inRepHero', '#inRepVillain', '#inRepHeat', '#inRepBounty'].forEach(i => $(i).value = ''); toast('Reputação atualizada.'); loadRepTable();
}

function bind(){
  const on = (id, ev, fn) => { const el = $(id); if(el) el.addEventListener(ev, fn); };
  on('#inTabs', 'click', e => { const b = e.target.closest('.chip'); if(b) showTab(b.dataset.t); });
  on('#inChar', 'change', refreshBalance); on('#inCatBtn', 'click', () => catalog().catch(() => {})); on('#inQuery', 'keydown', e => { if(e.key === 'Enter') catalog().catch(() => {}); });
  on('#inBuyBtn', 'click', buy); on('#inFilter', 'input', () => loadBook().catch(() => {}));
  on('#inAnalyze', 'click', () => runAnalyze().catch(() => {})); on('#inSaveReport', 'click', () => saveReport().catch(() => {}));
  on('#inAddStep', 'click', () => { analyzed.push(finish({subject: '', subject_type: 'npc', subject_char: null, action_cat: 'other', action_label: 'agiu', object_name: '', object_type: '', item_name: '', place: '', visibility: 'discreto', excerpt: ''})); renderPreview(); });
  on('#inClueFilter', 'input', () => loadClues().catch(() => {})); on('#inRepGo', 'click', () => repApply().catch(() => {}));
}
window.addEventListener('hashchange', route); window.addEventListener('menphis-ready', route);
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
