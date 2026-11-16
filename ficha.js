/* MENPHIS — ficha completa (modelo Menphis), importação/exportação e janela "Status" estilo Solo Leveling */
(function(){
'use strict';
const $ = (s,r=document) => r.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const chars = () => (window.MENPHIS_CH ? window.MENPHIS_CH() : []);
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 4200); };
window.MENPHIS_FICHA = true;
let editingId = null, avatarData = '';

const CASTAS = {Esquecida:{mana:0, tarjas:0}, Comum:{mana:75, tarjas:1000}, Nobre:{mana:150, tarjas:25000}};
const RANKS = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const rankName = r => { const i = RANKS.indexOf(r); return i < 3 ? 'Básico' : i < 6 ? 'Mediano' : i < 9 ? 'Avançado' : 'Supremo'; };
const TXT = {shIdade:'idade', shApar:'aparencia', shPers:'personalidade', shGosto:'gosto', shDesgosto:'desgosto', shHist:'historia', shItens:'itens', shPoderes:'poderes', shTalentos:'talentos', shPets:'pets', shCasta:'casta', shRank:'controle_rank'};
const NUM = {shXp:'xp', shXpMax:'xp_max', shTarjas:'tarjas', shQuanti:'quanti', shMana:'mana', shManaMax:'mana_max'};

/* ---------- imagem -> dataURL reduzida (usada também pelo jogo de narração) ---------- */
window.MENPHIS_IMG = (file, max = 640, q = .82) => new Promise((res, rej) => {
  const r = new FileReader(); r.onerror = rej;
  r.onload = () => { const im = new Image(); im.onerror = rej;
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); };
    im.src = r.result; };
  r.readAsDataURL(file);
});

