/* MENPHIS — aba Tutorial: livro de regras completo (gerado de rpg-knowledge.js) */
(function(){
'use strict';
const KB = (window.RPG_KB || []).filter(c => c.t.startsWith('Livro de Regras'));
const page = n => { const c = KB.find(k => k.t.endsWith('pág. ' + n + ')')); return c ? c.x : ''; };
const SECTIONS = [
  ['regras','📜','Regras de Convivência e Participação',[2]],
  ['prologo','📖','Prólogo — Os Ecos do Colapso',[3,4]],
  ['ficha','📝','Ficha de Personagem',[6]],
  ['magia','✨','Magia, Mana e Custo de Magia',[7,8]],
  ['humanos','💎','Humanos e a Gema Quantium',[9,10]],
  ['casta','👑','Casta Social',[11]],
  ['runas','🔣','Runas e Círculos Arcanos',[12,13,14,15]],
  ['atributos','📊','Atributos e a Escala "x"',[16,17,18,19,20]],
  ['ep','💥','Pontos Espirituais (EP) e Dano',[21,22]],
  ['treino','🏋️','Treinamento',[23,24,25,26]],
  ['companhia','🐾','Companhia (Pets)',[27,28]],
  ['niveis','⭐','Níveis e Custo de XP',[29,30]],
  ['missoes','🗡️','Missões',[31,32,33]],
  ['recompensas','🏆','Recompensas',[34,35,36,37,38,39]],
  ['guildas','🏰','Guildas',[40,41,42,43]]
];
const COLS = new Set([8,30]);
const HEAD = /^(Atributos|Treinamento|Recompensas|Missões|Guildas|Companhia|Runas|Magia|Ficha|Casta Social|Prólogo|Níveis|Pontos Espirituais|Gema Quantium|Humanos e Magia|Custo de Magia|Custo de XP: Patamar|RPG|Menphis|Regras)$/;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const rx = q => new RegExp('(' + q.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|') + ')', 'gi');

function renderPage(n, q){
  let lines = page(n).split('\n').filter(l => l.trim());
  while(lines.length && HEAD.test(lines[0].trim())) lines.shift();
  const hl = t => { t = esc(t); return q && q.trim().length > 1 ? t.replace(rx(esc(q)), '<mark>$1</mark>') : t; };
  const out = lines.map((l, i) => {
    const t = l.trim();
    if(/^[-–—→●•➥>]\s*/.test(t) || /^\d+\s*[-–.)]\s/.test(t)) return '<div class="tl">' + hl(t) + '</div>';
    if(t.length <= 46 && !/[.,;]$/.test(t) && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ“"(]/.test(t) && i < lines.length - 1 && !COLS.has(n)) return '<h4>' + hl(t) + '</h4>';
    return '<p>' + hl(t) + '</p>';
  }).join('');
  return '<div class="tpage' + (COLS.has(n) ? ' cols' : '') + '">' + out + '</div>';
}
function render(q){
  const wrap = document.getElementById('tutBody'); if(!wrap) return;
  const nq = norm(q || '').trim();
  let shown = 0;
  wrap.innerHTML = SECTIONS.map(([id, ic, title, pages]) => {
    const text = pages.map(page).join(' ');
    if(nq.length > 1 && !norm(text + ' ' + title).includes(nq.split(/\s+/)[0]) ) return '';
    if(nq.length > 1 && !nq.split(/\s+/).every(w => norm(text + ' ' + title).includes(w))) return '';
    shown++;
    return '<details class="sec" id="tut-' + id + '"' + (nq.length > 1 ? ' open' : '') + '><summary><span>' + ic + ' ' + esc(title) + '</span><small>pág. ' + pages[0] + (pages.length > 1 ? '–' + pages[pages.length-1] : '') + '</small></summary><div class="sec-body">' + pages.map(n => renderPage(n, q)).join('') + '</div></details>';
  }).join('') || '<div class="empty"><span class="big">🔎</span><p>Nada encontrado no livro para essa busca.</p></div>';
  const c = document.getElementById('tutCount'); if(c) c.textContent = nq.length > 1 ? shown + ' seção(ões) encontrada(s)' : SECTIONS.length + ' seções · livro de regras completo';
}
function init(){
  const toc = document.getElementById('tutToc'); if(!toc) return;
  toc.innerHTML = SECTIONS.map(([id, ic, t]) => '<button class="chip" data-id="' + id + '">' + ic + ' ' + esc(t.split(' — ')[0]) + '</button>').join('');
  toc.addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return;
    const d = document.getElementById('tut-' + b.dataset.id); if(!d){ document.getElementById('tutSearch').value=''; render(''); } 
    const el = document.getElementById('tut-' + b.dataset.id); if(el){ el.open = true; el.scrollIntoView({behavior:'smooth', block:'start'}); } });
  let t; document.getElementById('tutSearch').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => render(e.target.value), 200); });
  document.getElementById('tutOpen').addEventListener('click', () => document.querySelectorAll('#tutBody details').forEach(d => d.open = true));
  document.getElementById('tutClose').addEventListener('click', () => document.querySelectorAll('#tutBody details').forEach(d => d.open = false));
  render('');
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
