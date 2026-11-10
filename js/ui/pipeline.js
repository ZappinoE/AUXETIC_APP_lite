/* ---------- pipeline ---------- */
function showBlockInfo(A){
  const B=A.Bf(SELROW), N=A.N, th=ROWS[SELROW].th, G=A.G, P=cur.P;
  let tmax=NaN; const B0=buildBlock(N,G.L,0,th), B1=buildBlock(N,G.L,G.L*0.01,th);
  if(B0.side>0){const ds=(B0.side-B1.side)/(G.L*0.01); if(ds>0) tmax=B0.side/ds;}
  const ymax=tmax*2*sinN(P.type);
  $('blockinfo').innerHTML=B.ok?
    '<span>Riga mostrata</span><b>'+(SELROW+1)+' (θ = '+th+'°, Y = '+ROWS[SELROW].y+' m)</b>'+
    '<span>Scostamento t = Y/(2·sin(2π/N))</span><b>'+fmt(tOfY(ROWS[SELROW].y,P.type),4)+' m</b>'+
    '<span>Lato poligono centrale</span><b>'+fmt(B.side,4)+' m</b>'+
    '<span>Rotazione poligono</span><b>'+fmt(B.rotDeg,2)+'°</b>'+
    '<span>Y massima (poligono che si chiude)</span><b>'+(Number.isFinite(ymax)?fmt(ymax,4)+' m':'–')+'</b>':'<span>Riga '+(SELROW+1)+'</span><b>non valida</b>';
}
function setPill(i,on){const p=$('p'+i); p.textContent=on?'generato':'da generare'; p.classList.toggle('done',on);}
let curS=null;
function run(){
  const P=readP(), A=analyse(P), G=A.G; cur={P,A};
  $('b2').disabled=stage<1; $('b3').disabled=stage<2;
  $('meshinfo').innerHTML=
    '<span>Circonferenza</span><b>'+fmt(G.C,3)+' m</b>'+
    '<span>Lato blocco L = '+(P.type==='hex'?'C/(√3·N<sub>c</sub>)':'C/(2N<sub>c</sub>)')+'</span><b>'+fmt(G.L,3)+' m</b>'+
    '<span>Cella</span><b>'+(P.type==='hex'?fmt(S3*G.L,3)+' × '+fmt(G.L,3)+' (esagonale)':P.type==='square'?fmt(2*G.L,3)+' × '+fmt(2*G.L,3):fmt(2*G.L,3)+' × '+fmt(S3*G.L,3)+' (60°)')+' m</b>'+
    '<span>Righe assiali N<sub>a</sub></span><b>'+G.Na+'</b>'+
    '<span>Altezza effettiva</span><b>'+fmt(G.Heff,3)+' m</b>';
  $('meshnote').textContent=Math.abs(G.Heff-P.H)>1e-6?'L\'altezza è arrotondata a un numero intero di righe di celle (richiesta '+P.H+' m).':'';
  showBlockInfo(A);
  $('msg').textContent=A.msgs.join(' ');
  renderRowsTable(P,G);
  HV=stage>=2?G.Heff:P.H;
  if(stage>=1) buildCylinder(P.R,HV); else clearGroup(grp.surf);
  if(stage>=2) buildMesh(P,G); else clearGroup(grp.mesh);
  curS=null; COL=null; SOLV=null; DEF=null; isRef=true; if(typeof invalidatePrint==='function'&&PRINT!==undefined) invalidatePrint();
  if(stage>=3&&A.valid){
    curS=assemble(P,G,A.Bf); buildCuts(P,G,curS);
    COL=buildColumn(P,G,A.Bf,rowParams(P)); SOLV=makeColumnSolver(COL,{closed:P.closed,ends:P.ends,spring:P.dev.on?P.dev:null});
    buildDeformable(P,G,COL); buildBulk(P,G); applyState(new Float64Array(SOLV.n)); buildUmb();
    schedulePath();
  } else { ['lat','rot','cut','hin','bulkB','bulkT'].forEach(k=>clearGroup(grp[k])); invalidatePath(); }
  $('closed').disabled=P.ends==='bulkhead'; if(P.ends==='bulkhead') $('closed').checked=true; $('devBox').hidden=P.ends!=='bulkhead';
  refreshVis();
  M.surf.opacity=stage>=3?0.08:0.2;
  for(let i=1;i<=3;i++) setPill(i,stage>=i);
  $('sCells').textContent=stage>=2?P.Nc+' × '+G.Na:'–';
  $('sBlocks').textContent=curS?curS.nBlocks:'–';
  $('sParts').textContent=curS?curS.nBlocks+' / '+curS.nGroups:'–';
  $('sHinges').textContent=curS?curS.hinges.length:'–';
  drawCell(); drawProfile();
}
let pend=false;
const schedule=()=>{if(pend) return; pend=true; requestAnimationFrame(()=>{pend=false;run();});};