/* ---------- formulário completo dentro do modal existente ---------- */
function build(){
  const box = $('#sheetModal .modal-box'); if(!box || $('#shExtraTop')) return;
  const first = $('#sheetModal .sheet-row');
  const tools = document.createElement('div'); tools.id = 'shExtraTop';
  tools.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn btn-sm" type="button" id="shImportBtn">📥 Importar modelo de ficha</button></div>
  <div id="shImportBox" class="card" style="display:none;margin-bottom:14px"><p class="tiny muted" style="margin-bottom:8px">Cole a ficha no modelo Menphis (༺Nome-» ... ) ou escolha um arquivo .txt. Os atributos nunca ficam abaixo do mínimo do clã.</p>
    <textarea class="field" id="shImportText" rows="7" placeholder="༺Nome-» Aria&#10;༺Idade-» 24&#10;༺Clã-» Elfos&#10;..."></textarea>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap"><input type="file" id="shImportFile" accept=".txt,text/plain" class="tiny"><button class="btn btn-sm btn-primary" type="button" id="shImportGo">Aplicar na ficha</button></div><p class="tiny" id="shImportMsg" style="margin-top:8px;color:#fcd34d"></p></div>`;
  first.parentNode.insertBefore(tools, first);
  const ident = document.createElement('div'); ident.id = 'shIdent';
  ident.innerHTML = `<div class="sh-sec">Identidade</div>
  <div class="sheet-row"><div><label class="tiny muted">Idade</label><input class="field" id="shIdade" placeholder="Ex.: 24"></div><div><label class="tiny muted">Nível (Lvl)</label><input class="field" id="shLevel" type="number" min="1" max="10" value="1"></div></div>
  <div style="margin-bottom:12px"><label class="tiny muted">Avatar ou Aparência (nome do personagem base ou características)</label><textarea class="field" id="shApar" rows="2"></textarea>
    <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center"><input class="field" id="shAvatarUrl" placeholder="URL da imagem (opcional)" style="flex:1 1 180px"><input type="file" id="shAvatarFile" accept="image/*" class="tiny"><img id="shAvatarPrev" alt="" style="display:none;width:44px;height:44px;border-radius:8px;object-fit:cover"></div></div>
  <div style="margin-bottom:12px"><label class="tiny muted">Personalidade</label><textarea class="field" id="shPers" rows="2"></textarea></div>
  <div class="sheet-row"><div><label class="tiny muted">Casta Social</label><select class="field" id="shCasta"><option>Esquecida</option><option>Comum</option><option>Nobre</option></select></div><div><label class="tiny muted">1–5 Esquecida · 6–17 Comum · 18–20 Nobre</label><button class="btn btn-sm" type="button" id="shD20">🎲 Rolar d20</button> <span class="tiny muted" id="shD20r"></span></div></div>
  <div class="sheet-row"><div><label class="tiny muted">Gosto</label><textarea class="field" id="shGosto" rows="2"></textarea></div><div><label class="tiny muted">Desgosto</label><textarea class="field" id="shDesgosto" rows="2"></textarea></div></div>
  <div class="sh-sec">Atributos do Clã</div>`;
  $('#shPool').parentNode.insertBefore(ident, $('#shPool'));
  const bot = document.createElement('div'); bot.id = 'shExtraBottom';
  bot.innerHTML = `<div class="sh-sec">Mana, XP e Recursos</div>
  <div class="pool" id="shCalc"></div>
  <div class="sheet-row"><div><label class="tiny muted">Controle de Mana</label><select class="field" id="shRank">${RANKS.map(r => '<option value="'+r+'">Rank '+r+' ('+rankName(r)+')</option>').join('')}</select></div><div><label class="tiny muted">Mana atual / máxima</label><div style="display:flex;gap:6px"><input class="field" id="shMana" type="number" min="0"><input class="field" id="shManaMax" type="number" min="0"></div></div></div>
  <button class="btn btn-sm" type="button" id="shRecalc" style="margin-bottom:12px">↻ Recalcular mana pelo clã e casta</button>
  <div class="sheet-row"><div><label class="tiny muted">XP atual</label><input class="field" id="shXp" type="number" min="0" value="0"></div><div><label class="tiny muted">XP do nível (padrão 200)</label><input class="field" id="shXpMax" type="number" min="1" value="200"></div></div>
  <div class="sheet-row"><div><label class="tiny muted">Tarjas (moedas)</label><input class="field" id="shTarjas" type="number" min="0" value="0"></div><div><label class="tiny muted">Pontos Quanti (n° = n° de poderes)</label><input class="field" id="shQuanti" type="number" min="0" value="2"></div></div>
  <div style="margin-bottom:12px"><label class="tiny muted">História (mínimo 80 palavras)</label><textarea class="field" id="shHist" rows="5"></textarea><span class="tiny muted" id="shWords">0 palavras</span></div>
  <div class="sh-sec">Inventário e habilidades <small class="muted">(no livro: só liberados dentro do jogo)</small></div>
  <div style="margin-bottom:12px"><label class="tiny muted">Itens (um por linha)</label><textarea class="field" id="shItens" rows="2"></textarea></div>
  <div style="margin-bottom:12px"><label class="tiny muted">Poderes/Magias (uma por linha: Nome — descrição)</label><textarea class="field" id="shPoderes" rows="3"></textarea></div>
  <div style="margin-bottom:12px"><label class="tiny muted">Talentos (um por linha)</label><textarea class="field" id="shTalentos" rows="2"></textarea></div>
  <div style="margin-bottom:12px"><label class="tiny muted">Pet's (ficha do pet é separada)</label><textarea class="field" id="shPets" rows="2"></textarea></div>`;
  const save = $('#sheetModal .btn-amber'); save.parentNode.insertBefore(bot, save);

  const modal = $('#sheetModal');
  ['click','input','change'].forEach(ev => modal.addEventListener(ev, e => {
    if(['shMana','shManaMax','shTarjas'].includes(e.target.id) && ev === 'input') e.target.dataset.manual = '1';
    if(e.target.closest('#shExtraBottom, #shIdent, #shAttrs, #shClan, #shVariant')) setTimeout(recalc, 0);
  }));
  $('#shRecalc').onclick = () => { ['shMana','shManaMax','shTarjas'].forEach(i => delete $('#'+i).dataset.manual); recalc(); };
  $('#shD20').onclick = async () => {
    let n; try { n = (await window.MENPHIS_ROLL(1, 20, 0, 'ficha')).total; } catch(e){ n = 1 + Math.floor(Math.random() * 20); }
    const c = n <= 5 ? 'Esquecida' : n <= 17 ? 'Comum' : 'Nobre'; $('#shCasta').value = c; $('#shD20r').textContent = 'd20 = ' + n + ' → ' + c;
    delete $('#shTarjas').dataset.manual; recalc();
  };
  $('#shAvatarFile').onchange = async e => { const f = e.target.files[0]; if(!f) return; try { avatarData = await window.MENPHIS_IMG(f, 420); $('#shAvatarPrev').src = avatarData; $('#shAvatarPrev').style.display = 'block'; $('#shAvatarUrl').value = ''; } catch(err){ toast('Não consegui ler essa imagem.'); } };
  $('#shAvatarUrl').oninput = e => { if(e.target.value){ avatarData = ''; $('#shAvatarPrev').src = e.target.value; $('#shAvatarPrev').style.display = 'block'; } };
  $('#shImportBtn').onclick = () => { const b = $('#shImportBox'); b.style.display = b.style.display === 'none' ? 'block' : 'none'; };
  $('#shImportFile').onchange = async e => { const f = e.target.files[0]; if(f) $('#shImportText').value = await f.text(); };
  $('#shImportGo').onclick = () => { const r = parseFicha($('#shImportText').value); applyImport(r); };
}

