/* ===================== BLADDER / RESTRAINT =====================
   Membrana equivalente a un solo strato, mesh di triangoli su un settore (simmetria ciclica come la colonna).
   - forma di riposo = forma finale: profilo dei nodi delle Y nello stato aperto, spostato verso l'interno di s/2 + gioco,
     chiusa sui bulkhead con un collare cilindrico che copre le tacche del bordo a zig-zag
   - lati: molle assiali (rigidezza di membrana EA, solo trazione; compressione quasi nulla)
   - lati interni: molle torsionali sull'angolo diedro (rigidezza flessionale D, k = 3·D·ℓ²/(A1+A2)), riposo = forma finale
   - facce: pressione p·A·n (forza seguace)
   - attacchi puntuali (molle a lunghezza nulla) al centro dei poligoni rotanti o nei nodi delle Y, fissi o scorrevoli
   - contatto unilaterale con le piastre nel riferimento di ogni corpo, autocontatto punto-triangolo e lato-lato
   - piegatura iniziale: raccolta lungo il moto di chiusura del reticolo dei nodi delle Y + pieghe a soffietto
   Soluzione quasi statica per rilassamento dinamico (masse fittizie adattive, dt = 1, smorzamento cinetico);
   la struttura è risolta a passi alterni con il solutore della colonna caricato dalle reazioni della membrana
   e da un termine prossimale con la rigidezza di contatto (accoppiamento a due vie stabile). */
