/* ===================== SOLUTORE PLANARE A CORPI RIGIDI (cella periodica e superficie piana) =====================
   Corpi rigidi nel piano (poligoni rotanti e Y), 3 gradi di libertà ciascuno (ux, uy, θ); nella cella periodica in più
   gli allungamenti medi λx, λy (Λ = diag(λx, λy)). Ogni cerniera unisce un punto P del corpo a e del corpo b:
     posizione del punto P del corpo i nell'immagine periodica di traslazione s:  x = Λ s + c_i + u_i + R(θ_i)(P − s − c_i)
     δ = x_a − x_b,  energia  ½ δᵀ K δ  +  W(φ),  φ = θ_a − θ_b,  W = ½ kθ φ²  oppure dalla tabella M(φ) (rigidezza non lineare)
     cerniera anisotropa: K = k e eᵀ + k_t n nᵀ, e = R(θ_b) e₀ direzione della striscia (il taglio nel punto di cerniera),
     n ⟂ e. La terna è solidale alla Y (corpo b): la striscia esce dalla Y lungo il taglio e lì è incastrata; in simmetria la
     Y non ruota, quindi la terna resta fissa. Con k_t = k (o senza e₀, k_t) si ritrova ½ k |δ|².
   Ogni grado di libertà è libero, fisso oppure imposto: valore = base + coef·t, con t il parametro di carico
   (cella: λ − 1; superficie: spostamento dei corpi tirati). Equilibrio g = ∂E/∂q = 0 sui liberi, tangente esatta K = ∂²E/∂q²
   (fattorizzazione LDLᵀ a banda: i pivot negativi dicono quanti modi instabili ha lo stato), percorso con arc length a
   iperpiano su (q, t), quindi anche oltre i punti limite (snap-through, snap-back). Forza generalizzata F = ∂E/∂t. */

/* modello: {bodies:[{c:[x,y], lockRot}], hinges:[{a,b,P,sa,sb,k,kt,e0,kth,tab}], periodic, nDof, ctl:[{dof, base, coef}], loads:[{dof, coef}], L}
   loads: forza t·coef sul grado di libertà dof (controllo di forza, t = forza) */
function plDofs(M){ return 3*M.bodies.length+(M.periodic?2:0); }

/* W(φ), M = W', S = W'' di una cerniera: lineare oppure tabella {phi:[…], M:[…]} (φ ≥ 0, prolungata dispari, lineare oltre) */
function plRot(h,phi){
  const T=h.tab;
  if(!T) return {W:0.5*h.kth*phi*phi, M:h.kth*phi, S:h.kth};
  const s=phi<0?-1:1, a=Math.abs(phi), P=T.phi, Mv=T.M, n=P.length;
  let W=0, i=0;
  // integrale a tratti di M lineare a tratti
  while(i<n-1&&P[i+1]<=a){ W+=0.5*(Mv[i]+Mv[i+1])*(P[i+1]-P[i]); i++; }
  let M, S;
  if(i<n-1){ S=(Mv[i+1]-Mv[i])/(P[i+1]-P[i]); M=Mv[i]+S*(a-P[i]); W+=0.5*(Mv[i]+M)*(a-P[i]); }
  else { S=n>1?(Mv[n-1]-Mv[n-2])/(P[n-1]-P[n-2]):h.kth; M=Mv[n-1]+S*(a-P[n-1]); W+=0.5*(Mv[n-1]+M)*(a-P[n-1]); }
  return {W, M:s*M, S};
}

/* matrice di rigidezza traslazionale della cerniera nel riferimento globale [Kxx, Kxy, Kyy]; cb, sb = cos, sin di θ_b */
function plHingeKm(h,cb,sb){
  const ka=h.k, kt=h.kt==null?h.k:h.kt;
  if(kt===ka||!h.e0) return [ka,0,ka];
  const ex=cb*h.e0[0]-sb*h.e0[1], ey=sb*h.e0[0]+cb*h.e0[1];
  return [ka*ex*ex+kt*ey*ey,(ka-kt)*ex*ey,ka*ey*ey+kt*ex*ex];
}
/* superficie di energia della cerniera S(a, φ) = F(a, |φ|) dalle prove MUL2 a spostamento imposto su una griglia
   (a_j = accorciamento lungo la striscia, θ_i = rotazione ≥ 0): in ogni nodo U, N = ∂U/∂a, M = ∂U/∂θ (dalle reazioni)
   e la derivata mista; interpolazione di Hermite bicubica (C¹). Fuori dalla griglia prolungamento di Taylor del secondo
   ordine dal bordo con rigidezze costanti kx (trazione / compressione oltre la griglia) e ky (rotazione).
   surf = {a:[…], th:[…], U:[[i][j]], N, M, X (mista), kxLo, kxHi, kyHi}. Restituisce [S, S_a, S_φ, S_aa, S_aφ, S_φφ]. */