function recalc(){
  if(typeof cur === 'undefined' || !$('#shCalc')) return;
  const clan = $('#shClan').value, cap = cur.magic_capacity || 0, casta = CASTAS[$('#shCasta').value] || CASTAS.Esquecida;
  const capMana = Math.floor(cap / 10) * 25, manaMax = clan === 'Humanos' ? 0 : 150 + casta.mana + capMana;
  const epAdd = Math.floor(((cur.physical_resistance || 0) + (cur.magic_resistance || 0)) / 10) * 25;
  $('#shCalc').innerHTML = (clan === 'Humanos' ? 'Humanos não possuem mana · ' : 'Mana inicial: 150 base + ' + casta.mana + ' (casta) + ' + capMana + ' (capacidade ' + cap + 'x) = <b>' + manaMax + '</b> · ') + 'EP inicial: 100 + ' + epAdd + ' = <b>' + (100 + epAdd) + '</b>';
  const mm = $('#shManaMax'), m = $('#shMana'), t = $('#shTarjas');
  if(!mm.dataset.manual) mm.value = manaMax; if(!m.dataset.manual) m.value = mm.value; if(!t.dataset.manual) t.value = casta.tarjas;
  const w = ($('#shHist').value.trim().split(/\s+/).filter(Boolean)).length; $('#shWords').textContent = w + ' palavras' + (w < 80 ? ' (faltam ' + (80 - w) + ')' : ' ✓');
}

function resetForm(){
  editingId = null; avatarData = '';
  $('#shName').value = ''; $('#shLevel').value = 1; $('#shAvatarUrl').value = ''; $('#shAvatarPrev').style.display = 'none'; $('#shD20r').textContent = '';
  Object.keys(TXT).forEach(id => { $('#'+id).value = ''; }); $('#shCasta').value = 'Esquecida'; $('#shRank').value = 'I';
  $('#shXp').value = 0; $('#shXpMax').value = 200; $('#shQuanti').value = 2;
  ['shMana','shManaMax','shTarjas'].forEach(i => { $('#'+i).value = ''; delete $('#'+i).dataset.manual; });
  $('#shImportBox').style.display = 'none'; $('#shImportText').value = ''; $('#shImportMsg').textContent = '';
  $('#sheetModal h2').textContent = '🗡️ Ficha de Personagem';
}
function fill(c){
  const sh = c.sheet || {};
  $('#shName').value = c.name; $('#shLevel').value = c.level || 1;
  $('#shClan').value = c.clan; $('#shVariant').dataset.clan = ''; loadBase();
  if(c.variant){ $('#shVariant').value = c.variant; loadBase(); }
  base = Object.assign({}, base); const saved = c.stats || {};
  cur = {}; Object.keys(base).forEach(k => cur[k] = Math.max(base[k], saved[k] || 0)); poolMax = 0; renderAttrs();
  Object.entries(TXT).forEach(([id, k]) => { if(sh[k] != null) $('#'+id).value = sh[k]; });
  Object.entries(NUM).forEach(([id, k]) => { if(sh[k] != null){ $('#'+id).value = sh[k]; $('#'+id).dataset.manual = '1'; } });
  if(sh.avatar){ avatarData = sh.avatar.startsWith('data:') ? sh.avatar : ''; if(!avatarData) $('#shAvatarUrl').value = sh.avatar; $('#shAvatarPrev').src = sh.avatar; $('#shAvatarPrev').style.display = 'block'; }
  $('#sheetModal h2').textContent = '✏️ Editar ficha · ' + c.name;
}
window.openSheet = function(id){
  const sel = $('#shClan'); if(!sel.options.length) sel.innerHTML = Object.keys(CLANS).map(n => '<option>' + esc(n) + '</option>').join('');
  build(); resetForm(); editingId = id || null;
  if(editingId){ const c = chars().find(x => x.id === editingId); if(c) fill(c); } else loadBase();
  recalc(); $('#sheetModal').classList.add('open'); $('#sheetModal').scrollTop = 0;
};
window.editChar = id => window.openSheet(id);

