/* ---------- three.js ---------- */
const vp=$('vp');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
vp.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,1,0.01,1000);
const controls=new THREE.OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=0.08;
scene.add(new THREE.HemisphereLight(0xffffff,0x445566,0.72));
const dl=new THREE.DirectionalLight(0xffffff,0.75); dl.position.set(1,1.4,0.8); scene.add(dl);
const dl2=new THREE.DirectionalLight(0xffffff,0.3); dl2.position.set(-1,-0.4,-1); scene.add(dl2);
const M={
  surf:new THREE.MeshStandardMaterial({transparent:true,opacity:0.2,side:THREE.DoubleSide,depthWrite:false,roughness:0.9}),
  patch:new THREE.MeshBasicMaterial({transparent:true,opacity:0.3,side:THREE.DoubleSide,depthWrite:false}),
  rim:new THREE.LineBasicMaterial(),
  mesh:new THREE.LineBasicMaterial({transparent:true,opacity:0.85}),
  meshFaint:new THREE.LineBasicMaterial({transparent:true,opacity:0.3}),
  lat:new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:0.6,metalness:0.05,flatShading:true}),
  rot:new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:0.5,metalness:0.05,flatShading:true}),
  cut:new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),
  hin:new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:0.4,flatShading:true}),
  bulk:new THREE.MeshStandardMaterial({transparent:true,opacity:0.45,side:THREE.DoubleSide,depthWrite:false,roughness:0.35,metalness:0.3}),
  pin:new THREE.MeshStandardMaterial({roughness:0.3,metalness:0.5}),
  dev:new THREE.MeshStandardMaterial({color:'#C9A227',roughness:0.35,metalness:0.6}),
  damp:new THREE.MeshStandardMaterial({color:'#7A8591',transparent:true,opacity:0.55,roughness:0.4,metalness:0.4}),
  umb:new THREE.MeshStandardMaterial({vertexColors:true,transparent:true,opacity:0.42,side:THREE.DoubleSide,depthWrite:false,roughness:0.45,metalness:0.1,flatShading:true})
};
M.lat.vertexColors=true;
const grp={surf:new THREE.Group(),mesh:new THREE.Group(),lat:new THREE.Group(),rot:new THREE.Group(),cut:new THREE.Group(),hin:new THREE.Group(),bulkB:new THREE.Group(),bulkT:new THREE.Group(),umb:new THREE.Group()};
Object.values(grp).forEach(g=>scene.add(g));
let grid=null;
const clearGroup=g=>{while(g.children.length){const o=g.children.pop(); o.geometry&&o.geometry.dispose();}};

function applyTheme(){
  scene.background=new THREE.Color(tok('--vp'));
  M.surf.color.set(tok('--accent')); M.rim.color.set(tok('--accent')); M.patch.color.set(tok('--accent'));
  M.mesh.color.set(tok('--accent')); M.meshFaint.color.set(tok('--accent'));
  M.lat.color.set('#ffffff'); M.rot.color.set(tok(cur&&cur.P.type==='hex'?'--rothex':'--rot')); M.bulk.color.set(tok('--bulk')); M.pin.color.set(tok('--hinge'));
  recolorLat(); if(cur) renderRowsTable(cur.P,cur.A.G); M.cut.color.set(tok('--cut')); M.hin.color.set(tok('--hinge'));
  $('swLat').style.background=tok('--lat'); $('swRot').style.background=tok('--rot');
  $('swCut').style.background=tok('--cut'); $('swHin').style.background=tok('--hinge');
  if(grid) grid.material.color=new THREE.Color(tok('--vpgrid'));
  drawCell(); drawChart(); drawProfile(); if(typeof bldTheme==='function'){ bldTheme(); drawBChart(); } if(typeof cbTheme==='function'){ cbTheme(); drawCChart(); }
  if(typeof PV!=='undefined'&&PV){ PV.sc.background=new THREE.Color(tok('--vp')); if(PRINT&&PV_MODE==='asm') buildPV(); }
  const sw=document.getElementById('swPRig'); if(sw) sw.style.background='linear-gradient(90deg,'+tok('--ythin')+','+tok('--ythick')+')';
}

