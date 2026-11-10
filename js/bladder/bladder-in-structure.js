/* ---------- bladder nella struttura (pagina Progetto e simulazione, passo 6) ----------
   La colonna segue il percorso a volume imposto del passo 5 (stati di equilibrio); la membrana è premuta contro
   l'inviluppo della faccia interna, attaccata ai centri delle Y su un livello ogni n, con autocontatto.
   La struttura avanza solo quando la membrana l'ha riempita (percorso quasi statico). */
var CB=null, cbGrp=null, cbMesh=null, cbRunning=false;
const CB_PLANE=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
const cbMat=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:0.75,metalness:0});
function cbInit(){ if(cbGrp) return; cbGrp=new THREE.Group(); scene.add(cbGrp); renderer.localClippingEnabled=true; }
function cbTheme(){ if(CB&&CB.view) cbPaint(CB.view.x,CB.view.eps); const sw=$('swBld'); if(sw) sw.style.background='linear-gradient(90deg,'+tok('--bld')+','+tok('--bldhot')+')'; }
function cbRefreshVis(){ if(cbGrp) cbGrp.visible=!!(CB&&CB.shown&&$('vBld').checked); renderer.clippingPlanes=$('vHalf').checked?[CB_PLANE]:[]; }
function cbInvalidate(){
  cbRunning=false;
  if(cbGrp) while(cbGrp.children.length){ const o=cbGrp.children.pop(); o.geometry&&o.geometry.dispose(); }
  CB=null; cbMesh=null;
  if(!$('pC')) return;
  $('pC').textContent='da generare'; $('pC').classList.remove('done');
  $('cRun').disabled=true; $('cRun').textContent='Simula dispiegamento'; $('cScrub').disabled=true; $('cScrub').value=0; $('cScrub').max=0;
  $('cBarIn').style.width='0%'; $('cInfo').innerHTML=''; $('cState').innerHTML=''; drawCChart();
  const ok=!!(COL&&SOLV&&SOLV.bulk);
  $('cBuild').disabled=!ok||!(PATH&&PATH.done); $('cMsg').textContent=(COL&&SOLV&&!SOLV.bulk)?'Il bladder si chiude sui dischi: scegli le estremità a bulkhead (passo 5).':'';
  cbRefreshVis();
}
function cbPathReady(){ if(!CB) cbInvalidate(); }
function cbParams(){
  const v=(id,d,mn)=>{ const x=+$(id).value; return Number.isFinite(x)&&x>=mn?x:d; };
  return {EA:v('cEA',10000,1)*1e3, D:v('cD',0.1,0), gap:v('cGap',5,0)/1000, h:v('cH',0.15,0.04), ye:Math.round(v('cYe',3,1)),
    waveH:Math.round(v('cWH',1,1)), waveZ:v('cWZ',1,0.2), self:$('cSelf').checked, pmin:v('cPmin',0.05,0)/PU,
    fold:$('cFold').value, pv:v('cPv',0.02,0)/PU, fric:Math.min(0.95,v('cFr',0.3,0)), fricD:Math.min(0.95,v('cFrD',0.1,0)), dmul:v('cDm',20,1),
    cont:$('cCont').value, thick:v('cThk',5,0)/1000, solv:$('cSolv').value};
}
/* ultimo tratto crescente del percorso: primo punto con p ≥ p di esercizio (stato aperto) */
function cbFinalK(pOp){ const P=PATH.p, n=P.length; if(P[n-1]<pOp) return n-1; let k=n-1; while(k>0&&P[k-1]>=pOp) k--; return k; }
function cbBuild(){
  if(!COL||!SOLV||!SOLV.bulk) return;
  if(!PATH||!PATH.done){ $('cMsg').textContent='Aspetta che finisca il calcolo dell\'apertura (passo 5).'; return; }
  cbInit(); stopSim(); cbInvalidate();
  const P=cur.P, G=cur.A.G, u=cbParams();
  const pOp=Math.max(1e-9,(+$('pmax').value||0)/PU), kF=cbFinalK(pOp), stF=stateAt(kF);
  const rmax=Math.max(...stF.rs)-P.s/2, al=2*Math.PI/P.Nc;
  const o={EA:u.EA,D:u.D,gap:u.gap,nphi:Math.max(6,Math.round(al*rmax/u.h)),ds:u.h,kin:true,attach:'y',yEvery:u.ye,self:u.self,kinetic:true,
    pmaxPa:pOp,waveH:u.waveH,waveZ:u.waveZ,kA:2e6,plates:u.cont==='plates',thick:u.thick};
  $('cMsg').textContent='';
  let B;
  try{ B=buildBladder(COL,SOLV,P,G,{rs:stF.rs,zs:stF.zs},Float64Array.from(stF.q),o); }
  catch(e){ $('cMsg').textContent='Generazione non riuscita: '+e.message; return; }
  const Nup=Math.max(3000,Math.round(40*kF));   // passi a velocità piena della struttura
  CB={B,u,o,P,G,kF,pOp,k:0,it:0,Ns:200,Nh:3000,dkMax:kF/Nup,itEnd:-1,frames:[],hist:{k:[],v:[],pm:[]},shown:true,phase:'Piegato',done:false,pm:0,Vchk:0,mode:'ready',fFold:0};
  cbMakeMesh();
  if(u.fold==='sim'){
    // piegatura simulata: dalla forma finale nella struttura aperta, la struttura si richiude lungo il percorso
    // mentre nella membrana c'è una leggera depressione; il tessuto resiste anche a compressione e si piega da solo
    CB.mode='fold'; CB.k=kF; CB.fit=0; CB.settle=0; CB.dkF=kF/3000;
    B.resetState(B.X0); B.setStruct(stateAt(kF).q); B.perturb(0.01); Object.assign(B.st,{cComp:0.3,fric:u.fric,kCm:10,noHole:1,Dmul:u.dmul}); CB.settleN=u.solv==='impl'?150:1000;
    cbShow(B.st.x,null,B.st.q); cbRecord();
    $('pC').textContent='in piegatura'; $('pC').classList.add('done'); $('cRun').disabled=false; cbRunning=true; $('cRun').textContent='Pausa';
  } else {
    B.setStruct(stateAt(0).q); CB.Xfold=Float64Array.from(B.st.x);
    cbShow(B.Xc,null,new Float64Array(SOLV.n)); cbRecord();
    $('pC').textContent='piegato'; $('pC').classList.add('done');
    $('cRun').disabled=false; $('cRun').textContent='Simula dispiegamento';
  }
  cbInfo(); drawCChart();
  { const H0=G.Heff, Hn=stF.zs[stF.zs.length-1]-stF.zs[0]; fitView(Math.max(1,Math.max(...stF.rs)/P.R,Hn/H0)); const dz=(stF.zs[0]+stF.zs[stF.zs.length-1])/2-H0/2; controls.target.y+=dz; camera.position.y+=dz; controls.update(); }
}
function cbMakeMesh(){
  const B=CB.B, Nc=CB.P.Nc, N=B.N, nT=B.nT, idx=new Uint32Array(3*nT*Nc); let w=0;
  for(let s=0;s<Nc;s++) for(let t=0;t<nT;t++) for(let v=0;v<3;v++){ const c=B.tri[3*t+v], node=(c/3)|0, r=(c%3)-1; idx[w++]=(((s+r)%Nc+Nc)%Nc)*N+node; }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3*N*Nc),3));
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(3*N*Nc),3));
  g.setIndex(new THREE.BufferAttribute(idx,1));
  cbMesh=new THREE.Mesh(g,cbMat); cbMesh.renderOrder=3; cbGrp.add(cbMesh);
}
function cbPaint(x,eps){
  if(!cbMesh) return;
  const B=CB.B, Nc=CB.P.Nc, N=B.N, al=2*Math.PI/Nc, Hh=CB.G.Heff/2, g=cbMesh.geometry, pos=g.attributes.position.array, col=g.attributes.color.array;
  const c0=new THREE.Color(tok('--bld')), c1=new THREE.Color(tok('--bldhot')), eRef=0.05;
  let w=0;
  for(let s=0;s<Nc;s++){ const c=Math.cos(s*al), sn=Math.sin(s*al);
    for(let i=0;i<N;i++){ const X=x[3*i], Y=x[3*i+1], Z=x[3*i+2];
      pos[w]=c*X-sn*Y; pos[w+1]=Z-Hh; pos[w+2]=-(sn*X+c*Y);
      const f=eps?Math.min(1,Math.max(0,eps[i]/eRef)):0;
      col[w]=c0.r+(c1.r-c0.r)*f; col[w+1]=c0.g+(c1.g-c0.g)*f; col[w+2]=c0.b+(c1.b-c0.b)*f; w+=3; } }
  g.attributes.position.needsUpdate=true; g.attributes.color.needsUpdate=true; g.computeVertexNormals(); g.computeBoundingSphere();
}
function cbShow(x,eps,q){ CB.view={x,eps}; CB.shown=true; applyState(q instanceof Float64Array?q:Float64Array.from(q)); cbPaint(x,eps); cbRefreshVis(); }
function cbRecord(){
  const B=CB.B, st=B.st, S=stateAt(CB.k);
  let Fa=0; for(const A of B.anchors) Fa=Math.max(Fa,A.F||0);
  CB.frames.push({it:CB.mode==='fold'?CB.fit:CB.it,k:CB.k,pm:CB.pm,ps:Math.max(0,S.p),vs:S.vr,fill:B.volume()/B.ENV.V,x:Float32Array.from(st.x),eps:Float32Array.from(B.nodeEps),q:Float32Array.from(st.q),
    rmax:Math.max(...S.rs),Tmax:st.Tmax,cont:st.contacts,self:st.selfc,Fa,phase:CB.phase});
  $('cScrub').max=CB.frames.length-1;
}
function cbTick(){
  if(!cbRunning||!CB) return;
  const c=CB, B=c.B, st=B.st, t0=performance.now(), Vs=()=>B.ENV.V;
  while(performance.now()-t0<40&&!c.done&&c.mode==='fold'){
    c.pm=-c.u.pv; c.phase='Piegatura: la struttura si richiude, depressione nella membrana';
    const impl=c.u.solv==='impl', pen=st.penMax||0;
    if(impl){ // passo implicito: la struttura avanza di un punto del percorso quando la membrana non sporge oltre 3 cm
      if(c.k>0&&pen<0.03){ c.k=Math.max(0,c.k-1); B.setStruct(stateAt(c.k).q); }
      B.stepImplicit(-c.u.pv,{lam:5e-4,cg:60,dmax:0.03}); c.fit++; if(c.k<=0) c.settle++;
      if(c.fit%5===0) cbRecord(); }
    else {
      if(c.k>0&&c.fit%5===0){ c.k=Math.max(0,c.k-5*c.dkF*Math.max(0.05,Math.min(1,(0.03-pen)/0.0225))); B.setStruct(stateAt(c.k).q); }
      B.step(-c.u.pv,0.005,true); c.fit++; if(c.k<=0) c.settle++;
      if(c.fit%60===0) cbRecord(); }
    if(c.settle>=c.settleN){ // piegata: diventa lo stato iniziale del dispiegamento
      c.mode='ready'; c.Xfold=Float64Array.from(st.x); Object.assign(st,{cComp:1e-3,fric:c.o.plates?c.u.fricD:0,kCm:1,noHole:0,Dmul:1}); st.v.fill(0); st.ke=0; c.k=0; c.phase='Piegato';
      cbRecord(); c.fFold=c.frames.length-1; cbRunning=false; $('pC').textContent='piegato'; $('cRun').textContent='Simula dispiegamento'; $('cScrub').disabled=false; $('cScrub').value=c.fFold; }
  }
  while(performance.now()-t0<40&&!c.done&&c.mode==='deploy'&&c.u.solv==='impl'){
    const it=c.it, S=c.Sc||(c.Sc=stateAt(c.k)), Vm=B.volume(), pm=Math.min(1.3*c.pOp,Math.max(S.p,c.u.pmin)+5*101325/B.Vrest*Math.max(0,0.97*Vs()-Vm));
    c.pm=pm; c.phase=c.k<c.kF?'Dispiegamento':'Pressione di esercizio';
    const R=B.stepImplicit(pm,{lam:5e-4,cg:60,dmax:0.05});
    const fill=B.volume()/Vs(); let Fa=0; for(const A of B.anchors) Fa=Math.max(Fa,A.F||0);
    if(c.k<c.kF&&fill>0.9&&Fa<80e3&&R.dx<0.015){ c.k=Math.min(c.kF,c.k+Math.min(1,(fill-0.9)/0.05)); c.Sc=stateAt(c.k); B.setStruct(c.Sc.q); if(c.k>=c.kF&&c.itEnd<0) c.itEnd=it; }
    c.hist.k.push(c.k); c.hist.v.push(S.vr); c.hist.pm.push(pm*PU);
    if((it+1)%5===0) cbRecord();
    c.it++;
    if(c.itEnd>=0&&(c.it-c.itEnd)%25===0){ const V=B.volume(); if(c.Vchk&&Math.abs(V-c.Vchk)/B.Vrest<1e-4) c.done=true; c.Vchk=V; }
    if(c.itEnd>=0&&c.it>c.itEnd+600) c.done=true;
  }
  while(performance.now()-t0<40&&!c.done&&c.mode==='deploy'&&c.u.solv!=='impl'){
    const it=c.it;
    if(it>=c.Ns&&it%5===0){
      if(c.k<c.kF){ // avanzamento della struttura limitato dal riempimento della membrana e dalla forza sugli attacchi
        const fill=B.volume()/Vs(); let Fa=0; for(const A of B.anchors) Fa=Math.max(Fa,A.F||0);
        const fac=Math.min(Math.max(0,Math.min(1,(fill-0.90)/0.06)),Math.max(0,Math.min(1,2-Fa/40e3)));
        c.k=Math.min(c.kF,c.k+5*c.dkMax*Math.max(0.05,fac)); if(c.k>=c.kF&&c.itEnd<0) c.itEnd=it; }
      B.setStruct(stateAt(Math.min(c.k,c.kF)).q);
    }
    // pressione della membrana: quella del percorso a volume imposto, con un minimo, più un termine che la tiene piena
    const S=it%5===0||!c.Sc?(c.Sc=stateAt(c.k)):c.Sc;
    let pm=0;
    if(it>=c.Ns){ const Vm=B.volume(), def=Math.max(0,0.97*Vs()-Vm); pm=Math.min(1.3*c.pOp,Math.max(S.p,c.u.pmin)+5*101325/B.Vrest*def); }
    c.pm=pm; c.phase=it<c.Ns?'Assestamento delle pieghe a p = 0':c.k<c.kF?'Dispiegamento':'Pressione di esercizio';
    B.step(pm,0.005,true);
    if((it+1)%10===0){ c.hist.k.push(c.k); c.hist.v.push(S.vr); c.hist.pm.push(pm*PU); }
    if((it+1)%60===0) cbRecord();
    c.it++;
    if(c.itEnd>=0&&c.it>c.itEnd+300&&(c.it-c.itEnd)%600===0){ const V=B.volume(); if(c.Vchk&&Math.abs(V-c.Vchk)/B.Vrest<2e-4) c.done=true; c.Vchk=V; }
    if(c.itEnd>=0&&c.it>c.itEnd+c.Nh) c.done=true;
  }
  if(c.mode==='fold'||c.mode==='ready'){ const now=performance.now(), end=!cbRunning;
    if(end||now-(c.tVis||0)>250){ c.tVis=now; cbShow(st.x,B.nodeEps,st.q); }
    if(end||now-(c.tInfo||0)>500){ c.tInfo=now; $('cBarIn').style.width=(100*(1-c.k/c.kF)*0.9+10*c.settle/c.settleN).toFixed(1)+'%'; cbInfo(); drawCChart(); }
    return; }
  if(c.done){ cbRunning=false; c.phase='Completata'; cbRecord(); $('cRun').textContent='Simula di nuovo'; $('cScrub').disabled=false; $('cScrub').value=c.frames.length-1; $('pC').textContent='aperto'; }
  const now=performance.now(), end=!cbRunning;
  if(end||now-(c.tVis||0)>250){ c.tVis=now; cbShow(st.x,B.nodeEps,st.q); }
  if(end||now-(c.tInfo||0)>500){ c.tInfo=now; $('cBarIn').style.width=(c.done?100:100*(0.9*c.k/c.kF+0.1*Math.min(1,c.it/c.Ns))).toFixed(1)+'%'; cbInfo(); drawCChart(); }
}
function cbStart(){
  if(!CB) return;
  const c=CB, B=c.B;
  if(c.done||(c.mode==='ready'&&!cbRunning)){ // (ri)parte il dispiegamento dallo stato piegato
    if(c.done||c.it>0){ c.frames.length=c.fFold+1; c.hist={k:[],v:[],pm:[]}; c.it=0; c.itEnd=-1; c.done=false; c.Vchk=0; c.Sc=null; }
    B.resetState(c.Xfold); Object.assign(B.st,{cComp:1e-3,fric:c.o.plates?c.u.fricD:0,kCm:1,noHole:0,Dmul:1}); c.k=0; B.setStruct(stateAt(0).q); c.mode='deploy'; c.pm=0; c.Sc=null; if(c.u.solv==='impl'){ c.Ns=0; B.st.lamA=null; B.st.fPrev=null; }
    stopSim(); cbRunning=true; $('cRun').textContent='Pausa'; $('cScrub').disabled=true; $('pC').textContent='in apertura'; return; }
  stopSim(); cbRunning=!cbRunning;
  $('cRun').textContent=cbRunning?'Pausa':'Riprendi'; $('cScrub').disabled=cbRunning;
  if(cbRunning) $('pC').textContent=c.mode==='fold'?'in piegatura':'in apertura'; else $('cScrub').value=CB.frames.length-1;
}
function cbScrub(k){
  if(!CB||!CB.frames.length) return; cbRunning=false; if(!CB.done) $('cRun').textContent='Riprendi';
  const f=CB.frames[Math.max(0,Math.min(CB.frames.length-1,k))];
  cbShow(f.x,f.eps,Float64Array.from(f.q)); cbInfo(f); drawCChart(f);
}
function cbInfo(f){
  if(!CB){ $('cInfo').innerHTML=''; return; }
  const c=CB, B=c.B, P=c.P;
  let d=f;
  if(!d){ const S=stateAt(c.k); let Fa=0; for(const A of B.anchors) Fa=Math.max(Fa,A.F||0);
    d={it:c.mode==='fold'?c.fit:c.it,k:c.k,pm:c.pm,ps:Math.max(0,S.p),vs:S.vr,fill:B.volume()/B.ENV.V,rmax:Math.max(...S.rs),Tmax:B.st.Tmax,cont:B.st.contacts,self:B.st.selfc,Fa,phase:c.phase,eps:B.nodeEps}; }
  let em=0; for(let i=0;i<d.eps.length;i++) if(d.eps[i]>em) em=d.eps[i];
  $('cInfo').innerHTML=
    '<span>Fase</span><b>'+d.phase+'</b>'+
    '<span>Iterazione</span><b>'+d.it.toLocaleString('it-IT')+'</b>'+
    '<span>V/V₀ struttura</span><b>'+fmt(d.vs,2)+'</b>'+
    '<span>r max struttura</span><b>'+fmt(d.rmax,3)+' m</b>'+
    '<span>p percorso · p membrana</span><b>'+fmtP(d.ps*PU)+' · '+fmtP(d.pm*PU)+' atm</b>'+
    '<span>Riempimento</span><b>'+fmt(d.fill*100,1)+' %</b>'+
    '<span>Deformazione max</span><b>'+fmt(em*100,2)+' %</b>'+
    '<span>Tensione max</span><b>'+fmt(d.Tmax/1000,1)+' kN/m</b>'+
    '<span>Forza max su un attacco</span><b>'+fmt(d.Fa/1000,1)+' kN</b>'+
    '<span>Attacchi</span><b>'+(B.anchors.length*P.Nc)+' (Y, un livello ogni '+c.u.ye+')</b>'+
    '<span>Nodi a contatto</span><b>'+(d.cont*P.Nc).toLocaleString('it-IT')+'</b>'+
    '<span>Coppie in autocontatto</span><b>'+(d.self*P.Nc).toLocaleString('it-IT')+'</b>'+
    '<span>Nodi · triangoli</span><b>'+(B.N*P.Nc).toLocaleString('it-IT')+' · '+(B.nT*P.Nc).toLocaleString('it-IT')+'</b>';
  let label, col;
  if(d.phase==='Piegato'){ label='Membrana piegata nella struttura chiusa: premi Simula dispiegamento'; col='--muted'; }
  else if(d.phase.startsWith('Piegatura')){ label=d.phase; col='--muted'; }
  else if(em>0.06){ label='Membrana tesa oltre il 6% nelle zone rosse'; col='--warn'; }
  else if(d.phase==='Completata'){ label='Dispiegamento completato'; col='--ok'; }
  else { label=d.phase; col='--ok'; }
  $('cState').innerHTML='<span class="dot" style="background:var('+col+')"></span>'+label;
}
function drawCChart(f){
  const cv=prepCanvas('cChart'); if(!cv) return; const {x,w,h}=cv;
  const mut=tok('--muted'), ink=tok('--ink'), ln=tok('--line'), acc=tok('--bldhot');
  x.font='10.5px '+tok('--mono');
  if(!CB||!CB.hist.v.length){ x.fillStyle=mut; x.fillText(CB?'Premi Simula dispiegamento':'Genera il bladder',10,20); return; }
  const H=CB.hist, pm=Math.max(...H.pm,...PATH.p.map(v=>v*PU),CB.pOp*PU)*1.15, vm=Math.max(1.05,PATH.vr[CB.kF]*1.03);
  const L=40,R=8,T=10,B=26, sx=v=>L+(v-1)/(vm-1)*(w-L-R), sy=v=>T+(pm-v)/pm*(h-T-B);
  x.strokeStyle=ln; x.lineWidth=1; x.fillStyle=mut;
  for(const t of niceTicks(0,pm,4)){ const yy=Math.round(sy(t))+0.5; x.beginPath(); x.moveTo(L,yy); x.lineTo(w-R,yy); x.stroke(); x.textAlign='right'; x.fillText(fmtP(t),L-4,yy+3); }
  x.textAlign='center'; for(const t of niceTicks(1,vm,4)) if(t>=1) x.fillText(String(t),sx(t),h-B+13);
  x.fillText('V/V₀ struttura',(L+w-R)/2,h-2); x.save(); x.translate(9,(T+h-B)/2); x.rotate(-Math.PI/2); x.fillText('p [atm]',0,0); x.restore();
  x.save(); x.beginPath(); x.rect(L,T,w-L-R,h-T-B); x.clip();
  x.setLineDash([4,3]); x.strokeStyle=mut; x.lineWidth=1.2; x.beginPath(); for(let i=0;i<=CB.kF;i++){ const px=sx(PATH.vr[i]), py=sy(PATH.p[i]*PU); i?x.lineTo(px,py):x.moveTo(px,py); } x.stroke(); x.setLineDash([]);
  x.strokeStyle=acc; x.lineWidth=2; x.lineJoin='round'; x.beginPath(); H.v.forEach((v,i)=>{ const px=sx(v), py=sy(H.pm[i]); i?x.lineTo(px,py):x.moveTo(px,py); }); x.stroke();
  const pt=f?[f.vs,f.pm*PU]:[H.v[H.v.length-1],H.pm[H.pm.length-1]];
  x.beginPath(); x.arc(sx(pt[0]),sy(pt[1]),4.5,0,7); x.fillStyle=acc; x.fill(); x.lineWidth=2; x.strokeStyle=tok('--field'); x.stroke();
  x.restore();
  x.textAlign='left'; x.fillStyle=ink; x.fillText('— p membrana',L+6,T+12); x.fillStyle=mut; x.fillText('- - percorso a volume (passo 5)',L+96,T+12);
}
$('cBuild').onclick=cbBuild;
$('cRun').onclick=cbStart;
$('cScrub').addEventListener('input',e=>cbScrub(+e.target.value));
$('vBld').onchange=cbRefreshVis; $('vHalf').onchange=cbRefreshVis;
window.addEventListener('resize',()=>drawCChart());