function plSurfDer(s,x,y){
  // derivate ∂^m_x ∂^n_y (m, n ≤ 2) del polinomio di Hermite della cella che contiene (x, y) (già dentro la griglia)
  const A=s.a, T=s.th; let i=0, j=0;
  while(j<A.length-2&&x>A[j+1]) j++; while(i<T.length-2&&y>T[i+1]) i++;
  const h=A[j+1]-A[j], k=T[i+1]-T[i], u=(x-A[j])/h, v=(y-T[i])/k;
  // basi di Hermite e derivate rispetto alla coordinata locale: P0, P1 (valori), D0, D1 (pendenze)
  const bas=w=>[[2*w*w*w-3*w*w+1,6*w*w-6*w,12*w-6],[-2*w*w*w+3*w*w,-6*w*w+6*w,-12*w+6],[w*w*w-2*w*w+w,3*w*w-4*w+1,6*w-4],[w*w*w-w*w,3*w*w-2*w,6*w-2]];
  const bu=bas(u), bv=bas(v), out=[[0,0,0],[0,0,0],[0,0,0]];
  for(let ci=0;ci<2;ci++) for(let cj=0;cj<2;cj++){
    const ii=i+ci, jj=j+cj, f=s.U[ii][jj], fx=s.N[ii][jj]*h, fy=s.M[ii][jj]*k, fxy=s.X[ii][jj]*h*k;
    for(let m=0;m<3;m++) for(let n=0;n<3;n++){
      const sx=Math.pow(h,-m), sy=Math.pow(k,-n);
      out[m][n]+=sx*sy*(f*bu[cj][m]*bv[ci][n]+fx*bu[2+cj][m]*bv[ci][n]+fy*bu[cj][m]*bv[2+ci][n]+fxy*bu[2+cj][m]*bv[2+ci][n]); } }
  return out;
}
function plSurfEval(s,aa,phi){
  const sg=phi<0?-1:1, y0=Math.abs(phi), A=s.a, T=s.th;
  const x=Math.min(A[A.length-1],Math.max(A[0],aa)), y=Math.min(T[T.length-1],y0), dx=aa-x, dy=y0-y;
  const D=plSurfDer(s,x,y), kx=dx<0?s.kxLo:s.kxHi, ky=s.kyHi;
  // prolungamento: F = f + f_x dx + f_y dy + f_xy dx dy + ½ kx dx² + ½ ky dy², con le derivate nel punto sul bordo
  // (che dipendono dalla coordinata ancora dentro la griglia)
  const F=D[0][0]+D[1][0]*dx+D[0][1]*dy+D[1][1]*dx*dy+0.5*kx*dx*dx+0.5*ky*dy*dy;
  const Fx=D[1][0]+D[1][1]*dy+kx*dx, Fy=D[0][1]+D[1][1]*dx+ky*dy;
  // seconde derivate: nella direzione fuori griglia la rigidezza costante, in quella dentro le derivate del polinomio
  // (dentro la griglia dx = dy = 0 e restano quelle del polinomio)
  const Fxx=dx!==0?kx:D[2][0]+D[2][1]*dy, Fyy=dy!==0?ky:D[0][2]+D[1][2]*dx, Fxy=D[1][1];
  return [F,Fx,sg*Fy,Fxx,sg*Fxy,Fyy];
}
/* cerniera con superficie di energia calibrata con MUL2: E = S(a, φ) + ½ k_t t², con a = e·δ (lungo la striscia, + = verso
   la Y, cioè compressione), t = n·δ (di traverso, n = J e), e = R(θ_b) e₀. S contiene insieme la flessione (S(0, φ)) e la
   risposta assiale della striscia piegata, compresa l'instabilità a compressione. Derivate esatte:
     ∂a/∂q = e·∂δ/∂q (+ n·δ per θ_b),  ∂t/∂q = n·∂δ/∂q (− e·δ per θ_b),  ∂φ/∂θ_a = 1, ∂φ/∂θ_b = −1,
     ∂²a/∂p∂q = e·∂²δ/∂p∂q + [q = θ_b] n·∂δ/∂p + [p = θ_b] n·∂δ/∂q − [p = q = θ_b] e·δ  (e per t con n → −e, e → n). */
