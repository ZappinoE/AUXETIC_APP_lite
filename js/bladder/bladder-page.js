/* ---------- scheda Bladder / restraint (solo membrana, senza parti rigide) ---------- */
var BLD=null, BV=null, bldRunning=false, bvDirty=false;
const BLD_PLANE=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
function initBV(){
  if(BV) return BV;
  const el=$('bv'), r=new THREE.WebGLRenderer({antialias:true}); r.setPixelRatio(Math.min(window.devicePixelRatio,2)); r.localClippingEnabled=true; el.appendChild(r.domElement);
  const sc=new THREE.Scene(), cam=new THREE.PerspectiveCamera(36,1,0.05,2000), ctl=new THREE.OrbitControls(cam,r.domElement);
  ctl.enableDamping=true; ctl.dampingFactor=0.08;
  sc.add(new THREE.HemisphereLight(0xffffff,0x445566,0.8)); const l1=new THREE.DirectionalLight(0xffffff,0.7); l1.position.set(1,1.4,0.8); sc.add(l1); const l2=new THREE.DirectionalLight(0xffffff,0.3); l2.position.set(-1,-0.4,-1); sc.add(l2);
  const g=new THREE.Group(); sc.add(g);
  BV={r,sc,cam,ctl,g,mem:null,ghost:null,disks:[],grid:null,
      mat:{mem:new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:0.75,metalness:0}),
           ghost:new THREE.LineBasicMaterial({transparent:true,opacity:0.4}),
           disk:new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:0.6,transparent:true,opacity:0.55})}};
  ctl.addEventListener('change',()=>{bvDirty=true;});
  new ResizeObserver(bvResize).observe(el);
  bldTheme();
  return BV;
}
function bvResize(){ if(!BV) return; const el=$('bv'), w=el.clientWidth, h=el.clientHeight; if(!w||!h) return; BV.r.setSize(w,h,false); BV.r.domElement.style.width=w+'px'; BV.r.domElement.style.height=h+'px'; BV.cam.aspect=w/h; BV.cam.updateProjectionMatrix(); bvDirty=true; }
function bvClear(){ if(!BV) return; const g=BV.g; while(g.children.length){ const o=g.children.pop(); o.geometry&&o.geometry.dispose(); } BV.mem=null; BV.ghost=null; BV.disks=[]; BV.grid=null; bvDirty=true; }
function bldTheme(){
  const sw=$('swBldT'); if(sw) sw.style.background='linear-gradient(90deg,'+tok('--bld')+','+tok('--bldhot')+')';
  if(!BV) return;
  BV.sc.background=new THREE.Color(tok('--vp')); BV.mat.ghost.color=new THREE.Color(tok('--muted')); BV.mat.disk.color=new THREE.Color(tok('--bulk'));
  if(BV.grid){ const m=BV.grid.material; (Array.isArray(m)?m:[m]).forEach(mm=>mm.color=new THREE.Color(tok('--vpgrid'))); }
  if(BLD&&BLD.view) bldPaint(BLD.view.x,BLD.view.eps,BLD.view.zt,BLD.view.zb);
  bvDirty=true;
}
function bldVis(){
  if(!BV) return;
  if(BV.mem) BV.mem.visible=$('bvMem').checked;
  if(BV.ghost) BV.ghost.visible=$('bvGhost').checked;
  BV.disks.forEach(d=>d.visible=$('bvDisk').checked);
  const cl=$('bvHalf').checked?[BLD_PLANE]:[]; BV.mat.mem.clippingPlanes=cl; BV.mat.ghost.clippingPlanes=cl; BV.mat.mem.needsUpdate=true; BV.mat.ghost.needsUpdate=true;
  bvDirty=true;
}
function bldParams(){
  const v=(id,d,mn)=>{ const x=+$(id).value; return Number.isFinite(x)&&x>=mn?x:d; };
  const pIn=$('bPmax').value.trim(), pStep5=Math.max(1e-6,(+$('pmax').value||0.9));
  return {EA:v('bEA',10000,1)*1e3, D:v('bD',0.1,0), gap:v('bGap',5,0)/1000, h:v('bH',0.1,0.04),
    pmax:(pIn===''?pStep5:v('bPmax',pStep5,0.01))/PU, pOpAtm:pStep5,
    Nup:Math.round(v('bNup',1500,100)), Nh:Math.round(v('bNh',15000,500)), self:$('bSelf').checked, solv:$('bSolv').value, waveH:Math.round(v('bWH',1,1)), waveZ:v('bWZ',1,0.2)};
}
function bldMsgPre(){
  if(!COL||!SOLV) return 'Configura la struttura nella pagina "Progetto e simulazione".';
  if(!SOLV.bulk) return 'Il bladder si chiude sui due dischi: scegli le estremità a bulkhead (pagina "Progetto e simulazione", passo 5).';
  if(!PATH||!PATH.done) return 'Aspetta che finisca il calcolo dell\'apertura (pagina "Progetto e simulazione", passo 5): la forma finale del bladder si ricava da lì.';
  return '';
}
function bldInvalidate(){
  bldRunning=false; BLD=null; bvClear();
  if(!$('pB')) return;
  $('pB').textContent='da generare'; $('pB').classList.remove('done');
  $('bInfl').disabled=true; $('bInfl').textContent='Simula gonfiaggio'; $('bScrub').disabled=true; $('bScrub').value=0; $('bScrub').max=0;
  $('bBarIn').style.width='0%'; $('bInfo').innerHTML=''; $('bState').innerHTML=''; $('bShape').innerHTML='';
  const m=bldMsgPre(); $('bBuild').disabled=!!m; $('bMsg').textContent=m; drawBChart();
}
/* chiamata a fine calcolo del percorso (passo 5) */
function bldPathReady(){ if(BLD) return; bldInvalidate(); if(PAGE==='bld') bldBuild(); }
function bldBuild(){
  const m=bldMsgPre(); if(m){ $('bMsg').textContent=m; return; }
  initBV(); bldInvalidate();
  const P=cur.P, G=cur.A.G, u=bldParams();
  // forma finale: struttura aperta alla pressione di esercizio del passo 5
  const pOp=u.pOpAtm/PU, stF=stateAt(equilibriumFor(pOp,0));
  const rmax=Math.max(...stF.rs)-P.s/2, al=2*Math.PI/P.Nc;
  const o={EA:u.EA,D:u.D,gap:u.gap,nphi:Math.max(6,Math.round(al*rmax/u.h)),ds:u.h,free:true,self:u.self,kinetic:true,diskKeep:true,pmaxPa:u.pmax,waveH:u.waveH,waveZ:u.waveZ};
  $('bMsg').textContent='';
  let B;
  try{ B=buildBladder(COL,SOLV,P,G,{rs:stF.rs,zs:stF.zs},Float64Array.from(stF.q),o); }
  catch(e){ $('bMsg').textContent='Generazione non riuscita: '+e.message; return; }
  const Ns=200;
  // forma finale: raggio massimo e altezza fra i dischi
  let rF=0; for(const rg of B.ring) rF=Math.max(rF,rg.r);
  BLD={B,u,o,P,G,Ns,total:Ns+u.Nup+u.Nh,it:0,frames:[],hist:{p:[],v:[]},pOp,rF,HF:B.ring[B.ns].z-B.zBot,
       zMid:(B.zBot+B.zTopRef)/2,zMidF:(B.zBot+B.ring[B.ns].z)/2,Vchk:0,impl:u.solv==='impl',phase:'Piegato',done:false};
  bldMakeMesh(); bldShow(B.Xc,null,0,0);
  bldRecord(0);
  $('pB').textContent='piegato'; $('pB').classList.add('done');
  $('bInfl').disabled=false; $('bInfl').textContent='Simula gonfiaggio';
  $('bShape').innerHTML=
    '<span>Struttura aperta a</span><b>'+fmtP(u.pOpAtm)+' atm (passo 5)</b>'+
    '<span>r max membrana</span><b>'+fmt(rF,3)+' m</b>'+
    '<span>Altezza fra i dischi</span><b>'+fmt(BLD.HF,3)+' m</b>'+
    '<span>Volume</span><b>'+fmt(B.Vrest,1)+' m³</b>'+
    '<span>Area membrana</span><b>'+fmt(B.Area,1)+' m²</b>'+
    '<span>Collare sui dischi</span><b>'+fmt(B.hc*1000,0)+' mm</b>'+
    '<span>Raggio dei dischi</span><b>'+fmt(B.Rc,3)+' m</b>';
  bldInfo(); drawBChart(); bvFit();
}
function bldMakeMesh(){
  const B=BLD.B, Nc=BLD.P.Nc, N=B.N, nT=B.nT, g=BV.g;
  const idx=new Uint32Array(3*nT*Nc); let w=0;
  for(let s=0;s<Nc;s++) for(let t=0;t<nT;t++) for(let v=0;v<3;v++){ const c=B.tri[3*t+v], node=(c/3)|0, r=(c%3)-1; idx[w++]=(((s+r)%Nc+Nc)%Nc)*N+node; }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3*N*Nc),3));
  geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(3*N*Nc),3));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  BV.mem=new THREE.Mesh(geo,BV.mat.mem); g.add(BV.mem);
  // forma finale: paralleli e meridiani radi
  const al=2*Math.PI/Nc, L=[], X0=B.X0, Zm=BLD.zMidF, pt=(i,j,s)=>{ const k=3*B.id(i,j), c=Math.cos(s*al), sn=Math.sin(s*al), X=X0[k], Y=X0[k+1]; return [c*X-sn*Y,X0[k+2]-Zm,-(sn*X+c*Y)]; };
  const jStep=Math.max(1,Math.round(B.ns/24)), iStep=Math.max(1,Math.round(B.nphi/3));
  for(let s=0;s<Nc;s++){
    for(let j=0;j<=B.ns;j+=jStep) for(let i=0;i<B.nphi;i++){ const a=pt(i,j,s), b=i+1<B.nphi?pt(i+1,j,s):pt(0,j,s+1); L.push(...a,...b); }
    for(let i=0;i<B.nphi;i+=iStep) for(let j=0;j<B.ns;j++){ L.push(...pt(i,j,s),...pt(i,j+1,s)); } }
  const gg=new THREE.BufferGeometry(); gg.setAttribute('position',new THREE.Float32BufferAttribute(L,3));
  BV.ghost=new THREE.LineSegments(gg,BV.mat.ghost); g.add(BV.ghost);
  // dischi (bulkhead): fisso in basso, mobile in alto
  for(let k=0;k<2;k++){ const d=new THREE.Mesh(new THREE.CircleGeometry(B.Rc,64),BV.mat.disk); d.rotation.x=-Math.PI/2; g.add(d); BV.disks.push(d); }
  const size=Math.ceil(2.6*BLD.rF); BV.grid=new THREE.GridHelper(size,Math.round(size/0.5),tok('--vpgrid'),tok('--vpgrid')); BV.grid.position.y=-0.53*BLD.HF*1.04; g.add(BV.grid);
  bldVis();
}
/* posizioni (un settore) -> vista, replicate sui settori; colore dalla deformazione */
function bldPaint(x,eps,zt,zb){
  if(!BV||!BV.mem) return;
  const B=BLD.B, Nc=BLD.P.Nc, N=B.N, al=2*Math.PI/Nc, Zm=BLD.zMid, geo=BV.mem.geometry, pos=geo.attributes.position.array, col=geo.attributes.color.array;
  const c0=new THREE.Color(tok('--bld')), c1=new THREE.Color(tok('--bldhot')), eRef=0.05;
  let w=0;
  for(let s=0;s<Nc;s++){ const c=Math.cos(s*al), sn=Math.sin(s*al);
    for(let i=0;i<N;i++){ const X=x[3*i], Y=x[3*i+1], Z=x[3*i+2];
      pos[w]=c*X-sn*Y; pos[w+1]=Z-Zm; pos[w+2]=-(sn*X+c*Y);
      const f=eps?Math.min(1,Math.max(0,eps[i]/eRef)):0;
      col[w]=c0.r+(c1.r-c0.r)*f; col[w+1]=c0.g+(c1.g-c0.g)*f; col[w+2]=c0.b+(c1.b-c0.b)*f; w+=3; } }
  geo.attributes.position.needsUpdate=true; geo.attributes.color.needsUpdate=true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  if(BV.disks[1]){ BV.disks[0].position.y=B.zBot+(zb||0)-Zm; BV.disks[1].position.y=B.zTopRef+(zt||0)-Zm; }
  bvDirty=true;
}
function bldShow(x,eps,zt,zb){ BLD.view={x,eps,zt,zb}; bldPaint(x,eps,zt,zb); }
function bldMetrics(){
  const B=BLD.B, st=B.st, x=st.x; let rmax=0;
  for(let j=0;j<=B.ns;j++){ let r=0; for(let i=0;i<B.nphi;i++){ const k=3*B.id(i,j); r+=Math.hypot(x[k],x[k+1]); } rmax=Math.max(rmax,r/B.nphi); }
  return {rmax,H:B.zTopRef+st.zt-B.zBot-st.zb};
}
function bldRecord(pNow){
  const B=BLD.B, st=B.st, m=bldMetrics();
  BLD.frames.push({it:st.it,p:pNow,vr:B.volume()/B.Vrest,x:Float32Array.from(st.x),eps:Float32Array.from(B.nodeEps),zt:st.zt,zb:st.zb,
    rmax:m.rmax,H:m.H,Tmax:st.Tmax,self:st.selfc,phase:BLD.phase});
  $('bScrub').max=BLD.frames.length-1;
}
function bldPressureAt(it){
  const b=BLD, u=b.u; let k=it-b.Ns;
  if(k<0) return {p:0,ph:'Assestamento delle pieghe a p = 0'};
  if(k<u.Nup) return {p:u.pmax*k/u.Nup,ph:'Gonfiaggio'};
  return {p:u.pmax,ph:'Pressione costante'};
}
function bldTick(){
  if(!bldRunning||!BLD) return;
  const b=BLD, B=b.B, st=B.st, t0=performance.now();
  let pNow=b.pNow||0;
  while(performance.now()-t0<40&&!b.done&&b.impl){ // passo implicito: rampa in 40 passi, poi fino al residuo nullo
    const it=b.it; pNow=b.u.pmax*Math.min(1,it/40); b.phase=it<40?'Gonfiaggio':'Pressione costante';
    const R=B.stepImplicit(pNow,{lam:2e-4,cg:80,dmax:0.05});
    b.hist.p.push(pNow*PU); b.hist.v.push(B.volume()/B.Vrest);
    if((it+1)%3===0) bldRecord(pNow);
    b.it++;
    if(it>=40&&R.dx<2e-4){ b.done=true; b.conv=true; }
    if(b.it>=1200) b.done=true;
  }
  while(performance.now()-t0<40&&b.it<b.total&&!b.done&&!b.impl){
    const it=b.it, P=bldPressureAt(it); pNow=P.p; b.phase=P.ph;
    B.step(pNow,0.005,true);
    if((it+1)%10===0){ b.hist.p.push(pNow*PU); b.hist.v.push(B.volume()/B.Vrest); }
    if((it+1)%60===0) bldRecord(pNow);
    b.it++;
    // arresto automatico a pressione costante: volume fermo
    if(b.it>b.Ns+b.u.Nup&&(b.it-b.Ns-b.u.Nup)%600===0){ const V=B.volume(); if(b.Vchk&&Math.abs(V-b.Vchk)/B.Vrest<2e-4){ b.done=true; b.conv=true; } b.Vchk=V; }
  }
  b.pNow=pNow;
  if(!b.impl&&b.it>=b.total) b.done=true;
  if(b.done){ bldRunning=false; b.phase=b.conv?'Equilibrio raggiunto':'Iterazioni esaurite'; bldRecord(pNow); $('bInfl').textContent='Simula di nuovo'; $('bScrub').disabled=false; $('bScrub').value=b.frames.length-1; $('pB').textContent=b.conv?'gonfiato':'fermato'; }
  const now=performance.now(), end=!bldRunning;
  if(end||now-(b.tVis||0)>200){ b.tVis=now; bldShow(st.x,B.nodeEps,st.zt,st.zb); }
  if(end||now-(b.tInfo||0)>500){ b.tInfo=now; $('bBarIn').style.width=(b.done?100:b.impl?Math.min(95,100*b.it/300):100*b.it/b.total).toFixed(1)+'%'; bldInfo(); drawBChart(); }
}
function bldStart(){
  if(!BLD) return;
  if(BLD.done){ bldBuild(); if(!BLD) return; }
  bldRunning=!bldRunning;
  $('bInfl').textContent=bldRunning?'Pausa':'Riprendi'; $('bScrub').disabled=bldRunning;
  if(bldRunning) $('pB').textContent='in gonfiaggio'; else $('bScrub').value=BLD.frames.length-1;
}
function bldScrub(k){
  if(!BLD||!BLD.frames.length) return; bldRunning=false; if(!BLD.done) $('bInfl').textContent='Riprendi';
  const f=BLD.frames[Math.max(0,Math.min(BLD.frames.length-1,k))];
  bldShow(f.x,f.eps,f.zt,f.zb); bldInfo(f); drawBChart(f);
}
function bldInfo(f){
  if(!BLD){ $('bInfo').innerHTML=''; return; }
  const b=BLD, B=b.B, P=b.P;
  let d;
  if(f) d=f; else { const st=B.st, m=bldMetrics(); d={it:st.it,p:b.pNow||0,vr:B.volume()/B.Vrest,rmax:m.rmax,H:m.H,Tmax:st.Tmax,self:st.selfc,phase:b.phase,eps:B.nodeEps}; }
  let em=0; for(let i=0;i<d.eps.length;i++) if(d.eps[i]>em) em=d.eps[i];
  $('bInfo').innerHTML=
    '<span>Fase</span><b>'+d.phase+'</b>'+
    '<span>Iterazione</span><b>'+d.it.toLocaleString('it-IT')+'</b>'+
    '<span>Pressione</span><b>'+fmtP(d.p*PU)+' atm</b>'+
    '<span>V / V forma finale</span><b>'+fmt(d.vr,3)+'</b>'+
    '<span>r max (finale '+fmt(b.rF,2)+')</span><b>'+fmt(d.rmax,3)+' m</b>'+
    '<span>Altezza (finale '+fmt(b.HF,2)+')</span><b>'+fmt(d.H,3)+' m</b>'+
    '<span>Deformazione max</span><b>'+fmt(em*100,2)+' %</b>'+
    '<span>Tensione max</span><b>'+fmt(d.Tmax/1000,1)+' kN/m</b>'+
    '<span>Coppie in autocontatto</span><b>'+(d.self*P.Nc).toLocaleString('it-IT')+'</b>'+
    '<span>Nodi · triangoli</span><b>'+(B.N*P.Nc).toLocaleString('it-IT')+' · '+(B.nT*P.Nc).toLocaleString('it-IT')+'</b>'+
    '<span>Molle torsionali</span><b>'+(B.nH*P.Nc).toLocaleString('it-IT')+'</b>';
  let label, col;
  if(d.phase==='Piegato'){ label='Membrana piegata come starebbe dentro la struttura chiusa: premi Simula gonfiaggio'; col='--muted'; }
  else if(d.phase==='Equilibrio raggiunto'){ label=d.vr>0.97?'Gonfiata: la membrana ha ripreso la forma finale (più l\'allungamento elastico)':'Equilibrio raggiunto prima della forma finale: restano pieghe bloccate'; col=d.vr>0.97?'--ok':'--warn'; }
  else if(d.phase==='Iterazioni esaurite'){ label='Iterazioni finite prima dell\'equilibrio: aumenta le iterazioni a pressione costante'; col='--warn'; }
  else { label=d.phase; col='--ok'; }
  $('bState').innerHTML='<span class="dot" style="background:var('+col+')"></span>'+label;
}
function drawBChart(f){
  const c=prepCanvas('bChart'); if(!c) return; const {x,w,h}=c;
  const mut=tok('--muted'), ink=tok('--ink'), ln=tok('--line'), acc=tok('--bldhot');
  x.font='10.5px '+tok('--mono');
  if(!BLD||!BLD.hist.p.length){ x.fillStyle=mut; x.fillText(BLD?'Premi Simula gonfiaggio':'Genera il bladder',10,20); return; }
  const H=BLD.hist, pm=Math.max(...H.p,BLD.u.pmax*PU)*1.25, vm=Math.max(1.1,...H.v)*1.02;
  const L=40,R=8,T=10,B=26, sx=v=>L+v/vm*(w-L-R), sy=v=>T+(pm-v)/pm*(h-T-B);
  x.strokeStyle=ln; x.lineWidth=1; x.fillStyle=mut;
  for(const t of niceTicks(0,pm,4)){ const yy=Math.round(sy(t))+0.5; x.beginPath(); x.moveTo(L,yy); x.lineTo(w-R,yy); x.stroke(); x.textAlign='right'; x.fillText(fmtP(t),L-4,yy+3); }
  x.textAlign='center'; for(const t of niceTicks(0,vm,5)) x.fillText(String(+t.toFixed(2)),sx(t),h-B+13);
  x.fillText('V / V forma finale',(L+w-R)/2,h-2); x.save(); x.translate(9,(T+h-B)/2); x.rotate(-Math.PI/2); x.fillText('p [atm]',0,0); x.restore();
  x.save(); x.beginPath(); x.rect(L,T,w-L-R,h-T-B); x.clip();
  x.setLineDash([4,3]); x.strokeStyle=mut; x.lineWidth=1.2; x.beginPath(); x.moveTo(Math.round(sx(1))+0.5,T); x.lineTo(Math.round(sx(1))+0.5,h-B); x.stroke(); x.setLineDash([]);
  x.strokeStyle=acc; x.lineWidth=2; x.lineJoin='round'; x.beginPath(); H.v.forEach((v,i)=>{ const px=sx(v), py=sy(H.p[i]); i?x.lineTo(px,py):x.moveTo(px,py); }); x.stroke();
  const pt=f?[f.vr,f.p*PU]:[H.v[H.v.length-1],H.p[H.p.length-1]];
  x.beginPath(); x.arc(sx(pt[0]),sy(pt[1]),4.5,0,7); x.fillStyle=acc; x.fill(); x.lineWidth=2; x.strokeStyle=tok('--field'); x.stroke();
  x.restore();
  x.textAlign='left'; x.fillStyle=ink; x.fillText('— membrana',L+6,T+12); x.fillStyle=mut; x.fillText('- - forma finale',L+86,T+12);
}
function bvFit(){
  if(!BV||!BLD) return; const r=BLD.rF, H=BLD.HF, d=Math.max(H*2.05,r*4.6);
  BV.cam.position.set(d*0.62,d*0.32,d*0.82); BV.ctl.target.set(0,0,0); BV.cam.near=0.05; BV.cam.far=d*30; BV.cam.updateProjectionMatrix(); BV.ctl.update(); bvDirty=true;
}
$('bBuild').onclick=bldBuild;
$('bInfl').onclick=bldStart;
$('bScrub').addEventListener('input',e=>bldScrub(+e.target.value));
['bvMem','bvGhost','bvDisk','bvHalf'].forEach(id=>$(id).onchange=bldVis);
$('bvFit').onclick=bvFit;
window.addEventListener('resize',()=>drawBChart());
