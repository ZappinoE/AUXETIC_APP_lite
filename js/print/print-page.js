/* ---------- scheda Stampa 3D ---------- */
var PRINT=null;
const canSave=location.protocol==='file:';
let DL=null;   // capacità "downloads" della pagina pubblicata (null = non disponibile)
(async()=>{ try{ if(window.claude&&typeof window.claude.use==='function'){ DL=await window.claude.use('downloads'); if(PRINT) renderBom(); } }catch(e){ DL=null; } })();
function printOpts(){
  const P=cur.P, N=Math.max(1,+$('pScale').value||20), k=1000/N;
  const thkIn=+$('pThk').value;
  const v=(id,d,mn)=>Math.max(mn,+$(id).value||d);
  return {scale:1/N, gap:v('pGap',0.4,0.01), head:v('pHead',1.1,0.2), dTri:v('pDTri',3.2,0.2), dY:v('pDY',2.4,0.2), neck:v('pNeck',0.8,0.1), wall:v('pWall',0.4,0.1), clr:v('pClr',0.05,0),
          sp:thkIn>0?thkIn:P.s*k, rho:v('pRho',1.24,0.01), rhoT:v('pRhoT',1.21,0.01), Et:v('pEt',26,0.01), N, flat:$('pFlat').checked,
          lf:v('pLf',1.2,0.2), lt:($('pLt').value===''?1.0:Math.max(0,+$('pLt').value||0)), wp:v('pWp',1.6,0.3), dvN:v('pDvN',1.0,0.3), dvW:v('pDvW',2.2,0.5), dvL:v('pDvL',1.8,0.3),
          bulk:P.ends==='bulkhead', tb:v('pTb',3,0.4), wL:v('pWL',6,1), gb:v('pGb',1.5,0.2), wb:v('pWb',1.6,0.3), rc:Math.max(0,(+$('pRc').value||0)/2)};
}
function invalidatePrint(){ PRINT=null; SEL=-1; $('bomBody').innerHTML=''; $('pInfo').innerHTML=''; $('bZip').disabled=true; $('bCsv').disabled=true; $('p6').textContent='da generare'; $('p6').classList.remove('done'); clearPV(); if(PAGE==='print') schedulePrint(); }
let printTimer=null; function schedulePrint(){ clearTimeout(printTimer); printTimer=setTimeout(()=>{ if(PAGE==='print'&&!PRINT) genPrint(); },400); }
function genPrint(){
  if(!COL||!cur||!cur.A.valid){ $('pMsg').textContent='Nella pagina "Progetto e simulazione" genera prima le celle (passo 3) con una geometria valida.'; return; }
  if(typeof ClipperLib==='undefined'||typeof earcut==='undefined'){ $('pMsg').textContent='Librerie di geometria non disponibili: controlla la connessione o usa la versione offline.'; return; }
  const P=cur.P, G=cur.A.G, o=printOpts(), k=1000*o.scale;
  const msgs=[];
  if(o.dTri<2*(o.head+o.clr+o.wall)) msgs.push('Nel triangolo il bottone è troppo vicino allo spigolo: con angolo di 60° serve una distanza ≥ '+fmt(2*(o.head+o.clr+o.wall),2)+' mm.');
  if(o.dvW<=o.dvN+0.2) msgs.push('La testa della coda di rondine deve essere più larga del collo, altrimenti l\'inserto non resta bloccato.');
  if(o.neck<0.8) msgs.push('Striscia TPU sotto 0,8 mm: al limite per la stampa FDM.');
  if(o.sp<0.8) msgs.push('Spessore di stampa sotto 0,8 mm.');
  const ymin=Math.min(...ROWS.map(r=>r.y))*k, need=2*(o.head+o.clr+o.wall); if(ymin<need) msgs.push('Le Y più sottili ('+fmt(ymin,2)+' mm) sono più strette del foro del bottone con le sue pareti ('+fmt(need,2)+' mm).');
  if(o.gap<0.2) msgs.push('Gioco sotto 0,2 mm: in FDM le parti rischiano di saldarsi.');
  if(o.bulk&&o.wL<2*(o.head+o.clr+o.wall)+0.5) msgs.push('Aletta del bulkhead troppo stretta per il bottone: serve una larghezza ≥ '+fmt(2*(o.head+o.clr+o.wall)+0.5,1)+' mm.');
  $('pMsg').textContent=msgs.join(' ');
  $('p6').textContent='calcolo…';
  setTimeout(()=>{
    const t0=performance.now();
    const R=buildPrintParts(P,G,COL,cur.A.Bf,o);
    const hinges=COL.hin.length*P.Nc, bpins=R.bulk?R.bulk.pins.length*P.Nc:0;
    PRINT={R,o,P,G,hinges,bpins,ms:performance.now()-t0};
    const extra=[];
    const short=R.hinges.filter(h=>h.lfe<o.lf-1e-6).length; if(short) extra.push('In '+short+' cerniere su '+R.hinges.length+' il taglio fra punta e spigolo è corto: il tratto libero è ridotto al 75% del taglio.');
    const red=R.tips.filter(t=>t.tongueSc<1).length, bad=R.tips.filter(t=>!t.tongueOK).length;
    if(red) extra.push('Coda di rondine ridotta in '+red+' punte su '+R.tips.length+' (bracci stretti o al bordo del tubo)'+(bad?'; in '+bad+' non c\'è spazio per la parete minima: controlla quei pezzi':'')+'.');
    if(R.bulk&&2*R.bulk.Rb>200) extra.push('Il bulkhead misura Ø '+fmt(2*R.bulk.Rb,1)+' mm: controlla che stia sul piatto della stampante (altrimenti aumenta la scala).');
    if(extra.length) $('pMsg').textContent=($('pMsg').textContent+' '+extra.join(' ')).trim();
    renderBom(); $('bZip').disabled=false; $('bCsv').disabled=false;
    $('p6').textContent='pronto'; $('p6').classList.add('done');
    R.parts.forEach(pt=>{pt.cls=R.classes.findIndex(c=>c.sig===pt.sig);});
    buildPV(); setMode(PV_MODE);
  },20);
}
function bomRows(){
  const {R,o,P,hinges,bpins}=PRINT, rows=[];
  for(const c of R.classes){
    const m=c.vol/1000*o.rho;
    if(c.kind==='BULK'){ rows.push({code:c.code,tipo:'Bulkhead (disco con '+(c.nLug*P.Nc)+' alette)',righe:c.where,q:c.nPerTube,dim:c.bbox.map(v=>v.toFixed(1)).join(' × '),vol:c.vol/1000,m,mt:m*c.nPerTube,
      note:c.n>1?'uguale per base e cima (la cima si monta capovolta)':'',file:c.code+'.stl'}); continue; }
    rows.push({code:c.code,tipo:c.kind==='ROT'?'Triangolo rotante':'Y (parte esterna)',righe:[...c.rows].sort((a,b)=>a-b).join(', '),q:c.nPerTube,
      dim:c.bbox.map(v=>v.toFixed(1)).join(' × '),vol:c.vol/1000,m,mt:m*c.nPerTube,note:c.mirrorOf?'speculare di '+c.mirrorOf:(c.selfMirror?'simmetrico':''),file:c.code+'.stl'});
  }
  for(const I of R.insert.classes){ const mi=I.vol/1000*o.rhoT;
    rows.push({code:I.code,tipo:I.bulkIns?'Inserto TPU del bulkhead':'Inserto TPU '+(I.arms>=2?'a tridente (2 strisce + coda di rondine)':'a un ramo (bordo del tubo)'),righe:I.bulkIns?'base, cima':'–',q:I.nPerTube,dim:I.bbox.map(v=>v.toFixed(1)).join(' × '),vol:I.vol/1000,m:mi,mt:mi*I.nPerTube,
      note:I.bulkIns?'cerniera ad asse tangente: la striscia si flette nello spessore':'capovolto vale anche per le cerniere speculari',file:I.code+'_TPU.stl'}); }
  return rows;
}
function renderBom(){
  const rows=bomRows(), tb=$('bomBody'); tb.innerHTML='';
  rows.forEach((r,i)=>{ const tr=document.createElement('tr'); tr.dataset.i=i;
    tr.innerHTML='<td class="rn">'+r.code+'</td><td>'+r.tipo+'</td><td>'+r.righe+'</td><td class="num">'+r.q+'</td><td class="num">'+r.dim+'</td><td class="num">'+(Number.isFinite(r.m)?fmt(r.m,2):'–')+'</td><td>'+r.note+'</td>';
    tb.appendChild(tr); });
  const {R,o,P}=PRINT, nParts=R.classes.reduce((s,c)=>s+c.nPerTube,0), mass=R.classes.reduce((s,c)=>s+c.vol/1000*o.rho*c.nPerTube,0);
  const tri=R.classes.reduce((s,c)=>s+c.tris.length,0);
  $('pInfo').innerHTML='<span>Scala</span><b>1 : '+o.N+' · Ø '+fmt(2*R.Rp,1)+' × '+fmt(cur.A.G.Heff*1000*o.scale,1)+' mm</b>'+
    '<span>Componenti diversi (file STL)</span><b>'+R.classes.length+'</b>'+
    '<span>Pezzi stampati in totale</span><b>'+nParts+'</b>'+
    '<span>Cerniere collegate</span><b>'+PRINT.hinges+(PRINT.bpins?' (+ '+PRINT.bpins+' attacchi al bulkhead)':'')+'</b>'+
    (()=>{const IC=R.insert.classes.filter(c=>!c.bulkIns), BI=R.insert.classes.find(c=>c.bulkIns), Ls=R.hinges.map(h=>h.free), lo=Math.min(...Ls), hi=Math.max(...Ls), E=o.Et, A=o.neck*o.sp, I=o.sp*Math.pow(o.neck,3)/12;
      let t='<span>Tipi di inserto TPU</span><b>'+R.insert.classes.length+' ('+R.insert.classes.reduce((a,c)=>a+c.nPerTube,0)+' pezzi: uno per punta di braccio'+(BI?', uno per aletta del bulkhead':'')+')</b>'+
      '<span>Tratto libero totale (Y → spigolo → triangolo) / sezione</span><b>'+fmt(lo,2)+(hi-lo>0.02?'–'+fmt(hi,2):'')+' mm · '+fmt(o.neck,2)+' × '+fmt(o.sp,2)+' mm</b>'+
      '<span>Rigidezze stimate della cerniera</span><b>k ≈ '+fmt(E*A/hi,1)+(hi-lo>0.02?'–'+fmt(E*A/lo,1):'')+' N/mm · k<sub>θ</sub> ≈ '+fmt(E*I/hi,2)+(hi-lo>0.02?'–'+fmt(E*I/lo,2):'')+' N·mm/rad</b>';
      if(BI){ const Ib=o.wb*Math.pow(o.sp,3)/12; t+='<span>Cerniera del bulkhead</span><b>luce '+fmt(o.gb,2)+' mm · striscia '+fmt(o.wb,2)+' × '+fmt(o.sp,2)+' mm · k<sub>θ</sub> ≈ '+fmt(E*Ib/o.gb,2)+' N·mm/rad attorno alla tangente</b>'; }
      return t;})()+
    '<span>Massa stampata totale</span><b>'+fmt(mass,1)+' g rigido + '+fmt(R.insert.classes.reduce((s,c)=>s+c.vol/1000*o.rhoT*c.nPerTube,0),1)+' g TPU</b>'+
    '<span>Spessore di stampa</span><b>'+fmt(o.sp,2)+' mm (parti rigide e inserti)</b>'+
    '<span>Triangoli STL</span><b>'+tri.toLocaleString('it-IT')+'</b>';
  if(!canSave&&!DL) $('pNote').innerHTML='Unità dei file STL: mm alla scala di stampa. <b>Il salvataggio dei file funziona nella versione offline del tool</b> (file HTML aperto dal tuo computer); in questa pagina puoi vedere i componenti e copiare la distinta. Clicca una riga della distinta per vedere il pezzo.';
}
function csvText(){
  const rows=bomRows(), o=PRINT.o;
  const head='codice;tipo;righe;quantita;ingombro_mm;volume_cm3;massa_g;massa_totale_g;file;note';
  const L=[head].concat(rows.map(r=>[r.code,r.tipo,r.righe,r.q,r.dim,Number.isFinite(r.vol)?r.vol.toFixed(3):'',Number.isFinite(r.m)?r.m.toFixed(2):'',Number.isFinite(r.mt)?r.mt.toFixed(1):'',r.file,r.note].join(';')));
  const P=PRINT.P, G=PRINT.G;
  L.unshift('# Tubo Auxetico - distinta componenti · tipo '+P.type+' · R='+P.R+' m H='+G.Heff.toFixed(3)+' m Nc='+P.Nc+' Na='+G.Na+' · scala 1:'+o.N+' · gioco '+o.gap+' mm · inserto TPU: bottone r'+o.head+' mm, striscia '+o.neck+' mm · spessore '+o.sp.toFixed(2)+' mm');
  return L.join('\n');
}
/* ---------- visualizzatore della pagina Stampa 3D ---------- */
var PV=null, PV_MODE='asm', SEL=-1;
function initPV(){
  if(PV) return PV;
  const el=$('pv'), r=new THREE.WebGLRenderer({antialias:true}); r.setPixelRatio(Math.min(window.devicePixelRatio,2)); el.appendChild(r.domElement);
  const sc=new THREE.Scene(), cam=new THREE.PerspectiveCamera(36,1,0.1,20000), ctl=new THREE.OrbitControls(cam,r.domElement);
  ctl.enableDamping=true; ctl.dampingFactor=0.08;
  sc.add(new THREE.HemisphereLight(0xffffff,0x445566,0.75)); const l1=new THREE.DirectionalLight(0xffffff,0.75); l1.position.set(1,1.4,0.8); sc.add(l1); const l2=new THREE.DirectionalLight(0xffffff,0.3); l2.position.set(-1,-0.4,-1); sc.add(l2);
  const gA=new THREE.Group(), gO=new THREE.Group(); sc.add(gA,gO);
  PV={r,sc,cam,ctl,gA,gO,mat:{rig:new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:0.55,metalness:0.05,flatShading:true}),
      tpu:new THREE.MeshStandardMaterial({color:'#9A86E6',side:THREE.DoubleSide,roughness:0.6,flatShading:true}),
      one:new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:0.5,metalness:0.05,flatShading:true})}};
  new ResizeObserver(pvResize).observe(el);
  return PV;
}
function pvResize(){ if(!PV) return; const el=$('pv'), w=el.clientWidth, h=el.clientHeight; if(!w||!h) return; PV.r.setSize(w,h,false); PV.r.domElement.style.width=w+'px'; PV.r.domElement.style.height=h+'px'; PV.cam.aspect=w/h; PV.cam.updateProjectionMatrix(); }
function clearPV(){ if(!PV) return; for(const g of [PV.gA,PV.gO]) while(g.children.length){const o=g.children.pop(); o.geometry&&o.geometry.dispose();} $('pvCard').hidden=true; }
function partColor(pt){ const P=PRINT.P,G=PRINT.G; if(pt.kind==='BULK') return new THREE.Color(tok('--bulk')); return pt.kind==='ROT'?new THREE.Color(tok('--rothex')):rowColors(P,G)[Math.min(ROWS.length-1,pt.row)]; }
/* assieme: tutte le parti rigide e gli inserti, replicati sui settori (mm di stampa, asse del cilindro verticale) */
function buildPV(){
  if(!PRINT) return; initPV(); pvResize();
  const g=PV.gA; while(g.children.length){const o=g.children.pop(); o.geometry&&o.geometry.dispose();}
  const {asm}=PRINT.R, Nc=asm.Nc, al=2*Math.PI/Nc, only=$('pvCol').checked, ns=only?1:Nc, Hh=asm.H/2;
  const hi=new THREE.Color(tok('--accent'));
  const cols=PRINT.R.parts.map((pt,i)=>SEL>=0&&SEL<PRINT.R.classes.length&&pt.cls===SEL?hi:partColor(pt));
  const put=(src,dst,o,s2,c)=>{ const cs=Math.cos(s2*al), sn=Math.sin(s2*al); for(let i=0;i<src.length;i+=3){const x=src[i],y=src[i+1],z=src[i+2], X=x*cs-y*sn, Y=x*sn+y*cs; dst[o++]=X; dst[o++]=z-Hh; dst[o++]=-Y;} return o; };
  let n=0; for(const p of asm.rigid) n+=p.pos.length;
  const pos=new Float32Array(n*ns), col=new Float32Array(n*ns); let o=0;
  for(let s2=0;s2<ns;s2++) asm.rigid.forEach((p,i)=>{ const c=cols[i], o0=o; o=put(p.pos,pos,o,s2); for(let j=o0;j<o;j+=3){col[j]=c.r;col[j+1]=c.g;col[j+2]=c.b;} });
  const gr=new THREE.BufferGeometry(); gr.setAttribute('position',new THREE.BufferAttribute(pos,3)); gr.setAttribute('color',new THREE.BufferAttribute(col,3));
  const mr=new THREE.Mesh(gr,PV.mat.rig); mr.name='rig'; g.add(mr);
  if(asm.lugs.length){
    const bi=PRINT.R.classes.findIndex(c=>c.kind==='BULK'), bc=SEL>=bi&&bi>=0&&SEL<PRINT.R.classes.length&&PRINT.R.classes[SEL].kind==='BULK'?hi:new THREE.Color(tok('--bulk'));
    const srcs=[]; for(let s2=0;s2<ns;s2++) for(const p of asm.lugs) srcs.push([p,s2]); if(!only) for(const d of asm.disks) srcs.push([d,0]);
    let nb=0; for(const [p] of srcs) nb+=p.length; const pb=new Float32Array(nb), cb=new Float32Array(nb); let ob=0;
    for(const [p,s2] of srcs){ const o0=ob; ob=put(p,pb,ob,s2); for(let j=o0;j<ob;j+=3){cb[j]=bc.r;cb[j+1]=bc.g;cb[j+2]=bc.b;} }
    const gb=new THREE.BufferGeometry(); gb.setAttribute('position',new THREE.BufferAttribute(pb,3)); gb.setAttribute('color',new THREE.BufferAttribute(cb,3));
    const mb=new THREE.Mesh(gb,PV.mat.rig); mb.name='rig'; g.add(mb);
  }
  let m2=0; for(const p of asm.tpu) m2+=p.pos.length;
  const pt=new Float32Array(m2*ns); o=0; for(let s2=0;s2<ns;s2++) for(const p of asm.tpu) o=put(p.pos,pt,o,s2);
  const gt=new THREE.BufferGeometry(); gt.setAttribute('position',new THREE.BufferAttribute(pt,3));
  const mt=new THREE.Mesh(gt,PV.mat.tpu); mt.name='tpu'; mt.renderOrder=1; g.add(mt);
  pvVis();
}
function pvVis(){ if(!PV) return; for(const o of PV.gA.children){ if(o.name==='rig') o.visible=$('pvRig').checked; if(o.name==='tpu') o.visible=$('pvTpu').checked; } PV.gA.visible=PV_MODE==='asm'; PV.gO.visible=PV_MODE==='one'; }
/* pezzo singolo, orientato come va sul piatto (z verso l'alto) */
function buildOne(i){
  initPV(); const g=PV.gO; while(g.children.length){const o=g.children.pop(); o.geometry&&o.geometry.dispose();}
  const nc=PRINT.R.classes.length, ic=PRINT.R.insert.classes, isIns=i>=nc, c=isIns?ic[i-nc]:PRINT.R.classes[i]; if(!c) return null;
  const pos=new Float32Array(c.tris.length*9); let q=0; for(const t of c.tris) for(const v of t){pos[q++]=v[0]; pos[q++]=v[2]; pos[q++]=-v[1];}
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=PV.mat.one.clone(); mat.color=isIns?new THREE.Color('#9A86E6'):partColor(c.rep);
  const m=new THREE.Mesh(geo,mat); g.add(m);
  const size=Math.max(c.bbox[0],c.bbox[1])*1.6, grid=new THREE.GridHelper(size,Math.max(4,Math.round(size/5)),tok('--vpgrid'),tok('--vpgrid')); grid.position.set(c.bbox[0]/2,-0.01,-c.bbox[1]/2); g.add(grid);
  return c;
}
function fitPV(){
  if(!PV||!PRINT) return; const R=PRINT.R;
  if(PV_MODE==='asm'){ const only=$('pvCol').checked, s2=only?Math.max(R.asm.H*0.85,R.Rp*0.7):Math.max(R.Rp*1.35,R.asm.H*0.7);
    const ang=only?0:0; PV.cam.position.set(s2*1.9,s2*0.85,s2*2.3); PV.ctl.target.set(only?R.Rp:0,0,0); if(only) PV.cam.position.set(R.Rp+s2*2.2,s2*0.5,-s2*0.9); }
  else { const c=SEL>=0?(SEL<R.classes.length?R.classes[SEL]:R.insert.classes[SEL-R.classes.length]):null; if(!c) return; const b=c.bbox, d=Math.max(b[0],b[1])*1.5;
    PV.cam.position.set(b[0]/2+d*0.6,d*0.9,-b[1]/2+d*1.1); PV.ctl.target.set(b[0]/2,b[2]/2,-b[1]/2); }
  PV.cam.near=0.05; PV.cam.far=Math.max(R.asm.H,R.Rp)*50; PV.cam.updateProjectionMatrix(); PV.ctl.update();
}
function setMode(m){
  PV_MODE=m; $('pvAsm').setAttribute('aria-pressed',m==='asm'); $('pvOne').setAttribute('aria-pressed',m==='one');
  if(m==='one'&&SEL<0&&PRINT) SEL=0;
  if(m==='one'&&PRINT) showCard(buildOne(SEL));
  else $('pvCard').hidden=true;
  pvVis(); fitPV();
}
function showCard(c){
  if(!c){$('pvCard').hidden=true; return;}
  const rows=bomRows(), r=rows[SEL]; $('pvCard').hidden=false;
  $('pvCardT').textContent=r.code+' · '+r.tipo;
  $('pvCardI').innerHTML='<span>Quantità</span><b>'+r.q+'</b><span>Ingombro</span><b>'+r.dim+' mm</b><span>Massa</span><b>'+(Number.isFinite(r.m)?fmt(r.m,2)+' g':'–')+'</b>'+
    '<span>Sul piatto</span><b>'+(SEL<PRINT.R.classes.length?(PRINT.R.classes[SEL].kind==='BULK'?'disco in basso, alette verso l\'alto':PRINT.o.flat?'faccia piana in basso':'lato esterno in alto, con supporti'):'piatto, qualsiasi lato')+'</b>'+(r.note?'<span>Nota</span><b>'+r.note+'</b>':'');
}
function selectRow(i){
  const n=PRINT.R.classes.length+PRINT.R.insert.classes.length; if(i>=n) return;
  SEL=i; [...$('bomBody').children].forEach(tr=>tr.classList.toggle('sel',+tr.dataset.i===i));
  if(PV_MODE==='one'){ showCard(buildOne(i)); fitPV(); } else buildPV();
}
$('pvAsm').onclick=()=>{ if(PRINT){ buildPV(); setMode('asm'); } };
$('pvOne').onclick=()=>{ if(PRINT) setMode('one'); };
$('pvRig').onchange=pvVis; $('pvTpu').onchange=pvVis;
$('pvCol').onchange=()=>{ if(PRINT){ buildPV(); fitPV(); } };
$('pvFit').onclick=fitPV;
$('bPrint').onclick=genPrint;
$('bomBody').addEventListener('click',e=>{const tr=e.target.closest('tr'); if(!tr||!PRINT) return; selectRow(+tr.dataset.i);});
$('bCsv').onclick=()=>{ if(!PRINT) return; const t=csvText(); try{navigator.clipboard.writeText(t).then(()=>{$('bCsv').textContent='Copiata'; setTimeout(()=>$('bCsv').textContent='Copia distinta',1400);},()=>{$('exp').value=t;});}catch(e){$('exp').value=t;} };
$('bZip').onclick=()=>{
  if(!PRINT) return;
  if(!canSave&&!DL){ $('pMsg').textContent='In questa vista il salvataggio dei file non è disponibile: apri la versione offline del tool (file HTML sul tuo computer) e premi di nuovo "Scarica ZIP".'; return; }
  const enc=new TextEncoder(), files=[];
  for(const c of PRINT.R.classes) files.push({name:'componenti_stl/'+c.code+'.stl',data:stlBinary(c.tris,c.code)});
  for(const I of PRINT.R.insert.classes) files.push({name:'inserti_tpu/'+I.code+'_TPU.stl',data:stlBinary(I.tris,I.code+' TPU')});
  files.push({name:'distinta.csv',data:enc.encode('﻿'+csvText())});
  files.push({name:'LEGGIMI.txt',data:enc.encode(['Tubo Auxetico - componenti per stampa 3D','',
    'Ogni file STL e un componente diverso; la quantita da stampare e nella distinta (distinta.csv, separatore ;).',
    'Unita: mm alla scala di stampa 1:'+PRINT.o.N+'. Lato esterno del guscio verso l\'alto.',
    'Cerniere: inserti in TPU a tridente (cartella inserti_tpu, codici I..) da montare dopo la stampa, uno per ogni punta di braccio delle Y. La parte larga dell\'inserto (aggancio a V) riempie la tasca alla punta del braccio lungo i tagli, fino a '+PRINT.o.lf+' mm dallo spigolo del triangolo, ed e bloccata nella Y da una coda di rondine lungo l\'asse del braccio (si monta premendo l\'inserto dall\'alto); da li la striscia passa lo spigolo ed entra nella sede del triangolo lungo la bisettrice fino al bottone. Cosi la rotazione avviene vicino allo spigolo.',
    'Bulkhead (codici B..): disco stampato in piano con le alette verso l\'alto. Ogni aletta si collega al nodo di bordo della colonna con un inserto TPU piatto (IB1) a cavallo di una luce di '+PRINT.o.gb+' mm: la striscia si flette nello spessore, quindi la cerniera ruota attorno alla tangente come nel modello. Le alette sono gusci sovrapposti al disco: lo slicer li unisce.',
    'Per le cerniere speculari capovolgi l\'inserto (e piatto). Parti rigide in PLA/PETG, inserti in TPU (Shore 95A consigliato).',
    'Configurazione di stampa = forma chiusa (stato di riferimento). Pezzi "speculari" = immagini speculari: non ruotarli, stampali come sono.',
    ''].join('\r\n'))});
  const blob=makeZip(files), fname='tubo_auxetico_componenti_1-'+PRINT.o.N+'.zip';
  if(canSave){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fname; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},4000); return; }
  DL.save({filename:fname,data:blob}).then(()=>{ $('pMsg').textContent=''; },err=>{
    const c=err&&err.code;
    if(c==='declined') return;
    if(c==='rate_limited'){ $('pMsg').textContent='C\'è già una richiesta di salvataggio aperta: attendi e riprova.'; return; }
    $('pMsg').textContent='Salvataggio non disponibile in questa vista: usa la versione offline del tool.';
  });
};
['pScale','pGap','pHead','pDTri','pDY','pNeck','pWall','pClr','pThk','pRho','pRhoT','pEt','pFlat','pLf','pLt','pWp','pDvN','pDvW','pDvL','pTb','pWL','pGb','pWb','pRc'].forEach(id=>$(id).addEventListener('input',invalidatePrint));