function plHingeSurf(h,ta,tb,cb,sb,ddx,ddy,Rax,Ray,Rbx,Rby,dsx,dsy,ia,ib,per,mx,my,grad,addH){
  const ex=cb*h.e0[0]-sb*h.e0[1], ey=sb*h.e0[0]+cb*h.e0[1], nx=-ey, ny=ex, kt=h.kt==null?h.k:h.kt;
  const a=ex*ddx+ey*ddy, t=nx*ddx+ny*ddy, phi=ta-tb, S=plSurfEval(h.surf,a,phi);
  const col=[[1,0],[0,1],[-Ray,Rax],[-1,0],[0,-1],[Rby,-Rbx],[dsx,0],[0,dsy]];
  const idx=[ia,ia+1,ia+2,ib,ib+1,ib+2,per?mx:-1,per?my:-1], nl=per?8:6;
  const ap=new Float64Array(8), tp=new Float64Array(8), pp=new Float64Array(8);
  for(let p=0;p<nl;p++){ ap[p]=ex*col[p][0]+ey*col[p][1]; tp[p]=nx*col[p][0]+ny*col[p][1]; }
  ap[5]+=nx*ddx+ny*ddy; tp[5]-=a; pp[2]=1; pp[5]=-1;
  for(let p=0;p<nl;p++){ const zi=idx[p]; if(zi<0) continue; grad[zi]+=S[1]*ap[p]+S[2]*pp[p]+kt*t*tp[p]; }
  for(let p=0;p<nl;p++){ const zi=idx[p]; if(zi<0) continue;
    for(let q=0;q<nl;q++){ const zj=idx[q]; if(zj<0) continue;
      // derivate seconde di δ: solo θa-θa (−R_a r_a) e θb-θb (+R_b r_b)
      let dx2=0, dy2=0; if(p===2&&q===2){ dx2=-Rax; dy2=-Ray; } if(p===5&&q===5){ dx2=Rbx; dy2=Rby; }
      let apq=ex*dx2+ey*dy2, tpq=nx*dx2+ny*dy2;
      if(q===5){ apq+=nx*col[p][0]+ny*col[p][1]; tpq-=ex*col[p][0]+ey*col[p][1]; }
      if(p===5){ apq+=nx*col[q][0]+ny*col[q][1]; tpq-=ex*col[q][0]+ey*col[q][1]; }
      if(p===5&&q===5){ apq-=a; tpq-=t; }
      const v=S[3]*ap[p]*ap[q]+S[4]*(ap[p]*pp[q]+pp[p]*ap[q])+S[5]*pp[p]*pp[q]+S[1]*apq+kt*(tp[p]*tp[q]+t*tpq);
      addH(zi,zj,v); } }
  return S[0]+0.5*kt*t*t;
}
/* energia, gradiente completo e Hessiana (ridotta ai liberi, a banda) + derivate rispetto a t */
function plEval(M,z,map,bw,coef,wantK,t){
  const nb=M.bodies.length, nd=z.length, nf=map.nf, grad=new Float64Array(nd);
  const Kb=wantK?new Float64Array(nf*(bw+1)):null, gt=new Float64Array(nf);
  let E=0;
  const mx=3*nb, my=3*nb+1, per=M.periodic, lx=per?z[mx]:1, ly=per?z[my]:1;
  const idx=new Int32Array(8), col=new Float64Array(16);   // colonne 2×8 di ∂δ/∂(dof locali)
  const addH=(i,j,v)=>{   // v = ∂²E/∂z_i∂z_j (i, j indici completi), simmetrico: chiamato una volta per coppia ordinata
    const fi=map.f[i], fj=map.f[j];
    if(fi>=0&&fj>=0){ if(wantK&&fi>=fj) Kb[fi*(bw+1)+(fi-fj)]+=v; }
    if(fi>=0&&fj<0&&coef[j]!==0) gt[fi]+=v*coef[j];
  };
  for(const h of M.hinges){
    const A=M.bodies[h.a], B=M.bodies[h.b], ia=3*h.a, ib=3*h.b;
    const ta=z[ia+2], tb=z[ib+2], ca=Math.cos(ta), sa_=Math.sin(ta), cb=Math.cos(tb), sb_=Math.sin(tb);
    const rax=h.P[0]-h.sa[0]-A.c[0], ray=h.P[1]-h.sa[1]-A.c[1], rbx=h.P[0]-h.sb[0]-B.c[0], rby=h.P[1]-h.sb[1]-B.c[1];
    const Rax=ca*rax-sa_*ray, Ray=sa_*rax+ca*ray, Rbx=cb*rbx-sb_*rby, Rby=sb_*rbx+cb*rby;
    const dsx=h.sa[0]-h.sb[0], dsy=h.sa[1]-h.sb[1];
    // δ = Λ(sa − sb) + (c_a − c_b) + u_a − u_b + R_a r_a − R_b r_b  (a riposo: δ = 0)
    const ddx=lx*dsx+A.c[0]-B.c[0]+z[ia]-z[ib]+Rax-Rbx, ddy=ly*dsy+A.c[1]-B.c[1]+z[ia+1]-z[ib+1]+Ray-Rby;
    if(h.surf){ E+=plHingeSurf(h,ta,tb,cb,sb_,ddx,ddy,Rax,Ray,Rbx,Rby,dsx,dsy,ia,ib,per,mx,my,grad,addH); continue; }
    // K = R_b K₀ R_bᵀ e le sue derivate rispetto a θ_b: K' = JK − KJ, K'' = −2K − 2JKJ (J = rotazione di 90°)
    const K=plHingeKm(h,cb,sb_), Kxx=K[0], Kxy=K[1], Kyy=K[2];
    const d1xx=-2*Kxy, d1xy=Kxx-Kyy, d1yy=2*Kxy, d2xx=2*(Kyy-Kxx), d2xy=-4*Kxy, d2yy=2*(Kxx-Kyy);
    const fx=Kxx*ddx+Kxy*ddy, fy=Kxy*ddx+Kyy*ddy, gx=d1xx*ddx+d1xy*ddy, gy=d1xy*ddx+d1yy*ddy;   // Kδ, K'δ
    E+=0.5*(ddx*fx+ddy*fy);
    // dof locali: ua x,y, θa, ub x,y, θb, λx, λy
    idx[0]=ia; idx[1]=ia+1; idx[2]=ia+2; idx[3]=ib; idx[4]=ib+1; idx[5]=ib+2; idx[6]=per?mx:-1; idx[7]=per?my:-1;
    col.fill(0);
    col[0]=1; col[3]=1;                  // ∂δ/∂ua_x = (1,0), ∂δ/∂ua_y = (0,1)  (col[2c] = x, col[2c+1] = y)
    col[4]=-Ray; col[5]=Rax;             // ∂δ/∂θa = J R_a r_a
    col[6]=-1; col[9]=-1;                // ub
    col[10]=Rby; col[11]=-Rbx;           // ∂δ/∂θb = −J R_b r_b
    col[12]=dsx; col[15]=dsy;            // λx, λy
    const nl=per?8:6;
    for(let p=0;p<nl;p++){ const zi=idx[p]; if(zi<0) continue; grad[zi]+=col[2*p]*fx+col[2*p+1]*fy; }
    grad[ib+2]+=0.5*(ddx*gx+ddy*gy);                       // la terna ruota con la Y
    for(let p=0;p<nl;p++){ const zi=idx[p]; if(zi<0) continue; const cpx=col[2*p], cpy=col[2*p+1];
      for(let q=0;q<nl;q++){ const zj=idx[q]; if(zj<0) continue; const cqx=col[2*q], cqy=col[2*q+1];
        let v=cpx*(Kxx*cqx+Kxy*cqy)+cpy*(Kxy*cqx+Kyy*cqy);
        if(p===2&&q===2) v+=fx*(-Rax)+fy*(-Ray);            // ∂²δ/∂θa² = −R_a r_a
        if(p===5&&q===5) v+=fx*Rbx+fy*Rby+0.5*(ddx*(d2xx*ddx+d2xy*ddy)+ddy*(d2xy*ddx+d2yy*ddy));   // ∂²δ/∂θb² = +R_b r_b, K''
        if(q===5) v+=gx*cpx+gy*cpy;                         // δᵀK' ∂δ/∂p
        if(p===5) v+=gx*cqx+gy*cqy;
        addH(zi,zj,v); } }
    // rotazione relativa
    const r=plRot(h,ta-tb); E+=r.W;
    grad[ia+2]+=r.M; grad[ib+2]-=r.M;
    addH(ia+2,ia+2,r.S); addH(ib+2,ib+2,r.S); addH(ia+2,ib+2,-r.S); addH(ib+2,ia+2,-r.S);
  }
  // carichi esterni (controllo di forza): potenziale −t·Σ coef·z[dof], fuori da E (E resta l'energia elastica);
  // la grandezza coniugata u = Σ coef·z[dof] prende il posto di F
  let U=0;
  for(const l of M.loads||[]){ grad[l.dof]-=(t||0)*l.coef; U+=l.coef*z[l.dof]; const fi=map.f[l.dof]; if(fi>=0) gt[fi]-=l.coef; }
  const g=new Float64Array(nf); let F=0;
  for(let i=0;i<nd;i++){ const fi=map.f[i]; if(fi>=0) g[fi]=grad[i]; else F+=grad[i]*coef[i]; }
  if(M.loads&&M.loads.length) F=U;
  return {E,g,gt,F,Kb,grad};
}

