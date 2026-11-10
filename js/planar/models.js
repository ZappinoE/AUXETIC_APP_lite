/* ---------- modelli planari dalla geometria delle celle (unità della sezione: mm, N) ----------
   par: {type: 'hex'|'square'|'para', L (lato del blocco), th (θ in gradi), Y (larghezza alla radice), k, kth, tab (M(φ) o null)} */
function plBlock(par){
  const N=par.type==='square'?4:3, t=par.Y/(2*Math.sin(2*Math.PI/N));
  const B=buildBlock(N,par.L,t,par.th);
  return {B,N,t};
}
/* rigidezze della cerniera dal materiale (eq. 5.7–5.8): lamina larga w, spessa s, lunga ℓ, modulo E */
function plHingeK(E,w,s,l,nu){
  // k_t: taglio della striscia con le estremità che non ruotano (la rotazione relativa è kθ, a parte), riferito al centro della
  // striscia (lì traslazione e rotazione sono disaccoppiate): flessione 12EI/ℓ³ in serie con il taglio κGA/ℓ (Timoshenko)
  const I=s*w*w*w/12, G=E/(2*(1+(nu==null?0.45:nu))), kt=1/(l*l*l/(12*E*I)+l/(5/6*G*w*s));
  return {k:E*w*s/l, kt, kth:E*I/l, kb:E*(w*s*s*s/12)/l};
}
/* centro del tratto libero della striscia di TPU (stessa geometria della mesh MUL2, mul2Cell): la striscia corre lungo il
   taglio H → A, spostata di g/2 dal taglio verso il triangolo, larga w; parte a ℓ dallo spigolo H dentro la Y (al più 0,75
   del braccio) e arriva allo smusso del triangolo, dove il triangolo è largo quanto lei. Lì traslazione e rotazione della
   striscia sono disaccoppiate: è il punto di cerniera del modello rigido (par.pivot = 'mid'); 'corner' = lo spigolo H.
   pts = pezzo EST [V, A_{i−1}, H, A_i], cT = baricentro del poligono. */
function plStripMid(pts,cT,par){
  const H=pts[2], A=pts[3], Am=pts[1], g=par.gap==null?0.3:par.gap, w=par.w||0.8, lf=par.lh||3;
  const un=(a,b)=>{ const l=Math.hypot(b[0]-a[0],b[1]-a[1]); return [(b[0]-a[0])/l,(b[1]-a[1])/l]; }, dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
  const shift=(p,d,dist)=>{ let n=[-d[1],d[0]]; if(dot([cT[0]-p[0],cT[1]-p[1]],n)<0) n=[-n[0],-n[1]]; return [p[0]+n[0]*dist,p[1]+n[1]*dist]; };
  const meet=(p1,d1,p2,d2)=>{ const det=d1[0]*(-d2[1])-(-d2[0])*d1[1], bx=p2[0]-p1[0], by=p2[1]-p1[1], t=(bx*(-d2[1])-(-d2[0])*by)/det; return [p1[0]+t*d1[0],p1[1]+t*d1[1]]; };
  const e=un(H,A), dm=un(H,Am); let n=[-e[1],e[0]]; if(dot([cT[0]-H[0],cT[1]-H[1]],n)<0) n=[-n[0],-n[1]];
  const Ct=meet(shift(H,e,g/2+w),e,shift(H,dm,g/2),dm), c=-dot([Ct[0]-H[0],Ct[1]-H[1]],e);
  const lfe=Math.min(lf,0.75*Math.hypot(A[0]-H[0],A[1]-H[1])), sm=(c-lfe)/2, ym=g/2+w/2;
  return [H[0]-e[0]*sm+n[0]*ym, H[1]-e[1]*sm+n[1]*ym];
}
const plCen=pts=>{ let x=0,y=0; for(const q of pts){ x+=q[0]; y+=q[1]; } return [x/pts.length,y/pts.length]; };
/* punto di cerniera secondo par.pivot */
function plPivot(estPts,rotPts,H,par){ return par.pivot==='corner'?H.slice():plStripMid(estPts,plCen(rotPts),par); }
/* direzione della striscia nel punto di cerniera: il taglio fra il pezzo della Y e il poligono (pezzo EST [V, A_{i−1}, H, A_i]: H → A_i) */
function plStripDir(pts){ const dx=pts[3][0]-pts[2][0], dy=pts[3][1]-pts[2][1], n=Math.hypot(dx,dy)||1; return [dx/n,dy/n]; }