function buildBladder(col,solv,P,G,prof,qF,o){
  const Nc=P.Nc, al=2*Math.PI/Nc, ca=Math.cos(al), sa=Math.sin(al), R=P.R, s=P.s, bodies=col.bodies;
  const gap=o.gap, rhoC=R-s/2, Rc=rhoC-gap;
  const zt=solv.izt, ztF=solv.bulk?qF[zt]:0;
  // ---- profilo di riposo (forma finale): profilo dei nodi delle Y, spostato verso l'interno ----
  const nL=prof.rs.length, pr=[];
  for(let l=0;l<nL;l++) pr.push([prof.rs[l]-s/2-gap, prof.zs[l]]);
  // lisciatura (i livelli alterni dei nodi danno un profilo a dente di sega), estremità fisse
  for(let it=0;it<2;it++){ const c=pr.map(p=>p.slice()); for(let l=1;l<nL-1;l++){ pr[l][0]=0.25*c[l-1][0]+0.5*c[l][0]+0.25*c[l+1][0]; pr[l][1]=0.25*c[l-1][1]+0.5*c[l][1]+0.25*c[l+1][1]; } }
  pr[0][0]=Rc; pr[nL-1][0]=Rc;   // anelli di bordo sul bulkhead: stesso raggio da chiuso e da aperto
  // collare del bulkhead: fascia cilindrica alta hc che chiude le tacche del bordo a zig-zag; la membrana la segue
  const hc=o.collar==null?0.9*col.G.hstep:o.collar;
  if(hc>0){ const z0=pr[0][1], z1=pr[nL-1][1], inner=pr.filter(p=>p[1]>z0+hc+0.25*col.G.hstep&&p[1]<z1-hc-0.25*col.G.hstep);
    pr.length=0; pr.push([Rc,z0],[Rc,z0+hc],...inner,[Rc,z1-hc],[Rc,z1]); }
  const nP=pr.length;
  // Catmull-Rom densificato, poi ricampionamento a passo costante in lunghezza d'arco
  const dense=[]; const CR=(a,b,c,d,t)=>{const t2=t*t,t3=t2*t; return 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);};
  for(let l=0;l<nP-1;l++){ const a=pr[Math.max(0,l-1)], b=pr[l], c=pr[l+1], d=pr[Math.min(nP-1,l+2)];
    for(let k=0;k<12;k++){ const t=k/12; dense.push([CR(a[0],b[0],c[0],d[0],t),CR(a[1],b[1],c[1],d[1],t)]); } }
  dense.push(pr[nP-1].slice());
  const sAcc=[0]; for(let i=1;i<dense.length;i++) sAcc.push(sAcc[i-1]+Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]));
  const S=sAcc[sAcc.length-1];
  const nphi=Math.max(6,Math.round(o.nphi)), ns=Math.max(8,Math.round(S/Math.max(0.01,o.ds)));
  const ring=[]; { let k=0; for(let j=0;j<=ns;j++){ const sj=S*j/ns; while(k<sAcc.length-2&&sAcc[k+1]<sj) k++; const f=Math.min(1,Math.max(0,(sj-sAcc[k])/((sAcc[k+1]-sAcc[k])||1)));
    ring.push({r:dense[k][0]+(dense[k+1][0]-dense[k][0])*f, z:dense[k][1]+(dense[k+1][1]-dense[k][1])*f, s:sj}); } }
  const N=(ns+1)*nphi, id=(i,j)=>j*nphi+i;
  const X0=new Float64Array(3*N);   // forma di riposo (finale)
  for(let j=0;j<=ns;j++) for(let i=0;i<nphi;i++){ const a=al*i/nphi, k=3*id(i,j); X0[k]=ring[j].r*Math.cos(a); X0[k+1]=ring[j].r*Math.sin(a); X0[k+2]=ring[j].z; }
  // codici dei vertici con le copie nei settori vicini: (indice nodo)*3 + (rotazione + 1)
  const code=(I,J)=>{ const r=Math.floor(I/nphi), i=I-r*nphi; return 3*id(i,J)+(r+1); };
  // ---- triangoli, lati, cerniere ----
  const triU=[];
  for(let J=0;J<ns;J++) for(let I=0;I<nphi;I++){
    const a=[I,J], b=[I+1,J], c=[I+1,J+1], d=[I,J+1];
    if((I+J)%2===0){ triU.push([a,b,c],[a,c,d]); } else { triU.push([a,b,d],[b,c,d]); }
  }
  const nT=triU.length, tri=new Int32Array(3*nT);
  triU.forEach((t,k)=>{ for(let v=0;v<3;v++) tri[3*k+v]=code(t[v][0],t[v][1]); });
  const emap=new Map(), edges=[];
  const keyOf=(p,q)=>{ const sft=Math.floor(Math.min(p[0],q[0])/nphi)*nphi; const A=[p[0]-sft,p[1]], B=[q[0]-sft,q[1]];
    const ka=A[0]+','+A[1], kb=B[0]+','+B[1]; return {key:ka<kb?ka+'|'+kb:kb+'|'+ka, sft}; };
  triU.forEach((t,k)=>{ for(let e=0;e<3;e++){ const p=t[e], q=t[(e+1)%3], opp=t[(e+2)%3], K=keyOf(p,q);
      let E=emap.get(K.key); if(!E){ E={p:[p[0]-K.sft,p[1]],q:[q[0]-K.sft,q[1]],tris:[]}; emap.set(K.key,E); edges.push(E); }
      E.tris.push({t:k,e0:[p[0]-K.sft,p[1]],e1:[q[0]-K.sft,q[1]],opp:[opp[0]-K.sft,opp[1]]}); } });
  // posizione da codice
  const getP=(x,c,out)=>{ const k=3*((c/3)|0), r=(c%3)-1, X=x[k], Y=x[k+1];
    if(r===0){out[0]=X;out[1]=Y;} else { const sn=r*sa; out[0]=ca*X-sn*Y; out[1]=sn*X+ca*Y; } out[2]=x[k+2]; return out; };
  const addF=(f,c,F0,F1,F2)=>{ const k=3*((c/3)|0), r=(c%3)-1;
    if(r===0){f[k]+=F0;f[k+1]+=F1;} else { const sn=-r*sa; f[k]+=ca*F0-sn*F1; f[k+1]+=sn*F0+ca*F1; } f[k+2]+=F2; };
  const triArea=(x,t)=>{ const a=getP(x,tri[3*t],[0,0,0]), b=getP(x,tri[3*t+1],[0,0,0]), c=getP(x,tri[3*t+2],[0,0,0]);
    const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]]; return 0.5*Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]); };
  const A0=new Float64Array(nT); for(let t=0;t<nT;t++) A0[t]=triArea(X0,t);
  const EA=o.EA, nE=edges.length, eA=new Int32Array(nE), eB=new Int32Array(nE), eL=new Float64Array(nE), eK=new Float64Array(nE), eW=new Float64Array(nE);
  const pa=[0,0,0], pb=[0,0,0], pc=[0,0,0], pd=[0,0,0];
  edges.forEach((E,k)=>{ eA[k]=code(E.p[0],E.p[1]); eB[k]=code(E.q[0],E.q[1]); getP(X0,eA[k],pa); getP(X0,eB[k],pb);
    const L=Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]), Ad=E.tris.reduce((sum,t)=>sum+A0[t.t],0);
    eL[k]=L; eW[k]=Ad/L; eK[k]=0.8*EA*Ad/(L*L); });
  // cerniere (lati con due triangoli): e0, e1 nell'ordine del triangolo A, a opposto in A, b opposto in B
  const hin=edges.filter(E=>E.tris.length===2), nH=hin.length;
  const hE0=new Int32Array(nH), hE1=new Int32Array(nH), hA=new Int32Array(nH), hB=new Int32Array(nH), hTh=new Float64Array(nH), hK=new Float64Array(nH), hU=new Float64Array(4*nH);
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function dihedral(x0,x1,xa,xb,grad){
    // x0,x1 lato comune (verso del triangolo A), xa opposto in A, xb opposto in B; gradiente di Bridson (somma nulla)
    const E0=x1[0]-x0[0], E1=x1[1]-x0[1], E2=x1[2]-x0[2], le=Math.sqrt(E0*E0+E1*E1+E2*E2)||1e-12;
    const a0=xa[0]-x0[0], a1=xa[1]-x0[1], a2=xa[2]-x0[2], b0=xa[0]-x1[0], b1=xa[1]-x1[1], b2=xa[2]-x1[2];
    const c0=xb[0]-x1[0], c1=xb[1]-x1[1], c2=xb[2]-x1[2], d0=xb[0]-x0[0], d1=xb[1]-x0[1], d2=xb[2]-x0[2];
    const n10=a1*b2-a2*b1, n11=a2*b0-a0*b2, n12=a0*b1-a1*b0;          // (xa−x0)×(xa−x1)
    const n20=c1*d2-c2*d1, n21=c2*d0-c0*d2, n22=c0*d1-c1*d0;          // (xb−x1)×(xb−x0)
    const q1=(n10*n10+n11*n11+n12*n12)||1e-24, q2=(n20*n20+n21*n21+n22*n22)||1e-24;
    const cx=n11*n22-n12*n21, cy=n12*n20-n10*n22, cz=n10*n21-n11*n20;
    const th=Math.atan2((cx*E0+cy*E1+cz*E2)/le, n10*n20+n11*n21+n12*n22);
    if(grad){
      const ea=(b0*E0+b1*E1+b2*E2)/le, eb=(c0*E0+c1*E1+c2*E2)/le, fa=(a0*E0+a1*E1+a2*E2)/le, fb=(d0*E0+d1*E1+d2*E2)/le;
      const s1=1/q1, s2=1/q2, g0=grad[0], g1=grad[1], g2=grad[2], g3=grad[3];
      g0[0]=le*n10*s1; g0[1]=le*n11*s1; g0[2]=le*n12*s1;
      g1[0]=le*n20*s2; g1[1]=le*n21*s2; g1[2]=le*n22*s2;
      g2[0]=(ea*n10)*s1+(eb*n20)*s2; g2[1]=(ea*n11)*s1+(eb*n21)*s2; g2[2]=(ea*n12)*s1+(eb*n22)*s2;
      g3[0]=-(fa*n10)*s1-(fb*n20)*s2; g3[1]=-(fa*n11)*s1-(fb*n21)*s2; g3[2]=-(fa*n12)*s1-(fb*n22)*s2;
    }
    return th;
  }
  const GR=[[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
  hin.forEach((E,k)=>{ const tA=E.tris[0], tB=E.tris[1];
    hE0[k]=code(tA.e0[0],tA.e0[1]); hE1[k]=code(tA.e1[0],tA.e1[1]); hA[k]=code(tA.opp[0],tA.opp[1]); hB[k]=code(tB.opp[0],tB.opp[1]);
    getP(X0,hE0[k],pa); getP(X0,hE1[k],pb); getP(X0,hA[k],pc); getP(X0,hB[k],pd);
    hTh[k]=dihedral(pa,pb,pc,pd,GR); const le=Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]);
    hK[k]=3*o.D*le*le/(A0[tA.t]+A0[tB.t]);
    const nr=GR.map(g=>Math.hypot(g[0],g[1],g[2])); for(let c=0;c<4;c++) hU[4*k+c]=nr[c]; });
  const BRIDSON_SIGN=-1;   // verificato con le differenze finite: ∂θ/∂x = −u (Bridson)
  // ---- nodi cinematici: anelli di bordo sui bulkhead ----
  const kin=new Uint8Array(N); for(let i=0;i<nphi;i++){ kin[id(i,0)]=1; kin[id(i,ns)]=2; }
  const zBot=ring[0].z, zTopRef=ring[ns].z-ztF, rTop=ring[ns].r;   // quota dell'anello alto sul disco (struttura chiusa)
  // ---- corpi: pose, derivate rispetto alle rotazioni, piastre (contatto) ----
  const per=col.per;
  const plates=[];   // {b, poly:[[u,v]], uc, umin, umax, vmin, vmax}
  col.rot.forEach(r=>{ plates.push({b:r.body,poly:r.pts.map(p=>[p[0],p[1]])}); });
  col.est.forEach(pc=>{ plates.push({b:pc.body,poly:pc.pts.map(p=>[p[0]+pc.m*per,p[1]])}); });
  for(const pl of plates){ let a=1e18,b=-1e18,c=1e18,d=-1e18; for(const p of pl.poly){a=Math.min(a,p[0]);b=Math.max(b,p[0]);c=Math.min(c,p[1]);d=Math.max(d,p[1]);} pl.umin=a; pl.umax=b; pl.vmin=c; pl.vmax=d; pl.uc=(a+b)/2; }
  const inst=[]; for(const pl of plates) for(let t=-2;t<=2;t++){ const u0=pl.umin+t*per, u1=pl.umax+t*per; if(u1>-0.35*per&&u0<1.35*per) inst.push({pl,t}); }
  const nb=bodies.length, BP={c:new Float64Array(3*nb), Q:new Float64Array(9*nb), dQ:new Float64Array(27*nb)};
  function setBodies(q){
    for(let b=0;b<nb;b++){ const Pp=solv.pose(q,b), oo=6*bodies[b].o;
      BP.c.set(Pp.c,3*b); BP.Q.set(Pp.Q,9*b);
      const w=[q[oo+3],q[oo+4],q[oo+5]], eps=1e-7;
      for(let j=0;j<3;j++){ const w2=w.slice(); w2[j]+=eps; const Q2=rodrigues(w2); for(let m=0;m<9;m++) BP.dQ[27*b+9*j+m]=(Q2[m]-Pp.Q[m])/eps; } }
  }
  // punto materiale Y del corpo b (riferimento) -> mondo, nella copia ruotata di t settori
  const RT=[]; for(let t=-4;t<=4;t++) RT.push([Math.cos(t*al),Math.sin(t*al)]); const rotT=t=>RT[t+4];
  function bodyPoint(b,t,Y,out){
    const c0=bodies[b].c0, Q=BP.Q, k=9*b, a0=Y[0]-c0[0], a1=Y[1]-c0[1], a2=Y[2]-c0[2];
    const x=BP.c[3*b]+Q[k]*a0+Q[k+1]*a1+Q[k+2]*a2, y=BP.c[3*b+1]+Q[k+3]*a0+Q[k+4]*a1+Q[k+5]*a2, z=BP.c[3*b+2]+Q[k+6]*a0+Q[k+7]*a1+Q[k+8]*a2;
    const [ct,st]=rotT(t); out[0]=ct*x-st*y; out[1]=st*x+ct*y; out[2]=z; return out;
  }
  // mondo (copia t) -> riferimento del corpo b
  function toBody(b,t,x,out){
    const [ct,st]=rotT(t), X=ct*x[0]+st*x[1], Yy=-st*x[0]+ct*x[1], Z=x[2], k=9*b, Q=BP.Q, c0=bodies[b].c0;
    const d0=X-BP.c[3*b], d1=Yy-BP.c[3*b+1], d2=Z-BP.c[3*b+2];
    out[0]=c0[0]+Q[k]*d0+Q[k+3]*d1+Q[k+6]*d2; out[1]=c0[1]+Q[k+1]*d0+Q[k+4]*d1+Q[k+7]*d2; out[2]=c0[2]+Q[k+2]*d0+Q[k+5]*d1+Q[k+8]*d2; return out;
  }
  // forza F (mondo, copia t) applicata al punto materiale Y del corpo b -> forza generalizzata sui gdl della colonna
  function addGen(gacc,b,t,Y,F0,F1,F2){
    const [ct,st]=rotT(t), f0=ct*F0+st*F1, f1=-st*F0+ct*F1, f2=F2, oo=6*bodies[b].o, c0=bodies[b].c0;
    gacc[oo]+=f0; gacc[oo+1]+=f1; gacc[oo+2]+=f2;
    const a0=Y[0]-c0[0], a1=Y[1]-c0[1], a2=Y[2]-c0[2];
    for(let j=0;j<3;j++){ const k=27*b+9*j, D=BP.dQ; gacc[oo+3+j]+=f0*(D[k]*a0+D[k+1]*a1+D[k+2]*a2)+f1*(D[k+3]*a0+D[k+4]*a1+D[k+5]*a2)+f2*(D[k+6]*a0+D[k+7]*a1+D[k+8]*a2); }
  }
  // ---- attacchi: un nodo della membrana per ogni centro di blocco (poligono rotante) o nodo di Y ----
  setBodies(qF);
  const anchors=[], used=new Map();
  bodies.forEach((B,b)=>{
    let Pref=null;
    if(o.attach==='none'||o.free) return;
    if(o.attach==='y'){ if(B.kind!=='EST'||B.level===0||B.level===col.nLev-1) return; if(o.yEvery&&(B.level-1)%o.yEvery!==0) return; Pref=B.Xv; }
    else { if(B.kind!=='ROT') return; Pref=B.c0; }
    const ang=Math.atan2(Pref[1],Pref[0]), t=-Math.floor(ang/al+1e-9);
    const Pin=[Pref[0]*(Rc/R),Pref[1]*(Rc/R),Pref[2]];   // sulla faccia interna (meno il gioco)
    const xF=bodyPoint(b,t,Pin,[0,0,0]);
    let best=-1, bd=1e18; for(let j=2;j<=ns-2;j++) for(let i=0;i<nphi;i++){ const k=3*id(i,j), d=(X0[k]-xF[0])**2+(X0[k+1]-xF[1])**2+(X0[k+2]-xF[2])**2; if(d<bd){bd=d;best=id(i,j);} }
    if(best<0||bd>Math.pow(o.anchorTol||0.08,2)) return;   // corpo troppo lontano dalla membrana (vicino al collare)
    const prev=used.get(best); if(prev!==undefined&&anchors[prev].d2<=bd) return;
    const Y=toBody(b,t,[X0[3*best],X0[3*best+1],X0[3*best+2]],[0,0,0]);
    const A={node:best,b,t,Y,d2:bd,Pin};
    if(prev!==undefined) anchors[prev]=A; else { used.set(best,anchors.length); anchors.push(A); }
  });
  // broadphase delle piastre in (φ, z), ricostruita quando la struttura si muove
  const BG={na:48, a0:-0.4*al, a1:1.4*al, nz:0, z0:0, dz:0, cells:null}, gPad=0.5*col.G.L+0.05;
  function buildPlateGrid(q){
    setBodies(q);
    let zmin=1e18,zmax=-1e18; const tmp=[0,0,0], Yr=[0,0,0];
    const boxes=inst.map(I=>{ const pl=I.pl; let amin=1e9,amax=-1e9,z0=1e9,z1=-1e9;
      for(const p of pl.poly){ const a=p[0]/R; for(const rr of [rhoC,R+s/2]){ Yr[0]=rr*Math.cos(a); Yr[1]=rr*Math.sin(a); Yr[2]=p[1]; bodyPoint(pl.b,I.t,Yr,tmp);
        const an=Math.atan2(tmp[1],tmp[0]); amin=Math.min(amin,an); amax=Math.max(amax,an); z0=Math.min(z0,tmp[2]); z1=Math.max(z1,tmp[2]); } }
      if(amax-amin>Math.PI){ amin=-Math.PI; amax=Math.PI; }   // a cavallo di ±π: improbabile, prudenza
      zmin=Math.min(zmin,z0); zmax=Math.max(zmax,z1); return [amin,amax,z0,z1]; });
    BG.z0=zmin-0.2; BG.nz=Math.max(4,Math.ceil((zmax-zmin+0.4)/0.25)); BG.dz=(zmax-zmin+0.4)/BG.nz;
    BG.cells=Array.from({length:BG.na*BG.nz},()=>[]);
    const pad=0.02*al+gPad/rhoC;
    boxes.forEach((bx,ii)=>{ const ia0=Math.max(0,Math.floor((bx[0]-pad-BG.a0)/(BG.a1-BG.a0)*BG.na)), ia1=Math.min(BG.na-1,Math.floor((bx[1]+pad-BG.a0)/(BG.a1-BG.a0)*BG.na));
      const iz0=Math.max(0,Math.floor((bx[2]-gPad-BG.z0)/BG.dz)), iz1=Math.min(BG.nz-1,Math.floor((bx[3]+gPad-BG.z0)/BG.dz));
      for(let a=ia0;a<=ia1;a++) for(let z=iz0;z<=iz1;z++) BG.cells[z*BG.na+a].push(ii); });
    for(const A of anchors){ A.w=bodyPoint(A.b,A.t,A.Y,[0,0,0]); }
  }
  // distanza dal bordo di un poligono (fuori) oppure 0 (dentro)
  const polyDist=(poly,u,v)=>{ if(inPoly(poly,u,v)) return 0; let m=1e18; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[j], b=poly[i], ex=b[0]-a[0], ey=b[1]-a[1], l2=ex*ex+ey*ey||1e-18;
      const t=Math.max(0,Math.min(1,((u-a[0])*ex+(v-a[1])*ey)/l2)), dx=u-a[0]-t*ex, dy=v-a[1]-t*ey; m=Math.min(m,dx*dx+dy*dy); } return Math.sqrt(m); };
  const inPoly=(poly,u,v)=>{ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i], b=poly[j]; if(((a[1]>v)!==(b[1]>v))&&(u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; };
  // ---- piegatura iniziale ----
  // 1) raccolta: ogni punto della membrana segue all'indietro il moto della piastra su cui poggia nella forma finale
  //    (o della piastra più vicina, se sta sopra un'apertura), fino alla struttura chiusa, sulla parete (raggio Rc)
  // 2) pieghe a soffietto incrociate verso l'interno: il tessuto in eccesso (lati accorciati dalla raccolta) diventa
  //    un'ondulazione radiale in circonferenza e lungo l'asse, con ampiezza che restituisce la lunghezza dei lati;
  //    l'ampiezza si annulla agli attacchi e agli anelli di bordo
  const Xc=new Float64Array(3*N);
  setBodies(qF);
  // blocchi (triangoli o quadrati dei nodi delle Y): vertici chiusi e aperti in coordinate cilindriche (φ, z)
  const Nb=P.type==='square'?4:3, blk=[];
  col.rot.forEach((r,ci)=>{
    const C=[], D=[];
    for(let i=0;i<Nb;i++){ const pc=col.est[Nb*ci+i], u=pc.pts[0][0], v=pc.pts[0][1], m=pc.m;
      C.push([u/R,v]);
      const Xm=[R*Math.cos((u+m*per)/R),R*Math.sin((u+m*per)/R),v], w=bodyPoint(pc.body,-m,Xm,[0,0,0]);
      D.push([Math.atan2(w[1],w[0]),w[2]]); }
    // angoli aperti continui attorno al primo vertice
    for(let i=1;i<Nb;i++){ while(D[i][0]-D[0][0]>Math.PI) D[i][0]-=2*Math.PI; while(D[0][0]-D[i][0]>Math.PI) D[i][0]+=2*Math.PI; }
    for(let i=1;i<Nb-1;i++) for(const t of [-1,0,1]) blk.push({C:[C[0],C[i],C[i+1]].map(p=>[p[0]+t*al,p[1]]),D:[D[0],D[i],D[i+1]].map(p=>[p[0]+t*al,p[1]])});
  });
  const bary=(T,x,y)=>{ const [a,b,c]=T, d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]); if(Math.abs(d)<1e-14) return null;
    const l1=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d, l2=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d; return [l1,l2,1-l1-l2]; };
  for(let i=0;i<N;i++){ const k=3*i;
    if(kin[i]){ Xc[k]=X0[k]; Xc[k+1]=X0[k+1]; Xc[k+2]=kin[i]===1?zBot:zTopRef; continue; }
    const ph=Math.atan2(X0[k+1],X0[k]), z=X0[k+2];
    let best=null, bs=-1e18;
    for(const B2 of blk){ const l=bary(B2.D,ph,z); if(!l) continue; const m=Math.min(l[0],l[1],l[2]); if(m>bs){ bs=m; best={B2,l}; if(m>=0) break; } }
    const {B2,l}=best, phc=l[0]*B2.C[0][0]+l[1]*B2.C[1][0]+l[2]*B2.C[2][0], zc=l[0]*B2.C[0][1]+l[1]*B2.C[1][1]+l[2]*B2.C[2][1];
    Xc[k]=Rc*Math.cos(phc); Xc[k+1]=Rc*Math.sin(phc); Xc[k+2]=Math.min(zTopRef-1e-3,Math.max(zBot+1e-3,zc)); }
  // attacchi esattamente sul loro punto
  setBodies(new Float64Array(solv.n));
  for(const A of anchors){ const w=bodyPoint(A.b,A.t,A.Y,[0,0,0]), k=3*A.node; Xc[k]=w[0]; Xc[k+1]=w[1]; Xc[k+2]=w[2]; }
  // proiezione: nessun lato raccolto più lungo del 98% del riposo (nodi fissi: anelli e attacchi)
  const project=()=>{ const fixed=new Uint8Array(N); for(let i=0;i<N;i++) if(kin[i]) fixed[i]=1; for(const A of anchors) fixed[A.node]=1;
    for(let it=0;it<300;it++){ let worst=0;
      for(let e=0;e<nE;e++){ getP(Xc,eA[e],pa); getP(Xc,eB[e],pb); const d0=pb[0]-pa[0], d1=pb[1]-pa[1], d2=pb[2]-pa[2], L=Math.hypot(d0,d1,d2), Lm=0.98*eL[e];
        if(L<=Lm) continue; worst=Math.max(worst,L/eL[e]);
        const ia=(eA[e]/3)|0, ib=(eB[e]/3)|0, wa=fixed[ia]?0:1, wb=fixed[ib]?0:1; if(wa+wb===0) continue;
        const c=(L-Lm)/L/(wa+wb); addF(Xc,eA[e],wa*c*d0,wa*c*d1,wa*c*d2); addF(Xc,eB[e],-wb*c*d0,-wb*c*d1,-wb*c*d2); }
      // resta sulla parete o dentro
      for(let i=0;i<N;i++){ if(fixed[i]) continue; const k=3*i, r=Math.hypot(Xc[k],Xc[k+1]); if(r>Rc){ Xc[k]*=Rc/r; Xc[k+1]*=Rc/r; } Xc[k+2]=Math.min(zTopRef-1e-3,Math.max(zBot+1e-3,Xc[k+2])); }
      if(worst<1.0) break; } };
  project();
  // accorciamento medio dei lati in circonferenza e lungo il meridiano per ogni nodo
  const cH=new Float64Array(N), cM=new Float64Array(N), lH=new Float64Array(N), lM=new Float64Array(N), nHc=new Float64Array(N), nMc=new Float64Array(N);
  for(let j=0;j<=ns;j++) for(let i=0;i<nphi;i++){ const a=code(i,j);
    const hn=code(i+1,j); getP(X0,a,pa); getP(X0,hn,pb); const L0h=Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]); getP(Xc,a,pa); getP(Xc,hn,pb); const Lch=Math.max(1e-4,Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]));
    const ia=id(i,j), ib=id((i+1)%nphi,j); for(const q of [ia,ib]){ cH[q]+=L0h/Lch; lH[q]+=Lch; nHc[q]++; }
    if(j<ns){ const mn=code(i,j+1); getP(X0,a,pa); getP(X0,mn,pb); const L0m=Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]); getP(Xc,a,pa); getP(Xc,mn,pb); const Lcm=Math.max(1e-4,Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]));
      const jb=id(i,j+1); for(const q of [ia,jb]){ cM[q]+=L0m/Lcm; lM[q]+=Lcm; nMc[q]++; } } }
  // numero di semionde: pieghe in circonferenza per settore (intero, per la periodicità) e passo lungo l'asse (m)
  const nwH=Math.max(1,Math.round(o.waveH||1)), lamZ=Math.max(2*o.ds,o.waveZ||1.0), fold=new Float64Array(N);
  const zRing=new Float64Array(ns+1), rRing=new Float64Array(ns+1), zMidC=(zBot+zTopRef)/2;
  for(let j=0;j<=ns;j++){ let z=0,r=0; for(let i=0;i<nphi;i++){ const k=3*id(i,j); z+=Xc[k+2]; r+=Math.hypot(Xc[k],Xc[k+1]); } zRing[j]=z/nphi; rRing[j]=r/nphi; }
  const ancIJ=anchors.map(A=>[A.node%nphi,(A.node/nphi)|0]);
  for(let j=0;j<=ns;j++) for(let i=0;i<nphi;i++){ const q=id(i,j); if(kin[q]) continue;
    const ch=Math.max(1,cH[q]/Math.max(1,nHc[q])), cm=Math.max(1,cM[q]/Math.max(1,nMc[q]));
    const lamH=al*rRing[j]/nwH;
    const ah=0.8*(lamH/Math.PI)*Math.sqrt(Math.min(ch-1,1.5)), am=0.8*(lamZ/Math.PI)*Math.sqrt(Math.min(cm-1,1.5));
    let dA=1e9; for(const [ai,aj] of ancIJ){ let di=Math.abs(i-ai); di=Math.min(di,nphi-di); dA=Math.min(dA,Math.hypot(di,j-aj)); }
    const g=(1-Math.exp(-((dA/1.6)**2)))*(1-Math.exp(-((Math.min(j,ns-j)/2.5)**2)));
    // fase per indice: le creste restano allineate lungo i meridiani e lungo i paralleli
    const w=g*(ah*(1-Math.cos(2*Math.PI*nwH*i/nphi))/2+am*(1-Math.cos(2*Math.PI*(zRing[j]-zMidC)/lamZ))/2);
    fold[q]=Math.min(w,o.foldMax||0.35*Rc); }
  for(let q=0;q<N;q++){ if(!fold[q]) continue; const k=3*q, r=Math.hypot(Xc[k],Xc[k+1])||1, f=(r-fold[q])/r; Xc[k]*=f; Xc[k+1]*=f; }
  project();
  // ---- masse fittizie (stabilità del rilassamento dinamico con dt = 1) ----
  let hMin=1e9, hMean=0; for(let k=0;k<nE;k++){ hMin=Math.min(hMin,eL[k]); hMean+=eL[k]; } hMean/=nE;
  const slide=o.slide===true, rfA=o.regA==null?1:o.regA, rfC=o.regC==null?0.5:o.regC, cWin=o.cWin||0.6, dFar=o.dFar||0.5*col.G.L, bridge=o.bridge==null?0.7*hMean:o.bridge, kA=o.kA||2e6, kC=o.kC||8e4, rSC=0.45*hMean, kSC=o.kSC||5e4, cComp=o.cComp==null?1e-3:o.cComp;
  const kSum=new Float64Array(N);
  const addK=(c,v)=>{ kSum[(c/3)|0]+=v; };
  for(let k=0;k<nH;k++){ const u=hU.subarray(4*k,4*k+4), su=u[0]+u[1]+u[2]+u[3]; addK(hA[k],hK[k]*u[0]*su); addK(hB[k],hK[k]*u[1]*su); addK(hE0[k],hK[k]*u[2]*su); addK(hE1[k],hK[k]*u[3]*su); }
  // masse adattive: parte fissa (flessione, contatto, autocontatto, pressione, attacchi) + lati tesi ricalcolati a ogni passo
  const mBase=new Float64Array(N), kEdge=new Float64Array(N);
  for(let i=0;i<N;i++) mBase[i]=kSum[i]+2*kC+(o.self?4*(o.kST||1.2e6):0)+(o.pmaxPa||1e5)*hMean*2;
  for(const A of anchors) mBase[A.node]+=kA;
  const band=o.band||0.05, vMax=o.vMax||0.4*band*hMean;
  // ---- stato ----
  const st={x:Float64Array.from(Xc), v:new Float64Array(3*N), f:new Float64Array(3*N), q:new Float64Array(solv.n), p:0,
    gacc:new Float64Array(solv.n), nacc:0, it:0, contacts:0, selfc:0, Tmax:0, epsMax:0, Vm:0, blend:0, zt:0, vz:0, fzDisk:0, mzDisk:1, zb:0, vzb:0, fzBot:0, mzBot:1, cComp:cComp, Dmul:1, fric:0, kCm:1, noHole:0, rec:false};
  const cFlag=new Uint8Array(N), plC=new Int32Array(N).fill(-1), penN=new Float32Array(N), plB=new Int32Array(N);
  // intorno degli attacchi: lì comanda l'attacco (il centro della Y), non l'inviluppo lisciato della faccia interna
  const nearA=new Uint8Array(N); for(const A of anchors){ const ai=A.node%nphi, aj=(A.node/nphi)|0;
    for(let dj=-2;dj<=2;dj++) for(let di=-2;di<=2;di++){ const j=aj+dj; if(j<0||j>ns) continue; const i=((ai+di)%nphi+nphi)%nphi; nearA[id(i,j)]=1; } }
  const kB=new Float64Array(bodies.length); let kZ=0;
  for(const A of anchors){ const k=3*A.node; A.x0=[Xc[k],Xc[k+1],Xc[k+2]]; }
  // rigidezza assiale della membrana sull'anello alto (lati fra le ultime due file)
  let kTopRing=0; for(let k=0;k<nE;k++){ const ja=((eA[k]/3|0)/nphi)|0, jb=((eB[k]/3|0)/nphi)|0; if((ja===ns)!==(jb===ns)) kTopRing+=eK[k]; }
  kTopRing*=(o.kTopF==null?0.05:o.kTopF);
  const nodeEps=new Float32Array(N);
  // membrana libera: il collare vale solo per le file di materiale che lo formano (non per quota)
  const colRow=new Uint8Array(N); for(let j=0;j<=ns;j++){ if(ring[j].s<=hc+1e-6||ring[j].s>=S-hc-1e-6) for(let i=0;i<nphi;i++) colRow[id(i,j)]=1; }
  // tabella hash per l'autocontatto
  const HT=1<<15, hHead=new Int32Array(HT), hNext=new Int32Array(3*N), hItem=new Int32Array(3*N), hPos=new Float64Array(9*N);
  // autocontatto punto-triangolo (alla Bridson/Blender): spessore hT, triangoli del settore e dei due vicini in una tabella hash
  const hT=o.selfThk||0.015, kST=o.kST||1.2e6, csT=Math.max(2*hT,1.5*hMean), TH=1<<16, tHead=new Int32Array(TH), tCap=3*nT*12;
  let tNext=new Int32Array(tCap), tItem=new Int32Array(tCap), tCapN=tCap;
  const tV=new Float64Array(27*nT), tIJ=new Int32Array(18*nT), tAB=new Float64Array(18*nT), nearN=new Uint8Array(N);   // vertici ruotati e indici (i srotolato, j) per copia
  const tcell=(a,b,c)=>((a*73856093)^(b*19349663)^(c*83492791))&(TH-1);
  for(let t=0;t<nT;t++) for(let ro=0;ro<3;ro++) for(let q=0;q<3;q++){ const c=tri[3*t+q], nd=(c/3)|0, r=(c%3)-1; tIJ[18*t+6*ro+2*q]=nd%nphi+(r+ro-1)*nphi; tIJ[18*t+6*ro+2*q+1]=(nd/nphi)|0; }
  const RC=[[Math.cos(-al),Math.sin(-al)],[1,0],[Math.cos(al),Math.sin(al)]];
  // lati per l'autocontatto lato-lato (due falde che si incrociano senza che un nodo si avvicini all'altra faccia)
  const eHead=new Int32Array(TH), eCap=3*nE*10; let eNext=new Int32Array(eCap), eItem=new Int32Array(eCap), eCapN=eCap;
  const eV=new Float64Array(18*nE), eIJ=new Int32Array(12*nE), eStamp=new Int32Array(3*nE), eAB=new Float64Array(18*nE); let eSt=1, eeN=0, eeCap=1<<16, eeP=new Int32Array(eeCap);
  for(let e=0;e<nE;e++) for(let ro=0;ro<3;ro++){ for(let q=0;q<2;q++){ const c=q?eB[e]:eA[e], nd=(c/3)|0, r=(c%3)-1; eIJ[12*e+4*ro+2*q]=nd%nphi+(r+ro-1)*nphi; eIJ[12*e+4*ro+2*q+1]=(nd/nphi)|0; } }
  const hcell=(x,y,z)=>{ const ix=Math.floor(x/(2*rSC)), iy=Math.floor(y/(2*rSC)), iz=Math.floor(z/(2*rSC)); return ((ix*73856093)^(iy*19349663)^(iz*83492791))&(HT-1); };
  function forces(p,wantGen){
    const x=st.x, f=st.f; f.fill(0); if(st.rec) CH.fill(0);
    const ztNow=o.free?st.zt:(solv.bulk?st.q[zt]:0), zbNow=o.free?st.zb:0;
    // anelli di bordo (cinematici)
    for(let i=0;i<nphi;i++){ const k0=3*id(i,0), k1=3*id(i,ns); x[k0]=Xc[k0]; x[k0+1]=Xc[k0+1]; x[k0+2]=zBot+zbNow; x[k1]=Xc[k1]; x[k1+1]=Xc[k1+1]; x[k1+2]=zTopRef+ztNow; }
    let Tmax=0; nodeEps.fill(0); kEdge.fill(0);
    for(let k=0;k<nE;k++){ getP(x,eA[k],pa); getP(x,eB[k],pb); const d0=pb[0]-pa[0], d1=pb[1]-pa[1], d2=pb[2]-pa[2], L=Math.hypot(d0,d1,d2)||1e-12, ex=L-eL[k];
      const T=ex>0?eK[k]*ex:eK[k]*st.cComp*ex, s1=T/L; addF(f,eA[k],s1*d0,s1*d1,s1*d2); addF(f,eB[k],-s1*d0,-s1*d1,-s1*d2);
      const ke=ex>-band*eL[k]?eK[k]:eK[k]*st.cComp; kEdge[(eA[k]/3)|0]+=ke; kEdge[(eB[k]/3)|0]+=ke;
      if(ex>0){ const nT=T/eW[k]; if(nT>Tmax) Tmax=nT; const e=ex/eL[k], ia=(eA[k]/3)|0, ib=(eB[k]/3)|0; if(e>nodeEps[ia]) nodeEps[ia]=e; if(e>nodeEps[ib]) nodeEps[ib]=e; } }
    st.Tmax=Tmax;
    if(o.D>0) for(let k=0;k<nH;k++){ getP(x,hE0[k],pa); getP(x,hE1[k],pb); getP(x,hA[k],pc); getP(x,hB[k],pd);
      let dth=dihedral(pa,pb,pc,pd,GR)-hTh[k]; if(dth>Math.PI) dth-=2*Math.PI; if(dth<-Math.PI) dth+=2*Math.PI;
      const M=-hK[k]*st.Dmul*dth*BRIDSON_SIGN;   // F = −k (θ−θ₀) ∂θ/∂x, con ∂θ/∂x = BRIDSON_SIGN·u
      addF(f,hA[k],M*GR[0][0],M*GR[0][1],M*GR[0][2]); addF(f,hB[k],M*GR[1][0],M*GR[1][1],M*GR[1][2]);
      addF(f,hE0[k],M*GR[2][0],M*GR[2][1],M*GR[2][2]); addF(f,hE1[k],M*GR[3][0],M*GR[3][1],M*GR[3][2]);
      if(st.rec){ const o12=12*k; for(let c=0;c<4;c++){ hG[o12+3*c]=GR[c][0]; hG[o12+3*c+1]=GR[c][1]; hG[o12+3*c+2]=GR[c][2]; } } }
    if(p!==0) for(let t=0;t<nT;t++){ getP(x,tri[3*t],pa); getP(x,tri[3*t+1],pb); getP(x,tri[3*t+2],pc);
      const u0=pb[0]-pa[0],u1=pb[1]-pa[1],u2=pb[2]-pa[2],v0=pc[0]-pa[0],v1=pc[1]-pa[1],v2=pc[2]-pa[2], c6=p/6;
      const n0=(u1*v2-u2*v1)*c6, n1=(u2*v0-u0*v2)*c6, n2=(u0*v1-u1*v0)*c6;
      addF(f,tri[3*t],n0,n1,n2); addF(f,tri[3*t+1],n0,n1,n2); addF(f,tri[3*t+2],n0,n1,n2); }
    const gacc=st.gacc;
    // attacchi
    const bl=st.blend;
    for(const A of anchors){ const k=3*A.node, w=A.w;
      const t0=bl>=1?w[0]:A.x0[0]+(w[0]-A.x0[0])*bl, t1=bl>=1?w[1]:A.x0[1]+(w[1]-A.x0[1])*bl, t2=bl>=1?w[2]:A.x0[2]+(w[2]-A.x0[2])*bl;
      let F0=kA*(t0-x[k]), F1=kA*(t1-x[k+1]), F2=kA*(t2-x[k+2]);
      if(slide&&bl>=1){ // attacco scorrevole: solo la componente lungo la normale della piastra (raggio del corpo)
        const Q=BP.Q, q9=9*A.b, rr=Math.hypot(A.Y[0],A.Y[1])||1, nb0=A.Y[0]/rr, nb1=A.Y[1]/rr, [ct,s2]=rotT(A.t);
        const w0=Q[q9]*nb0+Q[q9+1]*nb1, w1=Q[q9+3]*nb0+Q[q9+4]*nb1, w2=Q[q9+6]*nb0+Q[q9+7]*nb1, n0=ct*w0-s2*w1, n1=s2*w0+ct*w1, n2=w2, fn=F0*n0+F1*n1+F2*n2;
        F0=fn*n0; F1=fn*n1; F2=fn*n2; }
      f[k]+=F0; f[k+1]+=F1; f[k+2]+=F2; if(wantGen){ addGen(gacc,A.b,A.t,A.Y,-F0,-F1,-F2); kB[A.b]+=rfA*kA; } A.F=Math.hypot(F0,F1,F2); if(st.rec){ addCH(A.node,1,0,0,kA); addCH(A.node,0,1,0,kA); addCH(A.node,0,0,1,kA); } }
    // contatto con le piastre, nel riferimento del corpo: dentro l'impronta (più il ponte sulle fessure) la membrana resta
    // sotto la faccia interna; nelle aperture fino a dFar dal bordo può entrare al massimo fino alla faccia esterna
    let nc=0; const Yb=[0,0,0], xn=[0,0,0], Ybest=[0,0,0];
    const usePl=!o.free&&(!o.kin||o.plates), thk=o.kin?(o.thick==null?gap:o.thick):0; let penMax=0;
    if(usePl) for(let i=0;i<N;i++){ if(kin[i]) continue; cFlag[i]=0; penN[i]=0; if(o.kin&&nearA[i]) continue; const k=3*i; xn[0]=x[k]; xn[1]=x[k+1]; xn[2]=x[k+2];
      const rr=Math.hypot(xn[0],xn[1]); if(rr<rhoC*0.55) continue;
      if(o.kin){ let iz=Math.floor((xn[2]-ENV.z0)/ENV.dz); iz=iz<0?0:iz>=ENV.n?ENV.n-1:iz; if(rr<ENV.r[iz]-0.15) continue; }   // solo i nodi vicini alla parete
      const an=Math.atan2(xn[1],xn[0]), ia=Math.floor((an-BG.a0)/(BG.a1-BG.a0)*BG.na), iz=Math.floor((xn[2]-BG.z0)/BG.dz);
      if(ia<0||ia>=BG.na||iz<0||iz>=BG.nz) continue;
      let bpd=1e9, bI=null, bdl=0, bII=-1;
      // piastra della volta precedente: se il nodo è ancora sulla sua impronta basta lei (ricerca completa ogni 8 passi)
      const cached=o.kin?plC[i]:-1, cands=(cached>=0&&(st.it+i)%8!==0)?[cached]:BG.cells[iz*BG.na+ia];
      for(let ci=0;ci<cands.length;ci++){ const ii=cands[ci], I=inst[ii], pl=I.pl; toBody(pl.b,I.t,xn,Yb);
        const rho=Math.hypot(Yb[0],Yb[1]), dlt=rho-rhoC+thk; if(dlt>cWin||dlt<(o.kin?-0.2:1e-12)) continue;
        let u=R*Math.atan2(Yb[1],Yb[0]); while(u-pl.uc>Math.PI*R) u-=2*Math.PI*R; while(pl.uc-u>Math.PI*R) u+=2*Math.PI*R;
        if(u<pl.umin-dFar||u>pl.umax+dFar||Yb[2]<pl.vmin-dFar||Yb[2]>pl.vmax+dFar) continue;
        const pd=polyDist(pl.poly,u,Yb[2]); if(pd<bpd){ bpd=pd; bI=I; bII=ii; bdl=dlt; Ybest[0]=Yb[0]; Ybest[1]=Yb[1]; Ybest[2]=Yb[2]; if(pd===0) break; } }
      if(o.kin) plC[i]=bI?bII:-1;
      if(!bI||bpd>dFar) continue;
      if(st.noHole&&bpd>bridge) continue;   // piegatura: sopra le aperture nessun vincolo (la depressione tira verso l'interno)
      const lim=bpd<=bridge?0:s, pen=bdl-lim; if(pen<=0) continue;
      if(o.kin&&pen>0.1){ plC[i]=-1; continue; }   // proiezione poco affidabile (piastra lontana o molto inclinata): ci pensa la rete di sicurezza
      const kc=kC*st.kCm, rho=Math.hypot(Ybest[0],Ybest[1]), Fb0=-kc*pen*Ybest[0]/rho, Fb1=-kc*pen*Ybest[1]/rho, b=bI.pl.b, Q=BP.Q, q9=9*b; cFlag[i]=1; if(pen>penMax) penMax=pen; penN[i]=pen; plB[i]=b;
      const w0=Q[q9]*Fb0+Q[q9+1]*Fb1, w1=Q[q9+3]*Fb0+Q[q9+4]*Fb1, w2=Q[q9+6]*Fb0+Q[q9+7]*Fb1;   // nel riferimento base della colonna
      const [ct,s2]=rotT(bI.t), F0=ct*w0-s2*w1, F1=s2*w0+ct*w1, F2=w2;
      f[k]+=F0; f[k+1]+=F1; f[k+2]+=F2; if(wantGen){ addGen(gacc,b,bI.t,Ybest,-F0,-F1,-F2); kB[b]+=rfC*kC; } nc++;
      if(st.rec){ const Fm=Math.hypot(F0,F1,F2)||1; addCH(i,F0/Fm,F1/Fm,F2/Fm,kc); } }
    // dischi: la membrana resta fra i due bulkhead
    const zLo=zBot+zbNow, zHi=zTopRef+ztNow; let fzTop=0, fzBot=0;
    for(let i=0;i<N;i++){ if(kin[i]) continue; const k=3*i+2; if(x[k]<zLo){ const F=kC*(zLo-x[k]); f[k]+=F; fzBot-=F; if(st.rec) addCH(i,0,0,1,kC); } else if(x[k]>zHi){ const F=kC*(zHi-x[k]); f[k]+=F; fzTop-=F; if(st.rec) addCH(i,0,0,1,kC); }
      // collare: faccia interna a raggio rhoC per z entro hc dai dischi
      if(!usePl) cFlag[i]=0;
      if(o.kin&&o.plates&&!cFlag[i]){ // rete di sicurezza: l'inviluppo lisciato, 12 cm più fuori, trattiene i nodi sfuggiti
        const r=Math.hypot(x[k-2],x[k-1]); let iz=Math.floor((x[k]-ENV.z0)/ENV.dz); iz=iz<0?0:iz>=ENV.n?ENV.n-1:iz; const rl=ENV.r[iz]+0.12; if(r>rl){ const F=kC*(rl-r)/r; f[k-2]+=F*x[k-2]; f[k-1]+=F*x[k-1]; if(st.rec) addCH(i,x[k-2]/r,x[k-1]/r,0,kC); } }
      if(o.kin&&!o.plates&&!nearA[i]){ const r=Math.hypot(x[k-2],x[k-1]); let iz=Math.floor((x[k]-ENV.z0)/ENV.dz); iz=iz<0?0:iz>=ENV.n?ENV.n-1:iz; const rl=ENV.r[iz]; if(r>rl){ const F=kC*st.kCm*(rl-r)/r; f[k-2]+=F*x[k-2]; f[k-1]+=F*x[k-1]; nc++; cFlag[i]=1; if(r-rl>penMax) penMax=r-rl; if(st.rec) addCH(i,x[k-2]/r,x[k-1]/r,0,kC*st.kCm); } }
      if(hc>0&&(o.free||o.kin?colRow[i]:(x[k]<zLo+hc||x[k]>zHi-hc))){ const r=Math.hypot(x[k-2],x[k-1]); if(r>rhoC){ const F=kC*(rhoC-r)/r; f[k-2]+=F*x[k-2]; f[k-1]+=F*x[k-1]; if(st.rec) addCH(i,x[k-2]/r,x[k-1]/r,0,kC); } } }
    // autocontatto punto-triangolo: ogni nodo resta ad almeno hT da ogni triangolo non adiacente (forza sul nodo e,
    // con i pesi baricentrici, sui vertici del triangolo); niente nodo-nodo, così due falde non si attraversano fra i nodi
    let nsc=0;
    if(o.self){
      const RB=6, rebuild=(st.it%RB===0)||!st.hashOk, mg=rebuild?(RB+1)*vMax:0, rN=hT+2*(RB+1)*vMax+0.03, rN2=rN*rN; if(rebuild) nearN.fill(0); if(rebuild){ tHead.fill(-1); eHead.fill(-1); st.hashOk=true; } let m=0;
      let amnT=1e9, amxT=-1e9; if(rebuild){ for(let i=0;i<N;i++){ const an=Math.atan2(x[3*i+1],x[3*i]); if(an<amnT) amnT=an; if(an>amxT) amxT=an; } amnT-=0.15; amxT+=0.15; }
      for(let t=0;t<nT;t++) for(let ro=0;ro<3;ro++){ const o27=27*t+9*ro, cR=RC[ro][0], sR=RC[ro][1]; let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;
        for(let q=0;q<3;q++){ getP(x,tri[3*t+q],pa); const X=cR*pa[0]-sR*pa[1], Y=sR*pa[0]+cR*pa[1], Z=pa[2]; tV[o27+3*q]=X; tV[o27+3*q+1]=Y; tV[o27+3*q+2]=Z;
          if(X<x0)x0=X; if(X>x1)x1=X; if(Y<y0)y0=Y; if(Y>y1)y1=Y; if(Z<z0)z0=Z; if(Z>z1)z1=Z; }
        if(ro!==1&&rebuild){ const an=Math.atan2((y0+y1)/2,(x0+x1)/2); if(an<amnT||an>amxT){ const o6b=18*t+6*ro; tAB[o6b]=1e9; tAB[o6b+1]=-1e9; continue; } }
        const o6=18*t+6*ro; tAB[o6]=x0-hT; tAB[o6+1]=x1+hT; tAB[o6+2]=y0-hT; tAB[o6+3]=y1+hT; tAB[o6+4]=z0-hT; tAB[o6+5]=z1+hT;
        if(!rebuild) continue;
        const a0=Math.floor((x0-rN)/csT), a1=Math.floor((x1+rN)/csT), b0=Math.floor((y0-rN)/csT), b1=Math.floor((y1+rN)/csT), c0=Math.floor((z0-rN)/csT), c1=Math.floor((z1+rN)/csT);
        for(let A=a0;A<=a1;A++) for(let Bq=b0;Bq<=b1;Bq++) for(let C=c0;C<=c1;C++){ if(m>=tCapN){ tCapN*=2; const n1=new Int32Array(tCapN), n2=new Int32Array(tCapN); n1.set(tNext); n2.set(tItem); tNext=n1; tItem=n2; } const h=tcell(A,Bq,C); tItem[m]=3*t+ro; tNext[m]=tHead[h]; tHead[h]=m; m++; } }
      const hT2=hT*hT;
      for(let i=0;i<N;i++){ if(kin[i]) continue; const k=3*i, X=x[k],Y=x[k+1],Z=x[k+2], ii=i%nphi, jj=(i/nphi)|0, h=tcell(Math.floor(X/csT),Math.floor(Y/csT),Math.floor(Z/csT));
        for(let e=tHead[h];e>=0;e=tNext[e]){ const it=tItem[e], t=(it/3)|0, ro=it%3, o27=27*t+9*ro, o18=18*t+6*ro;
          const ex2=rebuild?rN-hT:0; if(X<tAB[o18]-ex2||X>tAB[o18+1]+ex2||Y<tAB[o18+2]-ex2||Y>tAB[o18+3]+ex2||Z<tAB[o18+4]-ex2||Z>tAB[o18+5]+ex2) continue;
          let adj=false; for(let q=0;q<3;q++){ if(Math.abs(tIJ[o18+2*q]-ii)<=1&&Math.abs(tIJ[o18+2*q+1]-jj)<=1){ adj=true; break; } } if(adj) continue;
          // punto più vicino sul triangolo (Ericson)
          const ax=tV[o27],ay=tV[o27+1],az=tV[o27+2], bx=tV[o27+3],by=tV[o27+4],bz=tV[o27+5], cx=tV[o27+6],cy=tV[o27+7],cz=tV[o27+8];
          const abx=bx-ax,aby=by-ay,abz=bz-az, acx=cx-ax,acy=cy-ay,acz=cz-az, apx=X-ax,apy=Y-ay,apz=Z-az;
          const d1=abx*apx+aby*apy+abz*apz, d2=acx*apx+acy*apy+acz*apz; let u,v,w;
          if(d1<=0&&d2<=0){ u=1;v=0;w=0; } else {
            const bpx=X-bx,bpy=Y-by,bpz=Z-bz, d3=abx*bpx+aby*bpy+abz*bpz, d4=acx*bpx+acy*bpy+acz*bpz;
            if(d3>=0&&d4<=d3){ u=0;v=1;w=0; } else { const vc=d1*d4-d3*d2;
              if(vc<=0&&d1>=0&&d3<=0){ const t2=d1/(d1-d3); u=1-t2;v=t2;w=0; } else {
                const cpx=X-cx,cpy=Y-cy,cpz=Z-cz, d5=abx*cpx+aby*cpy+abz*cpz, d6=acx*cpx+acy*cpy+acz*cpz;
                if(d6>=0&&d5<=d6){ u=0;v=0;w=1; } else { const vb=d5*d2-d1*d6;
                  if(vb<=0&&d2>=0&&d6<=0){ const t2=d2/(d2-d6); u=1-t2;v=0;w=t2; } else { const va=d3*d6-d5*d4;
                    if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){ const t2=(d4-d3)/((d4-d3)+(d5-d6)); u=0;v=1-t2;w=t2; }
                    else { const dn=1/(va+vb+vc); v=vb*dn; w=vc*dn; u=1-v-w; } } } } } }
          const qx=u*ax+v*bx+w*cx, qy=u*ay+v*by+w*cy, qz=u*az+v*bz+w*cz; let dx=X-qx, dy=Y-qy, dz=Z-qz; const dd=dx*dx+dy*dy+dz*dz;
          if(rebuild&&dd<rN2) nearN[i]=1;
          if(dd>=hT2) continue;
          let dist=Math.sqrt(dd);
          if(dist<1e-9){ // sul piano: normale del triangolo
            dx=aby*acz-abz*acy; dy=abz*acx-abx*acz; dz=abx*acy-aby*acx; const nn=Math.hypot(dx,dy,dz)||1; dx/=nn; dy/=nn; dz/=nn; dist=0; }
          else { dx/=dist; dy/=dist; dz/=dist; }
          const F=kST*(hT-dist); f[k]+=F*dx; f[k+1]+=F*dy; f[k+2]+=F*dz; nsc++;
          if(st.rec) addCH(i,dx,dy,dz,kST);
          // reazione sui vertici del triangolo (copia ruotata di ro-1 settori: si riporta nel riferimento del nodo)
          const cR=RC[2-ro][0], sR=RC[2-ro][1], g0=-(cR*dx-sR*dy)*F, g1=-(sR*dx+cR*dy)*F, g2=-dz*F, ws=[u,v,w];
          for(let q=0;q<3;q++) if(ws[q]>0) addF(f,tri[3*t+q],ws[q]*g0,ws[q]*g1,ws[q]*g2); } }
      // lato-lato: punti più vicini fra due segmenti (Ericson), forza ripartita sui quattro estremi.
      // Le coppie candidate (distanza < spessore + margine) si cercano ogni 3 passi, la forza si valuta a ogni passo.
      if(!o.noEE){
        const segCP=(P0x,P0y,P0z,P1x,P1y,P1z,Q0x,Q0y,Q0z,Q1x,Q1y,Q1z,out)=>{
          const d1x=P1x-P0x,d1y=P1y-P0y,d1z=P1z-P0z, d2x=Q1x-Q0x,d2y=Q1y-Q0y,d2z=Q1z-Q0z, rx=P0x-Q0x,ry=P0y-Q0y,rz=P0z-Q0z;
          const A1=d1x*d1x+d1y*d1y+d1z*d1z, E2=d2x*d2x+d2y*d2y+d2z*d2z, F2=d2x*rx+d2y*ry+d2z*rz, C1=d1x*rx+d1y*ry+d1z*rz, B12=d1x*d2x+d1y*d2y+d1z*d2z, den=A1*E2-B12*B12;
          let sP=den>1e-14?Math.min(1,Math.max(0,(B12*F2-C1*E2)/den)):0, tQ=(B12*sP+F2)/E2;
          if(tQ<0){ tQ=0; sP=Math.min(1,Math.max(0,-C1/A1)); } else if(tQ>1){ tQ=1; sP=Math.min(1,Math.max(0,(B12-C1)/A1)); }
          out[0]=sP; out[1]=tQ; out[2]=P0x+d1x*sP-(Q0x+d2x*tQ); out[3]=P0y+d1y*sP-(Q0y+d2y*tQ); out[4]=P0z+d1z*sP-(Q0z+d2z*tQ); out[5]=d1y*d2z-d1z*d2y; out[6]=d1z*d2x-d1x*d2z; out[7]=d1x*d2y-d1y*d2x; };
        const cp=new Float64Array(8);
        if(rebuild){ m=0; eeN=0; const lim2=(hT+2*mg)*(hT+2*mg), csE=Math.max(csT,0.25);
          // intervallo angolare occupato dai nodi del settore: le copie dei settori vicini fuori da lì non servono
          let amn=1e9, amx=-1e9; for(let i=0;i<N;i++){ const an=Math.atan2(x[3*i+1],x[3*i]); if(an<amn) amn=an; if(an>amx) amx=an; } amn-=0.15; amx+=0.15;
          for(let e=0;e<nE;e++) for(let ro=0;ro<3;ro++){ const o18=18*e+6*ro, cR=RC[ro][0], sR=RC[ro][1];
            getP(x,eA[e],pa); getP(x,eB[e],pb);
            const X0=cR*pa[0]-sR*pa[1], Y0=sR*pa[0]+cR*pa[1], X1=cR*pb[0]-sR*pb[1], Y1=sR*pb[0]+cR*pb[1];
            if(!nearN[(eA[e]/3)|0]&&!nearN[(eB[e]/3)|0]){ eAB[o18]=1e9; eAB[o18+1]=-1e9; continue; }   // solo i lati delle zone dove due falde sono vicine
            if(ro!==1){ const an=Math.atan2(Y0+Y1,X0+X1); if(an<amn||an>amx){ eAB[o18]=1e9; eAB[o18+1]=-1e9; continue; } }
            eV[o18]=X0; eV[o18+1]=Y0; eV[o18+2]=pa[2]; eV[o18+3]=X1; eV[o18+4]=Y1; eV[o18+5]=pb[2];
            const w=hT+2*mg; eAB[o18]=Math.min(X0,X1)-w; eAB[o18+1]=Math.max(X0,X1)+w; eAB[o18+2]=Math.min(Y0,Y1)-w; eAB[o18+3]=Math.max(Y0,Y1)+w; eAB[o18+4]=Math.min(pa[2],pb[2])-w; eAB[o18+5]=Math.max(pa[2],pb[2])+w;
            const a0=Math.floor(eAB[o18]/csE), a1=Math.floor(eAB[o18+1]/csE), b0=Math.floor(eAB[o18+2]/csE), b1=Math.floor(eAB[o18+3]/csE), c0=Math.floor(eAB[o18+4]/csE), c1=Math.floor(eAB[o18+5]/csE);
            for(let A=a0;A<=a1;A++) for(let Bq=b0;Bq<=b1;Bq++) for(let C=c0;C<=c1;C++){ if(m>=eCapN){ eCapN*=2; const n1=new Int32Array(eCapN), n2=new Int32Array(eCapN); n1.set(eNext); n2.set(eItem); eNext=n1; eItem=n2; } const h=tcell(A,Bq,C); eItem[m]=3*e+ro; eNext[m]=eHead[h]; eHead[h]=m; m++; } }
          for(let e=0;e<nE;e++){ if(kin[(eA[e]/3)|0]&&kin[(eB[e]/3)|0]) continue; if(eAB[18*e+6]>eAB[18*e+7]) continue;
            const oA=18*e+6, ia=eIJ[12*e+4], ja=eIJ[12*e+5], ib=eIJ[12*e+6], jb=eIJ[12*e+7]; eSt++;
            const a0=Math.floor(eAB[oA]/csE), a1=Math.floor(eAB[oA+1]/csE), b0=Math.floor(eAB[oA+2]/csE), b1=Math.floor(eAB[oA+3]/csE), c0=Math.floor(eAB[oA+4]/csE), c1=Math.floor(eAB[oA+5]/csE);
            for(let A=a0;A<=a1;A++) for(let Bq=b0;Bq<=b1;Bq++) for(let C=c0;C<=c1;C++){ const h=tcell(A,Bq,C);
              for(let g=eHead[h];g>=0;g=eNext[g]){ const it=eItem[g]; if(eStamp[it]===eSt) continue; eStamp[it]=eSt; const e2=(it/3)|0, ro=it%3; if(e2===e&&ro===1) continue;
                const oB=18*e2+6*ro; if(eAB[oB]>eAB[oA+1]||eAB[oB+1]<eAB[oA]||eAB[oB+2]>eAB[oA+3]||eAB[oB+3]<eAB[oA+2]||eAB[oB+4]>eAB[oA+5]||eAB[oB+5]<eAB[oA+4]) continue;
                const o12=12*e2+4*ro; let adj=false;
                for(let q=0;q<2;q++){ const I=eIJ[o12+2*q], J=eIJ[o12+2*q+1]; if((Math.abs(I-ia)<=1&&Math.abs(J-ja)<=1)||(Math.abs(I-ib)<=1&&Math.abs(J-jb)<=1)){ adj=true; break; } } if(adj) continue;
                segCP(eV[oA],eV[oA+1],eV[oA+2],eV[oA+3],eV[oA+4],eV[oA+5],eV[oB],eV[oB+1],eV[oB+2],eV[oB+3],eV[oB+4],eV[oB+5],cp);
                if(cp[2]*cp[2]+cp[3]*cp[3]+cp[4]*cp[4]>lim2) continue;
                if(eeN>=eeCap){ eeCap*=2; const n=new Int32Array(eeCap); n.set(eeP); eeP=n; } eeP[eeN++]=e; eeP[eeN++]=3*e2+ro; } } } }
        // valutazione a ogni passo delle coppie candidate
        for(let c2=0;c2<eeN;c2+=2){ const e=eeP[c2], e2=(eeP[c2+1]/3)|0, ro=eeP[c2+1]%3, cR=RC[ro][0], sR=RC[ro][1];
          getP(x,eA[e],pa); getP(x,eB[e],pb); getP(x,eA[e2],pc); getP(x,eB[e2],pd);
          segCP(pa[0],pa[1],pa[2],pb[0],pb[1],pb[2], cR*pc[0]-sR*pc[1],sR*pc[0]+cR*pc[1],pc[2], cR*pd[0]-sR*pd[1],sR*pd[0]+cR*pd[1],pd[2],cp);
          const sP=cp[0], tQ=cp[1]; if(sP<=0.02||sP>=0.98||tQ<=0.02||tQ>=0.98) continue;   // vicino a un estremo: ci pensa il contatto punto-triangolo
          let dx=cp[2], dy=cp[3], dz=cp[4]; const dd=dx*dx+dy*dy+dz*dz; if(dd>=hT2) continue;
          let dist=Math.sqrt(dd); if(dist<1e-9){ dx=cp[5]; dy=cp[6]; dz=cp[7]; const nn=Math.hypot(dx,dy,dz)||1; dx/=nn; dy/=nn; dz/=nn; dist=0; } else { dx/=dist; dy/=dist; dz/=dist; }
          const F=0.5*kST*(hT-dist);   // ogni coppia è vista due volte
          addF(f,eA[e],(1-sP)*F*dx,(1-sP)*F*dy,(1-sP)*F*dz); addF(f,eB[e],sP*F*dx,sP*F*dy,sP*F*dz);
          const cB=RC[2-ro][0], sB=RC[2-ro][1], g0=-(cB*dx-sB*dy)*F, g1=-(sB*dx+cB*dy)*F, g2=-dz*F;
          addF(f,eA[e2],(1-tQ)*g0,(1-tQ)*g1,(1-tQ)*g2); addF(f,eB[e2],tQ*g0,tQ*g1,tQ*g2); nsc++;
          if(st.rec){ addCH((eA[e]/3)|0,dx,dy,dz,0.5*kST); addCH((eB[e]/3)|0,dx,dy,dz,0.5*kST); } } }
    }
    st.selfc=nsc; st.contacts=nc; st.penMax=penMax;
    // membrana libera: il disco superiore è un corpo che trasla lungo l'asse (spinta p·πr² e tiro della membrana)
    // membrana libera: i due dischi sono corpi che traslano lungo l'asse (spinta p·πr² e tiro della membrana), nessuna direzione privilegiata
    if(o.free){ let fz=0, mz=0, fb=0, mb=0; for(let i=0;i<nphi;i++){ const q=id(i,ns), q0=id(i,0); fz+=f[3*q+2]; mz+=mBase[q]+kEdge[q]; fb+=f[3*q0+2]; mb+=mBase[q0]+kEdge[q0]; }
      st.fzDisk=fz+fzTop+p*Math.PI*rTop*rTop/Nc; st.mzDisk=1.15*mz; st.fzBot=fb+fzBot-p*Math.PI*ring[0].r*ring[0].r/Nc; st.mzBot=1.15*mb; }
    if(wantGen&&solv.bulk){ let fz=0; for(let i=0;i<nphi;i++) fz+=f[3*id(i,ns)+2]; gacc[zt]+=fz+fzTop+p*Math.PI*rTop*rTop/Nc; kZ+=rfC*kTopRing; }
  }
  // struttura cinematica (o.kin): la colonna segue il suo percorso; la membrana è premuta contro un inviluppo
  // assialsimmetrico della faccia interna (profilo dei nodi delle Y, lisciato) e trattenuta dagli attacchi
  const ENV={n:600,z0:0,dz:1,r:new Float64Array(600)};
  function setStruct(q){
    st.q.set(q); if(o.kin&&o.plates) buildPlateGrid(q); else setBodies(q);
    for(const A of anchors){ A.w=bodyPoint(A.b,A.t,A.Y,[0,0,0]); }
    const prf=solv.profile(q), m=prf.rs.length, P2=[]; for(let l=0;l<m;l++) P2.push([prf.rs[l]-s/2-gap,prf.zs[l]]);
    for(let it=0;it<2;it++){ const c=P2.map(p=>p.slice()); for(let l=1;l<m-1;l++){ P2[l][0]=0.25*c[l-1][0]+0.5*c[l][0]+0.25*c[l+1][0]; P2[l][1]=0.25*c[l-1][1]+0.5*c[l][1]+0.25*c[l+1][1]; } }
    const z0=Math.min(P2[0][1],zBot)-0.5, z1=P2[m-1][1]+0.5; ENV.z0=z0; ENV.dz=(z1-z0)/ENV.n;
    let l=0; for(let k=0;k<ENV.n;k++){ const z=z0+(k+0.5)*ENV.dz; while(l<m-2&&P2[l+1][1]<z) l++;
      const a=P2[l], b=P2[l+1], f=Math.min(1,Math.max(0,(z-a[1])/((b[1]-a[1])||1e-9))); ENV.r[k]=Math.max(Rc,a[0]+(b[0]-a[0])*f); }
    // volume dell'inviluppo fra i dischi (per il pilotaggio a volume della membrana)
    const zA=zBot, zB=zTopRef+(solv.bulk?q[zt]:0); let V=0; for(let k=0;k<ENV.n;k++){ const za=ENV.z0+k*ENV.dz, zb2=za+ENV.dz, lo=Math.max(za,zA), hi=Math.min(zb2,zB); if(hi>lo) V+=Math.PI*ENV.r[k]*ENV.r[k]*(hi-lo); } ENV.V=V;
    if(o.kin) st.blend=1;
  }
  // ---- passo implicito (alla Baraff–Witkin, quasi statico): (K + λ·M) Δx = f, K tangente approssimata
  //      (molle dei lati esatte, flessione di Gauss–Newton, contatti k·n·nᵀ, pressione trascurata), gradienti coniugati
  //      senza matrice con precondizionatore diagonale; M = masse fittizie del rilassamento (limite superiore della rigidezza)
  const CH=new Float64Array(6*N), hG=new Float64Array(12*nH);
  function addCH(i,nx,ny,nz,k){ const o6=6*i; CH[o6]+=k*nx*nx; CH[o6+1]+=k*ny*ny; CH[o6+2]+=k*nz*nz; CH[o6+3]+=k*nx*ny; CH[o6+4]+=k*nx*nz; CH[o6+5]+=k*ny*nz; }
  const getV=(v,c,out)=>{ const k=3*((c/3)|0), r=(c%3)-1, X=v[k], Y=v[k+1]; if(r===0){out[0]=X;out[1]=Y;} else { const sn=r*sa; out[0]=ca*X-sn*Y; out[1]=sn*X+ca*Y; } out[2]=v[k+2]; return out; };
  const eKt=new Float64Array(nE), eKp=new Float64Array(nE), eU=new Float64Array(3*nE);
  const n3=3*N+2, IM={r:new Float64Array(n3), z:new Float64Array(n3), p:new Float64Array(n3), q:new Float64Array(n3), dx:new Float64Array(n3), w:new Float64Array(n3), Md:new Float64Array(N)};
  function Hv(v0,y,lam){
    // i nodi degli anelli di bordo seguono i dischi: in membrana libera la loro z è il grado di libertà del disco
    const v=IM.w; v.set(v0); for(let i=0;i<N;i++) if(kin[i]){ const k=3*i; v[k]=0; v[k+1]=0; v[k+2]=o.free?(kin[i]===2?v0[3*N]:v0[3*N+1]):0; }
    y.fill(0); const va=[0,0,0], vb=[0,0,0], vc=[0,0,0], vd=[0,0,0];
    for(let e=0;e<nE;e++){ getV(v,eA[e],va); getV(v,eB[e],vb); const d0=vb[0]-va[0], d1=vb[1]-va[1], d2=vb[2]-va[2], u0=eU[3*e], u1=eU[3*e+1], u2=eU[3*e+2];
      const dp=u0*d0+u1*d1+u2*d2, kt=eKt[e], kp=eKp[e], c0=kp*d0+(kt-kp)*dp*u0, c1=kp*d1+(kt-kp)*dp*u1, c2=kp*d2+(kt-kp)*dp*u2;
      addF(y,eA[e],-c0,-c1,-c2); addF(y,eB[e],c0,c1,c2); }
    if(o.D>0) for(let h=0;h<nH;h++){ const o12=12*h, kh=hK[h]*st.Dmul; getV(v,hA[h],va); getV(v,hB[h],vb); getV(v,hE0[h],vc); getV(v,hE1[h],vd);
      const sdot=hG[o12]*va[0]+hG[o12+1]*va[1]+hG[o12+2]*va[2]+hG[o12+3]*vb[0]+hG[o12+4]*vb[1]+hG[o12+5]*vb[2]+hG[o12+6]*vc[0]+hG[o12+7]*vc[1]+hG[o12+8]*vc[2]+hG[o12+9]*vd[0]+hG[o12+10]*vd[1]+hG[o12+11]*vd[2], c=kh*sdot;
      addF(y,hA[h],c*hG[o12],c*hG[o12+1],c*hG[o12+2]); addF(y,hB[h],c*hG[o12+3],c*hG[o12+4],c*hG[o12+5]); addF(y,hE0[h],c*hG[o12+6],c*hG[o12+7],c*hG[o12+8]); addF(y,hE1[h],c*hG[o12+9],c*hG[o12+10],c*hG[o12+11]); }
    let yT=0, yB=0;
    for(let i=0;i<N;i++){ const k=3*i; if(kin[i]){ if(kin[i]===2) yT+=y[k+2]; else yB+=y[k+2]; y[k]=y[k+1]=y[k+2]=0; continue; } const o6=6*i, a=v[k], b=v[k+1], c=v[k+2], m=lam*IM.Md[i];
      y[k]+=CH[o6]*a+CH[o6+3]*b+CH[o6+4]*c+m*a; y[k+1]+=CH[o6+3]*a+CH[o6+1]*b+CH[o6+5]*c+m*b; y[k+2]+=CH[o6+4]*a+CH[o6+5]*b+CH[o6+2]*c+m*c; }
    if(o.free){ y[3*N]=yT+lam*IM.MdT*v0[3*N]; y[3*N+1]=yB+lam*IM.MdB*v0[3*N+1]; } else { y[3*N]=0; y[3*N+1]=0; }
  }
  function stepImplicit(p,opt){
    opt=opt||{}; const nCG=opt.cg||40, dmax=Math.min(opt.dmax||0.05,o.self?0.9*hT:1);   // con l'autocontatto nessun nodo salta oltre lo spessore
    st.hashOk=false; st.rec=true; forces(p,false); st.rec=false;
    // regolarizzazione adattiva alla Levenberg–Marquardt: cresce se il residuo cresce (contatti che si accendono e spengono)
    let fn=0; for(let i=0;i<N;i++) if(!kin[i]){ const k=3*i; fn+=st.f[k]*st.f[k]+st.f[k+1]*st.f[k+1]+st.f[k+2]*st.f[k+2]; } fn=Math.sqrt(fn);
    const lam0=opt.lam==null?0.05:opt.lam; if(st.lamA==null||opt.reset) st.lamA=lam0;
    if(opt.adapt&&st.fPrev!=null){ if(fn>1.2*st.fPrev) st.lamA=Math.min(lam0*1000,st.lamA*3); else if(fn<st.fPrev) st.lamA=Math.max(lam0,st.lamA/1.5); }
    st.fPrev=fn; const lam=st.lamA;
    const x=st.x, f=st.f, P2=[0,0,0], Q2=[0,0,0];
    // rigidezze dei lati nella configurazione corrente
    for(let e=0;e<nE;e++){ getP(x,eA[e],P2); getP(x,eB[e],Q2); const d0=Q2[0]-P2[0], d1=Q2[1]-P2[1], d2=Q2[2]-P2[2], L=Math.hypot(d0,d1,d2)||1e-12, ex=L-eL[e];
      eU[3*e]=d0/L; eU[3*e+1]=d1/L; eU[3*e+2]=d2/L;
      if(ex>0){ eKt[e]=eK[e]; eKp[e]=eK[e]*ex/L; } else { eKt[e]=eK[e]*st.cComp; eKp[e]=0; } }
    for(let i=0;i<N;i++) IM.Md[i]=mBase[i]+kEdge[i];
    // gradienti coniugati precondizionati (Jacobi)
    const r=IM.r, z=IM.z, pp=IM.p, q=IM.q, dx=IM.dx; dx.fill(0);
    for(let i=0;i<N;i++){ const k=3*i; if(kin[i]){ r[k]=r[k+1]=r[k+2]=0; } else { r[k]=f[k]; r[k+1]=f[k+1]; r[k+2]=f[k+2]; } }
    let mT=0, mB=0; for(let i=0;i<nphi;i++){ mT+=IM.Md[id(i,ns)]; mB+=IM.Md[id(i,0)]; } IM.MdT=mT; IM.MdB=mB;
    r[3*N]=o.free?st.fzDisk:0; r[3*N+1]=o.free?st.fzBot:0;
    const PRE=IM.q; for(let i=0;i<N;i++){ const w=1/((1+lam)*IM.Md[i]); PRE[3*i]=PRE[3*i+1]=PRE[3*i+2]=w; } PRE[3*N]=1/((1+lam)*mT); PRE[3*N+1]=1/((1+lam)*mB);
    const PR=Float64Array.from(PRE);
    let rz=0, r0=0; for(let k=0;k<n3;k++){ z[k]=PR[k]*r[k]; pp[k]=z[k]; rz+=r[k]*z[k]; r0+=r[k]*r[k]; }
    let it=0; const tol2=r0*1e-4;
    for(;it<nCG;it++){ Hv(pp,q,lam); let pq=0; for(let k=0;k<n3;k++) pq+=pp[k]*q[k]; if(pq<=0) break;
      const al2=rz/pq; let rr=0; for(let k=0;k<n3;k++){ dx[k]+=al2*pp[k]; r[k]-=al2*q[k]; rr+=r[k]*r[k]; } if(rr<tol2) { it++; break; }
      let rz2=0; for(let k=0;k<n3;k++){ z[k]=PR[k]*r[k]; rz2+=r[k]*z[k]; }
      const be=rz2/rz; rz=rz2; for(let k=0;k<n3;k++) pp[k]=z[k]+be*pp[k]; }
    // passo limitato
    let mx=0; for(let i=0;i<N;i++){ const k=3*i, m=dx[k]*dx[k]+dx[k+1]*dx[k+1]+dx[k+2]*dx[k+2]; if(m>mx) mx=m; } mx=Math.sqrt(mx);
    mx=Math.max(mx,Math.abs(dx[3*N]),Math.abs(dx[3*N+1]));
    const sc=mx>dmax?dmax/mx:1; for(let k=0;k<3*N;k++) x[k]+=sc*dx[k];
    if(o.free){ st.zt+=sc*dx[3*N]; st.zb+=sc*dx[3*N+1]; }
    st.v.fill(0); st.it++; st.cg=it; st.dxMax=mx*sc;
    return {cg:it,dx:mx*sc,res:Math.sqrt(r0),lam};
  }
  // piccola perturbazione deterministica (innesca l'instabilità delle pieghe nella piegatura simulata)
  function perturb(amp){ let sd=12345; const rnd=()=>{ sd=(sd*1103515245+12345)&0x7fffffff; return sd/0x7fffffff-0.5; };
    for(let i=0;i<N;i++){ if(kin[i]) continue; const k=3*i; st.x[k]+=amp*rnd(); st.x[k+1]+=amp*rnd(); st.x[k+2]+=amp*rnd(); } }
  function resetState(x){ st.x.set(x); st.v.fill(0); st.ke=0; st.it=0; st.hashOk=false; }
  function step(p,zeta,frozen){
    forces(p,!frozen); if(!frozen) st.nacc++;
    const x=st.x, v=st.v, f=st.f, dmp=1-zeta;
    let ke=0;
    const dM=st.Dmul-1;
    for(let i=0;i<N;i++){ if(kin[i]) continue; const k=3*i, im=1/(1.15*(mBase[i]+kEdge[i]+dM*kSum[i]+(cFlag[i]?2*kC*(st.kCm-1):0)));
      v[k]=dmp*v[k]+f[k]*im; v[k+1]=dmp*v[k+1]+f[k+1]*im; v[k+2]=dmp*v[k+2]+f[k+2]*im;
      if(st.fric>0&&cFlag[i]){ // attrito con la parete: si smorza la velocità tangente dei nodi a contatto
        const r=Math.hypot(x[k],x[k+1])||1, n0=x[k]/r, n1=x[k+1]/r, vn=v[k]*n0+v[k+1]*n1, c=1-st.fric;
        v[k]=vn*n0+c*(v[k]-vn*n0); v[k+1]=vn*n1+c*(v[k+1]-vn*n1); v[k+2]*=c; }
      const vv=Math.sqrt(v[k]*v[k]+v[k+1]*v[k+1]+v[k+2]*v[k+2]); if(vv>vMax){ const c=vMax/vv; v[k]*=c; v[k+1]*=c; v[k+2]*=c; }
      x[k]+=v[k]; x[k+1]+=v[k+1]; x[k+2]+=v[k+2]; ke+=v[k]*v[k]+v[k+1]*v[k+1]+v[k+2]*v[k+2]; }
    if(o.free){ st.vz=(o.diskKeep?0.98:dmp)*st.vz+st.fzDisk/st.mzDisk; const vzM=vMax*(o.diskV||1); if(Math.abs(st.vz)>vzM) st.vz=Math.sign(st.vz)*vzM; st.zt+=st.vz; ke+=st.vz*st.vz;
      st.vzb=(o.diskKeep?0.98:dmp)*st.vzb+st.fzBot/st.mzBot; if(Math.abs(st.vzb)>vzM) st.vzb=Math.sign(st.vzb)*vzM; st.zb+=st.vzb; ke+=st.vzb*st.vzb; }
    // smorzamento cinetico: al picco di energia cinetica le velocità si azzerano (convergenza più rapida del solo viscoso)
    if(o.kinetic&&ke<st.ke*0.999&&st.it>0){ v.fill(0); if(!o.diskKeep){ st.vz=0; st.vzb=0; } st.resets=(st.resets||0)+1; }
    st.it++; st.ke=ke;
  }
  // passo strutturale: la colonna risponde alle forze medie della membrana
  function structStep(maxit){
    if(st.nacc===0) return;
    const n=solv.n, fz=new Float64Array(n), reg=new Float64Array(n), inv=1/st.nacc;
    for(let i=0;i<n;i++) fz[i]=st.gacc[i]*inv;
    const Lr=col.G.L/3;
    for(let b=0;b<nb;b++){ const kk=kB[b]*inv, oo=6*bodies[b].o; if(kk<=0) continue; for(let c=0;c<3;c++){ reg[oo+c]=kk; reg[oo+3+c]=kk*Lr*Lr; } }
    if(solv.bulk) reg[zt]=kZ*inv;
    const q0=Float64Array.from(st.q), sol=solv.solve(st.q,0,0,{f:fz,q0,reg},maxit||4);
    // limite di sicurezza sul passo (traslazioni)
    let mx=0; for(let b=0;b<nb;b++){ const oo=6*bodies[b].o; mx=Math.max(mx,Math.abs(sol.q[oo]-q0[oo]),Math.abs(sol.q[oo+1]-q0[oo+1]),Math.abs(sol.q[oo+2]-q0[oo+2])); }
    if(solv.bulk) mx=Math.max(mx,Math.abs(sol.q[zt]-q0[zt]));
    const lim=o.stepMax||0.02, sc=mx>lim?lim/mx:1; st.sInfo={mx,sc,it:sol.it,gn:sol.gn};
    for(let i=0;i<n;i++) st.q[i]=q0[i]+(sol.q[i]-q0[i])*sc;
    st.gacc.fill(0); st.nacc=0; kB.fill(0); kZ=0; buildPlateGrid(st.q);
  }
  function volume(){
    const x=st.x; let V=0;
    for(let t=0;t<nT;t++){ getP(x,tri[3*t],pa); getP(x,tri[3*t+1],pb); getP(x,tri[3*t+2],pc); V+=dot(pa,cross(pb,pc)); }
    const zT=x[3*id(0,ns)+2], zB=x[3*id(0,0)+2];
    for(let i=0;i<nphi;i++){ getP(x,code(i,ns),pa); getP(x,code(i+1,ns),pb); V+=dot([0,0,zT],cross(pa,pb)); getP(x,code(i,0),pa); getP(x,code(i+1,0),pb); V+=dot([0,0,zB],cross(pb,pa)); }
    return V/6*Nc;
  }
  buildPlateGrid(st.q); setStruct(st.q);
  // rapporto fra lunghezze piegate e di riposo (controllo della piegatura)
  let maxRatio=0, minRatio=9; for(let k=0;k<nE;k++){ getP(Xc,eA[k],pa); getP(Xc,eB[k],pb); const r=Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2])/eL[k]; maxRatio=Math.max(maxRatio,r); minRatio=Math.min(minRatio,r); }
  let Area=0; for(let t=0;t<nT;t++) Area+=A0[t]; Area*=Nc;
  // volume della forma di riposo (finale), per il confronto con lo stato gonfiato
  const Vrest=(()=>{ const sx=st.x; st.x=X0; const V=volume(); st.x=sx; return V; })();
  return {N,nphi,ns,nT,nE,nH,tri,code,id,X0,Xc,st,step,structStep,setStruct,ENV,perturb,resetState,cFlag,nearA,plC,BG,inst,penN,plB,stepImplicit,forces,volume,anchors,fold,ring,S,Area,hMean,rSC,kin,nodeEps,
    maxRatio,minRatio,hc,Vrest,ztF,eA,eB,eL,setBodies,buildPlateGrid,dihedral,getP,Rc,rTop,zBot,zTopRef,BRIDSON_SIGN};
}
