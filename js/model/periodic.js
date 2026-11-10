function periodicCell(P,G,B){
  const N=B.N, L=G.L;
  const hex=P.type==='hex';
  const a1=hex?[S3*L,0]:[2*L,0], a2=hex?[0,L]:(P.type==='square'?[0,2*L]:[L,S3*L]);
  const T=hex?hexTransforms(2,{L,Na:1},true):blockTransforms(Object.assign({},P,{Nc:1}),{L,Na:1});
  const cen=[],est=[],hin=[];
  for(const tr of T){
    const f=tr.f, Hm=B.H.map(f);
    const cc=[Hm.reduce((a,p)=>a+p[0],0)/N, Hm.reduce((a,p)=>a+p[1],0)/N];
    const ci=cen.length; cen.push({pts:Hm,cc}); const li=[];
    for(let i=0;i<N;i++){const im=(i-1+N)%N; est.push({pts:[f(B.V[i]),f(B.A[im]),Hm[i],f(B.A[i])]}); li.push(est.length-1);}
    for(let i=0;i<N;i++) hin.push({c:ci,e:li[i],H:Hm[i]});
  }
  const det=a1[0]*a2[1]-a2[0]*a1[1];
  const frac=m=>[(m[0]*a2[1]-a2[0]*m[1])/det,(a1[0]*m[1]-m[0]*a1[1])/det];
  const emap=new Map(), adj=est.map(()=>[]);
  est.forEach((pc,pi)=>{
    const p=pc.pts;
    for(const [a,b] of [[p[1],p[0]],[p[0],p[3]]]){
      const fm=frac([(a[0]+b[0])/2,(a[1]+b[1])/2]), n=[Math.floor(fm[0]+1e-7),Math.floor(fm[1]+1e-7)];
      const sx=n[0]*a1[0]+n[1]*a2[0], sy=n[0]*a1[1]+n[1]*a2[1];
      const k1=Math.round((a[0]-sx)*1e4)+','+Math.round((a[1]-sy)*1e4), k2=Math.round((b[0]-sx)*1e4)+','+Math.round((b[1]-sy)*1e4);
      const key=k1<k2?k1+'|'+k2:k2+'|'+k1, o=emap.get(key);
      if(o){const dn=[o.n[0]-n[0],o.n[1]-n[1]]; adj[o.pi].push([pi,dn]); adj[pi].push([o.pi,[-dn[0],-dn[1]]]);}
      else emap.set(key,{pi,n});
    }
  });
  let nb=0;
  est.forEach((pc,st)=>{
    if(pc.body!==undefined) return;
    pc.body=nb; pc.s=[0,0]; const q=[st];
    while(q.length){const u=q.pop(); for(const [v,dn] of adj[u]) if(est[v].body===undefined){
      est[v].body=nb; est[v].s=[est[u].s[0]+dn[0]*a1[0]+dn[1]*a2[0], est[u].s[1]+dn[0]*a1[1]+dn[1]*a2[1]]; q.push(v);} }
    nb++;
  });
  return {cen,est,hin,nb,a1,a2};
}

