/* funzioni del modello a corpi rigidi condivise dagli export */
// angoli di Eulero 3-1-3 (rad) di una terna con asse z dato e asse x suggerito
function rigidEuler(z,xh){
  const nz=Math.hypot(z[0],z[1],z[2]); z=[z[0]/nz,z[1]/nz,z[2]/nz];
  let d=xh[0]*z[0]+xh[1]*z[1]+xh[2]*z[2], x=[xh[0]-d*z[0],xh[1]-d*z[1],xh[2]-d*z[2]];
  if(Math.hypot(x[0],x[1],x[2])<1e-9){ const t=Math.abs(z[0])<0.9?[1,0,0]:[0,1,0]; d=t[0]*z[0]+t[1]*z[1]+t[2]*z[2]; x=[t[0]-d*z[0],t[1]-d*z[1],t[2]-d*z[2]]; }
  const nx=Math.hypot(x[0],x[1],x[2]); x=[x[0]/nx,x[1]/nx,x[2]/nx];
  const y=[z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  const th=Math.acos(Math.max(-1,Math.min(1,z[2])));
  if(Math.abs(Math.sin(th))<1e-9) return [Math.atan2(x[1],x[0]),th,0];
  return [Math.atan2(z[0],-z[1]),th,Math.atan2(x[2],y[2])];
}

// risultante della pressione unitaria (1 Pa) sui pezzi di un corpo, verso l'esterno, e momento rispetto a o
function rigidPressure(pieces,o){
  const F=[0,0,0], T=[0,0,0];
  for(const pc of pieces){
    let a=[0,0,0], c=[0,0,0], At=0;
    for(let i=1;i+1<pc.length;i++){ const p0=pc[0],p1=pc[i],p2=pc[i+1];
      const u=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]], v=[p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]];
      const n=[(u[1]*v[2]-u[2]*v[1])/2,(u[2]*v[0]-u[0]*v[2])/2,(u[0]*v[1]-u[1]*v[0])/2], ar=Math.hypot(n[0],n[1],n[2]);
      a=[a[0]+n[0],a[1]+n[1],a[2]+n[2]]; for(let d=0;d<3;d++) c[d]+=ar*(p0[d]+p1[d]+p2[d])/3; At+=ar; }
    c=c.map(x=>x/Math.max(At,1e-30));
    if(a[0]*c[0]+a[1]*c[1]<0) a=a.map(x=>-x);               // verso l'esterno del cilindro
    const r=[c[0]-o[0],c[1]-o[1],c[2]-o[2]];
    for(let d=0;d<3;d++) F[d]+=a[d];
    T[0]+=r[1]*a[2]-r[2]*a[1]; T[1]+=r[2]*a[0]-r[0]*a[2]; T[2]+=r[0]*a[1]-r[1]*a[0];
  }
  return {F,T};
}

function rigidOpts(){
  const g=(id,d,mn)=>{ const v=+$(id).value; return Number.isFinite(v)&&v>=mn?v:d; };
  return {rho:g('aRho',1010,1), E:1.7e9, nu:0.4, damp:g('aDamp',12,0)/100, T:g('aT',20,0.1), cellT:g('aTc',20,0.1)};
}

function rigidCellData(j){
  const {P,A}=cur, G=A.G, B=A.Bf(j);
  const P1=Object.assign({},P,{Nc:P.type==='hex'?2:2}), G1=Object.assign({},G,{Na:3,C:1e9});
  const S=assemble(P1,G1,()=>B);
  const C=periodicCell(P,G,B), nPer=C.cen.length, per=G.per;
  const rots=S.parts.map((p,i)=>i).filter(i=>S.parts[i].kind==='ROT'&&S.parts[i].row===1);
  const cen=i=>{const q=S.parts[i].pts; return [q.reduce((a,p)=>a+p[0],0)/q.length,q.reduce((a,p)=>a+p[1],0)/q.length];};
  const us=rots.map(i=>cen(i)[0]), uc=(Math.min(...us)+Math.max(...us))/2;
  // finestra di un periodo in u (spostata di poco per non tagliare sui baricentri)
  let sel=null;
  for(const sh of [0.013,0.27,0.51,0.77]){ const u0=uc-per/2+sh*per*0.5;
    const s=rots.filter(i=>{const u=cen(i)[0]; return u>=u0&&u<u0+per;}); if(s.length===nPer){ sel=s; break; } }
  if(!sel) throw new Error('periodo della riga '+(j+1)+' non individuato');
  // Y collegate
  const gsize=new Map(); S.parts.forEach(p=>{ if(p.kind==='EST') gsize.set(p.group,(gsize.get(p.group)||0)+1); });
  const gmax=Math.max(...gsize.values());
  const hin=S.hinges.filter(h=>sel.includes(h.rot)), groups=[...new Set(hin.map(h=>S.parts[h.est].group))];
  const incomplete=groups.filter(g=>gsize.get(g)<gmax).length;
  const vs=sel.map(i=>cen(i)[1]), vc=(Math.min(...vs)+Math.max(...vs))/2;
  const Vc=Math.PI*P.R*P.R*G.Hc/P.Nc;
  G0=G; const md=makeModel(C,P.k0,P.kth0,P.closed,Vc), pth=md.path();
  return {S,sel,hin,groups,incomplete,uc,vc,Vc,pth,B,nPer};
}