/* LDLᵀ a banda (senza pivot): fattorizza sul posto, restituisce il numero di pivot negativi */
function plLDL(Kb,n,bw){
  const w=bw+1, d=new Float64Array(n); let neg=0, tiny=0;
  for(let i=0;i<n;i++){ let ad=0; for(let j=Math.max(0,i-bw);j<=i;j++) ad=Math.max(ad,Math.abs(Kb[i*w+(i-j)])); tiny=Math.max(tiny,ad); }
  tiny*=1e-13;
  for(let i=0;i<n;i++){
    const j0=Math.max(0,i-bw);
    for(let j=j0;j<i;j++){
      let s=Kb[i*w+(i-j)]; const k0=Math.max(j0,j-bw);
      for(let k=k0;k<j;k++) s-=Kb[i*w+(i-k)]*d[k]*Kb[j*w+(j-k)];
      Kb[i*w+(i-j)]=s/d[j];
    }
    let s=Kb[i*w];
    for(let k=j0;k<i;k++){ const l=Kb[i*w+(i-k)]; s-=l*l*d[k]; }
    if(Math.abs(s)<tiny) s=s<0?-tiny:tiny;
    d[i]=s; Kb[i*w]=1; if(s<0) neg++;
  }
  return {d,neg};
}
function plSolve(Kb,d,n,bw,b){
  const w=bw+1, x=Float64Array.from(b);
  for(let i=0;i<n;i++){ let s=x[i]; for(let k=Math.max(0,i-bw);k<i;k++) s-=Kb[i*w+(i-k)]*x[k]; x[i]=s; }
  for(let i=0;i<n;i++) x[i]/=d[i];
  for(let i=n-1;i>=0;i--){ let s=x[i]; for(let k=i+1;k<=Math.min(n-1,i+bw);k++) s-=Kb[k*w+(k-i)]*x[k]; x[i]=s; }
  return x;
}