let cur=null, HV=1;
const mapP=(u,v,r,R)=>{const a=u/R; return [r*Math.cos(a), v-HV/2, -r*Math.sin(a)];};
const meshFrom=(pos,mat)=>{const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.computeVertexNormals(); return new THREE.Mesh(g,mat);};
const linesFrom=(pos,mat)=>{const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); return new THREE.LineSegments(g,mat);};

function buildCylinder(R,H){
  clearGroup(grp.surf);
  grp.surf.add(new THREE.Mesh(new THREE.CylinderGeometry(R,R,H,160,1,true),M.surf));
  for(const y of [-H/2,H/2]){
    const pts=[]; for(let k=0;k<=160;k++){const a=k/160*Math.PI*2; pts.push(new THREE.Vector3(R*Math.cos(a),y,R*Math.sin(a)));}
    grp.surf.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),M.rim));
  }
  if(grid){scene.remove(grid); grid.geometry.dispose();}
  const s=Math.max(R*5,H*1.4);
  grid=new THREE.GridHelper(s,20,tok('--vpgrid'),tok('--vpgrid'));
  grid.position.y=-H/2-H*0.03; scene.add(grid);
}
function pushCurve(pos,u0,v0,u1,v1,r,R){
  const n=Math.max(1,Math.ceil(Math.abs(u1-u0)/R/(2*D2R)));
  for(let i=0;i<n;i++){const a=i/n,b=(i+1)/n; pos.push(...mapP(u0+(u1-u0)*a,v0+(v1-v0)*a,r,R),...mapP(u0+(u1-u0)*b,v0+(v1-v0)*b,r,R));}
}
function buildMesh(P,G){
  clearGroup(grp.mesh);
  const R=P.R, r=R*1.003, L=G.L, pos=[], faint=[];
  if(P.type==='hex'){
    const h=S3/2*L;
    for(let j=0;j<=G.Na;j++) pushCurve(pos,0,j*L,G.C,j*L,r,R);
    for(let i=0;i<2*P.Nc;i++) pushCurve(i%2?faint:pos,i*h,0,i*h,G.Heff,r,R);
  } else if(P.type==='square'){
    for(let i=0;i<2*P.Nc;i++) pushCurve(i%2?faint:pos,i*L,0,i*L,G.Heff,r,R);
    for(let j=0;j<=2*G.Na;j++) pushCurve(j%2?faint:pos,0,j*L,G.C,j*L,r,R);
  } else {
    const h=S3/2*L;
    for(let rr=0;rr<=2*G.Na;rr++) pushCurve(rr%2?faint:pos,0,rr*h,G.C,rr*h,r,R);
    for(let rr=0;rr<2*G.Na;rr++)for(let k=0;k<2*P.Nc;k++){
      const x0=k*L+rr*L/2;
      pushCurve(k%2===0?pos:faint,x0,rr*h,x0+L/2,(rr+1)*h,r,R);
      pushCurve(faint,x0+L,rr*h,x0+L/2,(rr+1)*h,r,R);
    }
  }
  grp.mesh.add(linesFrom(pos,M.mesh)); grp.mesh.add(linesFrom(faint,M.meshFaint));
  const pp=[], rr=R*1.0015, n=10, j0=SELROW*G.Hc;
  const corner=P.type==='hex'?[[0,j0],[S3*L,j0],[S3*L,j0+L],[0,j0+L]]:P.type==='square'?[[0,j0],[2*L,j0],[2*L,j0+2*L],[0,j0+2*L]]:[[SELROW*L,j0],[SELROW*L+2*L,j0],[SELROW*L+3*L,j0+S3*L],[SELROW*L+L,j0+S3*L]];
  const bil=(a,b)=>{const p0=corner[0],p1=corner[1],p3=corner[3]; return [p0[0]+(p1[0]-p0[0])*a+(p3[0]-p0[0])*b, p0[1]+(p1[1]-p0[1])*a+(p3[1]-p0[1])*b];};
  for(let a=0;a<n;a++)for(let b=0;b<n;b++){
    const q=[bil(a/n,b/n),bil((a+1)/n,b/n),bil((a+1)/n,(b+1)/n),bil(a/n,(b+1)/n)].map(p=>mapP(p[0],p[1],rr,R));
    pp.push(...q[0],...q[1],...q[2],...q[0],...q[2],...q[3]);
  }
  const gp=new THREE.BufferGeometry(); gp.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));
  grp.mesh.add(new THREE.Mesh(gp,M.patch));
}
function buildCuts(P,G,S){
  clearGroup(grp.cut);
  const R=P.R, ro=R+P.s/2, ri=R-P.s/2, dA=3*D2R;
  const eps=P.s*0.03, wc=Math.max(P.hw,G.L*0.018)/2, cp=[];
  for(const c of S.cuts){
    const du=c[2]-c[0],dv=c[3]-c[1],len=Math.hypot(du,dv); if(len<1e-9) continue;
    const nu=-dv/len*wc,nv=du/len*wc, n=Math.max(1,Math.ceil(Math.abs(du)/R/dA));
    for(const r of [ro+eps,ri-eps]) for(let i=0;i<n;i++){
      const u0=c[0]+du*i/n,v0=c[1]+dv*i/n,u1=c[0]+du*(i+1)/n,v1=c[1]+dv*(i+1)/n;
      const A1=mapP(u0+nu,v0+nv,r,R),B1=mapP(u1+nu,v1+nv,r,R),C1=mapP(u1-nu,v1-nv,r,R),D1=mapP(u0-nu,v0-nv,r,R);
      cp.push(...A1,...B1,...C1,...A1,...C1,...D1);
    }
  }
  grp.cut.add(meshFrom(cp,M.cut));
}