$('b1').onclick=()=>{stage=Math.max(stage,1); run(); fitView();};
$('b2').onclick=()=>{stage=Math.max(stage,2); run(); fitView();};
$('b3').onclick=()=>{stage=3; run();};
$('type').addEventListener('change',()=>{ const t=$('type').value; $('Nc').value=t==='hex'?12:9; tableForce=true; applyPreset(); rowsNa=-1; schedule(); });
['R','H','Nc','hw','thk','kt','kth','kb','closed','ends','dev','dK1','dK3','dS0'].forEach(id=>$(id).addEventListener('input',schedule));
['dC','dT'].forEach(id=>$(id).addEventListener('input',()=>{ if(PATH&&PATH.done) setK(SIM.k); }));
['theta','y0'].forEach(id=>$(id).addEventListener('input',()=>{ applyPreset(); rowsNa=-1; schedule(); }));
['kt','kth','kb'].forEach(id=>$(id).addEventListener('input',()=>{EST.clear();}));
['R','H','Nc'].forEach(id=>$(id).addEventListener('change',()=>fitView()));
$('preset').addEventListener('change',()=>{ PROF.preset=$('preset').value; applyPreset(); rowsNa=-1; schedule(); });
PROFIDS.forEach(([id,k,i])=>$(id).addEventListener('input',()=>{
  PROF.preset='custom'; $('preset').value='custom';
  PROFIDS.forEach(([id2,k2,i2])=>{const v=+$(id2).value; PROF[k2][i2]=Number.isFinite(v)?(k2==='th'?Math.max(0,v):Math.max(k2==='y'?1e-4:0.01,v)):PROF[k2][i2];});
  rowsNa=-1; schedule();
}));
$('rowsBody').addEventListener('input',e=>{
  const el=e.target; if(!el.dataset.f||el.value==='') return; const j=+el.dataset.j, v=+el.value, f=el.dataset.f;
  if(!Number.isFinite(v)||(f==='th'?v<0:v<=0)) return;
  ROWS[j][f]=v;
  $('pz').textContent='modificato'; $('pz').classList.add('done'); schedule();
});
$('rowsBody').addEventListener('click',e=>{ const tr=e.target.closest('tr'); if(!tr) return; const j=+tr.dataset.j; if(j!==SELROW){SELROW=j; if(cur){renderRowsTable(cur.P,cur.A.G); showBlockInfo(cur.A); drawCell(); if(stage>=2){buildMesh(cur.P,cur.A.G); refreshVis();}}} });
$('pmax').addEventListener('input',()=>{pmaxTouched=true; drawChart();});
$('bK').onclick=()=>{
  const P=readP(), E=(+$('Eh').value||0)*1e6, Lh=+$('Lh').value||1e-6;
  $('kt').value=+(E*P.hw*P.s/Lh).toPrecision(4); $('kth').value=+(E*(P.s*Math.pow(P.hw,3)/12)/Lh).toPrecision(4); $('kb').value=+(E*(P.hw*Math.pow(P.s,3)/12)/Lh).toPrecision(4);
  EST.clear(); schedule();
};
$('bPath').onclick=()=>{ if(COL&&SOLV){clearTimeout(pathTimer); invalidatePath(); startPath();} };
$('scrub').addEventListener('input',e=>{ if(!PATH||!PATH.done) return; stopSim(); setK(+e.target.value); });
$('bSim').onclick=()=>{ if(SIM.on) stopSim(); else startSim(); };
[['vSurf'],['vMesh'],['vLat'],['vRot'],['vCut'],['vHin'],['vBulk'],['vUmb']].forEach(([id])=>$(id).onchange=refreshVis);
$('bView').onclick=()=>{ const st=PATH&&PATH.done?stateAt(SIM.k):null; fitView(st?Math.max(...st.rs)/cur.P.R:1); };