function collect(){
  const sh = {};
  Object.entries(TXT).forEach(([id, k]) => sh[k] = $('#'+id).value.trim());
  Object.entries(NUM).forEach(([id, k]) => sh[k] = parseInt($('#'+id).value, 10) || 0);
  sh.avatar = avatarData || $('#shAvatarUrl').value.trim();
  return sh;
}
window.saveChar = async function(){
  const S = window.MENPHIS_SB; if(!S || !window.MENPHIS_USER) return toast('Entre na sua conta para salvar o personagem.');
  const name = $('#shName').value.trim(); if(!name) return toast('Dê um nome ao personagem.');
  const words = $('#shHist').value.trim().split(/\s+/).filter(Boolean).length;
  if(words < 80 && !confirm('A história tem ' + words + ' palavras (o livro pede no mínimo 80). Salvar mesmo assim?')) return;
  const clan = $('#shClan').value, c = CLANS[clan];
  const row = {name, clan, variant: c.variants ? $('#shVariant').value : '', stats: cur, level: Math.max(1, parseInt($('#shLevel').value, 10) || 1), sheet: collect()};
  const {error} = editingId ? await S.from('characters').update(row).eq('id', editingId) : await S.from('characters').insert(row);
  if(error) return toast(/sheet/.test(error.message) ? 'Rode o update_v5.sql no Supabase (coluna "sheet" não existe).' : error.message);
  closeModals(); toast('Personagem salvo!'); if(window.renderChars) window.renderChars();
};

