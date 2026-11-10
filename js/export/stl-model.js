/* STL dell'intera struttura come appare nella vista (parti visibili), in mm, asse del tubo lungo z, base a z = 0 */
function sceneSTL(name){
  scene.updateMatrixWorld(true);
  const Hh=cur.A.G.Heff/2, meshes=[];
  for(const k of ['lat','rot','hin','bulkB','bulkT','umb']){ const g=grp[k]; if(!g||!g.visible) continue; g.traverse(o=>{ if(o.isMesh&&o.visible&&o.geometry&&o.geometry.attributes.position) meshes.push(o); }); }
  let nt=0; for(const o of meshes){ const geo=o.geometry; nt+=Math.floor((geo.index?geo.index.count:geo.attributes.position.count)/3); }
  const buf=new ArrayBuffer(84+50*nt), dv=new DataView(buf), hdr=('Tubo Auxetico '+name).slice(0,79);
  for(let i=0;i<hdr.length;i++) dv.setUint8(i,hdr.charCodeAt(i)&127); dv.setUint32(80,nt,true);
  const v=new THREE.Vector3(); let off=84; const A=[0,0,0],B=[0,0,0],C=[0,0,0];
  const P=(pos,i,m,o)=>{ v.fromBufferAttribute(pos,i).applyMatrix4(m); o[0]=v.x*1000; o[1]=-v.z*1000; o[2]=(v.y+Hh)*1000; };
  for(const o of meshes){
    const geo=o.geometry, pos=geo.attributes.position, idx=geo.index, m=o.matrixWorld, n=idx?idx.count:pos.count;
    for(let t=0;t+2<n;t+=3){
      P(pos,idx?idx.getX(t):t,m,A); P(pos,idx?idx.getX(t+1):t+1,m,B); P(pos,idx?idx.getX(t+2):t+2,m,C);
      const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],wx=C[0]-A[0],wy=C[1]-A[1],wz=C[2]-A[2];
      let nx=uy*wz-uz*wy, ny=uz*wx-ux*wz, nz=ux*wy-uy*wx; const l=Math.hypot(nx,ny,nz)||1;
      for(const q of [[nx/l,ny/l,nz/l],A,B,C]){ dv.setFloat32(off,q[0],true); dv.setFloat32(off+4,q[1],true); dv.setFloat32(off+8,q[2],true); off+=12; }
      dv.setUint16(off,0,true); off+=2;
    }
  }
  return {buf,nt};
}
/* STL leggero: ogni corpo rigido come un solo prisma (Y unite in un poligono), vertici sul cilindro senza suddivisioni,
   niente cerniere né perni; bulkhead a 48 lati; ombrelli a 20 triangoli. Unità mm, asse z, base a z = 0. */
