/* ---------- stime per riga (modello periodico) ---------- */
const EST=new Map();
const estKey=(P,G,th,t)=>[P.type,G.L.toFixed(4),t.toFixed(6),th,(P.kth0/P.k0).toPrecision(4)].join('|');
function rowEstimate(P,G,th,t){
  const key=estKey(P,G,th,t); if(EST.has(key)) return EST.get(key);
  const N=P.type==='square'?4:3, B=buildBlock(N,G.L,t,th);
  let res={lopen:NaN,vopen:NaN,slope:0};
  if(B.ok){
    G0=G;
    const C=periodicCell(P,G,B), Vc=Math.PI*P.R*P.R*G.Hc/P.Nc, mdl=makeModel(C,P.k0,P.kth0,false,Vc), pth=mdl.path();
    const vr=pth.lu.map((l,i)=>l*l*pth.lv[i]);
    let slope=0; for(let i=1;i<vr.length;i++) slope=Math.max(slope,Math.abs((pth.p[i]-pth.p[i-1])/(vr[i]-vr[i-1]||1e-9)));
    res.slope=slope;
    if(Number.isFinite(pth.trough)&&pth.trough<=0) for(let i=Math.max(1,pth.troughI);i<pth.p.length;i++) if(pth.p[i-1]<=0&&pth.p[i]>0){const f=pth.p[i-1]/(pth.p[i-1]-pth.p[i]); res.lopen=pth.lu[i-1]+(pth.lu[i]-pth.lu[i-1])*f; res.vopen=vr[i-1]+(vr[i]-vr[i-1])*f; break;}
  }
  EST.set(key,res); return res;
}