/* ---------- modello: min Π = ½Σ k|δ|² + ½Σ kθ φ² − p·V  (Levenberg–Marquardt) ---------- */
function linsolve(A,b,n){
  for(let c=0;c<n;c++){
    let piv=c,mx=Math.abs(A[c*n+c]);
    for(let r=c+1;r<n;r++){const v=Math.abs(A[r*n+c]); if(v>mx){mx=v;piv=r;}}
    if(mx<1e-300) return null;
    if(piv!==c){for(let k=0;k<n;k++){const t=A[c*n+k];A[c*n+k]=A[piv*n+k];A[piv*n+k]=t;} const t=b[c];b[c]=b[piv];b[piv]=t;}
    for(let r=c+1;r<n;r++){const f=A[r*n+c]/A[c*n+c]; if(f===0) continue; for(let k=c;k<n;k++) A[r*n+k]-=f*A[c*n+k]; b[r]-=f*b[c];}
  }
  const x=new Float64Array(n);
  for(let r=n-1;r>=0;r--){let s=b[r]; for(let k=r+1;k<n;k++) s-=A[r*n+k]*x[k]; x[r]=s/A[r*n+r];}
  return x;
}
function makeModel(C,kt,kth,closed,Vc){
  const nb=C.nb, nc=C.cen.length, oc=2*(nb-1), op=oc+2*nc, n=op+nc+1, iv=n-1;
  const skt=Math.sqrt(kt), skh=Math.sqrt(Math.max(kth,0)), nh=C.hin.length, m=2*nh+nc;
  // controllo: estremità aperte -> ctl = λu (forza assiale nulla); estremità chiuse -> ctl = V/V0 (controllo di volume, λu = √(v/λv))
  function ev(q,ctl){
    const r=new Float64Array(m), J=new Float64Array(m*n); let dElu=0; const lv=q[iv];
    const lu=closed?Math.sqrt(ctl/lv):ctl, dlu=closed?-lu/(2*lv):0;
    for(let k=0;k<nh;k++){
      const h=C.hin[k], c=C.cen[h.c], e=C.est[h.e], ax=h.H[0]-c.cc[0], ay=h.H[1]-c.cc[1];
      const ph=q[op+h.c], cs=Math.cos(ph), sn=Math.sin(ph), rx=cs*ax-sn*ay, ry=sn*ax+cs*ay;
      const bi=e.body>0?2*(e.body-1):-1, bx=bi>=0?q[bi]:0, by=bi>=0?q[bi+1]:0;
      const xc=c.cc[0]+q[oc+2*h.c]+rx, yc=c.cc[1]+q[oc+2*h.c+1]+ry;
      const xi=h.H[0]+bx+(1-lu)*e.s[0], yi=h.H[1]+by+(1-lv)*e.s[1];
      const i0=2*k*n, i1=(2*k+1)*n;
      r[2*k]=skt*(xc-xi); r[2*k+1]=skt*(yc-yi);
      dElu+=r[2*k]*skt*e.s[0];
      J[i0+oc+2*h.c]=skt; J[i1+oc+2*h.c+1]=skt;
      J[i0+op+h.c]=-skt*ry; J[i1+op+h.c]=skt*rx;
      if(bi>=0){J[i0+bi]=-skt; J[i1+bi+1]=-skt;}
      J[i1+iv]=skt*e.s[1]; J[i0+iv]=skt*e.s[0]*dlu;
    }
    for(let c=0;c<nc;c++){const i=2*nh+c; r[i]=skh*q[op+c]; J[i*n+op+c]=skh;}
    let E=0; for(let i=0;i<m;i++) E+=r[i]*r[i]; E*=0.5;
    return {r,J,E,Pi:E,dElu,lu};
  }
  function solve(q,ctl){
    let mu=1e-4, cur=ev(q,ctl);
    for(let it=0;it<100;it++){
      const g=new Float64Array(n), Hm=new Float64Array(n*n), {r,J}=cur;
      for(let i=0;i<m;i++){const ri=r[i], row=i*n; for(let a=0;a<n;a++){const ja=J[row+a]; if(ja===0) continue; g[a]+=ja*ri; for(let b=a;b<n;b++){const jb=J[row+b]; if(jb!==0) Hm[a*n+b]+=ja*jb;}}}
      for(let a=0;a<n;a++) for(let b=0;b<a;b++) Hm[a*n+b]=Hm[b*n+a];
      let gn=0; for(let a=0;a<n;a++) gn=Math.max(gn,Math.abs(g[a]));
      if(gn<1e-9*Math.max(1,kt)*G0.L) break;
      let ok=false;
      for(let tr=0;tr<14;tr++){
        const A=Float64Array.from(Hm); for(let a=0;a<n;a++) A[a*n+a]+=mu*(Hm[a*n+a]+1e-9*kt)+1e-12;
        const d=linsolve(A,Float64Array.from(g,v=>-v),n); if(!d){mu*=10;continue;}
        const qn=Float64Array.from(q); for(let a=0;a<n;a++) qn[a]+=d[a];
        const nx=ev(qn,ctl);
        if(nx.Pi<=cur.Pi+1e-13*Math.max(1,Math.abs(cur.Pi))){q=qn;cur=nx;mu=Math.max(mu/4,1e-12);ok=true;break;}
        mu*=5;
      }
      if(!ok) break;
    }
    return {q,res:cur};
  }
  function path(){
    const out={lu:[],lv:[],p:[],E:[],q:[],phi:[]};
    let q=new Float64Array(n); q[iv]=1; let p=0, dl=0.004, phase=0, peak=0, trough=Infinity;
    for(let s=0;s<=700;s++){
      const ctl=closed?1+s*0.012:1+s*0.004;
      const sol=solve(q,ctl); q=sol.q; const lu=sol.res.lu;
      p=s>0?sol.res.dElu/(2*Vc*lu*q[iv]):0;
      let ph=0; for(let c=0;c<nc;c++) ph=Math.max(ph,Math.abs(q[op+c]));
      out.lu.push(lu); out.lv.push(q[iv]); out.p.push(p); out.E.push(sol.res.E); out.q.push(Float64Array.from(q)); out.phi.push(ph);
      const k=out.p.length-1;
      if(k>1){
        if(phase===0&&out.p[k]<out.p[k-1]){phase=1;peak=out.p[k-1];out.peakI=k-1;}
        else if(phase===1&&out.p[k]>out.p[k-1]){phase=2;trough=out.p[k-1];out.troughI=k-1;}
        if(phase===2&&p>1.3*peak) break;
      }
      if(ph>95*D2R) break;
    }
    out.peak=phase>0?peak:NaN; out.trough=phase===2?trough:NaN;
    return out;
  }
  return {n,iv,oc,op,nb,nc,path};
}
let G0={L:1};