/* cella periodica: poligoni e Y; le Y possono essere bloccate in rotazione (come nel modello a colonna del tool) */
function plCellModel(par,mode,lockY){
  const {B}=plBlock(par);
  if(!B.ok) throw new Error('geometria non valida: la Y chiude il poligono centrale o θ è fuori campo');
  const P={type:par.type}, G={L:par.L};
  const C=periodicCell(P,G,B);
  const bodies=[], nc=C.cen.length;
  C.cen.forEach(c=>bodies.push({c:c.cc.slice(),kind:'ROT',lockRot:false}));
  // Y: centro del pezzo di riferimento (punti del pezzo + s, cioè riportati nell'immagine del corpo)
  const acc=[]; for(let i=0;i<C.nb;i++) acc.push([0,0,0]);
  C.est.forEach(e=>{ for(const p of e.pts){ acc[e.body][0]+=p[0]+e.s[0]; acc[e.body][1]+=p[1]+e.s[1]; acc[e.body][2]++; } });
  acc.forEach(a=>bodies.push({c:[a[0]/a[2],a[1]/a[2]],kind:'Y',lockRot:!!lockY}));
  const hinges=C.hin.map(h=>{ const e=C.est[h.e]; return {a:h.c,b:nc+e.body,P:plPivot(e.pts,C.cen[h.c].pts,h.H,par),H:h.H.slice(),sa:[0,0],sb:[-e.s[0],-e.s[1]],k:par.k,kt:par.kt,e0:plStripDir(e.pts),kth:par.kth,tab:par.tab||null}; });
  // traslazione del primo corpo bloccata (moto rigido); la rotazione rigida non è un modo nullo del reticolo periodico (Λ data)
  const nb=bodies.length, ctl=[{dof:0},{dof:1}];
  const mx=3*nb, my=3*nb+1;
  if(mode==='bi'){ ctl.push({dof:mx,base:1,coef:1},{dof:my,base:1,coef:1}); }
  else if(mode==='uni-y'){ ctl.push({dof:my,base:1,coef:1}); }
  else if(mode==='uni-x-fix'){ ctl.push({dof:mx,base:1,coef:1},{dof:my,base:1,coef:0}); }
  else if(mode==='uni-y-fix'){ ctl.push({dof:my,base:1,coef:1},{dof:mx,base:1,coef:0}); }
  else ctl.push({dof:mx,base:1,coef:1});            // 'uni-x': λx imposto, λy libero
  const area=Math.abs(C.a1[0]*C.a2[1]-C.a1[1]*C.a2[0]);
  // pezzi da disegnare: poligoni (corpo, s = 0) e pezzi delle Y (corpo, s del pezzo)
  const draw=C.cen.map((c,i)=>({body:i,pts:c.pts,s:[0,0],kind:'ROT'})).concat(C.est.map(e=>({body:nc+e.body,pts:e.pts,s:[-e.s[0],-e.s[1]],kind:'Y'})));
  return {bodies,hinges,periodic:true,ctl,L:par.L,a1:C.a1,a2:C.a2,area,draw,nPoly:nc,nY:C.nb,par,mode};
}

/* cella esagonale attorno a un nodo di Y: Y centrale, 6 triangoli, 6 pezzi delle Y ai vertici (2 pezzi ciascuno).
   Stessa scelta di blocchi della mesh MUL2 (plMul2Mesh); coordinate con l'origine nel nodo centrale. */