/* numerazione dei liberi (corpi nell'ordine dato da M.order) e larghezza di banda */
function plMap(M){
  const nb=M.bodies.length, nd=plDofs(M), f=new Int32Array(nd).fill(-1), coef=new Float64Array(nd), base=new Float64Array(nd);
  const fixed=new Uint8Array(nd);
  for(const c of M.ctl){ fixed[c.dof]=1; coef[c.dof]=c.coef||0; base[c.dof]=c.base||0; }
  M.bodies.forEach((b,i)=>{ if(b.lockRot) fixed[3*i+2]=1; });
  let nf=0; const order=M.order||M.bodies.map((b,i)=>i), pos=new Int32Array(nb);
  order.forEach((bi,o)=>{ pos[bi]=o; for(let a=0;a<3;a++){ const i=3*bi+a; if(!fixed[i]) f[i]=nf++; } });
  if(M.periodic) for(const i of [3*nb,3*nb+1]) if(!fixed[i]) f[i]=nf++;
  // banda: massima distanza fra liberi accoppiati da una cerniera
  let bw=0;
  for(const h of M.hinges){ const ds=[3*h.a,3*h.a+1,3*h.a+2,3*h.b,3*h.b+1,3*h.b+2]; if(M.periodic) ds.push(3*nb,3*nb+1);
    let lo=1e9, hi=-1; for(const i of ds){ const v=f[i]; if(v>=0){ lo=Math.min(lo,v); hi=Math.max(hi,v); } } if(hi>=0) bw=Math.max(bw,hi-lo); }
  return {f,nf,bw,coef,base,nd};
}

