/* ===================== ESPORTAZIONE PER MATLAB / SIMSCAPE MULTIBODY =====================
   Modello a corpi rigidi (piastre rigide, un bushing per cerniera, estremità del modello a
   colonna, pressione follower per corpo; cella periodica con le Y guidate), scritto come dati JSON. Lo script
   tubo_simscape.m legge un file, costruisce il modello Simscape Multibody e lo simula:
     tubo_simscape('cella',7)   -> cella periodica della riga 7
     tubo_simscape('tubo')      -> tubo intero (senza bladder) */
function simBodiesFromParts(S,idx,X3){
  const bodies=[], of=new Map(), gmap=new Map();
  idx.forEach(i=>{ const p=S.parts[i]; if(p.kind==='ROT'){ of.set(i,bodies.length); bodies.push({name:'R'+(bodies.length+1),kind:'ROT',parts:[i],row:p.row}); } });
  idx.forEach(i=>{ const p=S.parts[i]; if(p.kind!=='EST') return; let b=gmap.get(p.group); if(b===undefined){ b=bodies.length; gmap.set(p.group,b); bodies.push({name:'Y'+(gmap.size),kind:'Y',parts:[]}); } bodies[b].parts.push(i); of.set(i,b); });
  for(const b of bodies){ b.pieces=b.parts.map(i=>S.parts[i].pts.map(q=>X3(q[0],q[1])));
    let n=0,c=[0,0,0]; for(const pc of b.pieces) for(const p of pc){ c[0]+=p[0]; c[1]+=p[1]; c[2]+=p[2]; n++; } b.c=c.map(v=>v/n);
    if(b.kind==='Y'){ const V=S.parts[b.parts[0]].pts[0]; b.V2=V; b.node=X3(V[0],V[1]); } }
  return {bodies,of};
}
const simR=(z,x)=>{ // matrice di rotazione (colonne = assi x y z) con z dato e x suggerito, righe per JSON
  const e=rigidEuler(z,x), c1=Math.cos(e[0]),s1=Math.sin(e[0]),c2=Math.cos(e[1]),s2=Math.sin(e[1]),c3=Math.cos(e[2]),s3=Math.sin(e[2]);
  const M=[[c1*c3-s1*c2*s3,-c1*s3-s1*c2*c3,s1*s2],[s1*c3+c1*c2*s3,-s1*s3+c1*c2*c3,-c1*s2],[s2*s3,s2*c3,c2]];
  return M.map(r=>r.map(v=>+v.toFixed(12)));
};
const simRound=p=>p.map(v=>+v.toPrecision(12));
function simCommon(P,G,o,bodies){
  return {units:'SI (m, kg, N, s, rad)',thickness:P.s,density:o.rho,damping:o.damp,plateRadius:Math.min(P.hw,G.L*0.02)*0.5,
    bodies:bodies.map(b=>({name:b.name,kind:b.kind,c:simRound(b.c),node:b.node?simRound(b.node):null,pieces:b.pieces.map(pc=>({v:pc.map(simRound)}))}))};
}
function simTubeModel(P,G,S,rows,o,pk,pfin,peak){
  const R=P.R, X3=(u,v)=>[R*Math.cos(u/R),R*Math.sin(u/R),v], top=G.Heff, hs=G.hstep, nLev=Math.round(top/hs);
  const {bodies,of}=simBodiesFromParts(S,S.parts.map((p,i)=>i),X3);
  for(const b of bodies) if(b.kind==='Y') b.level=Math.round(b.V2[1]/hs);
  const m=Object.assign({type:'tubo',R,height:top,Nc:P.Nc,rows:G.Na,cellType:P.type,ends:P.ends,closed:P.closed},simCommon(P,G,o,bodies));
  m.hinges=S.hinges.map(h=>{ const a=h.p[0]/R, r=rows[h.row]; return {a:of.get(h.rot)+1,b:of.get(h.est)+1,p:simRound(X3(h.p[0],h.p[1])),R:simR([Math.cos(a),Math.sin(a),0],[0,0,1]),k:r.k,kb:r.kb,kth:r.kth,row:h.row+1}; });
  const lev0=bodies.map((b,i)=>i).filter(i=>bodies[i].kind==='Y'&&bodies[i].level===0), levT=bodies.map((b,i)=>i).filter(i=>bodies[i].kind==='Y'&&bodies[i].level===nLev);
  const tang=p=>{const a=Math.atan2(p[1],p[0]); return [-Math.sin(a),Math.cos(a),0];}, radial=p=>{const a=Math.atan2(p[1],p[0]); return [Math.cos(a),Math.sin(a),0];};
  const kref=Math.max(...rows.map(r=>r.k));
  m.supports=[];
  if(P.ends==='bulkhead'){
    m.bulkhead={z:top,thickness:Math.max(P.s*2,G.L*0.05),radius:R*1.01};
    for(const i of lev0) m.supports.push({type:'perno',body:i+1,to:'ground',p:simRound(bodies[i].node),R:simR(tang(bodies[i].node),radial(bodies[i].node))});
    for(const i of levT) m.supports.push({type:'perno',body:i+1,to:'bulkhead',p:simRound(bodies[i].node),R:simR(tang(bodies[i].node),radial(bodies[i].node))});
    if(P.dev&&P.dev.on) m.device={k1:P.dev.k1,k3:P.dev.k3,s0:P.dev.s0,c:devC()};
  } else {
    // vincoli a penalità come nel tool (rigidezza 20 k_max lungo la normale del piano), su z e in direzione tangenziale
    const pick3=list=>{ const out=[]; for(const ang of [0,2*Math.PI/3,4*Math.PI/3]){ let best=null,bd=1e9; for(const i of list){ const c=bodies[i].node||bodies[i].c, a=Math.atan2(c[1],c[0]); const d=Math.abs(Math.atan2(Math.sin(a-ang),Math.cos(a-ang))); if(d<bd&&!out.includes(i)){bd=d;best=i;} } if(best!==null) out.push(best); } return out; };
    const kp=20*kref;
    if(P.ends==='base'){
      for(const i of lev0) m.supports.push({type:'piano',body:i+1,p:simRound(bodies[i].node),n:[0,0,1],k:kp});
      for(const i of pick3(lev0)) m.supports.push({type:'piano',body:i+1,p:simRound(bodies[i].node),n:simRound(tang(bodies[i].node)),k:kp});
    } else {
      const mid=bodies.map((b,i)=>i).filter(i=>bodies[i].kind==='ROT'&&Math.abs(bodies[i].c[2]-top/2)<G.Hc*0.6);
      for(const i of pick3(mid)){ m.supports.push({type:'piano',body:i+1,p:simRound(bodies[i].c),n:[0,0,1],k:kp}); m.supports.push({type:'piano',body:i+1,p:simRound(bodies[i].c),n:simRound(tang(bodies[i].c)),k:kp}); }
    }
  }
  // pressione: risultante e momento (per 1 Pa) di ogni corpo nel suo punto c, componenti fisse nel corpo
  m.pressure={pmax:pk,pfin,T1:o.T,Thold:o.T*0.25,T2:o.T,peakTool:Number.isFinite(peak)?peak:null};
  m.press=bodies.map((b,i)=>{ const pr=rigidPressure(b.pieces,b.c); return {body:i+1,F:simRound(pr.F),T:simRound(pr.T)}; });
  m.endThrust=[];
  if(P.closed){ const A=Math.PI*R*R;
    if(P.ends==='bulkhead') m.endThrust.push({to:'bulkhead',area:A,dir:[0,0,1]});
    else { levT.forEach(i=>m.endThrust.push({body:i+1,p:simRound(bodies[i].node),area:A/levT.length,dir:[0,0,1]}));
      if(P.ends==='free') lev0.forEach(i=>m.endThrust.push({body:i+1,p:simRound(bodies[i].node),area:A/lev0.length,dir:[0,0,-1]})); } }
  const midL=Math.round(nLev/2);
  m.outputs={midNodes:bodies.map((b,i)=>i).filter(i=>bodies[i].kind==='Y'&&bodies[i].level===midL).map(i=>i+1),topNode:levT.length?levT[0]+1:null};
  return m;
}
function simCellModel(j,rows,o){
  const P=cur.P, G=cur.A.G, D=rigidCellData(j), S=D.S, R=P.R;
  const X3=(u,v)=>{const a=(u-D.uc)/R; return [R*Math.cos(a),R*Math.sin(a),v-D.vc];};
  const idx=[...D.sel]; S.parts.forEach((p,i)=>{ if(p.kind==='EST'&&D.groups.includes(p.group)) idx.push(i); });
  const {bodies,of}=simBodiesFromParts(S,idx,X3);
  const m=Object.assign({type:'cella',row:j+1,theta:ROWS[j].th,Y:ROWS[j].y,R,cellType:P.type,closed:P.closed,Vc:D.Vc},simCommon(P,G,o,bodies));
  const r=rows[j];
  m.hinges=D.hin.map(h=>{ const a=(h.p[0]-D.uc)/R; return {a:of.get(h.rot)+1,b:of.get(h.est)+1,p:simRound(X3(h.p[0],h.p[1])),R:simR([Math.cos(a),Math.sin(a),0],[0,0,1]),k:r.k,kb:r.kb,kth:r.kth,row:j+1}; });
  const pth=D.pth, n=pth.lu.length, stp=Math.max(1,Math.ceil(n/150)), ix=[]; for(let k=0;k<n;k+=stp) ix.push(k); if(ix[ix.length-1]!==n-1) ix.push(n-1);
  m.drive={t:ix.map((k,i)=>+(o.cellT*i/(ix.length-1)).toPrecision(10)),lu:ix.map(k=>+pth.lu[k].toPrecision(10)),lv:ix.map(k=>+pth.lv[k].toPrecision(10)),
    pTool:ix.map(k=>+pth.p[k].toPrecision(8)),Etool:ix.map(k=>+pth.E[k].toPrecision(8)),kTool:[P.k0,P.kth0]};
  m.ydrive=bodies.map((b,i)=>b.kind==='Y'?{body:i+1,X:simRound(b.node)}:null).filter(Boolean);
  return m;
}
async function exportSim(){
  const msg=$('aMsg'); msg.textContent='';
  if(!cur||!cur.A.valid||!curS){ msg.textContent='Genera prima le celle (passo 3) con una geometria valida.'; return; }
  const P=cur.P, G=cur.A.G, rows=rowParams(P), o=rigidOpts();
  const pk=(+$('pmax').value||0)/PU, pfin=(+$('phold').value||0)/PU, peak=PATH&&Number.isFinite(PATH.peak)?PATH.peak:NaN;
  const enc=new TextEncoder(), files=[], dir='simscape_tubo_auxetico/', info=[];
  msg.textContent='Preparazione dei modelli per MATLAB…'; await new Promise(r=>setTimeout(r,20));
  try{ files.push({name:dir+'tubo_intero.json',data:enc.encode(JSON.stringify(simTubeModel(P,G,curS,rows,o,pk,pfin,peak)))}); }
  catch(e){ msg.textContent='Tubo non esportato: '+e.message; return; }
  for(let j=0;j<G.Na;j++){
    try{ const m=simCellModel(j,rows,o); files.push({name:dir+'celle/cella_riga'+String(j+1).padStart(2,'0')+'.json',data:enc.encode(JSON.stringify(m))}); }
    catch(e){ info.push('- riga '+(j+1)+': non esportata ('+e.message+')'); }
    if(j%3===2){ msg.textContent='Celle: '+(j+1)+' di '+G.Na+'…'; await new Promise(r=>setTimeout(r,0)); }
  }
  files.push({name:dir+'tubo_simscape.m',data:enc.encode(SIMSCAPE_M)});
  files.push({name:dir+'LEGGIMI.txt',data:enc.encode(['Tubo Auxetico - modelli per MATLAB / Simscape Multibody','',
    'USO (in MATLAB, nella cartella simscape_tubo_auxetico):',
    '  out = tubo_simscape(\'cella\', 7);   % cella periodica della riga 7 (righe 1-'+G.Na+')',
    '  out = tubo_simscape(\'tubo\');       % tubo intero senza bladder',
    '  tubo_simscape(\'tubo\', [], \'Simula\', false, \'Apri\', true);   % solo costruzione, poi apre il modello',
    'Richiede Simulink, Simscape e Simscape Multibody. Lo script costruisce il modello .slx, lo simula e salva risultati_*.mat e grafico_*.png.','',
    'MODELLO: corpi rigidi (piastre estruse, densita '+o.rho+' kg/m3), un Bushing Joint per cerniera con z = normale al guscio (k sulle traslazioni, k_b attorno a x e y, k_theta attorno a z), smorzamento '+(o.damp*100)+'% della rigidezza.',
    '- Cella: un periodo della riga sul cilindro. Ogni Y e guidata da 3 giunti prismatici con moto imposto: traslazione affine (lambda_u radiale, lambda_v assiale) senza rotazione, i poligoni sono liberi. lambda_u(t), lambda_v(t) seguono il percorso del modello periodico del tool. Uscite: lavoro dei moti W (energia), volume V, p = dW/dV; il grafico confronta energia e pressione con il tool.',
    '- Tubo: estremita '+P.ends+(P.closed?', chiuse':', aperte')+'. Pressione follower per corpo (rampa fino a '+(pk*PU).toFixed(3)+' atm in '+o.T+' s, mantenimento, discesa a '+(pfin*PU).toFixed(3)+' atm). Uscite: pressione, raggio medio a meta altezza, altezza.',
    '- Il bladder e gli MMOD non sono inclusi.',...info,''].join('\r\n'))});
  const blob=makeZip(files), fname='simscape_tubo_auxetico.zip';
  msg.textContent=(await saveBlob(blob,fname))?'Salvato '+fname+' (tubo intero + '+G.Na+' celle + script MATLAB)':'Salvataggio non riuscito: usa la versione offline.';
}
$('bSim3').onclick=exportSim;