function plHexParts(par){
  const {B}=plBlock(par);
  if(!B.ok) throw new Error('geometria non valida: la Y chiude il poligono centrale o θ è fuori campo');
  const L=par.L, S0=assemble({type:'hex',Nc:2,hw:0},{L,Na:3,C:1e12},()=>B), h=S3/2*L, hexNode=[2*h,L];
  const keep=new Set(); S0.parts.forEach(p=>{ if(p.kind==='ROT'){ const c=[(p.pts[0][0]+p.pts[1][0]+p.pts[2][0])/3,(p.pts[0][1]+p.pts[1][1]+p.pts[2][1])/3]; if(Math.hypot(c[0]-hexNode[0],c[1]-hexNode[1])<L*0.7) keep.add(p.block); } });
  const parts=[], idx=new Map(); S0.parts.forEach((p,i)=>{ if(keep.has(p.block)){ idx.set(i,parts.length); parts.push(p); } });
  const hinges=S0.hinges.filter(hg=>idx.has(hg.rot)&&idx.has(hg.est)).map(hg=>Object.assign({},hg,{rot:idx.get(hg.rot),est:idx.get(hg.est)}));
  return {B,S0,hexNode,Sc:{parts,cuts:[],hinges}};
}
/* modello della cella esagonale. bc = 'sym': Y centrale ferma, Y dei vertici = immagini della centrale traslate di
   (Λ − I)·X_v, senza rotazione (le condizioni di simmetria della cella nel reticolo, le stesse di MUL2), Λ = λ·I.
   bc = 'free': cella libera, Y del vertice basso incastrata, Y del vertice alto tirata lungo y: ctrl 'disp' (spostamento
   imposto, rotazione bloccata, x libero) oppure 'force' (forza Fy nel baricentro della Y, x e rotazione liberi). */
function plHexModel(par,bc,ctrl){
  const {hexNode,Sc}=plHexParts(par), P=Sc.parts, sh=q=>[q[0]-hexNode[0],q[1]-hexNode[1]];
  const groups=new Map(); P.forEach((p,i)=>{ if(p.kind!=='EST') return; const n=sh(p.pts[0]), key=Math.round(n[0]*1e3)+','+Math.round(n[1]*1e3);   // pts[0] = nodo della Y
    if(!groups.has(key)) groups.set(key,{node:n,pieces:[]}); groups.get(key).pieces.push(i); });
  let cen=null; const ver=[]; groups.forEach(g=>{ if(Math.hypot(g.node[0],g.node[1])<1e-6*par.L) cen=g; else ver.push(g); });
  if(!cen||ver.length!==6) throw new Error('cella esagonale non costruita ('+ver.length+' vertici)');
  const top=ver.reduce((a,g)=>g.node[1]>a.node[1]?g:a), bot=ver.reduce((a,g)=>g.node[1]<a.node[1]?g:a);
  const bodies=[], ofPart=new Int32Array(P.length).fill(-1), shiftOf=new Array(P.length).fill(null), draw=[];
  const cOf=pcs=>{ let x=0,y=0,n=0; for(const pc of pcs) for(const q of pc){ x+=q[0]; y+=q[1]; n++; } return [x/n,y/n]; };
  // Y centrale (corpo 0), poi i triangoli, poi (cella libera) le Y dei vertici
  bodies.push({kind:'Y',pts:cen.pieces.map(i=>P[i].pts.map(sh)),lockRot:bc==='sym',node:[0,0]}); cen.pieces.forEach(i=>{ ofPart[i]=0; shiftOf[i]=[0,0]; });
  P.forEach((p,i)=>{ if(p.kind==='ROT'){ ofPart[i]=bodies.length; shiftOf[i]=[0,0]; bodies.push({kind:'ROT',pts:[p.pts.map(sh)],lockRot:false}); } });
  const vb=new Map();
  for(const g of ver){
    if(bc==='sym'){ g.pieces.forEach(i=>{ ofPart[i]=0; shiftOf[i]=g.node.slice(); }); }
    else { const b=bodies.length; vb.set(g,b); bodies.push({kind:'Y',pts:g.pieces.map(i=>P[i].pts.map(sh)),lockRot:false,node:g.node.slice()}); g.pieces.forEach(i=>{ ofPart[i]=b; shiftOf[i]=[0,0]; }); }
  }
  bodies.forEach(b=>{ b.c=cOf(b.pts); });
  const hinges=Sc.hinges.map(hg=>({a:ofPart[hg.rot],b:ofPart[hg.est],P:sh(plPivot(P[hg.est].pts,P[hg.rot].pts,hg.p,par)),H:sh(hg.p),sa:[0,0],sb:shiftOf[hg.est].slice(),k:par.k,kt:par.kt,e0:plStripDir(P[hg.est].pts),kth:par.kth,tab:par.tab||null}));
  P.forEach((p,i)=>{ draw.push({body:ofPart[i],pts:p.pts.map(sh),s:shiftOf[i].slice(),kind:p.kind==='ROT'?'ROT':'Y'}); });
  const nb=bodies.length, ctl=[], loads=[];
  let iTop=-1, iBot=-1;
  let support;
  if(bc==='sym'){ ctl.push({dof:0},{dof:1}); support=[0,1];
    if(ctrl==='force') loads.push({dof:3*nb,coef:0.5},{dof:3*nb+1,coef:0.5});     // forza generalizzata ∂E/∂λ (u = λ)
    else ctl.push({dof:3*nb,base:1,coef:1},{dof:3*nb+1,base:1,coef:1}); }
  else {
    iTop=vb.get(top); iBot=vb.get(bot);
    ctl.push({dof:3*iBot},{dof:3*iBot+1},{dof:3*iBot+2}); support=[3*iBot,3*iBot+1,3*iBot+2];
    if(ctrl==='force') loads.push({dof:3*iTop+1,coef:1});
    else ctl.push({dof:3*iTop+1,coef:1},{dof:3*iTop+2});
  }
  const area=1.5*S3*par.L*par.L;                     // esagono regolare con i nodi dei vertici a distanza L
  return {bodies,hinges,periodic:bc==='sym',ctl,loads,L:par.L,draw,tiles:[[0,0]],par,bc,ctrl,support,iTop,iBot,
    topNode:top.node,botNode:bot.node,area,hexNode,Sc};
}

