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
})();