/* percorso di equilibrio. opt: {tmax, maxSteps, tscale, onStep(k,res)} */
function plPath(M,opt){
  const map=plMap(M), {f,nf,bw,coef,base,nd}=map;
  if(!nf) throw new Error('nessun grado di libertà libero');
  const L=M.L||1, tmax=opt.tmax, tsc=opt.tscale||1, maxSteps=opt.maxSteps||400;
  // pesi dello spazio scalato: traslazioni / L, rotazioni e λ così come sono, t / tscale
  const wq=new Float64Array(nf); for(let i=0;i<nd;i++){ const fi=f[i]; if(fi<0) continue; wq[fi]=(i<3*M.bodies.length&&i%3!==2)?1/L:1; }
  const wt=1/tsc;
  const z=new Float64Array(nd); if(M.periodic){ z[3*M.bodies.length]=1; z[3*M.bodies.length+1]=1; }
  const setT=(zz,t)=>{ for(let i=0;i<nd;i++) if(f[i]<0&&(coef[i]!==0||base[i]!==0)) zz[i]=base[i]+coef[i]*t; };
  // regolarizzazione minima sulle rotazioni (cerniere con kθ = 0): non cambia gli equilibri
  const kref=Math.max(...M.hinges.map(h=>h.k))||1, reg=1e-10*kref*L*L;
  const factor=(zz,tt)=>{ const ev=plEval(M,zz,map,bw,coef,true,tt); for(let i=0;i<nd;i++){ const fi=f[i]; if(fi>=0&&i<3*M.bodies.length&&i%3===2) ev.Kb[fi*(bw+1)]+=reg; } const fac=plLDL(ev.Kb,nf,bw); return {ev,fac}; };
  let t=0; setT(z,t);
  const out={t:[],F:[],E:[],neg:[],z:[],iters:[],L,nf,bw,stopped:''};
  const record=(zz,tt,ev,neg,it)=>{ out.t.push(tt); out.F.push(ev.F); out.E.push(ev.E); out.neg.push(neg); out.z.push(Float64Array.from(zz)); out.iters.push(it); if(opt.onStep) opt.onStep(out.t.length-1,out); };
  let cur=factor(z,t); record(z,t,cur.ev,cur.fac.neg,0);
  const tol=1e-9*kref*L;
  let tau=null, ds=(opt.ds0||tmax/50)*wt, dsMax=(opt.dsMax||tmax/12)*wt, dsMin=ds*1e-4;
  for(let step=0;step<maxSteps;step++){
    // tangente: K v = −g_t
    const v=plSolve(cur.ev.Kb,cur.fac.d,nf,bw,cur.ev.gt.map(x=>-x));
    let nn=wt*wt; for(let i=0;i<nf;i++) nn+=(wq[i]*v[i])**2; nn=Math.sqrt(nn);
    let tq=new Float64Array(nf), tt=wt/nn; for(let i=0;i<nf;i++) tq[i]=wq[i]*v[i]/nn;
    if(tau){ let dp=tt*tau.t; for(let i=0;i<nf;i++) dp+=tq[i]*tau.q[i]; if(dp<0){ tt=-tt; for(let i=0;i<nf;i++) tq[i]=-tq[i]; } }
    else if(tt<0){ tt=-tt; for(let i=0;i<nf;i++) tq[i]=-tq[i]; }
    let ok=false, zn, tn, itn=0, last;
    for(let tries=0;tries<12&&!ok;tries++){
      zn=Float64Array.from(z); tn=t+ds*tt/wt;
      for(let i=0;i<nd;i++){ const fi=f[i]; if(fi>=0) zn[i]+=ds*tq[fi]/wq[fi]; }
      setT(zn,tn);
      const yp=Float64Array.from(zn), tp=tn;
      for(let it=1;it<=25;it++){
        last=factor(zn,tn); const {ev,fac}=last;
        let gn=0; for(let i=0;i<nf;i++) gn=Math.max(gn,Math.abs(ev.g[i]));
        let c=tt*wt*(tn-tp); for(let i=0;i<nd;i++){ const fi=f[i]; if(fi>=0) c+=tq[fi]*wq[fi]*(zn[i]-yp[i]); }
        const a=plSolve(ev.Kb,fac.d,nf,bw,ev.g.map(x=>-x)), b=plSolve(ev.Kb,fac.d,nf,bw,ev.gt.map(x=>-x));
        let ta=0, tb=0; for(let i=0;i<nf;i++){ ta+=tq[i]*wq[i]*a[i]; tb+=tq[i]*wq[i]*b[i]; }
        const dt=(-c-ta)/(tb+tt*wt);
        let dn=Math.abs(dt)*wt; for(let i=0;i<nd;i++){ const fi=f[i]; if(fi>=0){ const d=a[fi]+b[fi]*dt; zn[i]+=d; dn=Math.max(dn,Math.abs(d*wq[fi])); } }
        tn+=dt; setT(zn,tn);
        if(!Number.isFinite(dn)) break;
        if(gn<tol&&dn<1e-10){ itn=it; ok=true; break; }
        if(dn<1e-12*Math.max(1,ds)&&gn<tol*1e3){ itn=it; ok=true; break; }
        if(it>=4&&dn>10*ds) break;
      }
      if(!ok){ ds*=0.5; if(ds<dsMin) break; }
    }
    if(!ok){ out.stopped='il passo non converge (punto di biforcazione o perdita di contatto fra le ipotesi del modello)'; break; }
    last=factor(zn,tn);
    tau={t:tt,q:tq}; z.set(zn); t=tn; cur=last;
    record(z,t,cur.ev,cur.fac.neg,itn);
    ds=Math.min(dsMax,Math.max(dsMin,ds*(itn<=3?1.5:itn>8?0.6:1)));
    let thm=0; for(let i=0;i<M.bodies.length;i++) thm=Math.max(thm,Math.abs(z[3*i+2]));
    if(t>=tmax){ out.stopped='raggiunto il carico massimo'; break; }
    if(t<=((M.loads&&M.loads.length)?-3:-0.5)*tmax){ out.stopped='il percorso torna indietro oltre il riferimento'; break; }   // a forza imposta forze negative sono normali (curva a N)
    if(thm>170*D2R){ out.stopped='rotazioni oltre 170°'; break; }
    if(step===maxSteps-1) out.stopped='raggiunto il numero massimo di passi';
  }
  // controllo di forza: ascissa = spostamento coniugato, ordinata = forza (come nel controllo di spostamento)
  if(M.loads&&M.loads.length){ const u=out.F; out.F=out.t; out.t=u; out.force=true; }
  out.map=map;
  return out;
}