/* cella quadrata (4 blocchi quadrati specchiati, come nella tesi, fig. 5.3). bc = 'sym': cella periodica 2L × 2L con le Y
   senza rotazione e λ imposto (equibiassiale); bc = 'free': patch di 2 × 2 blocchi, Y del nodo basso (a metà del lato)
   incastrata, Y del nodo alto tirata lungo y (ctrl 'disp': spostamento imposto, rotazione bloccata, x libero; 'force':
   forza lungo y, x e rotazione liberi). */
function plSquareCellModel(par,bc,ctrl){
  if(bc==='sym'){
    const C=plCellModel(par,'bi',true), nb=C.bodies.length;
    if(ctrl==='force') C.ctl=C.ctl.filter(c=>c.dof<3*nb);
    return Object.assign(C,{bc:'sym',ctrl:ctrl==='force'?'force':'disp',support:[0,1],iTop:-1,iBot:-1,loads:ctrl==='force'?[{dof:3*nb,coef:0.5},{dof:3*nb+1,coef:0.5}]:[],tiles:[[0,0]]});
  }
  const M=plPlaneModel(par,1,1), [x0,y0,x1,y1]=M.box, cx=(x0+x1)/2;
  const ys=[]; M.bodies.forEach((b,i)=>{ if(b.kind==='Y'){ b.node=b.pts[0][0].slice(); ys.push(i); } });
  const mid=ys.filter(i=>Math.abs(M.bodies[i].node[0]-cx)<1e-6*par.L);
  if(!mid.length) throw new Error('cella quadrata non costruita');
  const iTop=mid.reduce((a,i)=>M.bodies[i].node[1]>M.bodies[a].node[1]?i:a), iBot=mid.reduce((a,i)=>M.bodies[i].node[1]<M.bodies[a].node[1]?i:a);
  const ctl=[{dof:3*iBot},{dof:3*iBot+1},{dof:3*iBot+2}], loads=[];
  if(ctrl==='force') loads.push({dof:3*iTop+1,coef:1}); else ctl.push({dof:3*iTop+1,coef:1},{dof:3*iTop+2});
  const nodeC=[cx,(y0+y1)/2];
  return Object.assign(M,{ctl,loads,tiles:[[0,0]],bc:'free',ctrl,support:[3*iBot,3*iBot+1,3*iBot+2],iTop,iBot,topNode:M.bodies[iTop].node.slice(),botNode:M.bodies[iBot].node.slice(),nodeC,area:(x1-x0)*(y1-y0)});
}

