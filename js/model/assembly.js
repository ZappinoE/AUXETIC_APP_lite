/* ---------- assemblaggio statico (per vista chiusa ed esportazione) ---------- */
function assemble(P,G,Bf){
  const parts=[], cuts=[], hinges=[];
  const T=blockTransforms(P,G);
  const par=[]; const find=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};
  const unite=(a,b)=>{a=find(a);b=find(b); if(a!==b) par[a]=b;};
  const pk=q=>{let u=((q[0]%G.C)+G.C)%G.C; if(u>G.C-1e-6) u=0; return Math.round(u*1e4)+','+Math.round(q[1]*1e4);};
  const edgeMap=new Map();
  const reg=(a,b,pid)=>{const k1=pk(a),k2=pk(b),k=k1<k2?k1+'|'+k2:k2+'|'+k1; const o=edgeMap.get(k); if(o===undefined) edgeMap.set(k,pid); else unite(o,pid);};
  for(const tr of T){
    const B=Bf(tr), N=B.N, f=tr.f, Hm=B.H.map(f);
    const cid=parts.length; parts.push({kind:'ROT',block:tr.id,row:tr.row,pts:Hm}); par.push(cid);
    const lat=[];
    for(let i=0;i<N;i++){
      const im=(i-1+N)%N, pts=[f(B.V[i]),f(B.A[im]),Hm[i],f(B.A[i])];
      const pid=parts.length; parts.push({kind:'EST',block:tr.id,row:tr.row,pts}); par.push(pid); lat.push(pid);
      reg(pts[1],pts[0],pid); reg(pts[0],pts[3],pid);
    }
    for(let i=0;i<N;i++){
      const a=f(B.A[i]), e=Hm[(i+1)%N], len=Math.hypot(e[0]-a[0],e[1]-a[1]), k=Math.max(0,len-P.hw)/len;
      cuts.push([a[0],a[1],a[0]+(e[0]-a[0])*k,a[1]+(e[1]-a[1])*k]);
      hinges.push({p:Hm[i],rot:cid,est:lat[i],row:tr.row});
    }
  }
  const groups=new Map();
  parts.forEach((p,i)=>{ if(p.kind==='EST'){const r=find(i); if(!groups.has(r)) groups.set(r,groups.size+1); p.group=groups.get(r);} else p.group=0; });
  return {parts,cuts,hinges,nBlocks:T.length,nGroups:groups.size};
}

function analyse(P){
  const G=layout(P), N=P.type==='square'?4:3;
  if(rowsNa!==G.Na) rowsFromProfile(G.Na);
  SELROW=Math.min(SELROW,G.Na-1);
  // blocco per riga (uniforme) e blocco per trasformazione: θ della riga del blocco, t del lato = t della riga del lato
  const V0=regPoly(N,G.L), cache=new Map();
  const get=(th,ts)=>{const k=th+'|'+ts.map(v=>v.toFixed(7)).join(','); let B=cache.get(k); if(!B){B=buildBlock(N,G.L,ts,th); cache.set(k,B);} return B;};
  const rowAt=v=>Math.max(0,Math.min(G.Na-1,Math.floor(v/G.Hc+1e-9)));
  const Bf=tr=>{
    if(typeof tr==='number') return get(ROWS[tr].th,new Array(N).fill(tOfY(ROWS[tr].y,P.type)));
    const ts=[]; for(let i=0;i<N;i++){const a=V0[i], b=V0[(i+1)%N], m=tr.f([(a[0]+b[0])/2,(a[1]+b[1])/2]); ts.push(tOfY(ROWS[rowAt(m[1])].y,P.type));}
    return get(ROWS[tr.row].th,ts);
  };
  const msgs=[], badRows=[], thMax=P.type==='square'?45:30;
  ROWS.forEach((r,j)=>{
    const B=Bf(j);
    if(!(r.th>=0&&r.th<thMax)||!B.ok){badRows.push(j); return;}
    if(P.hw>=B.side*0.5) msgs.push('Riga '+(j+1)+': cerniera troppo larga rispetto al lato del poligono centrale ('+B.side.toFixed(4)+' m).');
  });
  // blocchi di transizione fra righe con Y diverse
  if(!badRows.length){ for(const tr of blockTransforms(Object.assign({},P,{Nc:1}),G)) if(!Bf(tr).ok){ if(!badRows.includes(tr.row)) badRows.push(tr.row); } }
  if(badRows.length) msgs.unshift('Righe non valide: '+badRows.map(j=>j+1).sort((a,b)=>a-b).join(', ')+'. θ deve stare fra 0° e '+thMax+'° e la Y non deve chiudere il poligono centrale (anche nei blocchi di passaggio fra righe).');
  return {G,N,Bf,msgs,badRows,valid:badRows.length===0};
}
