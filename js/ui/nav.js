/* navigazione: Cella singola · Superficie piana · Cilindro (progetto, stampa 3D, bladder) */
PAGE='model';
const PAGES={cell:['pgCell','tabCell','#cella'],plane:['pgPlane','tabPlane','#piano'],doc:['pgDoc','tabDoc','#modelli'],model:['pgModel','tabModel','#progetto'],print:['pgPrint','tabPrint','#stampa'],bld:['pgBld','tabBld','#bladder']};
function showPage(pg){
  PAGE=pg;
  for(const [k,[div,tab]] of Object.entries(PAGES)){ $(div).hidden=k!==pg; $(tab).setAttribute('aria-selected',k===pg); }
  if(pg==='bld'){ initBV(); bvResize(); bldTheme(); if(!BLD){ bldInvalidate(); if(!bldMsgPre()) bldBuild(); } else { bldVis(); drawBChart(); } }
  else if(pg==='print'){ initPV(); pvResize(); PV.sc.background=new THREE.Color(tok('--vp')); if(!PRINT) genPrint(); else { buildPV(); setMode(PV_MODE); } }
  else if(pg==='cell'){ if(typeof plCellShow==='function') plCellShow(); }
  else if(pg==='plane'){ if(typeof plPlaneShow==='function') plPlaneShow(); }
  else if(pg==='doc'){ if(typeof docShow==='function') docShow(); }
  else { resize(); }
  try{ history.replaceState(null,'',PAGES[pg][2]); }catch(e){}
}
for(const k of Object.keys(PAGES)) $(PAGES[k][1]).onclick=()=>showPage(k);


/* ---- pannello a sinistra di ogni pagina: sezioni a schede e larghezza regolabile ---- */
/* sezioni (.step) dell'aside come schede, una alla volta; names = etichette (altrimenti il titolo h2 della sezione) */
function secTabs(aside,key,names){
  const secs=[...aside.querySelectorAll(':scope>section.step')]; if(!secs.length) return null;
  const lab=secs.map((x,i)=>(names&&names[i])||(x.querySelector('h2')?x.querySelector('h2').textContent.trim():'Sezione '+(i+1)));
  let cur=0; try{ cur=Math.min(secs.length-1,Math.max(0,+localStorage.getItem('tab_'+key)||0)); }catch(e){}
  const bar=document.createElement('div'); bar.className='sectabs'; bar.setAttribute('role','tablist');
  const show=(i,silent)=>{ cur=i; secs.forEach((x,j)=>x.classList.toggle('tabhide',j!==i)); [...bar.children].forEach((b,j)=>b.setAttribute('aria-selected',j===i));
    try{ localStorage.setItem('tab_'+key,i); }catch(e){} if(!silent) requestAnimationFrame(()=>window.dispatchEvent(new Event('resize'))); };
  secs.forEach((x,i)=>{ x.classList.add('tabbed'); const b=document.createElement('button'); b.type='button'; b.setAttribute('role','tab'); b.textContent=lab[i]; b.onclick=()=>show(i); bar.appendChild(b); });
  aside.insertBefore(bar,secs[0]); show(cur,true);
  return show;
}
/* divisore trascinabile fra pannello e vista (larghezza condivisa da tutte le pagine; doppio clic = larghezza iniziale) */
function panelSplitter(){
  const apps=[...document.querySelectorAll('.plapp')], apply=w=>apps.forEach(a=>a.style.setProperty('--aw',w+'px'));
  const redraw=()=>{ window.dispatchEvent(new Event('resize'));
    try{ if(PAGE==='print'&&typeof pvResize==='function') pvResize(); else if(PAGE==='bld'&&typeof bvResize==='function') bvResize(); else if(PAGE==='model'&&typeof resize==='function') resize(); }catch(e){}
    if(typeof PL!=='undefined') for(const S of Object.values(PL)) if(S.M){ plDraw(S); plCharts(S); } };
  try{ const w=+localStorage.getItem('plAsideW'); if(w>=260) apply(w); }catch(e){}
  document.querySelectorAll('.plapp>.vsplit').forEach(sp=>{
    sp.addEventListener('pointerdown',ev=>{
      ev.preventDefault(); sp.setPointerCapture(ev.pointerId); sp.classList.add('drag');
      const left=sp.parentElement.getBoundingClientRect().left; let raf=0;
      const mv=e=>{ const w=Math.round(Math.max(260,Math.min(e.clientX-left,Math.min(900,innerWidth-320)))); apply(w); try{ localStorage.setItem('plAsideW',w); }catch(_){}
        if(!raf) raf=requestAnimationFrame(()=>{ raf=0; redraw(); }); };
      const up=()=>{ sp.classList.remove('drag'); sp.removeEventListener('pointermove',mv); sp.removeEventListener('pointerup',up); sp.removeEventListener('pointercancel',up); redraw(); };
      sp.addEventListener('pointermove',mv); sp.addEventListener('pointerup',up); sp.addEventListener('pointercancel',up);
    });
    sp.addEventListener('dblclick',()=>{ apps.forEach(a=>a.style.removeProperty('--aw')); try{ localStorage.removeItem('plAsideW'); }catch(_){} redraw(); });
  });
}
panelSplitter();
for(const [id,key] of [['pgModel','model'],['pgPrint','print'],['pgBld','bld']]){ const a=document.querySelector('#'+id+'>aside'); if(a) secTabs(a,key); }