/* ---------- importar / exportar o modelo ---------- */
const LABELS = [
  ['_attrs', /Atributos\s+de\s+Cl[ãa]/i], ['nome', /Nome/i], ['idade', /Idade/i], ['aparencia', /Avatar(?:\s+ou\s+Apar[eê]ncia)?|Apar[eê]ncia/i], ['personalidade', /Personalidade/i],
  ['casta', /Casta\s+Social/i], ['gosto', /Gostos?(?:\s*\/+\s*Desgostos?)?/i], ['cla', /Cl[ãa]/i], ['forca', /For[çc]a(?:\s+f[ií]sica)?/i],
  ['res', /Resist[êe]ncia\s+F[ií]sica\s*\/\s*M[áa]gica/i], ['vel', /Velocidade/i], ['int', /Intelig[êe]ncia/i], ['cap', /Capacidade\s+M[áa]gica/i],
  ['maestria', /Maestria(?:\s+(?:com|em)\s+Armas?)?/i], ['controle', /Controle\s+de\s+Mana/i], ['mana', /Mana/i], ['historia', /Hist[óo]ria/i], ['xp', /Xp/i],
  ['itens', /Itens/i], ['tarjas', /Tarjas(?:\s*\(moedas\))?/i], ['quanti', /Pontos\s+Quanti/i], ['poderes', /Poderes\s*\/*\s*Magias/i], ['talentos', /Talentos/i], ['pets', /Pet'?s/i]
];
const nrm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function parseFicha(text){
  const t = String(text || '').replace(/\r/g, '');
  const hits = [];
  LABELS.forEach(([key, re]) => {
    const g = new RegExp('(?:^|[\\s༺➥•>*\\-])(' + re.source + ')\\s*(?:\\([^)]*\\))?\\s*(?:[-–—]*»|:)', 'gi');
    let m; while((m = g.exec(t))){ const s = m.index + m[0].indexOf(m[1]); hits.push({key, start: s, end: m.index + m[0].length, len: m[1].length}); if(m.index === g.lastIndex) g.lastIndex++; }
  });
  hits.sort((a, b) => a.start - b.start || b.len - a.len);
  const keep = []; hits.forEach(h => { const last = keep[keep.length - 1]; if(last && h.start < last.end){ if(h.len > last.len) keep[keep.length - 1] = h; } else keep.push(h); });
  const out = {}; const warn = [];
  keep.forEach((h, i) => {
    let v = t.slice(h.end, i + 1 < keep.length ? keep[i + 1].start : t.length);
    v = v.replace(/\{•[^}]*\}/g, ' ').replace(/\((?:Não é possível|Só podem|Só pode)[^)]*\)/gi, ' ').replace(/[─═╭╧╤📜🌕🌑༺]+/g, ' ').replace(/•\s*Descri[çc][ãa]o:?/gi, ' ');
    if(h.key !== '_attrs' && out[h.key] == null) out[h.key] = v.trim();
  });
  const lines = v => String(v || '').split(/\n|➥/).map(x => x.replace(/^[\s➥•\-]+/, '').trim()).filter(Boolean).join('\n');
  const num = v => { const m = String(v || '').match(/\d[\d.,]*/); return m ? parseInt(m[0].replace(/[.,]/g, ''), 10) : null; };
  const r = {name: (out.nome || '').replace(/\s+/g, ' ').trim(), idade: (out.idade || '').trim(), aparencia: (out.aparencia || '').replace(/\s+/g, ' ').trim(), personalidade: (out.personalidade || '').replace(/\s+/g, ' ').trim(),
    historia: (out.historia || '').replace(/\s+/g, ' ').trim(), itens: lines(out.itens), poderes: lines(out.poderes), talentos: lines(out.talentos), pets: lines(out.pets), stats: {}};
  if(out.gosto){ const p = out.gosto.split(/\/+|desgosto[s]?\s*[:\-]?/i).map(x => x.replace(/^\s*gostos?\s*[:\-]?/i, '').trim()); r.gosto = p[0] || ''; r.desgosto = p[1] || ''; }
  if(out.casta){ const c = nrm(out.casta); r.casta = /esquecid/.test(c) ? 'Esquecida' : /nobre|real/.test(c) ? 'Nobre' : /comum/.test(c) ? 'Comum' : ''; }
  if(out.cla){ const c = nrm(out.cla); const key = Object.keys(CLANS).find(k => c.includes(nrm(k).split(/\s*\/\s*/)[0].slice(0, Math.max(4, nrm(k).split(/\s*\/\s*/)[0].length - 1)))); if(key){ r.clan = key; const v = CLANS[key].variants; if(v) r.variant = Object.keys(v).find(x => c.includes(nrm(x).split(' ')[0] === 'elfo' ? nrm(x).split(' ').slice(-1)[0] : nrm(x).split(' ')[0])) || ''; } else warn.push('Clã "' + out.cla.trim() + '" não reconhecido.'); }
  const st = r.stats; const n = {forca: 'strength', vel: 'speed', int: 'intelligence', cap: 'magic_capacity', maestria: 'weapon_mastery'};
  Object.entries(n).forEach(([k, a]) => { const x = num(out[k]); if(x != null) st[a] = x; });
  if(out.res){ const ns = (String(out.res).match(/\d+/g) || []).map(Number); if(ns.length){ st.physical_resistance = ns[0]; st.magic_resistance = ns.length > 1 ? ns[1] : ns[0]; } }
  if(out.controle){ const m = String(out.controle).match(/Rank\s*([IVX]+)/i); if(m && RANKS.includes(m[1].toUpperCase())) r.rank = m[1].toUpperCase(); }
  const mana = String(out.mana || '').match(/(\d+)\s*(?:\/\s*(\d+))?/); if(mana){ r.mana = +mana[1]; r.mana_max = mana[2] ? +mana[2] : +mana[1]; }
  if(out.xp){ const l = out.xp.match(/Lvl\s*(\d+)/i), p = out.xp.match(/\(?\s*(\d+)\s*\/\s*(\d+)\s*\)?/); if(l) r.level = +l[1]; if(p){ r.xp = +p[1]; r.xp_max = +p[2]; } }
  const tj = num(out.tarjas); if(tj != null) r.tarjas = tj; const qp = num(out.quanti); if(qp != null) r.quanti = qp;
  r.warn = warn; return r;
}
window.MENPHIS_parseFicha = parseFicha;
function applyImport(r){
  const msg = [...r.warn]; const set = (id, v) => { if(v != null && v !== '') $('#'+id).value = v; };
  set('shName', r.name); set('shIdade', r.idade); set('shApar', r.aparencia); set('shPers', r.personalidade); set('shGosto', r.gosto); set('shDesgosto', r.desgosto);
  set('shHist', r.historia); set('shItens', r.itens); set('shPoderes', r.poderes); set('shTalentos', r.talentos); set('shPets', r.pets);
  if(r.casta){ $('#shCasta').value = r.casta; delete $('#shTarjas').dataset.manual; }
  if(r.level) $('#shLevel').value = r.level; set('shXp', r.xp); set('shXpMax', r.xp_max); if(r.rank) $('#shRank').value = r.rank;
  if(r.tarjas != null){ $('#shTarjas').value = r.tarjas; $('#shTarjas').dataset.manual = '1'; } if(r.quanti != null) $('#shQuanti').value = r.quanti;
  if(r.clan){
    $('#shClan').value = r.clan; $('#shVariant').dataset.clan = ''; loadBase(); if(r.variant){ $('#shVariant').value = r.variant; loadBase(); }
    Object.entries(r.stats).forEach(([k, v]) => { if(v < base[k]){ msg.push(LABEL_PT(k) + ' ' + v + 'x ajustado ao mínimo do clã (' + base[k] + 'x).'); v = base[k]; } cur[k] = v; });
    renderAttrs();
  } else if(Object.keys(r.stats).length) msg.push('Informe o Clã para aplicar os atributos.');
  if(r.mana_max != null){ $('#shManaMax').value = r.mana_max; $('#shMana').value = r.mana; $('#shManaMax').dataset.manual = $('#shMana').dataset.manual = '1'; }
  recalc(); $('#shImportMsg').textContent = '✅ Ficha importada.' + (msg.length ? ' ' + msg.join(' ') : '');
}
const LABEL_PT = k => ({strength:'Força', weapon_mastery:'Maestria', speed:'Velocidade', physical_resistance:'Res. Física', magic_resistance:'Res. Mágica', magic_capacity:'Cap. Mágica', intelligence:'Inteligência'}[k] || k);

