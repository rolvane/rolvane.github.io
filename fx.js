/* MENPHIS — animações de fluidez: direção do deslize entre telas + escalonamento de entrada */
(function(){
'use strict';
const order = [...document.querySelectorAll('#nav a')].map(a => a.getAttribute('href').replace(/^#\/?/,''));
const key = () => (location.hash.replace(/^#\/?/,'') || '').split('?')[0];
let last = order.indexOf(key());
window.addEventListener('hashchange', () => {
  const i = order.indexOf(key());
  document.body.dataset.dir = (i !== -1 && last !== -1 && i < last) ? 'back' : 'fwd';
  if(i !== -1) last = i;
});
const SEL = '.card,.clan-card,.shop-card,.char-card,.tool-card,.quick-card,.turn,.stat-card,.guild-card';
function stagger(root){
  const els = root.matches && root.matches(SEL) ? [root] : [];
  root.querySelectorAll && root.querySelectorAll(SEL).forEach(e => els.push(e));
  els.forEach(el => { const p = el.parentElement; if(!p) return; el.style.setProperty('--i', Math.min([...p.children].indexOf(el), 14)); });
}
stagger(document.body);
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if(n.nodeType === 1) stagger(n); }))).observe(document.body, {childList:true, subtree:true});

/* botões da Home que rolam até uma seção */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-scroll]'); if(!a) return;
  const go = () => { const el = document.getElementById(a.dataset.scroll); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); };
  if(!key()){ e.preventDefault(); go(); } else setTimeout(go, 520);
});
/* painel de status: mostra o que carregou e qual arquivo falta */
const paintStatus = () => {
  const box = document.getElementById('sysStatus'); if(!box) return;
  const kb = (window.RPG_KB || []).length;
  const items = [
    ['Livro de regras (' + kb + ' trechos)', kb > 50, 'rpg-knowledge.js'],
    ['Tutorial', document.querySelectorAll('#tutBody details').length > 5, 'tutorial.js'],
    ['Chat IA', typeof window.geminiImage === 'function', 'ai.js'],
    ['IA ativa (chave do admin)', !!window.MENPHIS_AI_READY, 'Painel Admin → IA'],
    ['Supabase', !!window.supabase, 'internet / bloqueador'],
    ['Sistema online', !!window.MENPHIS_ONLINE, 'app.js + config.js']
  ];
  box.innerHTML = items.map(([n, ok, file]) => '<span class="chip ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✅ ' : '❌ ') + n + (ok ? '' : ' → ' + file) + '</span>').join('');
};
window.addEventListener('load', paintStatus); window.addEventListener('menphis-status', paintStatus);
/* modo visitante: libera Tutorial, Clãs e o Guardião sem login */
const g = document.getElementById('authGuest');
if(g) g.addEventListener('click', () => {
  window.__guest = true;
  document.getElementById('authGate').style.display = 'none';
  const u = document.getElementById('userBar');
  if(u && !u.textContent.trim()) u.innerHTML = '👤 Visitante · <a href="#" onclick="window.__guest=false;showLogin&&showLogin();document.getElementById(\'authGate\').style.display=\'flex\';return false">Entrar</a>';
});
})();