/* Rilascio: si toglie il carico (spostamenti imposti e forze) lasciando solo i vincoli di appoggio (M.support: i dof
   bloccati del modello, il resto dei dof imposti diventa libero) e si lascia andare la struttura dallo stato zEnd fino
   a un equilibrio stabile. Minimizzazione dell'energia con Newton smorzato: shift sulla diagonale finché la tangente è
   definita positiva, passo limitato (~1% di L, ~0,6°) con riduzione se l'energia non scende; ogni iterazione è un
   fotogramma. Restituisce {z:[…], E:[…], neg, converged, iters}. */
function plRelease(M,zEnd,opt){
  opt=opt||{};
  const sup=M.support?new Set(M.support):null;
  const M2=Object.assign({},M,{ctl:M.ctl.filter(c=>sup?sup.has(c.dof):(!c.coef&&!c.base)),loads:[]});
  const map=plMap(M2), {f,nf,bw,coef,nd}=map;
  if(!nf) throw new Error('nessun grado di libertà libero');
  const nb=M.bodies.length, L=M.L||1, w1=bw+1, kref=Math.max(...M.hinges.map(h=>h.k))||1, tol=1e-8*kref*L;
  const wq=new Float64Array(nf); for(let i=0;i<nd;i++){ const fi=f[i]; if(fi<0) continue; wq[fi]=(i<3*nb&&i%3!==2)?1/L:1; }
  const dmax=opt.dmax||0.01, maxIt=opt.maxIt||800, z=Float64Array.from(zEnd);
  const frames=[Float64Array.from(z)], E=[plEval(M2,z,map,bw,coef,false,0).E];
  let lam=0, perturbed=false, converged=false, it=0, neg=0;
  const shifted=(ev,l)=>{ const K=Float64Array.from(ev.Kb); let md=0; for(let i=0;i<nf;i++) md=Math.max(md,Math.abs(K[i*w1]));
    for(let i=0;i<nf;i++) K[i*w1]+=l*md+(i>=0?1e-12*md:0); return K; };
  for(it=1;it<=maxIt;it++){
    const ev=plEval(M2,z,map,bw,coef,true,0); let gn=0; for(let i=0;i<nf;i++) gn=Math.max(gn,Math.abs(ev.g[i]));
    if(gn<tol){
      neg=plLDL(shifted(ev,0),nf,bw).neg;
      if(neg===0){ converged=true; break; }
      if(perturbed) break;
      perturbed=true; for(let i=0;i<nb;i++) if(f[3*i+2]>=0) z[3*i+2]+=1e-3*((i%2)?1:-1);   // stato di sella: piccola perturbazione
      continue;
    }
    let fac, K, l=lam; for(let k=0;k<40;k++){ K=shifted(ev,l); fac=plLDL(K,nf,bw); if(fac.neg===0) break; l=l===0?1e-6:l*10; }
    let st=plSolve(K,fac.d,nf,bw,ev.g.map(x=>-x)), sm=0; for(let i=0;i<nf;i++) sm=Math.max(sm,Math.abs(wq[i]*st[i]));
    if(!Number.isFinite(sm)) break;
    let a=sm>dmax?dmax/sm:1, ok=false;
    for(let ls=0;ls<12;ls++){
      const zn=Float64Array.from(z); for(let i=0;i<nd;i++){ const fi=f[i]; if(fi>=0) zn[i]+=a*st[fi]; }
      const En=plEval(M2,zn,map,bw,coef,false,0).E;
      if(En<=E[E.length-1]+1e-12*Math.max(1,Math.abs(E[E.length-1]))){ z.set(zn); E.push(En); frames.push(Float64Array.from(z)); ok=true; break; }
      a*=0.5;
    }
    lam=ok?l*0.3:Math.max(l,1e-6)*10; if(lam<1e-9) lam=0;
    if(!ok&&lam>1e12) break;
  }
  // al più ~150 fotogrammi, sempre con l'ultimo
  let idx=frames.map((_,i)=>i); if(idx.length>150){ const s=idx.length/150; idx=[...Array(150).keys()].map(k=>Math.min(frames.length-1,Math.round(k*s))); idx[idx.length-1]=frames.length-1; }
  return {z:idx.map(i=>frames[i]),E:idx.map(i=>E[i]),neg,converged,iters:it};
}