/* ---------- percorso di equilibrio della colonna (calcolo a blocchi, non bloccante) ---------- */
let PATH=null, JOB=0, pathTimer=null, pmaxTouched=true;   // p massima = pressione di esercizio (0,9 atm di default)
function invalidatePath(){ if(typeof bldInvalidate==='function') bldInvalidate(); if(typeof cbInvalidate==='function') cbInvalidate(); JOB++; PATH=null; stopSim(); setBar(0); $('p4').textContent='da calcolare'; $('p4').classList.remove('done'); $('bSim').disabled=true; drawChart(); drawProfile(); updateSimInfo(null); ['sPeak','sOpen'].forEach(id=>$(id).textContent='–'); }
function schedulePath(){ invalidatePath(); clearTimeout(pathTimer); pathTimer=setTimeout(startPath,450); }
function setBar(f){ $('barIn').style.width=(Math.max(0,Math.min(1,f))*100).toFixed(1)+'%'; }
function startPath(){
  if(!COL||!SOLV||!cur) return;
  const job=++JOB, P=cur.P, G=cur.A.G, rows=rowParams(P);
  $('p4').textContent='calcolo…';
  // 1) stime per riga (una alla volta)
  const prs=[...new Map(rows.map(r=>[r.th+'|'+r.y,[r.th,tOfY(r.y,P.type)]])).values()];
  let i=0;
  const next=()=>{
    if(job!==JOB) return;
    if(i<prs.length){ rowEstimate(P,G,prs[i][0],prs[i][1]); i++; renderRowsTable(P,G); setBar(0.05*i/prs.length); setTimeout(next,0); return; }
    runColumn(job,P,G,rows);
  };
  next();
}
function runColumn(job,P,G,rows){
  const ests=rows.map(r=>EST.get(estKey(P,G,r.th,tOfY(r.y,P.type))));
  const V0=SOLV.Vcol0;
  const kap=30*G.Na*Math.max(...rows.map((r,j)=>(ests[j]?ests[j].slope:0)*r.f),1e-9)/V0;
  const vops=ests.map(e=>e&&Number.isFinite(e.vopen)?e.vopen:1.3);
  const vrStop=Math.min(9,Math.max(...vops)*1.12+0.1), nSteps=240, dv=(vrStop-1)/nSteps;
  const pth={vr:[],p:[],q:[],rs:[],zs:[],rot:[],kappa:kap,done:false};
  PATH=pth; let q=new Float64Array(SOLV.n), s=0;
  const step=()=>{
    if(job!==JOB) return;
    const t0=performance.now();
    const pT=Math.max(0,(+$('pmax').value||0)/PU)*1.05;
    const more=()=>s<=nSteps||(s<3*nSteps&&pth.p.length&&pth.p[pth.p.length-1]<pT&&pth.vr[pth.vr.length-1]<9);
    while(more()&&performance.now()-t0<100){
      const Vt=V0*(1+s*dv), sol=SOLV.solve(q,Vt,kap); q=sol.q;
      const pr=sol.res.pr;
      pth.vr.push(sol.res.Vc/V0); pth.p.push(s===0?0:kap*(Vt-sol.res.Vc)); pth.q.push(Float64Array.from(q));
      pth.rs.push(Float64Array.from(pr.rs)); pth.zs.push(Float64Array.from(pr.zs)); pth.rot.push(SOLV.maxRot(q));
      s++;
      if(SOLV.maxRot(q)>150*D2R){s=3*nSteps+1; pth.stopRot=true;}
      // oltre la pressione di esercizio (dopo lo scatto) il tratto è solo irrigidimento: ci si ferma a 1,5 volte p di esercizio
      { const pl=pth.p[pth.p.length-1]; pth.pRun=Math.max(pth.pRun||0,pl); if(pl<0.6*pth.pRun) pth.seenDrop=true;
        if(pT>0&&pth.seenDrop&&pl>1.45*pT) s=3*nSteps+1; }
    }
    setBar(0.05+0.95*Math.min(1,s/nSteps)); drawChart();
    if(more()){ setTimeout(step,0); return; }
    finishPath(pth);
  };
  step();
}
function finishPath(pth){
  pth.done=true;
  const p=pth.p, n=p.length;
  // pressione di innesco: primo massimo significativo
  let run=0, peakI=-1;
  for(let i=1;i<n;i++){ if(p[i]>run){run=p[i]; peakI=i;} if(run>0&&p[i]<0.6*run){break;} }
  pth.peak=peakI>0?p[peakI]:NaN; pth.peakI=peakI;
  let lm=n-1; while(lm>0&&p[lm-1]<=p[lm]) lm--; pth.lastMinI=lm;
  let pk=0,pkI=-1; for(let i=0;i<=lm;i++) if(p[i]>pk){pk=p[i];pkI=i;} pth.peakMax=pkI>0?pk:pth.peak; pth.peakMaxI=pkI;
  // stati stabili a p = 0 (attraversamenti crescenti dopo un tratto negativo)
  pth.zeros=[]; let seenNeg=false;
  for(let i=1;i<n;i++){ if(p[i]<-0.02*Math.abs(pth.peak||1e-9)) seenNeg=true; if(seenNeg&&p[i-1]<=0&&p[i]>0){ const f=p[i-1]/(p[i-1]-p[i]); pth.zeros.push({k:i-1+f, vr:pth.vr[i-1]+(pth.vr[i]-pth.vr[i-1])*f}); seenNeg=false; } }
  pth.open=pth.zeros.length?pth.zeros[pth.zeros.length-1]:null;
  $('scrub').max=n-1; $('scrub').value=0;
  if(!pmaxTouched){ const pm=Math.max(...p); $('pmax').value=+((Number.isFinite(pth.peakMax)?pth.peakMax*1.15:pm*0.5)*PU).toPrecision(3); }
  $('p4').textContent='calcolato'; $('p4').classList.add('done'); $('bSim').disabled=false;
  $('sPeak').textContent=Number.isFinite(pth.peak)?fmtP(pth.peak*PU)+(pth.peakMax>pth.peak*1.05?' → '+fmtP(pth.peakMax*PU):'')+' atm':'–';
  $('sOpen').textContent=pth.open?fmt(pth.open.vr,2)+(pth.zeros.length>1?' ('+pth.zeros.length+' stati)':''):(devOn()?'no: a p = 0 la molla lo richiude':'no');
  buildUmb(); SIM.k=0; setK(0);
  if(typeof bldPathReady==='function') bldPathReady();
  if(typeof cbPathReady==='function') cbPathReady();
}
function stateAt(k){
  const n=PATH.p.length, i=Math.max(0,Math.min(n-1,Math.floor(k))), j=Math.min(n-1,i+1), f=Math.min(1,Math.max(0,k-i));
  const lerpA=(A,B)=>{const o=new Float64Array(A.length); for(let a=0;a<A.length;a++) o[a]=A[a]+(B[a]-A[a])*f; return o;};
  const L=arr=>arr[i]+(arr[j]-arr[i])*f;
  return {q:lerpA(PATH.q[i],PATH.q[j]),rs:lerpA(PATH.rs[i],PATH.rs[j]),zs:lerpA(PATH.zs[i],PATH.zs[j]),p:L(PATH.p),vr:L(PATH.vr),rot:L(PATH.rot),i,f};
}
const SIM={on:false,k:0,p:0,dir:1,snapTo:null,snapping:false,snapSpan:0,t:0,kd:0,settle:0};
/* dispositivo interno fra le flange: forza della molla (totale, N) per un allungamento z della flangia superiore */
const devOn=()=>!!(cur&&cur.P.dev&&cur.P.dev.on&&SOLV&&SOLV.bulk);
function devForce(z){ const d=cur.P.dev, az=Math.abs(z), e=az>d.s0?Math.sign(z)*(az-d.s0):0; return d.k1*e+d.k3*e*e*e; }
const devC=()=>devOn()?Math.max(0,+$('dC').value||0):0;
const heightAt=k=>{ const st=stateAt(k); return st.zs[st.zs.length-1]-st.zs[0]; };
function setK(k){
  if(!PATH||!PATH.p.length) return;
  if(typeof CB!=='undefined'&&CB&&CB.shown){ CB.shown=false; cbRunning=false; if(!CB.done) $('cRun').textContent='Riprendi'; cbRefreshVis(); }
  SIM.k=k; const st=stateAt(k); applyState(st.q);
  $('scrub').value=Math.round(k); updateSimInfo(st); drawChart(); drawProfile(st);
}
function equilibriumFor(p,k){
  const P=PATH.p, n=P.length; let i=Math.round(k);
  if(P[i]<p){ while(i<n-1&&P[i]<p) i++; if(i>0&&P[i]>=p&&P[i-1]<p) return i-1+(p-P[i-1])/(P[i]-P[i-1]); return i; }
  while(i>0&&P[i]>p) i--;
  if(i<n-1&&P[i]<=p&&P[i+1]>p) return i+(p-P[i])/(P[i+1]-P[i]);
  return i;
}
function startSim(){
  if(!PATH||!PATH.done) return; cbRunning=false; SIM.on=true; SIM.p=0; SIM.dir=1; SIM.k=0; SIM.snapping=false; SIM.t=0; SIM.kd=0; SIM.settle=0;
  $('bSim').textContent='Ferma'; setK(0);
  frameFinal();
}
/* inquadra la forma alla pressione massima: raggio e altezza finali, centro spostato con l'allungamento del tubo */
function frameFinal(){
  const kf=equilibriumFor(Math.max(1e-9,(+$('pmax').value||0)/PU),0), st=stateAt(kf), H0=cur.A.G.Heff, Hn=st.zs[st.zs.length-1]-st.zs[0];
  fitView(Math.max(1,Math.max(...st.rs)/cur.P.R,Hn/H0));
  const dz=(st.zs[0]+st.zs[st.zs.length-1])/2-H0/2; controls.target.y+=dz; camera.position.y+=dz; controls.update();
}
function stopSim(){ SIM.on=false; SIM.snapping=false; $('bSim').textContent='Simula carico'; }
let simLast=0;
function simTick(dtF){
  const now=performance.now(), dt=dtF!=null?dtF:Math.min(0.1,(now-(simLast||now))/1000); simLast=now;
  if(!SIM.on||!PATH) return;
  const pmax=Math.max(1e-9,(+$('pmax').value||0)/PU), pfin=Math.min(pmax,Math.max(0,(+$('phold').value||0)/PU)), ramp=5.0;
  const cD=devC();
  if(cD>0){
    // modello ridotto a 1 grado di libertà lungo il percorso di equilibrio, inerzia trascurata:
    // (p − p_eq)·dV = c·Ḣ²·dt  →  k̇ = (p − p_eq)·V' / (c·H'²), con V e H in funzione della coordinata k del percorso
    const Tr=Math.max(0.1,+$('dT').value||60), ts=Tr/ramp, n=PATH.p.length, V0t=SOLV.Vcol0*cur.P.Nc, kmax=n/1.2/ts;
    const nsub=12, h=dt*ts/nsub;
    for(let it=0;it<nsub;it++){
      if(SIM.settle===0){ SIM.p+=SIM.dir*pmax*h/Tr; if(SIM.p>=pmax){SIM.p=pmax; SIM.dir=-1;} if(SIM.dir<0&&SIM.p<=pfin){SIM.p=pfin; SIM.settle=1;} }
      const k=SIM.k, i=Math.max(0,Math.min(n-2,Math.floor(k))), dvr=(PATH.vr[i+1]-PATH.vr[i])||1e-9;
      const peq=stateAt(k).p, H1=heightAt(Math.min(n-1,i+1)), H0=heightAt(i), dH=Math.abs(H1-H0)||1e-9;
      let kd=(SIM.p-peq)*V0t*dvr/(cD*dH*dH); kd=Math.max(-kmax,Math.min(kmax,kd));
      SIM.kd=kd; SIM.vH=kd*(H1-H0); SIM.k=Math.max(0,Math.min(n-1,k+kd*h)); SIM.t+=h;
    }
    setK(SIM.k);
    if(SIM.settle>0){ SIM.settle+=dt*ts; if(Math.abs(SIM.kd)*ts<0.02||SIM.settle>3*Tr){ stopSim(); setK(SIM.k); } }
    return;
  }
  if(SIM.snapping){
    const d=SIM.snapTo-SIM.k, stepk=Math.sign(d)*Math.max(Math.abs(SIM.snapSpan)*dt/0.6,1e-3);
    if(Math.abs(d)<=Math.abs(stepk)){SIM.k=SIM.snapTo; SIM.snapping=false;} else SIM.k+=stepk;
    setK(SIM.k); return;
  }
  SIM.p+=SIM.dir*pmax*dt/ramp;
  if(SIM.p>=pmax){SIM.p=pmax; SIM.dir=-1;}
  if(SIM.dir<0&&SIM.p<=pfin) SIM.p=pfin;
  const kn=equilibriumFor(SIM.p,SIM.k);
  if(Math.abs(kn-SIM.k)>3){SIM.snapTo=kn; SIM.snapSpan=kn-SIM.k; SIM.snapping=true;} else setK(kn);
  if(SIM.dir<0&&SIM.p<=pfin&&!SIM.snapping){ stopSim(); setK(kn); }
}
function updateSimInfo(st){
  const box=$('siminfo'), sb=$('simstate');
  if(!PATH||!st){box.innerHTML=''; sb.innerHTML=''; return;}
  const P=cur.P, rmin=Math.min(...st.rs), rmax=Math.max(...st.rs), Hn=st.zs[st.zs.length-1]-st.zs[0];
  box.innerHTML=
    '<span>Pressione'+(SIM.on?' applicata':' di equilibrio')+'</span><b>'+fmtP((SIM.on?SIM.p:st.p)*PU)+' atm</b>'+
    '<span>Rapporto V/V₀</span><b>'+fmt(st.vr,3)+'</b>'+
    '<span>Raggio min / max</span><b>'+fmt(rmin,3)+' / '+fmt(rmax,3)+' m</b>'+
    '<span>Altezza</span><b>'+fmt(Hn,3)+' m</b>'+
    '<span>Rotazione max poligoni</span><b>'+fmt(st.rot/D2R,1)+'°</b>'+
    (devOn()?(()=>{ const z=PATH.q[0]&&SOLV.izt!=null?st.q[SOLV.izt]:0, Fs=devForce(z), cD=devC(), Fd=SIM.on&&cD>0?cD*(SIM.vH||0):0;
      return '<span>Dispositivo: allungamento</span><b>'+fmt(z,3)+' m</b><span>Forza molla / smorzatore</span><b>'+fmt(Fs/1000,2)+' / '+fmt(Fd/1000,2)+' kN</b>'+
        (SIM.on&&cD>0?'<span>Tempo simulato</span><b>'+fmt(SIM.t,1)+' s</b>':''); })():'');
  const i=st.i, n=PATH.p.length, dp=PATH.p[Math.min(i+1,n-1)]-PATH.p[Math.max(0,i-1)];
  let label,col;
  if(SIM.snapping){label='Snap-through: salto dinamico a pressione costante'; col='--warn';}
  else if(SIM.on&&devC()>0&&Math.abs(SIM.kd||0)>0.5){label=(SIM.kd>0?'Apertura':'Chiusura')+' frenata dallo smorzatore'; col='--warn';}
  else if(i===0&&st.f<1e-6){label='Configurazione chiusa (riferimento)'; col='--muted';}
  else if(PATH.zeros&&PATH.zeros.some(z=>Math.abs(z.k-SIM.k)<1.5)){label='Stato stabile a pressione nulla'; col='--ok';}
  else if(dp<0){label='Ramo instabile sotto controllo di pressione'; col='--warn';}
  else {label='Equilibrio stabile'; col='--ok';}
  sb.innerHTML='<span class="dot" style="background:var('+col+')"></span>'+label;
}