function toTemplate(c){
  const sh = c.sheet || {}, s = c.stats || {}, bl = x => String(x || '').split('\n').filter(Boolean).map(l => '➥' + l).join('\n') || '➥';
  return ['🌕 Ficha Menphis 🌑', '╭────────────────────', '༺Nome-» ' + c.name, '༺Idade-» ' + (sh.idade || ''), '༺Avatar ou Aparência-» ' + (sh.aparencia || ''), '༺Personalidade-» ' + (sh.personalidade || ''),
    '༺Casta Social-» ' + (sh.casta || ''), '༺Gosto /// Desgosto-» ' + (sh.gosto || '') + ' /// ' + (sh.desgosto || ''), '༺Clã-» ' + c.clan + (c.variant ? ' (' + c.variant + ')' : ''), '༺Atributos de Clã:',
    '➥Força: ' + s.strength + 'x', '➥Resistência Física/Mágica: ' + s.physical_resistance + 'x / ' + s.magic_resistance + 'x', '➥Velocidade: ' + s.speed + 'x', '➥Inteligência: ' + s.intelligence + 'x',
    '➥Capacidade Mágica: ' + s.magic_capacity + 'x', '➥Maestria com Arma: ' + s.weapon_mastery + 'x', '➥Controle de Mana: Rank ' + (sh.controle_rank || 'I'), '➥Mana: ' + (sh.mana || 0) + '/' + (sh.mana_max || 0),
    '༺História-» ' + (sh.historia || ''), '༺Xp: Lvl ' + c.level + ' (' + (sh.xp || 0) + '/' + (sh.xp_max || 200) + ')', '༺Itens:', bl(sh.itens), '༺Tarjas (moedas): ' + (sh.tarjas || 0), '༺Pontos Quanti: ' + (sh.quanti != null ? sh.quanti : 2),
    '༺Poderes///Magias:', bl(sh.poderes), '༺Talentos:', bl(sh.talentos), "༺Pet's:", bl(sh.pets), '📜╧╤╧╤╧╤╧╤╧╤╧╤╧╧╤╧╤╧╤📜'].join('\n');
}