/* grandezze di ogni cerniera in uno stato z: δ (vettore e modulo), φ, energie traslazionale e rotazionale */
function plHingeState(M,z){
  const nb=M.bodies.length, per=M.periodic, lx=per?z[3*nb]:1, ly=per?z[3*nb+1]:1;
  return M.hinges.map(h=>{
    const A=M.bodies[h.a], B=M.bodies[h.b], ia=3*h.a, ib=3*h.b, ta=z[ia+2], tb=z[ib+2];
    const rax=h.P[0]-h.sa[0]-A.c[0], ray=h.P[1]-h.sa[1]-A.c[1], rbx=h.P[0]-h.sb[0]-B.c[0], rby=h.P[1]-h.sb[1]-B.c[1];
    const Rax=Math.cos(ta)*rax-Math.sin(ta)*ray, Ray=Math.sin(ta)*rax+Math.cos(ta)*ray, Rbx=Math.cos(tb)*rbx-Math.sin(tb)*rby, Rby=Math.sin(tb)*rbx+Math.cos(tb)*rby;
    const dx=lx*(h.sa[0]-h.sb[0])+A.c[0]-B.c[0]+z[ia]-z[ib]+Rax-Rbx, dy=ly*(h.sa[1]-h.sb[1])+A.c[1]-B.c[1]+z[ia+1]-z[ib+1]+Ray-Rby;
    if(h.surf){
      // energia della superficie: "rotazione" = S(0, φ), "traslazione" = il resto (assiale della striscia piegata + traverso)
      const cb=Math.cos(tb), sb=Math.sin(tb), ex=cb*h.e0[0]-sb*h.e0[1], ey=sb*h.e0[0]+cb*h.e0[1], kt=h.kt==null?h.k:h.kt;
      const a=ex*dx+ey*dy, t=-ey*dx+ex*dy, S=plSurfEval(h.surf,a,ta-tb), S0=plSurfEval(h.surf,0,ta-tb);
      return {dx,dy,d:Math.hypot(dx,dy),phi:ta-tb,a,t,Et:S[0]-S0[0]+0.5*kt*t*t,Er:S0[0],M:S[2],N:S[1]};
    }
    const r=plRot(h,ta-tb), K=plHingeKm(h,Math.cos(tb),Math.sin(tb));
    return {dx,dy,d:Math.hypot(dx,dy),phi:ta-tb,Et:0.5*(dx*(K[0]*dx+K[1]*dy)+dy*(K[1]*dx+K[2]*dy)),Er:r.W,M:r.M};
  });
}
/* posizione deformata di un punto P del corpo i (immagine con traslazione s) */
function plPoint(M,z,i,P,s){
  const nb=M.bodies.length, per=M.periodic, lx=per?z[3*nb]:1, ly=per?z[3*nb+1]:1, B=M.bodies[i], th=z[3*i+2];
  const sx=s?s[0]:0, sy=s?s[1]:0, rx=P[0]-sx-B.c[0], ry=P[1]-sy-B.c[1];
  return [lx*sx+B.c[0]+z[3*i]+Math.cos(th)*rx-Math.sin(th)*ry, ly*sy+B.c[1]+z[3*i+1]+Math.sin(th)*rx+Math.cos(th)*ry];
}