/* superficie piana di nx × ny celle (patch finita, nessuna periodicità) */
function plPlaneModel(par,nx,ny){
  const {B}=plBlock(par);
  if(!B.ok) throw new Error('geometria non valida: la Y chiude il poligono centrale o θ è fuori campo');
  const P={type:par.type,Nc:nx,hw:0};
  const G=par.type==='hex'?{L:par.L,Na:ny,C:1e12}:{L:par.L,Na:ny,C:1e12};
  const S=assemble(P,G,()=>B);
  const bodies=[], ofPart=new Int32Array(S.parts.length).fill(-1), ofGroup=new Map();
  S.parts.forEach((p,i)=>{ if(p.kind==='ROT'){ ofPart[i]=bodies.length; bodies.push({kind:'ROT',pts:[p.pts],lockRot:false}); } });
  S.parts.forEach((p,i)=>{ if(p.kind!=='EST') return; let b=ofGroup.get(p.group); if(b===undefined){ b=bodies.length; ofGroup.set(p.group,b); bodies.push({kind:'Y',pts:[],lockRot:false}); } bodies[b].pts.push(p.pts); ofPart[i]=b; });
  bodies.forEach(b=>{ let x=0,y=0,n=0; for(const pc of b.pts) for(const q of pc){ x+=q[0]; y+=q[1]; n++; } b.c=[x/n,y/n]; });
  const hinges=S.hinges.map(h=>({a:ofPart[h.rot],b:ofPart[h.est],P:plPivot(S.parts[h.est].pts,S.parts[h.rot].pts,h.p,par),H:h.p.slice(),sa:[0,0],sb:[0,0],k:par.k,kt:par.kt,e0:plStripDir(S.parts[h.est].pts),kth:par.kth,tab:par.tab||null}));
  let mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18; for(const b of bodies) for(const pc of b.pts) for(const q of pc){ mnx=Math.min(mnx,q[0]); mny=Math.min(mny,q[1]); mxx=Math.max(mxx,q[0]); mxy=Math.max(mxy,q[1]); }
  const box=[mnx,mny,mxx,mxy], ax=(mxx-mnx)>=(mxy-mny)?0:1;
  const order=bodies.map((b,i)=>i).sort((i,j)=>bodies[i].c[ax]-bodies[j].c[ax]||bodies[i].c[1-ax]-bodies[j].c[1-ax]);
  const draw=[]; bodies.forEach((b,i)=>b.pts.forEach(pc=>draw.push({body:i,pts:pc,s:[0,0],kind:b.kind})));
  return {bodies,hinges,periodic:false,ctl:[],L:par.L,order,box,draw,par,nx,ny,S,ofPart,ofGroup};
}
/* vincoli della superficie: bloccati (tutto fermo), tirati (spostamento t lungo dir; con presa rigida anche trasversale e rotazione nulli) */
function plPlaneBC(M,fixed,pulled,dir,grip){
  const ctl=[]; const n=Math.hypot(dir[0],dir[1])||1, d=[dir[0]/n,dir[1]/n];
  for(const i of fixed) ctl.push({dof:3*i},{dof:3*i+1},{dof:3*i+2});
  for(const i of pulled){
    if(Math.abs(d[0])>=Math.abs(d[1])){ ctl.push({dof:3*i,coef:d[0]}); if(grip||d[1]!==0) ctl.push({dof:3*i+1,coef:d[1]}); }
    else { ctl.push({dof:3*i+1,coef:d[1]}); if(grip||d[0]!==0) ctl.push({dof:3*i,coef:d[0]}); }
    if(grip) ctl.push({dof:3*i+2});
  }
  M.ctl=ctl; return M;
}