function lightSTL(q,name){
  const P=cur.P, G=cur.A.G, R=P.R, hs=P.s/2, Nc=P.Nc, al=2*Math.PI/Nc, per=COL.per, bodies=COL.bodies;
  const poses=bodies.map((b,i)=>SOLV.pose(q,i)), out=[];
  const X3=(u,v,dr)=>{const a=u/R, r=R+dr; return [r*Math.cos(a),r*Math.sin(a),v];};
  const Tb=(bi,X)=>{ const Pp=poses[bi], c0=bodies[bi].c0, r=mv(Pp.Q,[X[0]-c0[0],X[1]-c0[1],X[2]-c0[2]]); return [Pp.c[0]+r[0],Pp.c[1]+r[1],Pp.c[2]+r[2]]; };
  const bodyTris=[];   // triangoli di una colonna nel riferimento del tubo
  const prism=(bi,pts)=>{
    let ar=0; for(let i=0;i<pts.length;i++){const p=pts[i],q2=pts[(i+1)%pts.length]; ar+=p[0]*q2[1]-q2[0]*p[1];} if(ar<0) pts=pts.slice().reverse();
    const fl=[]; for(const p of pts) fl.push(p[0],p[1]); const idx=(typeof earcut!=='undefined')?earcut(fl):(()=>{const o=[]; for(let i=1;i<pts.length-1;i++) o.push(0,i,i+1); return o;})();
    const top=pts.map(p=>Tb(bi,X3(p[0],p[1],hs))), bot=pts.map(p=>Tb(bi,X3(p[0],p[1],-hs)));
    for(let t=0;t<idx.length;t+=3){ bodyTris.push([top[idx[t]],top[idx[t+1]],top[idx[t+2]]],[bot[idx[t]],bot[idx[t+2]],bot[idx[t+1]]]); }
    for(let i=0;i<pts.length;i++){ const j=(i+1)%pts.length; bodyTris.push([bot[i],bot[j],top[j]],[bot[i],top[j],top[i]]); }
  };
  if($('vRot').checked) COL.rot.forEach(r=>prism(r.body,r.pts));
  if($('vLat').checked){
    const byBody=new Map(); COL.est.forEach(pc=>{ if(!byBody.has(pc.body)) byBody.set(pc.body,[]); byBody.get(pc.body).push(pc.pts.map(p=>[p[0]+pc.m*per,p[1]])); });
    const CL=typeof ClipperLib!=='undefined'?ClipperLib:null, SCc=1e6;
    for(const [bi,polys] of byBody){
      let res=null;
      if(CL){ const c=new CL.Clipper(); c.AddPaths(polys.map(pp=>pp.map(p=>({X:Math.round(p[0]*SCc),Y:Math.round(p[1]*SCc)}))),CL.PolyType.ptSubject,true);
        const so=new CL.Paths(); c.Execute(CL.ClipType.ctUnion,so,CL.PolyFillType.pftNonZero,CL.PolyFillType.pftNonZero);
        res=CL.Clipper.CleanPolygons(so,SCc*1e-5).filter(pa=>pa.length>=3).map(pa=>pa.map(p=>[p.X/SCc,p.Y/SCc])); }
      for(const pp of (res&&res.length?res:polys)) prism(bi,pp);
    }
  }
  const push=t=>out.push(t);
  for(let s2=0;s2<Nc;s2++){ const Rs=rz(s2*al); for(const t of bodyTris) push(t.map(p=>mv(Rs,p))); }
  // ombrelli (concept)
  if($('vUmb').checked&&DEF&&DEF.umb){
    const aff=t=>{ const Pp=poses[t.b], c0=bodies[t.b].c0, Qc0=mv(Pp.Q,c0), bb=[Pp.c[0]-Qc0[0],Pp.c[1]-Qc0[1],Pp.c[2]-Qc0[2]]; if(t.m===0) return {A:Pp.Q,b:bb}; const Rm=rz(t.m*al), Rmi=rz(-t.m*al); return {A:mm(mm(Rmi,Pp.Q),Rm),b:mv(Rmi,bb)}; };
    for(let s2=0;s2<Nc;s2++){ const Rs=rz(s2*al); for(const t of DEF.umb.sets[s2&1]){ const f=aff(t), A=mm(Rs,f.A), b=mv(Rs,f.b), a=t.lite;
      for(let i=0;i<a.length;i+=9){ const V=k=>{const X=[a[i+k],a[i+k+1],a[i+k+2]], y=mv(A,X); return [y[0]+b[0],y[1]+b[1],y[2]+b[2]];}; push([V(0),V(3),V(6)]); } } }
  }
  // bulkhead
  if($('vBulk').checked&&SOLV.bulk){
    const tb=Math.max(P.s*2,G.L*0.05), Rb=R*1.01, n=48, zt=G.Heff+q[SOLV.izt];
    const disk=(z0,z1)=>{ const c0=[0,0,z0], c1=[0,0,z1]; for(let i=0;i<n;i++){ const a=2*Math.PI*i/n, b2=2*Math.PI*(i+1)/n, p0=[Rb*Math.cos(a),Rb*Math.sin(a)], p1=[Rb*Math.cos(b2),Rb*Math.sin(b2)];
      push([c1,[p0[0],p0[1],z1],[p1[0],p1[1],z1]]); push([c0,[p1[0],p1[1],z0],[p0[0],p0[1],z0]]); push([[p0[0],p0[1],z0],[p1[0],p1[1],z0],[p1[0],p1[1],z1]]); push([[p0[0],p0[1],z0],[p1[0],p1[1],z1],[p0[0],p0[1],z1]]); } };
    disk(-tb,0); disk(zt,zt+tb);
  }
  const buf=new ArrayBuffer(84+50*out.length), dv=new DataView(buf), hdr=('Tubo Auxetico '+name).slice(0,79);
  for(let i=0;i<hdr.length;i++) dv.setUint8(i,hdr.charCodeAt(i)&127); dv.setUint32(80,out.length,true); let off=84;
  for(const [A,B,C] of out){ const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],wx=C[0]-A[0],wy=C[1]-A[1],wz=C[2]-A[2]; let nx=uy*wz-uz*wy, ny=uz*wx-ux*wz, nz=ux*wy-uy*wx; const l=Math.hypot(nx,ny,nz)||1;
    for(const q2 of [[nx/l,ny/l,nz/l],A.map(v=>v*1000),B.map(v=>v*1000),C.map(v=>v*1000)]){ dv.setFloat32(off,q2[0],true); dv.setFloat32(off+4,q2[1],true); dv.setFloat32(off+8,q2[2],true); off+=12; }
    dv.setUint16(off,0,true); off+=2; }
  return {buf,nt:out.length};
}
async function exportModelSTL(){
  const msg=$('stlMsg');
  if(!PATH||!PATH.done){ msg.textContent='Calcola prima l\'apertura (pulsante "Calcola apertura").'; return; }
  if(!canSaveFiles()){ msg.textContent='Il salvataggio funziona nella versione offline del tool.'; return; }
  stopSim(); const k0=SIM.k; msg.textContent='Preparo gli STL…'; await new Promise(r=>setTimeout(r,20));
  try{
    const pT=Math.max(1e-9,(+$('pmax').value||0)/PU), kf=equilibriumFor(pT,0), stF=stateAt(kf), pl=fmtP(pT*PU).replace(',','.');
    const lite=$('stlMode').value==='lite', q0=new Float64Array(SOLV.n);
    let c,o;
    if(lite){ c=lightSTL(q0,'chiusa'); o=lightSTL(stF.q,'aperta '+pl+' atm'); }
    else { applyState(q0); c=sceneSTL('chiusa'); applyState(stF.q); o=sceneSTL('aperta '+pl+' atm'); }
    const enc=new TextEncoder(), P=cur.P, G=cur.A.G;
    const files=[{name:'tubo_chiuso.stl',data:c.buf},{name:'tubo_aperto_'+pl+'atm.stl',data:o.buf},
      {name:'LEGGIMI.txt',data:enc.encode(['Tubo Auxetico - modelli STL della struttura','',
        'Unita: mm, scala reale. Asse del tubo lungo z, bulkhead inferiore a z = 0.',
        'tubo_chiuso.stl: configurazione chiusa (riferimento, p = 0).',
        'tubo_aperto_'+pl+'atm.stl: equilibrio a p = '+pl+' atm, V/V0 = '+stF.vr.toFixed(3)+'.',
        'Sono incluse solo le parti visibili nella vista 3D al momento dell\'esportazione (Y, triangoli, cerniere, bulkhead, MMOD).',
        lite?'Versione leggera: ogni Y e ogni triangolo e un solo prisma con i vertici sul cilindro (nessuna suddivisione della curvatura), senza cerniere ne perni; bulkhead a 48 lati.':'Versione completa: la stessa geometria della vista 3D (piastre curve suddivise, cerniere, perni).',
        'Ogni piastra e un solido separato: i file servono per visualizzazione, rendering e verifiche di ingombro, non per la stampa (per quella usa la pagina Stampa 3D).',
        'Configurazione: tipo '+P.type+', R = '+P.R+' m, H = '+G.Heff.toFixed(3)+' m, Nc = '+P.Nc+', Na = '+G.Na+'.'].join('\r\n'))}];
    const ok=await saveBlob(makeZip(files),'tubo_auxetico_stl.zip');
    msg.textContent=ok?'Salvato tubo_auxetico_stl.zip · chiusa '+c.nt.toLocaleString('it-IT')+' triangoli, aperta '+o.nt.toLocaleString('it-IT')+' triangoli ('+((c.buf.byteLength+o.buf.byteLength)/1048576).toFixed(0)+' MB).':'Salvataggio non riuscito: usa la versione offline.';
  }catch(e){ msg.textContent='Esportazione non riuscita: '+e.message; }
  finally{ setK(k0); }
}
$('bStl').onclick=exportModelSTL;
$('bCellSvg').onclick=()=>saveCell('svg'); $('bCellPng').onclick=()=>saveCell('png');
$('bSheet').onclick=exportSheet;