/* ---------- geometria deformabile: modelli 3D per parte, moto rigido, replica per settori ---------- */
function tplPlate(out,pts,R,dA,hs){
  const tri=(a,b,c,dr)=>out.push(a[0],a[1],dr,b[0],b[1],dr,c[0],c[1],dr);
  for(let k=1;k<pts.length-1;k++){
    const a=pts[0],b=pts[k],c=pts[k+1];
    const ext=Math.max(Math.abs(b[0]-a[0]),Math.abs(c[0]-a[0]),Math.abs(c[0]-b[0]));
    const n=Math.min(12,Math.max(1,Math.ceil(ext/R/dA)));
    const P=(i,j)=>[a[0]+(b[0]-a[0])*i/n+(c[0]-a[0])*j/n, a[1]+(b[1]-a[1])*i/n+(c[1]-a[1])*j/n];
    for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){
      const p00=P(i,j),p10=P(i+1,j),p01=P(i,j+1);
      tri(p00,p10,p01,hs); tri(p00,p01,p10,-hs);
      if(i+j<n-1){const p11=P(i+1,j+1); tri(p10,p11,p01,hs); tri(p10,p01,p11,-hs);}
    }
  }
  for(let k=0;k<pts.length;k++){
    const a=pts[k],b=pts[(k+1)%pts.length], n=Math.max(1,Math.ceil(Math.abs(b[0]-a[0])/R/dA));
    for(let i=0;i<n;i++){
      const p=[a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n], q=[a[0]+(b[0]-a[0])*(i+1)/n,a[1]+(b[1]-a[1])*(i+1)/n];
      out.push(p[0],p[1],hs,q[0],q[1],hs,q[0],q[1],-hs, p[0],p[1],hs,q[0],q[1],-hs,p[0],p[1],-hs);
    }
  }
}
function tplHinge(out,H,hr,a){
  const m=10,[u,v]=H;
  for(let q=0;q<m;q++){
    const t0=q/m*2*Math.PI,t1=(q+1)/m*2*Math.PI;
    const x0=u+hr*Math.cos(t0),y0=v+hr*Math.sin(t0),x1=u+hr*Math.cos(t1),y1=v+hr*Math.sin(t1);
    out.push(x0,y0,a,x1,y1,a,x1,y1,-a, x0,y0,a,x1,y1,-a,x0,y0,-a, u,v,a,x0,y0,a,x1,y1,a, u,v,-a,x1,y1,-a,x0,y0,-a);
  }
}
let COL=null, SOLV=null, DEF=null;
function buildDeformable(P,G,col){
  ['lat','rot','hin'].forEach(k=>clearGroup(grp[k]));
  const R=P.R, dA=5*D2R, hs=P.s/2, eps=P.s*0.03, hr=Math.max(P.hw/2,G.L*0.028);
  const to3=a=>{const o=new Float32Array(a.length); for(let i=0;i<a.length;i+=3){const r=R+a[i+2], an=a[i]/R; o[i]=r*Math.cos(an); o[i+1]=r*Math.sin(an); o[i+2]=a[i+1];} return o;};
  const T={lat:[],rot:[],hin:[]};
  col.est.forEach(pc=>{const a=[]; tplPlate(a,pc.pts,R,dA,hs); T.lat.push({b:pc.body,m:pc.m,row:pc.row,arr:to3(a)});});
  col.rot.forEach(r=>{const a=[]; tplPlate(a,r.pts,R,dA,hs); T.rot.push({b:r.body,m:0,arr:to3(a)});});
  col.hin.forEach(h=>{const a=[]; tplHinge(a,h.H,hr,hs+2*eps); T.hin.push({b:col.rot[h.c].body,m:0,arr:to3(a)});});
  const geo={};
  for(const k of ['lat','rot','hin']){
    const per=T[k].reduce((s,t)=>s+t.arr.length,0), g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(per*P.Nc),3));
    g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(per*P.Nc),3));
    geo[k]=g; grp[k].add(new THREE.Mesh(g,M[k]));
  }
  DEF={P,G,T,geo,Hh:G.Heff/2,col};
  recolorLat();
}
function recolorLat(){
  if(!DEF) return; const {P,G,T,geo}=DEF, cols=rowColors(P,G), per=T.lat.reduce((s,t)=>s+t.arr.length,0);
  const ca=new Float32Array(per*P.Nc); let w=0;
  for(let s=0;s<P.Nc;s++) for(const t of T.lat){const c=cols[t.row]||cols[0]; for(let i=0;i<t.arr.length;i+=3){ca[w++]=c.r; ca[w++]=c.g; ca[w++]=c.b;}}
  geo.lat.setAttribute('color',new THREE.BufferAttribute(ca,3));
  M.rot.color.set(tok(P.type==='hex'?'--rothex':'--rot'));
  $('swRot').style.background=tok(P.type==='hex'?'--rothex':'--rot');
  $('swLat').style.background=P.type==='hex'?'linear-gradient(90deg,'+tok('--ythin')+','+tok('--ythick')+')':tok('--lat');
}
/* ombrelli esagonali (solo concept, pattern esagonale): un esagono curvo (guscio cilindrico al raggio del suo livello) sopra il nodo di ogni Y, su 4 livelli.
   Livello = (i mod 2) + 2·(j mod 2) negli indici del reticolo delle Y; passando alla colonna vicina j cambia parità,
   quindi servono due serie di modelli (settori pari e dispari). Esagono = passo aperto λL (1 + margine), λ dall'apertura calcolata. */
