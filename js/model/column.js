/* ---------- costruzione della colonna ---------- */
function buildColumn(P,G,Bf,rows){
  const L=G.L, R0=P.R, Nc=P.Nc, alpha=2*Math.PI/Nc, per=G.per||2*L;
  const X3=(u,v)=>[R0*Math.cos(u/R0), R0*Math.sin(u/R0), v];
  const T=blockTransforms(Object.assign({},P,{Nc:1}),G);
  const rot=[], est=[], hin=[];
  for(const tr of T){
    const B=Bf(tr), N=B.N, f=tr.f, Hm=B.H.map(f);
    const cc=[Hm.reduce((a,p)=>a+p[0],0)/N, Hm.reduce((a,p)=>a+p[1],0)/N];
    const ci=rot.length; rot.push({pts:Hm,cc,row:tr.row,block:tr.id}); const li=[];
    for(let i=0;i<N;i++){const im=(i-1+N)%N; est.push({pts:[f(B.V[i]),f(B.A[im]),Hm[i],f(B.A[i])],row:tr.row,block:tr.id}); li.push(est.length-1);}
    for(let i=0;i<N;i++) hin.push({c:ci,e:li[i],H:Hm[i],row:tr.row});
  }
  // unione dei pezzi esterni (periodicità solo in u, periodo 2L)
  const emap=new Map(), adj=est.map(()=>[]);
  const K=(x,y)=>Math.round(x*1e4)+','+Math.round(y*1e4);
  est.forEach((pc,pi)=>{
    const p=pc.pts;
    for(const [a,b] of [[p[1],p[0]],[p[0],p[3]]]){
      const n=Math.floor(((a[0]+b[0])/2)/per+1e-7), sx=n*per;
      const k1=K(a[0]-sx,a[1]), k2=K(b[0]-sx,b[1]), key=k1<k2?k1+'|'+k2:k2+'|'+k1, o=emap.get(key);
      if(o){const dn=o.n-n; adj[o.pi].push([pi,dn]); adj[pi].push([o.pi,-dn]);} else emap.set(key,{pi,n});
    }
  });
  const bodies=[];
  rot.forEach((r,i)=>{ bodies.push({kind:'ROT',idx:i,row:r.row,c0:X3(r.cc[0],r.cc[1])}); r.body=bodies.length-1; });
  let nest=0;
  est.forEach((pc,st)=>{
    if(pc.body!==undefined) return;
    const b=bodies.length; bodies.push({kind:'EST',pieces:[]}); nest++;
    pc.body=b; pc.m=0; const q=[st];
    while(q.length){const u=q.pop(); bodies[b].pieces.push(u); for(const [v,dn] of adj[u]) if(est[v].body===undefined){est[v].body=b; est[v].m=est[u].m+dn; q.push(v);} }
  });
  for(const b of bodies){
    if(b.kind!=='EST') continue;
    let su=0,sv=0,n=0; for(const pi of b.pieces){const pc=est[pi]; for(const p of pc.pts){su+=p[0]+pc.m*per; sv+=p[1]; n++;}}
    b.c0=X3(su/n,sv/n);
    const pc=est[b.pieces[0]], V=pc.pts[0];
    b.Xv=X3(V[0]+pc.m*per,V[1]); b.level=Math.round(V[1]/G.hstep);
    b.row=Math.min(G.Na-1,Math.floor(V[1]/G.Hc));
  }
  // ordinamento per quota (matrice a banda)
  const order=bodies.map((b,i)=>i).sort((a,b)=>(bodies[a].c0[2]-bodies[b].c0[2])||(Math.atan2(bodies[a].c0[1],bodies[a].c0[0])-Math.atan2(bodies[b].c0[1],bodies[b].c0[0])));
  order.forEach((bi,o)=>bodies[bi].o=o);
  hin.forEach(h=>{h.cb=rot[h.c].body; h.kb=est[h.e].body; h.m=est[h.e].m; h.Xh=X3(h.H[0],h.H[1]); const a=h.H[0]/R0; h.n0=[Math.cos(a),Math.sin(a),0];});
  const nLev=2*G.Na+1;
  return {P,G,rot,est,hin,bodies,nLev,alpha,Nc,R0,X3,per,rows};
}

