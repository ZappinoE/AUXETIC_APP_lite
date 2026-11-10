/* ===== MODELLO A COLONNA (simmetria ciclica) — codice condiviso pagina/test ===== */
const D2R=Math.PI/180, S3=Math.sqrt(3);
const rot2=(v,a)=>[v[0]*Math.cos(a)-v[1]*Math.sin(a), v[0]*Math.sin(a)+v[1]*Math.cos(a)];
function regPoly(N,L){const V=[]; let p=[0,0], d=[1,0], ext=2*Math.PI/N; for(let i=0;i<N;i++){V.push(p.slice()); p=[p[0]+L*d[0],p[1]+L*d[1]]; d=rot2(d,ext);} return V;}
function buildBlock(N,L,t,thDeg){
  const th=thDeg*D2R, ext=2*Math.PI/N;
  const V=regPoly(N,L);
  const A=[],Rd=[], tt=Array.isArray(t)?t:new Array(N).fill(t);  // t per lato: A_i sul lato i a distanza t_i da V_{i+1}
  for(let i=0;i<N;i++){
    const a=V[i], b=V[(i+1)%N], len=Math.hypot(b[0]-a[0],b[1]-a[1]), e=[(b[0]-a[0])/len,(b[1]-a[1])/len];
    A.push([b[0]-tt[i]*e[0], b[1]-tt[i]*e[1]]); Rd.push(rot2(e,ext+th));
  }
  const H=[];
  for(let i=0;i<N;i++){
    const im=(i-1+N)%N, d1=Rd[i], d2=Rd[im], P1=A[i], P2=A[im];
    const det=d1[0]*(-d2[1])-(-d2[0])*d1[1];
    if(Math.abs(det)<1e-12) return {ok:false,N,L};
    const bx=P2[0]-P1[0], by=P2[1]-P1[1];
    const s=(bx*(-d2[1])-(-d2[0])*by)/det;
    H.push([P1[0]+s*d1[0], P1[1]+s*d1[1]]);
  }
  const dot=(u,v)=>u[0]*v[0]+u[1]*v[1];
  const s1=dot([H[0][0]-A[0][0],H[0][1]-A[0][1]],Rd[0]);
  const s2=dot([H[1][0]-A[0][0],H[1][1]-A[0][1]],Rd[0]);
  const side=Math.hypot(H[1][0]-H[0][0],H[1][1]-H[0][1]);
  const rotDeg=((Math.atan2(H[1][1]-H[0][1],H[1][0]-H[0][0])*180/Math.PI+540)%360)-180;
  let ok=true;
  for(let i=0;i<N;i++){const j=(i+1)%N, q1=dot([H[i][0]-A[i][0],H[i][1]-A[i][1]],Rd[i]), q2=dot([H[j][0]-A[i][0],H[j][1]-A[i][1]],Rd[i]); if(!(q1>0&&q2>q1+1e-9)) ok=false;}
  return {ok,N,L,V,A,H,Rd,s1,s2,side,rotDeg};
}
function layout(P){
  const C=2*Math.PI*P.R;
  if(P.type==='hex'){ // triangoli con lati verticali (blocchi del parallelogramma ruotati di 90°): periodo √3·L in u, L in z
    const L=C/(S3*P.Nc), Hc=L, Na=Math.max(1,Math.round(P.H/Hc));
    return {C,L,Hc,Na,Heff:Na*Hc,hstep:L/2,per:S3*L};
  }
  const L=C/(2*P.Nc);
  const Hc=P.type==='square'?2*L:S3*L;
  const Na=Math.max(1,Math.round(P.H/Hc));
  return {C,L,Hc,Na,Heff:Na*Hc,hstep:P.type==='square'?L:S3/2*L,per:2*L};
}
/* blocchi triangolari ruotati di 90° (u = circonferenza, v = asse), bordo a zig-zag entro [0, Na·L];
   periodic=true: una sola cella periodica (centroide in [0,L)) per il modello periodico */
function hexTransforms(nStrip,G,periodic){
  const L=G.L, h=S3/2*L, out=[], top=G.Na*L, e=1e-9;
  const rowOf=vmin=>Math.max(0,Math.min(G.Na-1,Math.floor((vmin+L/2)/L+1e-9)));
  for(let r=0;r<nStrip;r++){
    const odd=r%2;
    for(let k=-2;k<=G.Na+1;k++){
      const x0=k*L+odd*L/2;
      const up={vmin:x0,vmax:x0+L,f:p=>[p[1]+r*h,p[0]+x0]};
      const dn={vmin:x0+L/2,vmax:x0+3*L/2,f:p=>[-p[1]+(r+1)*h,p[0]+x0+L/2]};
      for(const tr of [up,dn]){
        const c=(tr.vmin+tr.vmax)/2;
        const ok=periodic?(c>=-e&&c<L-e):(tr.vmin>=-e&&tr.vmax<=top+e);
        if(ok) out.push({id:out.length,row:periodic?0:rowOf(tr.vmin),f:tr.f});
      }
    }
  }
  return out;
}
/* blocchi (con indice di riga di celle) */
function blockTransforms(P,G){
  if(P.type==='hex') return hexTransforms(2*P.Nc,G,false);
  const L=G.L, out=[];
  if(P.type==='square'){
    for(let j=0;j<2*G.Na;j++)for(let i=0;i<2*P.Nc;i++){
      const mx=i%2===1, my=j%2===1;
      out.push({id:out.length,row:j>>1,f:p=>[(mx?L-p[0]:p[0])+i*L,(my?L-p[1]:p[1])+j*L]});
    }
  } else {
    const h=S3/2*L;
    for(let r=0;r<2*G.Na;r++)for(let k=0;k<2*P.Nc;k++){
      const x0=k*L+r*L/2;
      out.push({id:out.length,row:r>>1,f:p=>[p[0]+x0,p[1]+r*h]});
      out.push({id:out.length,row:r>>1,f:p=>[p[0]+x0+L/2,-p[1]+(r+1)*h]});
    }
  }
  return out;
}