const UMB_COL=['#4F8FBF','#7FAE45','#D1A23C','#A56BC0'], UMB_MAST=[0.62,0.66,0.70];
function buildUmb(){
  clearGroup(grp.umb); if(!DEF) return; DEF.umb=null;
  const {P,G,col}=DEF; $('umbNote').textContent='';
  if(P.type!=='hex'){ $('vUmbL').hidden=true; return; } $('vUmbL').hidden=false;
  const L=G.L, R=P.R, per=G.per||2*L, H0=0.165*L, DH=0.066*L, tp=0.02*L, mr=0.018*L, marg=0.15;
  let lam=PATH&&PATH.open?Math.cbrt(PATH.open.vr):1.55;
  if(PATH&&PATH.done){ const pT=(+$('pmax').value||0)/PU; if(pT>0){ const st=stateAt(equilibriumFor(pT,0)); lam=Math.max(lam,Math.max(...st.rs)/R); } }
  const mg=Math.max(0.02,Math.min(marg,1.98/lam-1)), D0=lam*L*(1+mg);
  const sets=[[],[]];
  col.bodies.forEach((b,bi)=>{ if(b.kind!=='EST') return;
    const pc=col.est[b.pieces[0]], V=pc.pts[0], u=V[0]+pc.m*per, v=V[1];
    const i=Math.round(u/(S3/2*L)), j=Math.round(v/L-i/2), a=V[0]/R, er=[Math.cos(a),Math.sin(a)], et=[-Math.sin(a),Math.cos(a)];
    for(let sp=0;sp<2;sp++){
      const lvl=(i&1)+2*(((j-sp)%2+2)%2), h=H0+lvl*DH, rr=R+h, rc=D0*rr/R/S3;
      const X=(du,dv,r)=>[r*er[0]+du*et[0], r*er[1]+du*et[1], v+dv];
      // guscio cilindrico: il piatto segue la curvatura del tubo al raggio del suo livello, così resta a distanza costante dai livelli vicini
      const Xc=(du,dv,r)=>{const t=a+du/rr; return [r*Math.cos(t), r*Math.sin(t), v+dv];};
      const pos=[], colr=[], c=new THREE.Color(UMB_COL[lvl]);
      const tri=(p,q,w,cc)=>{pos.push(...p,...q,...w); for(let k=0;k<3;k++) colr.push(cc[0],cc[1],cc[2]);};
      const cl=[c.r,c.g,c.b], nd=3, r1=rr+tp/2, r0=rr-tp/2;
      const hv=[]; for(let k=0;k<6;k++){const t=k*Math.PI/3; hv.push([rc*Math.cos(t),rc*Math.sin(t)]);}
      for(let k=0;k<6;k++){ const A0=[0,0], B0=hv[k], C0=hv[(k+1)%6];
        const Q=(i2,j2)=>[A0[0]+(B0[0]-A0[0])*i2/nd+(C0[0]-A0[0])*j2/nd, A0[1]+(B0[1]-A0[1])*i2/nd+(C0[1]-A0[1])*j2/nd];
        for(let i2=0;i2<nd;i2++) for(let j2=0;j2<nd-i2;j2++){ const p00=Q(i2,j2),p10=Q(i2+1,j2),p01=Q(i2,j2+1);
          tri(Xc(...p00,r1),Xc(...p10,r1),Xc(...p01,r1),cl); tri(Xc(...p00,r0),Xc(...p01,r0),Xc(...p10,r0),cl);
          if(i2+j2<nd-1){const p11=Q(i2+1,j2+1); tri(Xc(...p10,r1),Xc(...p11,r1),Xc(...p01,r1),cl); tri(Xc(...p10,r0),Xc(...p01,r0),Xc(...p11,r0),cl);} }
        for(let e=0;e<nd;e++){ const p=[B0[0]+(C0[0]-B0[0])*e/nd,B0[1]+(C0[1]-B0[1])*e/nd], q2=[B0[0]+(C0[0]-B0[0])*(e+1)/nd,B0[1]+(C0[1]-B0[1])*(e+1)/nd];
          tri(Xc(...p,r0),Xc(...q2,r0),Xc(...q2,r1),cl); tri(Xc(...p,r0),Xc(...q2,r1),Xc(...p,r1),cl); } }
      // asta radiale dal nodo al piatto
      const sq=r=>[X(-mr,-mr,r),X(mr,-mr,r),X(mr,mr,r),X(-mr,mr,r)], m0=sq(R), m1=sq(rr-tp/2+0.001*L);
      for(let k=0;k<4;k++){const k2=(k+1)%4; tri(m0[k],m0[k2],m1[k2],UMB_MAST); tri(m0[k],m1[k2],m1[k],UMB_MAST);}
      const lite=[]; const lt=(p,q,w)=>lite.push(...p,...q,...w), T1=hv.map(p=>Xc(p[0],p[1],r1)), T0=hv.map(p=>Xc(p[0],p[1],r0));
      for(let k2=1;k2<5;k2++){ lt(T1[0],T1[k2],T1[k2+1]); lt(T0[0],T0[k2+1],T0[k2]); }
      for(let k2=0;k2<6;k2++){ const k3=(k2+1)%6; lt(T0[k2],T0[k3],T1[k3]); lt(T0[k2],T1[k3],T1[k2]); }
      sets[sp].push({b:bi,m:pc.m,arr:new Float32Array(pos),col:new Float32Array(colr),lite:new Float32Array(lite)});
    }
  });
  const Nc=P.Nc; let n=0; for(let s2=0;s2<Nc;s2++) for(const t of sets[s2&1]) n+=t.arr.length;
  const g=new THREE.BufferGeometry(), ca=new Float32Array(n); let w=0;
  for(let s2=0;s2<Nc;s2++) for(const t of sets[s2&1]){ ca.set(t.col,w); w+=t.col.length; }
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n),3)); g.setAttribute('color',new THREE.BufferAttribute(ca,3));
  const mesh=new THREE.Mesh(g,M.umb); mesh.renderOrder=2; grp.umb.add(mesh);
  DEF.umb={sets,g};
  $('umbNote').textContent='esagoni '+fmt(D0,2)+' m, 4 livelli'+(Nc%2?' · con N dispari c\'è un giunto con livelli uguali':'');
  if(DEF.q) applyState(DEF.q);
}
/* bulkhead: dischi rigidi alle estremità, perni sui nodi di bordo */
function buildBulk(P,G){
  clearGroup(grp.bulkB); clearGroup(grp.bulkT);
  if(!SOLV||!SOLV.bulk) return;
  const R=P.R, Hh=G.Heff/2, tb=Math.max(P.s*2,G.L*0.05), al=2*Math.PI/P.Nc;
  const disk=()=>new THREE.Mesh(new THREE.CylinderGeometry(R*1.01,R*1.01,tb,128,1,false),M.bulk);
  const d0=disk(); d0.position.y=-Hh-tb/2; grp.bulkB.add(d0);
  const d1=disk(); d1.position.y=Hh+tb/2; grp.bulkT.add(d1);
  const pr=Math.max(P.hw,G.L*0.035), pl=G.L*0.16;
  const pins=(list,top)=>{
    const g=[];
    for(const bi of list){const X=COL.bodies[bi].Xv; const a0=Math.atan2(X[1],X[0]);
      for(let s=0;s<P.Nc;s++){const a=a0+s*al; g.push([R*Math.cos(a),X[2]-Hh,-R*Math.sin(a),a]);}}
    for(const [x,y,z,a] of g){
      const m=new THREE.Mesh(new THREE.CylinderGeometry(pr,pr,pl,12),M.pin);
      m.position.set(x,y,z); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-Math.sin(a),0,-Math.cos(a))); // asse del perno tangente alla circonferenza
      (top?grp.bulkT:grp.bulkB).add(m);
    }
  };
  pins(SOLV.lev0,false); pins(SOLV.levTop,true);
  // dispositivo interno: molla elicoidale e smorzatore lungo l'asse, dal disco inferiore a quello superiore
  DEVM=null;
  if(P.dev&&P.dev.on){
    const Hf=G.Heff, rH=R*0.22, nT=14;
    class Helix extends THREE.Curve{ getPoint(t,tg=new THREE.Vector3()){ const a=2*Math.PI*nT*t; return tg.set(rH*Math.cos(a),t*Hf,rH*Math.sin(a)); } }
    const sp=new THREE.Mesh(new THREE.TubeGeometry(new Helix(),nT*40,R*0.012,8,false),M.dev);
    const dp=new THREE.Mesh(new THREE.CylinderGeometry(R*0.07,R*0.07,Hf,24,1,false),M.damp); dp.geometry.translate(0,Hf/2,0);
    sp.position.y=-Hh; dp.position.y=-Hh; grp.bulkB.add(sp,dp); DEVM={sp,dp,Hf};
  }
}
var DEVM=null;
let isRef=true;
function applyState(q){
  if(!DEF||!SOLV) return;
  const {P,T,geo,Hh}=DEF, Nc=P.Nc, al=2*Math.PI/Nc, bodies=COL.bodies;
  const poses=bodies.map((b,i)=>SOLV.pose(q,i));
  grp.bulkT.position.y=SOLV.bulk?q[SOLV.izt]:0;
  if(DEVM&&SOLV.bulk){ const f=Math.max(0.05,(DEVM.Hf+q[SOLV.izt])/DEVM.Hf); DEVM.sp.scale.y=f; DEVM.dp.scale.y=f; }
  let mx=0; for(let i=0;i<q.length;i++) mx=Math.max(mx,Math.abs(q[i]));
  isRef=mx<1e-9;
  const aff=(t)=>{
    const Pp=poses[t.b], c0=bodies[t.b].c0, Qc0=mv(Pp.Q,c0), bb=[Pp.c[0]-Qc0[0],Pp.c[1]-Qc0[1],Pp.c[2]-Qc0[2]];
    if(t.m===0) return {A:Pp.Q,b:bb};
    const Rm=rz(t.m*al), Rmi=rz(-t.m*al); return {A:mm(mm(Rmi,Pp.Q),Rm), b:mv(Rmi,bb)};
  };
  for(const k of ['lat','rot','hin']){
    const pos=geo[k].attributes.position.array; let w=0;
    const AF=T[k].map(aff);
    for(let s=0;s<Nc;s++){
      const Rs=rz(s*al);
      for(let ti=0;ti<T[k].length;ti++){
        const A=mm(Rs,AF[ti].A), b=mv(Rs,AF[ti].b), a=T[k][ti].arr, len=a.length;
        for(let i=0;i<len;i+=3){
          const X=a[i],Y=a[i+1],Z=a[i+2];
          const x=A[0]*X+A[1]*Y+A[2]*Z+b[0], y=A[3]*X+A[4]*Y+A[5]*Z+b[1], z=A[6]*X+A[7]*Y+A[8]*Z+b[2];
          pos[w++]=x; pos[w++]=z-Hh; pos[w++]=-y;
        }
      }
    }
    geo[k].attributes.position.needsUpdate=true; geo[k].computeBoundingSphere();
  }
  DEF.q=q;
  if(DEF.umb){
    const {sets,g}=DEF.umb, pos=g.attributes.position.array; let w=0; const AFs=[sets[0].map(aff),sets[1].map(aff)];
    for(let s=0;s<Nc;s++){ const Rs=rz(s*al), L2=sets[s&1], AF=AFs[s&1];
      for(let ti=0;ti<L2.length;ti++){ const A=mm(Rs,AF[ti].A), b=mv(Rs,AF[ti].b), a=L2[ti].arr;
        for(let i=0;i<a.length;i+=3){ const X=a[i],Y=a[i+1],Z=a[i+2];
          pos[w++]=A[0]*X+A[1]*Y+A[2]*Z+b[0]; const y=A[3]*X+A[4]*Y+A[5]*Z+b[1]; pos[w++]=A[6]*X+A[7]*Y+A[8]*Z+b[2]-Hh; pos[w++]=-y; } } }
    g.attributes.position.needsUpdate=true; g.computeBoundingSphere();
  }
  refreshVis();
}
function refreshVis(){
  grp.surf.visible=$('vSurf').checked&&isRef; grp.mesh.visible=$('vMesh').checked&&isRef; grp.cut.visible=$('vCut').checked&&isRef;
  grp.lat.visible=$('vLat').checked; grp.rot.visible=$('vRot').checked; grp.hin.visible=$('vHin').checked;
  grp.bulkB.visible=grp.bulkT.visible=$('vBulk').checked; grp.umb.visible=$('vUmb').checked;
  if(typeof cbRefreshVis==='function') cbRefreshVis();
}

function fitView(scale){
  if(!cur) return; const f=(typeof scale==='number'&&scale>0)?scale:1;
  const H=(stage>=2?cur.A.G.Heff:cur.P.H), s=Math.max(cur.P.R*f*1.35,H*0.7*Math.max(1,f*0.9));
  camera.position.set(s*1.9,s*0.85,s*2.3);
  camera.near=s*0.005; camera.far=s*200; camera.updateProjectionMatrix();
  controls.minDistance=s*0.05; controls.maxDistance=s*40;
  controls.target.set(0,0,0); controls.update();
}
function resize(){
  const w=vp.clientWidth,h=vp.clientHeight; if(!w||!h) return;
  renderer.setSize(w,h,false); renderer.domElement.style.width=w+'px'; renderer.domElement.style.height=h+'px';
  camera.aspect=w/h; camera.updateProjectionMatrix();
}
window.addEventListener('resize',()=>{drawChart(); drawProfile();});