/* ---------- risolutore ---------- */
function makeColumnSolver(col,opt){
  const {bodies,hin,nLev,alpha,Nc}=col, nb=bodies.length;
  const ends=opt.ends||(opt.base?'base':'free'), bulk=ends==='bulkhead';
  if(bulk) opt=Object.assign({},opt,{closed:true});
  const n=6*nb+(bulk?1:0), izt=n-1;   // con i bulkhead: ultimo gdl = traslazione assiale del bulkhead superiore
  const Rzm={}, getRz=m=>Rzm[m]||(Rzm[m]=rz(m*alpha));
  // termini: cerniere (7 residui, 12 dof) e vincoli
  const H=hin.map(h=>{
    const r=col.rows[h.row];
    return Object.assign({},h,{skt:Math.sqrt(r.k),skh:Math.sqrt(Math.max(0,r.kth)),skb:Math.sqrt(Math.max(0,r.kb))});
  });
  const kref=Math.max(...col.rows.map(r=>r.k));
  const est=bodies.filter(b=>b.kind==='EST');
  const lev0=bodies.map((b,i)=>i).filter(i=>bodies[i].kind==='EST'&&bodies[i].level===0);
  // corpo di riferimento per la rotazione rigida attorno all'asse: poligono centrale a metà altezza
  const midZ=col.G.Heff/2; let b0=0,bd=1e9; bodies.forEach((b,i)=>{if(b.kind==='ROT'){const d=Math.abs(b.c0[2]-midZ); if(d<bd){bd=d;b0=i;}}});
  const a0=Math.atan2(bodies[b0].c0[1],bodies[b0].c0[0]), et0=[-Math.sin(a0),Math.cos(a0),0];
  const base=ends==='base';
  const levTop=bodies.map((b,i)=>i).filter(i=>bodies[i].kind==='EST'&&bodies[i].level===nLev-1);
  const kbmax=Math.max(...col.rows.map(r=>Math.max(r.kb,r.kth))), kp=50*kref, kpr=50*kbmax+1e-6*kref*col.G.L*col.G.L;
  const pose=(q,b)=>{const o=6*bodies[b].o; return {c:[bodies[b].c0[0]+q[o],bodies[b].c0[1]+q[o+1],bodies[b].c0[2]+q[o+2]], Q:rodrigues([q[o+3],q[o+4],q[o+5]])};};
  function hingeRes(h,Pc,Pk,out){
    const c0c=bodies[h.cb].c0, c0k=bodies[h.kb].c0, Rm=getRz(h.m), Rmi=getRz(-h.m);
    const a=[h.Xh[0]-c0c[0],h.Xh[1]-c0c[1],h.Xh[2]-c0c[2]], qa=mv(Pc.Q,a);
    const xc=[Pc.c[0]+qa[0],Pc.c[1]+qa[1],Pc.c[2]+qa[2]];
    const Xb=mv(Rm,h.Xh), bvec=[Xb[0]-c0k[0],Xb[1]-c0k[1],Xb[2]-c0k[2]], qb=mv(Pk.Q,bvec);
    const xe=mv(Rmi,[Pk.c[0]+qb[0],Pk.c[1]+qb[1],Pk.c[2]+qb[2]]);
    out[0]=h.skt*(xc[0]-xe[0]); out[1]=h.skt*(xc[1]-xe[1]); out[2]=h.skt*(xc[2]-xe[2]);
    const Qe=mm(mm(Rmi,Pk.Q),Rm), w=logmap(mm(Pc.Q,mT(Qe))), nn=mv(Pc.Q,h.n0);
    const wn=w[0]*nn[0]+w[1]*nn[1]+w[2]*nn[2];
    out[3]=h.skh*wn; out[4]=h.skb*(w[0]-wn*nn[0]); out[5]=h.skb*(w[1]-wn*nn[1]); out[6]=h.skb*(w[2]-wn*nn[2]);
  }
  // volume da profilo dei vertici (corpi esterni)
  const estIdx=est.map(b=>bodies.indexOf(b));
  const cntLev=new Float64Array(nLev), zRef=new Float64Array(nLev); {const c=cntLev; estIdx.forEach(bi=>{const b=bodies[bi]; zRef[b.level]+=b.Xv[2]; c[b.level]++;}); for(let l=0;l<nLev;l++) zRef[l]/=Math.max(1,c[l]);}
  function vertexOf(q,bi){const P=pose(q,bi), b=bodies[bi], a=[b.Xv[0]-b.c0[0],b.Xv[1]-b.c0[1],b.Xv[2]-b.c0[2]], qa=mv(P.Q,a); return [P.c[0]+qa[0],P.c[1]+qa[1],P.c[2]+qa[2]];}
  function profile(q){
    const rs=new Float64Array(nLev), zs=new Float64Array(nLev), cnt=new Float64Array(nLev);
    for(const bi of estIdx){const b=bodies[bi], x=vertexOf(q,bi); rs[b.level]+=Math.hypot(x[0],x[1]); zs[b.level]+=x[2]; cnt[b.level]++;}
    for(let l=0;l<nLev;l++){rs[l]/=Math.max(1,cnt[l]); zs[l]/=Math.max(1,cnt[l]);}
    return {rs,zs};
  }
  function volFromProfile(pr){
    let V=0; for(let l=0;l<nLev-1;l++){const a=pr.rs[l],b=pr.rs[l+1], dz=opt.closed?(pr.zs[l+1]-pr.zs[l]):(zRef[l+1]-zRef[l]); V+=Math.PI/3*(a*a+a*b+b*b)*dz;}
    return V;
  }
  const Vcol=q=>volFromProfile(profile(q))/Nc;
  const q0=new Float64Array(n); const Vcol0=Vcol(q0);
  // valutazione completa: residui, gradiente, hessiana GN a banda
  let bw=0;
  for(const h of H){bw=Math.max(bw,Math.abs(bodies[h.cb].o-bodies[h.kb].o)*6+5);}
  if(bulk) for(const bi of levTop) bw=Math.max(bw,izt-6*bodies[bi].o);
  bw=Math.max(bw,5);
  function evalAll(q,Vt,kappa,wantH,ext){
    const g=new Float64Array(n), Hb=wantH?new Float64Array(n*(bw+1)):null; let E=0;
    const poses=bodies.map((b,i)=>pose(q,i));
    const r=new Float64Array(7), rp=new Float64Array(7), Jl=new Float64Array(7*12);
    const addTerm=(dofs,res,J,nr)=>{
      for(let i=0;i<nr;i++) E+=0.5*res[i]*res[i];
      const nd=dofs.length;
      for(let a=0;a<nd;a++){let s=0; for(let i=0;i<nr;i++) s+=J[i*nd+a]*res[i]; g[dofs[a]]+=s;}
      if(Hb) for(let a=0;a<nd;a++)for(let b=0;b<nd;b++){const ia=dofs[a], ib=dofs[b]; if(ib>ia) continue; let s=0; for(let i=0;i<nr;i++) s+=J[i*nd+a]*J[i*nd+b]; Hb[ia*(bw+1)+(ia-ib)]+=s;}
    };
    const eps=1e-7*col.G.L, epsr=1e-7;
    for(const h of H){
      const Pc=poses[h.cb], Pk=poses[h.kb]; hingeRes(h,Pc,Pk,r);
      const oc=6*bodies[h.cb].o, ok=6*bodies[h.kb].o, dofs=[];
      for(let a=0;a<6;a++) dofs.push(oc+a); for(let a=0;a<6;a++) dofs.push(ok+a);
      if(wantH){
        for(let a=0;a<12;a++){
          const gi=dofs[a], e=(a%6)<3?eps:epsr, sv=q[gi]; q[gi]=sv+e;
          const Pc2=a<6?pose(q,h.cb):Pc, Pk2=a>=6?pose(q,h.kb):Pk; hingeRes(h,Pc2,Pk2,rp); q[gi]=sv;
          for(let i=0;i<7;i++) Jl[i*12+a]=(rp[i]-r[i])/e;
        }
      }
      if(wantH) addTerm(dofs,r,Jl,7); else for(let i=0;i<7;i++) E+=0.5*r[i]*r[i];
    }
    // vincoli
    const o0=6*bodies[b0].o, skr=Math.sqrt(kref);
    if(bulk){
      // perni sui bulkhead: punto del nodo solidale al bordo del bulkhead, rotazione libera solo attorno alla tangente
      const sp=Math.sqrt(kp), spr=Math.sqrt(kpr), zt=q[izt];
      const pin=(bi,top)=>{
        const b=bodies[bi], o=6*b.o, x=vertexOf(q,bi), a=Math.atan2(b.Xv[1],b.Xv[0]), e=[-Math.sin(a),Math.cos(a),0];
        const res=[sp*(x[0]-b.Xv[0]), sp*(x[1]-b.Xv[1]), sp*(x[2]-b.Xv[2]-(top?zt:0))];
        const w=[q[o+3],q[o+4],q[o+5]], we=w[0]*e[0]+w[1]*e[1]+w[2]*e[2];
        const rr=[spr*(w[0]-we*e[0]), spr*(w[1]-we*e[1]), spr*(w[2]-we*e[2])];
        if(!wantH){for(const v of res) E+=0.5*v*v; for(const v of rr) E+=0.5*v*v; return;}
        const dofs=[o,o+1,o+2,o+3,o+4,o+5]; if(top) dofs.push(izt);
        const nd=dofs.length, J=new Float64Array(3*nd);
        for(let c=0;c<3;c++) J[c*nd+c]=sp;
        for(let a2=3;a2<6;a2++){const sv=q[o+a2]; q[o+a2]=sv+epsr; const x2=vertexOf(q,bi); q[o+a2]=sv; for(let c=0;c<3;c++) J[c*nd+a2]=sp*(x2[c]-x[c])/epsr;}
        if(top) J[2*nd+6]=-sp;
        addTerm(dofs,res,J,3);
        const Jr=new Float64Array(3*6); for(let c=0;c<3;c++)for(let d=0;d<3;d++) Jr[c*6+3+d]=spr*((c===d?1:0)-e[c]*e[d]);
        addTerm(dofs.slice(0,6),rr,Jr,3);
      };
      for(const bi of lev0) pin(bi,false);
      for(const bi of levTop) pin(bi,true);
      // dispositivo elastico interno fra le due flange: molla assiale (lineare + cubica) con corsa libera ±s0; per colonna vale 1/Nc
      const spg=opt.spring;
      if(spg&&(spg.k1>0||spg.k3>0)){
        const k1=spg.k1/col.Nc, k3=spg.k3/col.Nc, s0=Math.max(0,spg.s0||0), az=Math.abs(zt), d=az>s0?Math.sign(zt)*(az-s0):0;
        if(d!==0){ const r=[], J=[];
          if(k1>0){ r.push(Math.sqrt(k1)*d); J.push(Math.sqrt(k1)); }
          if(k3>0){ const c=Math.sqrt(k3/2); r.push(c*d*Math.abs(d)); J.push(2*c*Math.abs(d)); }
          if(!wantH){ for(const v of r) E+=0.5*v*v; } else addTerm([izt],r,J,r.length); }
      }
    } else addTerm([o0,o0+1],[skr*(q[o0]*et0[0]+q[o0+1]*et0[1])],[skr*et0[0],skr*et0[1]],1);
    if(bulk){} else if(base){
      const sb=Math.sqrt(20*kref);
      for(const bi of lev0){
        const b=bodies[bi], o=6*b.o, x=vertexOf(q,bi), res=[sb*(x[2]-b.Xv[2])];
        if(!wantH){E+=0.5*res[0]*res[0]; continue;}
        const J=new Float64Array(6), dofs=[];
        for(let a=0;a<6;a++){dofs.push(o+a); const e=a<3?eps:epsr, sv=q[o+a]; q[o+a]=sv+e; J[a]=sb*(vertexOf(q,bi)[2]-x[2])/e; q[o+a]=sv;}
        addTerm(dofs,res,J,1);
      }
    } else addTerm([o0+2],[skr*q[o0+2]],[skr],1);
    // volume (penalità) con gradiente analitico dal profilo
    const pr=profile(q), Vc=volFromProfile(pr)/Nc, dV=new Float64Array(n);
    if(kappa>0){
      const dVr=new Float64Array(nLev), dVz=new Float64Array(nLev), k3=Math.PI/3/Nc;
      for(let l=0;l<nLev-1;l++){
        const a=pr.rs[l], b=pr.rs[l+1], dz=opt.closed?(pr.zs[l+1]-pr.zs[l]):(zRef[l+1]-zRef[l]);
        dVr[l]+=k3*(2*a+b)*dz; dVr[l+1]+=k3*(a+2*b)*dz;
        if(opt.closed){const f=k3*(a*a+a*b+b*b); dVz[l+1]+=f; dVz[l]-=f;}
      }
      if(wantH){
        for(const bi of estIdx){
          const b=bodies[bi], o=6*b.o, l=b.level, c=cntLev[l], x=vertexOf(q,bi), rho=Math.hypot(x[0],x[1])||1e-12;
          const gx=dVr[l]*x[0]/rho/c, gy=dVr[l]*x[1]/rho/c, gz=dVz[l]/c;
          dV[o]=gx; dV[o+1]=gy; dV[o+2]=gz;
          for(let a=3;a<6;a++){const sv=q[o+a]; q[o+a]=sv+epsr; const x2=vertexOf(q,bi); q[o+a]=sv; dV[o+a]=((x2[0]-x[0])*gx+(x2[1]-x[1])*gy+(x2[2]-x[2])*gz)/epsr;}
        }
      }
      const dv=Vc-Vt; E+=0.5*kappa*dv*dv; if(wantH) for(let i=0;i<n;i++) g[i]+=kappa*dv*dV[i];
    }
    // carico esterno generalizzato (bladder): potenziale lineare −f·(q − q₀) attorno allo stato di partenza
    if(ext){ const f=ext.f, q0=ext.q0, rg=ext.reg;
      for(let i=0;i<n;i++){ const d=q[i]-q0[i]; if(f[i]!==0){ E-=f[i]*d; g[i]-=f[i]; }
        // termine prossimale: rigidezza della membrana che segue il corpo (accoppiamento stabile a passi alterni)
        if(rg&&rg[i]>0){ E+=0.5*rg[i]*d*d; g[i]+=rg[i]*d; if(wantH) Hb[i*(bw+1)]+=rg[i]; } } }
    return {E,g,Hb,dV,Vc,pr};
  }
  function bandChol(A){ // in place, fattore inferiore
    const w=bw, W=w+1;
    for(let i=0;i<n;i++){
      for(let j=Math.max(0,i-w);j<=i;j++){
        let s=A[i*W+(i-j)];
        for(let k=Math.max(0,i-w,j-w);k<j;k++) s-=A[i*W+(i-k)]*A[j*W+(j-k)];
        if(i===j){ if(!(s>0)) return false; A[i*W]=Math.sqrt(s);} else A[i*W+(i-j)]=s/A[j*W];
      }
    }
    return true;
  }
  function bandSolve(Lb,b){
    const w=bw, W=w+1, y=Float64Array.from(b);
    for(let i=0;i<n;i++){let s=y[i]; for(let k=Math.max(0,i-w);k<i;k++) s-=Lb[i*W+(i-k)]*y[k]; y[i]=s/Lb[i*W];}
    for(let i=n-1;i>=0;i--){let s=y[i]; for(let k=i+1;k<=Math.min(n-1,i+w);k++) s-=Lb[k*W+(k-i)]*y[k]; y[i]=s/Lb[i*W];}
    return y;
  }
  function solve(q,Vt,kappa,ext,maxit){
    let mu=1e-6, cur=evalAll(q,Vt,kappa,true,ext), it=0, gn=0;
    for(;it<(maxit||opt.maxit||40);it++){
      gn=0; for(let i=0;i<n;i++) gn=Math.max(gn,Math.abs(cur.g[i]));
      if(gn<(opt.tol||1e-6)*kref*col.G.L) break;
      let ok=false;
      for(let tr=0;tr<12;tr++){
        const A=Float64Array.from(cur.Hb), W=bw+1;
        for(let i=0;i<n;i++) A[i*W]+=mu*A[i*W]+1e-10*kref+1e-14;
        if(!bandChol(A)){mu*=10; continue;}
        const y=bandSolve(A,Float64Array.from(cur.g,v=>-v));
        let dx=y;
        if(kappa>0){
          const z=bandSolve(A,cur.dV); let gy=0,gz=0; for(let i=0;i<n;i++){gy+=cur.dV[i]*y[i]; gz+=cur.dV[i]*z[i];}
          const f=kappa*gy/(1+kappa*gz); dx=new Float64Array(n); for(let i=0;i<n;i++) dx[i]=y[i]-z[i]*f;
        }
        const qn=Float64Array.from(q); for(let i=0;i<n;i++) qn[i]+=dx[i];
        const nx=evalAll(qn,Vt,kappa,false,ext);
        if(nx.E<=cur.E*(1+1e-12)+1e-15){q=qn;cur=evalAll(q,Vt,kappa,true,ext);mu=Math.max(mu/4,1e-12);ok=true;break;}
        mu*=6;
      }
      if(!ok) break;
    }
    return {q,res:cur,it,gn};
  }
  function maxRot(q){let m=0; bodies.forEach(b=>{if(b.kind==='ROT'){const o=6*b.o; m=Math.max(m,Math.hypot(q[o+3],q[o+4],q[o+5]));}}); return m;}
  return {n,bw,bodies,Vcol0,solve,maxRot,pose,profile,vertexOf,bulk,izt,lev0,levTop};
}