/* ---------- janela de status estilo Solo Leveling ---------- */
const ATTR = [['strength','FORÇA'],['speed','VELOCIDADE'],['physical_resistance','RES. FÍSICA'],['magic_resistance','RES. MÁGICA'],['intelligence','INTELIGÊNCIA'],['magic_capacity','CAP. MÁGICA'],['weapon_mastery','MAESTRIA']];
let typeTok = 0;
function typeLine(el, text){ const my = ++typeTok; let i = 0; el.textContent = ''; (function step(){ if(my !== typeTok) return; el.textContent = text.slice(0, ++i); if(i < text.length) setTimeout(step, 22); })(); }
function countUp(el, to, ms = 800){ const t0 = performance.now(); (function f(t){ const k = Math.min(1, (t - t0) / ms); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if(k < 1) requestAnimationFrame(f); })(t0); }
const list = v => { const a = String(v || '').split('\n').filter(Boolean); return a.length ? a : []; };
window.openChar = function(id){
  const c = chars().find(x => x.id === id); if(!c) return;
  const sh = c.sheet || {}, s = c.stats || {}, cl = CLANS[c.clan] || {icon:'⚔️'};
  const ep = 100 + Math.floor(((s.physical_resistance || 0) + (s.magic_resistance || 0)) / 10) * 25;
  const manaMax = sh.mana_max || 0, mana = sh.mana != null ? sh.mana : manaMax, xpMax = sh.xp_max || 200, xp = sh.xp || 0, rank = sh.controle_rank || 'I';
  const pct = (a, b) => b ? Math.max(0, Math.min(100, a / b * 100)) : 0;
  let w = $('#slWin'); if(!w){ w = document.createElement('div'); w.id = 'slWin'; w.className = 'sl-overlay'; document.body.appendChild(w);
    w.addEventListener('mousedown', e => { if(e.target === w) w.classList.remove('open'); }); document.addEventListener('keydown', e => { if(e.key === 'Escape') w.classList.remove('open'); }); }
  const own = window.MENPHIS_USER && (c.owner === window.MENPHIS_USER.id || (window.MENPHIS_PROF && ['mestre','admin'].includes(window.MENPHIS_PROF.role)));
  const secs = (title, items, fmt) => items.length ? '<div class="sl-sec"><h5>[ ' + title + ' ]</h5>' + items.map(fmt).join('') + '</div>' : '';
  w.innerHTML = `<div class="sl-panel"><button class="sl-x" aria-label="Fechar">×</button>
    <div class="sl-sys" id="slSys"></div>
    <div class="sl-head"><div class="sl-av">${sh.avatar ? '<img src="' + esc(sh.avatar) + '" alt="">' : '<span>' + cl.icon + '</span>'}</div>
      <div class="sl-id"><div class="sl-title">[ STATUS ]</div><div class="sl-name">${esc(c.name)}</div><div class="sl-sub">${esc(c.clan)}${c.variant ? ' · ' + esc(c.variant) : ''}${sh.casta ? ' · Casta ' + esc(sh.casta) : ''}${sh.idade ? ' · ' + esc(sh.idade) + ' anos' : ''}</div></div>
      <div class="sl-lvl"><small>NÍVEL</small><b data-n="${c.level || 1}">0</b></div></div>
    <div class="sl-bars">
      <div class="sl-bar ep"><span>EP</span><div><i data-w="100"></i></div><em>${ep} / ${ep}</em></div>
      <div class="sl-bar mp"><span>MANA</span><div><i data-w="${pct(mana, manaMax)}"></i></div><em>${mana} / ${manaMax}</em></div>
      <div class="sl-bar xp"><span>XP</span><div><i data-w="${pct(xp, xpMax)}"></i></div><em>${xp} / ${xpMax}</em></div></div>
    <div class="sl-attrs">${ATTR.map(([k, l]) => '<div class="sl-attr"><span>' + l + '</span><div class="sl-ab"><i data-w="' + Math.min(100, s[k] || 0) + '"></i></div><b><span data-n="' + (s[k] || 0) + '">0</span>x</b></div>').join('')}</div>
    <div class="sl-row"><div class="sl-chip">PONTOS QUANTI <b>${sh.quanti != null ? sh.quanti : 2}</b></div><div class="sl-chip gold">TARJAS <b>${Number(sh.tarjas || 0).toLocaleString('pt-BR')}</b></div><div class="sl-chip">CONTROLE DE MANA <b>RANK ${rank}</b> <small>${rankName(rank)}</small></div></div>
    ${(sh.quanti || 0) > 0 ? '<div class="sl-note">[NOTIFICAÇÃO] Você possui <b>' + (sh.quanti) + '</b> Ponto(s) Quanti disponível(is) para poderes.</div>' : ''}
    ${secs('HABILIDADES / PODERES', list(sh.poderes), p => '<div class="sl-skill"><b>' + esc(p.split(/\s[—-]\s/)[0]) + '</b><small>' + esc(p.split(/\s[—-]\s/).slice(1).join(' — ')) + '</small></div>')}
    ${secs('TALENTOS', list(sh.talentos), p => '<div class="sl-tag">' + esc(p) + '</div>')}
    ${secs('INVENTÁRIO', list(sh.itens), p => '<div class="sl-tag">' + esc(p) + '</div>')}
    ${secs("COMPANHIA", list(sh.pets), p => '<div class="sl-tag">' + esc(p) + '</div>')}
    ${sh.personalidade ? '<div class="sl-sec"><h5>[ PERSONALIDADE ]</h5><p>' + esc(sh.personalidade) + '</p></div>' : ''}
    ${sh.gosto || sh.desgosto ? '<div class="sl-sec"><h5>[ GOSTOS ]</h5><p>👍 ' + esc(sh.gosto || '—') + ' &nbsp; 👎 ' + esc(sh.desgosto || '—') + '</p></div>' : ''}
    ${sh.historia ? '<details class="sl-sec"><summary>[ HISTÓRIA ]</summary><p>' + esc(sh.historia) + '</p></details>' : ''}
    <div id="slRep"></div><div class="sl-actions">${own ? '<button class="btn btn-sm" id="slEdit">✏️ Editar ficha</button>' : ''}<button class="btn btn-sm" id="slExport">📤 Exportar .txt</button><button class="btn btn-sm" id="slClose">Fechar</button></div></div>`;
  w.classList.add('open'); w.scrollTop = 0;
  if(window.MENPHIS_repHtml) window.MENPHIS_repHtml(id).then(h => { const r = $('#slRep'); if(r) r.innerHTML = h; });
  typeLine($('#slSys'), '[SISTEMA] Janela de status aberta. Bem-vindo, ' + c.name + '.');
  requestAnimationFrame(() => requestAnimationFrame(() => { $$('#slWin [data-w]').forEach(i => i.style.width = i.dataset.w + '%'); $$('#slWin [data-n]').forEach(b => countUp(b, +b.dataset.n)); }));
  $('#slWin .sl-x').onclick = $('#slClose').onclick = () => w.classList.remove('open');
  if($('#slEdit')) $('#slEdit').onclick = () => { w.classList.remove('open'); window.openSheet(id); };
  $('#slExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toTemplate(c)], {type:'text/plain;charset=utf-8'})); a.download = 'ficha-' + c.name.replace(/\W+/g, '-') + '.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
};
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
