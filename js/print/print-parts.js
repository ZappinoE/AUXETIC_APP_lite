/* ===================== STAMPA 3D: componenti, deduplicazione, STL, distinta ===================== */
/* Richiede: ClipperLib (clipper-lib), earcut. Unità interne: mm alla scala di stampa. */
function buildPrintParts(P,G,col,Bf,o){
  const CL=(typeof ClipperLib!=='undefined')?ClipperLib:require('clipper-lib');
  const EC=(typeof earcut!=='undefined')?earcut:require('earcut');
  const k=o.scale*1000;                          // m reali -> mm di stampa
  const SC=1000;                                 // mm -> interi Clipper (µm)
  const Rp=P.R*k, sp=o.sp, per=(G.per||2*G.L)*k, g=o.gap, dA=(o.dA||8)*Math.PI/180;
  // inserto TPU (come nella foto): bottone nel triangolo, striscia lungo il taglio, bottone nella Y
  const rh=o.head, wn=o.neck, clr=o.clr, wall=o.wall||0.4, lf=o.lf||1.2, wp=o.wp||1.6, dvN=o.dvN||1.0, dvW=o.dvW||2.2, dvL=o.dvL||1.8;

  const N=P.type==='square'?4:3;
  const toI=p=>({X:Math.round(p[0]*SC),Y:Math.round(p[1]*SC)});
  const ring=pts=>pts.map(p=>toI(p));
  const circle=(c,r,n=28)=>{const a=[]; for(let i=0;i<n;i++){const t=2*Math.PI*i/n; a.push(toI([c[0]+r*Math.cos(t),c[1]+r*Math.sin(t)]));} return a;};
  const S2=p=>[p[0]*k,p[1]*k];
  function clip(subj,clp,type){
    const c=new CL.Clipper(); c.AddPaths(subj,CL.PolyType.ptSubject,true); if(clp&&clp.length) c.AddPaths(clp,CL.PolyType.ptClip,true);
    const s=new CL.Paths(); c.Execute(type,s,CL.PolyFillType.pftNonZero,CL.PolyFillType.pftNonZero); return s;
  }
  const union=a=>clip(a,null,CL.ClipType.ctUnion);
  const diff=(a,b)=>b.length?clip(a,b,CL.ClipType.ctDifference):a;
  const uni2=(a,b)=>clip(a.concat(b),null,CL.ClipType.ctUnion);
  function kerf(segs){
    const co=new CL.ClipperOffset(2,0.03*SC); for(const s of segs) co.AddPath([toI(s[0]),toI(s[1])],CL.JoinType.jtRound,CL.EndType.etOpenRound);
    const out=new CL.Paths(); co.Execute(out,g/2*SC); return out;
  }
  // --- tagli e cerniere della colonna, replicati sui settori vicini (mm di stampa) ---
  const T=blockTransforms(Object.assign({},P,{Nc:1}),G);
  const cutsH=[];
  for(const tr of T){const B=Bf(tr); for(let i=0;i<N;i++){const a=S2(tr.f(B.A[i])), h=S2(tr.f(B.H[(i+1)%N])); cutsH.push([a,h]);}}
  // giunto a tridente (come il pin di esempio): mozzo alla punta del braccio della Y, un ramo lungo l'asse del braccio
  // fino al bottone nella Y, un ramo per ciascun triangolo: lungo il taglio fino allo spigolo e poi lungo la bisettrice fino al bottone
  const un=(a,b)=>{const l=Math.hypot(b[0]-a[0],b[1]-a[1]); return [(b[0]-a[0])/l,(b[1]-a[1])/l];};
  const hinges=col.hin.map((h,i)=>{
    const tri=col.rot[h.c].pts, Nt=tri.length; let j=0,bd=1e18; tri.forEach((q,qi)=>{const dd=Math.hypot(q[0]-h.H[0],q[1]-h.H[1]); if(dd<bd){bd=dd;j=qi;}});
    const H=S2(tri[j]), Hp=S2(tri[(j-1+Nt)%Nt]), Hn=S2(tri[(j+1)%Nt]);
    const sP=un(H,Hp), sN=un(H,Hn); let bis=[sP[0]+sN[0],sP[1]+sN[1]]; const lb=Math.hypot(...bis); bis=[bis[0]/lb,bis[1]/lb];
    const side=Math.hypot(Hp[0]-H[0],Hp[1]-H[1]), al=Math.acos(Math.max(-1,Math.min(1,sP[0]*sN[0]+sP[1]*sN[1])));
    // d0: profondità (lungo la bisettrice) alla quale il materiale del triangolo arriva a toccare il canale della striscia;
    // fino a lì la striscia è già libera. Tratto libero nel triangolo: la punta è tagliata a d0 + lte, e se serve il bottone
    // scende più in profondità (senza toccare i bottoni degli altri spigoli: d ≤ (lato − 2(r+gioco) − parete)/√3)
    const d0=(g/2+(wn/2+clr)*Math.cos(al/2))/Math.sin(al/2), cl0=rh+clr+0.3;
    const dMax=Math.max(o.dTri,(side-2*(rh+clr)-wall)/S3), dT=Math.min(dMax,Math.max(o.dTri,d0+(o.lt||0)+cl0));
    const lte=Math.max(0,Math.min(o.lt||0,dT-cl0-d0,0.2*side));
    const T=[H[0]+bis[0]*dT,H[1]+bis[1]*dT];
    const pc=col.est[h.e].pts, V=S2(pc[0]), A=S2(pc[3]), uA=un(A,V);
    const B=[A[0]+uA[0]*o.dY,A[1]+uA[1]*o.dY];
    // tratto libero allo spigolo: la striscia lascia l'aggancio nella Y a distanza lf dallo spigolo H
    const dAH=Math.hypot(A[0]-H[0],A[1]-H[1]), lfe=Math.min(lf,0.75*dAH), eHA=un(H,A), Ph=[H[0]+eHA[0]*lfe,H[1]+eHA[1]*lfe];
    // tratto libero dentro il triangolo: la punta del triangolo è tagliata a lte dallo spigolo lungo la bisettrice, così la
    // striscia esce libera dalla sede (al più 1/5 del lato, e lasciando almeno 0,6 mm di sede stretta prima del bottone)
    const dn=d0+lte, pr=[-bis[1],bis[0]], Wn=2*dn+wn+2, Q=(a,b)=>[H[0]+bis[0]*a+pr[0]*b,H[1]+bis[1]*a+pr[1]*b];
    const notch=lte>1e-3?[Q(dn,Wn),Q(dn,-Wn),Q(-Wn,-Wn),Q(-Wn,Wn)]:null;
    return {i,c:h.c,e:h.e,m:col.est[h.e].m,body:col.est[h.e].body,H,T,A,B,uA,Ph,lfe,lte,d0,dT,free:lfe+d0+lte,notch,dAH,quad:pc.map(S2),side};
  });
  // un inserto per ogni punta di braccio: cerniere con stessa Y e stesso punto A
  const tipMap=new Map();
  // (le due cerniere di una punta possono stare in copie della colonna diverse: la chiave usa u modulo il periodo)
  const shH=(h,dx)=>{ if(Math.abs(dx)<1e-9) return h; const sh=p=>[p[0]+dx,p[1]]; return Object.assign({},h,{H:sh(h.H),T:sh(h.T),A:sh(h.A),B:sh(h.B),Ph:sh(h.Ph),quad:h.quad.map(sh)}); };
  const tipList=[];
  for(const h of hinges){ let g2=null, dx=0;
    for(const tp of tipList){ if(tp.body!==h.body||Math.abs(tp.A[1]-h.A[1])>0.01) continue; const d=tp.A[0]-h.A[0], n=Math.round(d/per); if(Math.abs(d-n*per)<0.01){g2=tp; dx=n*per; break;} }
    if(!g2){g2={A:h.A,B:h.B,uA:h.uA,hs:[],body:h.body}; tipList.push(g2); tipMap.set(tipList.length,g2);} g2.hs.push(shH(h,dx)); }
  const pathOff=(paths,half)=>{const co=new CL.ClipperOffset(2,0.02*SC); for(const pts of paths) co.AddPath(pts.map(toI),CL.JoinType.jtRound,CL.EndType.etOpenRound); const out=new CL.Paths(); co.Execute(out,half*SC); return out;};
  const polyOff=(paths,d)=>{ if(!paths.length) return []; const co=new CL.ClipperOffset(2,0.02*SC); co.AddPaths(paths,CL.JoinType.jtRound,CL.EndType.etClosedPolygon); const out=new CL.Paths(); co.Execute(out,d*SC); return out;};
  const toF=paths=>paths.map(pa=>pa.map(p=>[p.X/SC,p.Y/SC]));
  const areaI=pa=>Math.abs(CL.Clipper.Area(pa))/(SC*SC);
  // aggancio largo nella Y: fascia di profondità wp lungo il taglio, dalla punta A fino a lf dallo spigolo,
  // tenuta a distanza (gioco + parete) dagli altri tagli; così la striscia è libera solo vicino allo spigolo
  function padOf(h){
    let r=clip(pathOff([[h.A,h.Ph]],wp),[ring(h.quad)],CL.ClipType.ctIntersection);
    const others=[], R2=Math.pow(h.dAH+wp+3,2);
    for(const s of [-1,0,1]) for(const c of cutsH){ const a=[c[0][0]+s*per,c[0][1]], b=[c[1][0]+s*per,c[1][1]];
      if(Math.hypot(a[0]-h.A[0],a[1]-h.A[1])<1e-6) continue;
      const cx=(a[0]+b[0])/2-h.A[0], cy=(a[1]+b[1])/2-h.A[1], hl=Math.hypot(b[0]-a[0],b[1]-a[1])/2; if(Math.hypot(cx,cy)-hl>Math.sqrt(R2)) continue; others.push([a,b]); }
    if(others.length) r=diff(r,pathOff(others,g/2+clr+Math.max(2*wall,0.8)));
    return r.filter(pa=>areaI(pa)>0.05);
  }
  // coda di rondine lungo l'asse del braccio: parte dal vertice interno della fascia e si allarga entrando nella Y.
  // Con la fascia a V impedisce ogni traslazione e rotazione nel piano: l'inserto si monta solo premendolo dall'alto.
  function tongueOf(tp,sc){
    let ax=[0,0]; for(const h of tp.hs){const e=un(tp.A,h.Ph); ax[0]+=e[0]; ax[1]+=e[1];}
    let la=Math.hypot(ax[0],ax[1]);
    if(tp.hs.length<2||la<0.2){ ax=tp.uA.slice(); const q=tp.hs[0].quad, cq=q.reduce((a,p)=>[a[0]+p[0]/q.length,a[1]+p[1]/q.length],[0,0]); if(ax[0]*(cq[0]-tp.A[0])+ax[1]*(cq[1]-tp.A[1])<0) ax=[-ax[0],-ax[1]]; }
    else ax=[ax[0]/la,ax[1]/la];
    const nx=[-ax[1],ax[0]];
    let s=1; for(const h of tp.hs){const e=un(tp.A,h.Ph); s=Math.min(s,Math.abs(e[0]*ax[1]-e[1]*ax[0]));}
    const din=Math.min(3*wp,wp/Math.max(0.3,s)), t0=Math.max(0,din-0.4), t1=din+dvL*sc;
    const P2=(t,w)=>[tp.A[0]+ax[0]*t+nx[0]*w,tp.A[1]+ax[1]*t+nx[1]*w];
    const pts=[P2(t0,-dvN*sc/2),P2(din,-dvN*sc/2),P2(t1,-dvW*sc/2),P2(t1,dvW*sc/2),P2(din,dvN*sc/2),P2(t0,dvN*sc/2)];
    // controllo: coda + gioco + parete tutta dentro la Y e lontana dagli altri tagli
    const tl=[ring(pts)]; if(!CL.Clipper.Orientation(tl[0])) tl[0].reverse();
    const chk=diff(polyOff(tl,clr+wall),union(tp.hs.map(h=>ring(h.quad))));
    const cuts=[]; for(const sh of [-1,0,1]) for(const c of cutsH){ const a=[c[0][0]+sh*per,c[0][1]], b=[c[1][0]+sh*per,c[1][1]]; if(Math.hypot((a[0]+b[0])/2-tp.A[0],(a[1]+b[1])/2-tp.A[1])<Math.hypot(b[0]-a[0],b[1]-a[1])/2+t1+5) cuts.push([a,b]); }
    const hit=clip(polyOff(tl,clr+wall),pathOff(cuts,g/2),CL.ClipType.ctIntersection).reduce((a,pa)=>a+areaI(pa),0);
    const out=chk.reduce((a,pa)=>a+areaI(pa),0);
    return {pts,ok:hit<0.02&&out<0.05,ax,sc};
  }
  const tips=[...tipMap.values()].map(tp=>{ const pads=[].concat(...tp.hs.map(padOf)); let tg=null; for(const sc of [1,0.85,0.7,0.55,0.45]){ tg=tongueOf(tp,sc); if(tg.ok) break; }
    return {A:tp.A,B:tp.B,uA:tp.uA,n:tp.hs.length,branches:tp.hs.map(h=>[h.T,h.H,h.Ph]),knobs:tp.hs.map(h=>h.T),
      pads:toF(uni2(pads,[ring(tg.pts)])),tongue:tg.pts,tongueOK:tg.ok,tongueSc:tg.sc,hs:tp.hs}; });
  const shifts=[-3,-2,-1,0,1,2,3];
  // --- regioni base dei corpi ---
  const parts=[];
  col.rot.forEach((r,ci)=>parts.push({kind:'ROT',row:r.row,pieces:[r.pts.map(S2)],notches:hinges.filter(h=>h.c===ci&&h.notch).map(h=>h.notch)}));
  const bodyPieces=new Map();
  col.est.forEach((pc,pi)=>{ if(!bodyPieces.has(pc.body)) bodyPieces.set(pc.body,[]); bodyPieces.get(pc.body).push(pi); });
  for(const [b,list] of bodyPieces){
    const pcs=list.map(pi=>col.est[pi].pts.map(p=>[(p[0]+col.est[pi].m*(G.per||2*G.L))*k,p[1]*k]));
    const rows=list.map(pi=>col.est[pi].row);
    parts.push({kind:'EST',row:Math.round(rows.reduce((a,v)=>a+v,0)/rows.length),pieces:pcs,body:b});
  }
  // sede dell'inserto: fori dei bottoni + canali dei rami
  const seat=(tp,dx)=>{const sh=p=>[p[0]+dx,p[1]], w=tp.w||wn; return pathOff(tp.branches.map(b=>b.map(sh)),w/2+clr).concat(tp.knobs.map(k2=>circle(sh(k2),rh+clr,32)),polyOff((tp.pads||[]).map(pa=>ring(pa.map(sh))),clr));};
  // --- attacchi ai bulkhead: un inserto TPU piatto nel piano della parete a cavallo della luce fra il nodo di bordo e l'aletta del disco ---
  const pins=[];
  if(o.bulk){ col.bodies.forEach((b,bi)=>{ if(b.kind!=='EST') return; const top=b.level===col.nLev-1; if(b.level!==0&&!top) return;
      const pc=col.est[b.pieces[0]], V=[(pc.pts[0][0]+pc.m*(G.per||2*G.L))*k,pc.pts[0][1]*k], dir=top?-1:1;
      const Sk=[V[0],V[1]+dir*o.dY], Lk=[V[0],V[1]-dir*(o.gb+o.dY)];
      pins.push({bi,top,V,dir,Sk,Lk,branches:[[Lk,Sk]],knobs:[Sk,Lk],w:o.wb,A:V}); }); }
  // --- per ogni parte: base - tagli - sedi degli inserti ---
  for(const pt of parts){
    let mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;
    for(const pc of pt.pieces) for(const p of pc){mnx=Math.min(mnx,p[0]);mny=Math.min(mny,p[1]);mxx=Math.max(mxx,p[0]);mxy=Math.max(mxy,p[1]);}
    const pad=2*(Math.max(o.dTri+(o.lt||0)+1.5,o.dY)+rh+g+wall)+3, near=p=>p[0]>mnx-pad&&p[0]<mxx+pad&&p[1]>mny-pad&&p[1]<mxy+pad;
    const segs=[]; for(const s of shifts) for(const c of cutsH){const a=[c[0][0]+s*per,c[0][1]], b=[c[1][0]+s*per,c[1][1]]; if(near(a)||near(b)||near([(a[0]+b[0])/2,(a[1]+b[1])/2])) segs.push([a,b]);}
    const seats=[], sp2=[], sp3=[]; for(const s of shifts) for(const tp of tips.concat(pins)){ const m=[tp.A[0]+s*per,tp.A[1]]; if(near(m)){ seats.push(...seat(tp,s*per)); for(const b of tp.branches.concat(tp.tongue?[tp.tongue]:[])) for(const q of b) (tp.w?sp3:sp2).push([q[0]+s*per,q[1]]); } }
    pt.lower=diff(diff(union(pt.pieces.map(ring)),kerf(segs)),seats);
    if(pt.notches&&pt.notches.length) pt.lower=diff(pt.lower,pt.notches.map(nq=>{const r=ring(nq); if(!CL.Clipper.Orientation(r)) r.reverse(); return r;}));
    pt.upper=[];
    // firma di congruenza (dati esatti, prima del clipping)
    const pts=[]; for(const pc of pt.pieces) for(const p of pc) pts.push(['b',p]);
    const inb=p=>p[0]>mnx-pad/2&&p[0]<mxx+pad/2&&p[1]>mny-pad/2&&p[1]<mxy+pad/2;
    for(const p of sp2) if(inb(p)) pts.push(['h',p]);
    for(const p of sp3) if(inb(p)) pts.push(['p',p]);
    for(const sg of segs) if(inb(sg[0])||inb(sg[1])){pts.push(['k',sg[0]]); pts.push(['k',sg[1]]);}
    if(pt.notches) for(const nq of pt.notches) pts.push(['n',nq[0]],['n',nq[1]]);
    const cen=[0,0]; let nb=0; for(const [t,p] of pts) if(t==='b'){cen[0]+=p[0];cen[1]+=p[1];nb++;} cen[0]/=nb; cen[1]/=nb;
    const q=Math.max(1e-3,G.L*k*1e-4);
    const sig=(fx,fy)=>pts.map(([t,p])=>t+Math.round(fx*(p[0]-cen[0])/q)+','+Math.round(fy*(p[1]-cen[1])/q)).sort().join(';');
    const s0=sig(1,1), s1=sig(-1,-1), m0=sig(-1,1), m1=sig(1,-1);
    pt.sig=s0<s1?s0:s1; pt.msig=m0<m1?m0:m1; pt.cen=cen;
  }
  // --- classi di componenti uguali ---
  const classes=[]; const bySig=new Map();
  for(const pt of parts){ let c=bySig.get(pt.sig); if(!c){c={rep:pt,kind:pt.kind,rows:new Set(),n:0,sig:pt.sig,msig:pt.msig}; bySig.set(pt.sig,c); classes.push(c);} c.n++; c.rows.add(pt.row+1); }
  classes.sort((a,b)=>(a.kind<b.kind?-1:a.kind>b.kind?1:0)||(Math.min(...a.rows)-Math.min(...b.rows)));
  let nr=0, ne=0; for(const c of classes){ c.code=(c.kind==='ROT'?'T':'Y')+String(c.kind==='ROT'?++nr:++ne).padStart(2,'0'); }
  for(const c of classes){ const m=classes.find(d=>d!==c&&d.sig===c.msig); c.mirrorOf=m?m.code:null; c.selfMirror=c.sig===c.msig; }
  // --- mesh curva a due strati ---
  function exPolys(paths){ paths=CL.Clipper.CleanPolygons(CL.Clipper.SimplifyPolygons(paths,CL.PolyFillType.pftNonZero),0.002*SC); const c=new CL.Clipper(); c.AddPaths(paths,CL.PolyType.ptSubject,true); const tree=new CL.PolyTree(); c.Execute(CL.ClipType.ctUnion,tree,CL.PolyFillType.pftNonZero,CL.PolyFillType.pftNonZero); return CL.JS.PolyTreeToExPolygons(tree); }
  // xp != null: faccia esterna piana (piano x = xp); i punti esterni sono prolungati in direzione radiale fino al piano
  function meshLayer(paths,r0,r1,tris,xp){
    const eps=exPolys(paths); if(!eps.length) return;
    const X=(u,v,r)=>(xp!=null&&r===r1)?[xp,xp*Math.tan(u/Rp),v]:[r*Math.cos(u/Rp),r*Math.sin(u/Rp),v];
    for(const ep of eps){
      const rings=[ep.outer].concat(ep.holes||[]).map(rg=>rg.map(p=>[p.X/SC,p.Y/SC]));
      const area=rg=>{let a=0; for(let i=0;i<rg.length;i++){const p=rg[i],q=rg[(i+1)%rg.length]; a+=p[0]*q[1]-q[0]*p[1];} return a/2;};
      if(area(rings[0])<0) rings[0].reverse(); for(let h=1;h<rings.length;h++) if(area(rings[h])>0) rings[h].reverse();
      const flat=[], hi=[]; rings.forEach((rg,ri)=>{ if(ri>0) hi.push(flat.length/2); for(const p of rg) flat.push(p[0],p[1]); });
      const idx=EC(flat,hi.length?hi:null,2); const P2=i=>[flat[2*i],flat[2*i+1]];
      let ext=0; for(let t=0;t<idx.length;t+=3){const a=P2(idx[t]),b=P2(idx[t+1]),c=P2(idx[t+2]); ext=Math.max(ext,Math.abs(a[0]-b[0]),Math.abs(b[0]-c[0]),Math.abs(a[0]-c[0]));}
      const n=Math.max(1,Math.min(6,Math.ceil(ext/(Rp*dA))));
      for(let t=0;t<idx.length;t+=3){
        let a=P2(idx[t]),b=P2(idx[t+1]),c=P2(idx[t+2]);
        if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0){const tmp=b;b=c;c=tmp;}
        const Q=(i,j)=>[a[0]+(b[0]-a[0])*i/n+(c[0]-a[0])*j/n, a[1]+(b[1]-a[1])*i/n+(c[1]-a[1])*j/n];
        for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){
          const p00=Q(i,j),p10=Q(i+1,j),p01=Q(i,j+1);
          tris.push([X(...p00,r1),X(...p10,r1),X(...p01,r1)], [X(...p00,r0),X(...p01,r0),X(...p10,r0)]);
          if(i+j<n-1){const p11=Q(i+1,j+1); tris.push([X(...p10,r1),X(...p11,r1),X(...p01,r1)], [X(...p10,r0),X(...p01,r0),X(...p11,r0)]);}
        }
      }
      for(const rg of rings) for(let e=0;e<rg.length;e++){
        const p=rg[e], q2=rg[(e+1)%rg.length];
        for(let s=0;s<n;s++){
          const a=[p[0]+(q2[0]-p[0])*s/n,p[1]+(q2[1]-p[1])*s/n], b=[p[0]+(q2[0]-p[0])*(s+1)/n,p[1]+(q2[1]-p[1])*(s+1)/n];
          tris.push([X(...a,r0),X(...b,r0),X(...b,r1)], [X(...a,r0),X(...b,r1),X(...a,r1)]);
        }
      }
    }
  }
  // mesh di ogni parte nel proprio riferimento (centrata in u = 0); faccia esterna piana se richiesto
  function meshPart(paths,du,flat){
    const sh=paths.map(pa=>pa.map(p=>({X:p.X-Math.round(du*SC),Y:p.Y})));
    let xp=null;
    if(flat){ let umin=1e18,umax=-1e18; for(const pa of sh) for(const p of pa){const u=p.X/SC; if(u<umin)umin=u; if(u>umax)umax=u;}
      const r1=Rp+sp/2; xp=(umin<=0&&umax>=0)?r1:r1*Math.cos(Math.min(Math.abs(umin),Math.abs(umax))/Rp); }
    const tris=[]; meshLayer(sh,Rp-sp/2,Rp+sp/2,tris,xp); return {tris,xp};
  }
  for(const pt of parts) pt.mesh=meshPart(pt.lower,pt.cen[0],!!o.flat);
  for(const c of classes){
    const pt=c.rep, xp=pt.mesh.xp;
    // orientamento di stampa: faccia esterna (piana) sul piatto e parte concava verso l'alto; senza faccia piana, lato esterno verso l'alto
    const tris=pt.mesh.tris.map(t=>t.map(v=>xp!=null?[-v[1],v[2],xp-v[0]]:[v[1],v[2],v[0]-Rp+sp/2]));
    let mn=[1e18,1e18,1e18]; for(const t of tris) for(const v of t) for(let i=0;i<3;i++) mn[i]=Math.min(mn[i],v[i]);
    for(const t of tris) for(const v of t) for(let i=0;i<3;i++) v[i]-=mn[i];
    let vol=0, bb=[1e18,1e18,1e18,-1e18,-1e18,-1e18];
    for(const [a,b,d] of tris){ vol+=(a[0]*(b[1]*d[2]-b[2]*d[1])-a[1]*(b[0]*d[2]-b[2]*d[0])+a[2]*(b[0]*d[1]-b[1]*d[0]))/6; for(const v of [a,b,d]) for(let i=0;i<3;i++){bb[i]=Math.min(bb[i],v[i]); bb[i+3]=Math.max(bb[i+3],v[i]);} }
    c.tris=tris; c.vol=Math.abs(vol); c.bbox=[bb[3]-bb[0],bb[4]-bb[1],bb[5]-bb[2]]; c.nPerTube=c.n*P.Nc; c.flat=xp!=null;
  }
  // --- prisma: contorni piani (mm) estrusi fra h0 e h1 con la mappa X(p,h) -> [x,y,z] (terna destrorsa) ---
  function prism(paths,h0,h1,X,tris){
    for(const ep of exPolys(paths)){
      const rings=[ep.outer].concat(ep.holes||[]).map(rg=>rg.map(p=>[p.X/SC,p.Y/SC]));
      const ar=rg=>{let a=0; for(let i=0;i<rg.length;i++){const p=rg[i],q=rg[(i+1)%rg.length]; a+=p[0]*q[1]-q[0]*p[1];} return a/2;};
      if(ar(rings[0])<0) rings[0].reverse(); for(let hh=1;hh<rings.length;hh++) if(ar(rings[hh])>0) rings[hh].reverse();
      const flat=[], hi=[]; rings.forEach((rg,ri)=>{ if(ri>0) hi.push(flat.length/2); for(const p of rg) flat.push(p[0],p[1]); });
      const idx=EC(flat,hi.length?hi:null,2), P2=i=>[flat[2*i],flat[2*i+1]];
      for(let t=0;t<idx.length;t+=3){ let a=P2(idx[t]),b=P2(idx[t+1]),c=P2(idx[t+2]);
        if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0){const tmp=b;b=c;c=tmp;}
        tris.push([X(a,h1),X(b,h1),X(c,h1)],[X(a,h0),X(c,h0),X(b,h0)]); }
      for(const rg of rings) for(let e=0;e<rg.length;e++){const p=rg[e],q2=rg[(e+1)%rg.length]; tris.push([X(p,h0),X(q2,h0),X(q2,h1)],[X(p,h0),X(q2,h1),X(p,h1)]);}
    }
    return tris;
  }
  const insShape=tp=>union(pathOff(tp.branches,(tp.w||wn)/2).concat(tp.knobs.map(k2=>circle(k2,rh,40)),(tp.pads||[]).map(ring)));
  const statTris=(tris,shift)=>{ let mn=[1e18,1e18,1e18]; for(const t of tris) for(const v of t) for(let i=0;i<3;i++) mn[i]=Math.min(mn[i],v[i]);
    if(shift) for(const t of tris) for(const v of t) for(let i=0;i<3;i++) v[i]-=mn[i];
    let vol=0, bb=[1e18,1e18,1e18,-1e18,-1e18,-1e18];
    for(const [a,b,d] of tris){ vol+=(a[0]*(b[1]*d[2]-b[2]*d[1])-a[1]*(b[0]*d[2]-b[2]*d[0])+a[2]*(b[0]*d[1]-b[1]*d[0]))/6; for(const v of [a,b,d]) for(let i=0;i<3;i++){bb[i]=Math.min(bb[i],v[i]); bb[i+3]=Math.max(bb[i+3],v[i]);} }
    return {vol:Math.abs(vol),bbox:[bb[3]-bb[0],bb[4]-bb[1],bb[5]-bb[2]]}; };
  // --- inserti TPU piatti: uno per punta di braccio, raggruppati per forma (un inserto capovolto vale per la cerniera speculare) ---
  function insertMesh(tp){
    const itris=prism(insShape(tp),0,sp,(p,h)=>[p[0],p[1],h],[]);
    const st=statTris(itris,true);
    return {tris:itris,vol:st.vol,bbox:st.bbox,arms:tp.branches.length};
  }
  // firma delle fasce di aggancio: area, baricentro e momenti del secondo ordine (robusta rispetto ai vertici degli archi)
  const padKey=(pads,f)=>{ let A=0,Sx=0,Sy=0,Ixx=0,Iyy=0,Ixy=0;
    for(const pa of pads) for(let i=0;i<pa.length;i++){ const x0=pa[i][0],y0=f*pa[i][1],x1=pa[(i+1)%pa.length][0],y1=f*pa[(i+1)%pa.length][1], c=x0*y1-x1*y0;
      A+=c/2; Sx+=(x0+x1)*c/6; Sy+=(y0+y1)*c/6; Ixx+=(y0*y0+y0*y1+y1*y1)*c/12; Iyy+=(x0*x0+x0*x1+x1*x1)*c/12; Ixy+=(x0*y1+2*x0*y0+2*x1*y1+x1*y0)*c/24; }
    const sg=A<0?-1:1; return [A,Sx,Sy,Ixx,Iyy,Ixy].map((v,i)=>Math.round(sg*v/(i===0?0.2:i<3?0.3:0.6))).join(','); };
  const insMap=new Map(), insClasses=[];
  for(const tp of tips){
    // sistema locale: origine nel mozzo (punta del braccio), x lungo l'asse del braccio
    const t=tp.uA, n=[-t[1],t[0]], loc=q=>[(q[0]-tp.A[0])*t[0]+(q[1]-tp.A[1])*t[1],(q[0]-tp.A[0])*n[0]+(q[1]-tp.A[1])*n[1]];
    const L={branches:tp.branches.map(b=>b.map(loc)),knobs:tp.knobs.map(loc),pads:tp.pads.map(pa=>pa.map(loc))}, qq=0.02;
    const key=f=>L.branches.map(b=>b.map(p=>Math.round(p[0]/qq)+','+Math.round(f*p[1]/qq)).join(':')).sort().join(';')+'|'+padKey(L.pads,f);
    const k1=key(1), k2=key(-1), kk=k1<k2?k1:k2;
    let c=insMap.get(kk); if(!c){c=Object.assign({n:0,lf:Math.min(...tp.hs.map(h=>h.lfe))},L); insMap.set(kk,c); insClasses.push(c);} c.n++;
  }
  insClasses.forEach((c,i)=>{ Object.assign(c,insertMesh(c)); c.code='I'+String(i+1).padStart(2,'0'); c.nPerTube=c.n*P.Nc; c.neckLen=c.lf; });
  const minSide=Math.min(...hinges.map(h=>h.side));
  // --- assieme per la visualizzazione (riferimento del cilindro, mm di stampa, un settore) ---
  const toPos=(tris,rot)=>{const a=new Float32Array(tris.length*9), c=Math.cos(rot), s2=Math.sin(rot); let w=0; for(const t of tris) for(const v of t){a[w++]=v[0]*c-v[1]*s2; a[w++]=v[0]*s2+v[1]*c; a[w++]=v[2];} return a;};
  const asmRigid=parts.map(pt=>({kind:pt.kind,row:pt.row,pos:toPos(pt.mesh.tris,pt.cen[0]/Rp)}));
  const asmTpu=tips.map(tp=>{const t2=[]; meshLayer(insShape(tp),Rp-sp/2,Rp+sp/2,t2,null); return {pos:toPos(t2,0)};});
  // --- bulkhead: disco con un'aletta per ogni nodo di bordo; l'aletta sta nel piano tangente della parete ---
  let bulk=null;
  if(pins.length){
    const tb=o.tb, wL=o.wL, gb=o.gb, wb=o.wb, ov=0.3, hL=gb+o.dY+rh+clr+Math.max(wall,1.0);
    const Rb=Rp+sp/2+(o.rim==null?0.5:o.rim), rc=Math.max(0,(o.rc||0));
    // mappa piana della parete nel nodo: p=[u,v] -> e_t (u-u0) + z v + e_r (Rp+h)
    const wallX=u0=>{const a=u0/Rp, ca=Math.cos(a), sa=Math.sin(a); return (p,h)=>{const du=p[0]-u0, r=Rp+h; return [r*ca-du*sa, r*sa+du*ca, p[1]];};};
    const lugs=[], bIns=[];
    for(const pn of pins){
      const V=pn.V, y0=pn.top?V[1]+gb:V[1]-hL-ov, y1=pn.top?V[1]+hL+ov:V[1]-gb;
      const rect=[[V[0]-wL/2,y0],[V[0]+wL/2,y0],[V[0]+wL/2,y1],[V[0]-wL/2,y1]];
      const lug=diff([ring(rect)],seat(pn,0));
      pn.lugTris=prism(lug,-sp/2,sp/2,wallX(V[0]),[]);
      pn.insTris=prism(insShape(pn),-sp/2,sp/2,wallX(V[0]),[]);
      lugs.push(pn); 
    }
    const disks=[];
    for(const top of [false,true]){
      const L2=pins.filter(p=>p.top===top); if(!L2.length) continue;
      const vz=top?Math.max(...L2.map(p=>p.V[1]))+hL:Math.min(...L2.map(p=>p.V[1]))-hL, z0=top?vz:vz-tb, z1=top?vz+tb:vz;
      const dk=[circle([0,0],Rb,192)]; if(rc>0.5) { const hole=circle([0,0],rc,96); hole.reverse(); dk.push(hole); }
      const dTris=prism(rc>0.5?diff([dk[0]],[circle([0,0],rc,96)]):[dk[0]],z0,z1,(p,h)=>[p[0],p[1],h],[]);
      // componente completo: disco + alette di tutti i settori
      const all=dTris.slice(); const al=2*Math.PI/P.Nc;
      for(let s2=0;s2<P.Nc;s2++){ const c=Math.cos(s2*al), sn=Math.sin(s2*al); for(const pn of L2) for(const t of pn.lugTris) all.push(t.map(v=>[v[0]*c-v[1]*sn, v[0]*sn+v[1]*c, v[2]])); }
      // orientamento di stampa: disco sul piatto, alette verso l'alto
      const ptris=all.map(t=>t.map(v=>top?[v[0],-v[1],z1-v[2]]:[v[0],v[1],v[2]-z0]));
      const st=statTris(ptris,true);
      // firma: posizioni relative delle alette nella colonna (per riconoscere dischi uguali)
      const offs=L2.map(p=>(((p.V[0]%per)+per)%per)).sort((a,b)=>a-b), rel=offs.map(x=>x-offs[0]);
      disks.push({top,tris:ptris,vol:st.vol,bbox:st.bbox,z0,z1,sig:rel.map(x=>Math.round(x*100)).join(','),msig:rel.map(x=>Math.round(((per-x)%per)*100)).sort((a,b)=>a-b).join(','),nLug:L2.length,asm:toPos(dTris,0),lugPos:toPos([].concat(...L2.map(p=>p.lugTris)),0)});
    }
    const bClasses=[];
    for(const d of disks){ const m=bClasses.find(c=>c.sig==='BULK'+d.sig||c.sig==='BULK'+d.msig); if(m){ m.n++; m.tops.push(d.top); continue; }
      bClasses.push({kind:'BULK',rep:{kind:'BULK'},rows:new Set(),n:1,tops:[d.top],sig:'BULK'+d.sig,tris:d.tris,vol:d.vol,bbox:d.bbox,nLug:d.nLug,flat:true}); }
    bClasses.forEach((c,i)=>{ c.code='B'+String(i+1).padStart(2,'0'); c.nPerTube=c.n; c.where=c.tops.map(t=>t?'cima':'base').join(', '); c.mirrorOf=null; c.selfMirror=false; });
    // inserto del bulkhead: striscia larga wb con due bottoni, a cavallo della luce gb
    const bi0=pins[0], loc=q=>[q[0]-bi0.V[0],(q[1]-bi0.V[1])*bi0.dir];
    const bL={branches:bi0.branches.map(b=>b.map(loc)),knobs:bi0.knobs.map(loc),w:wb,pads:[]};
    const bI=Object.assign({n:pins.length,code:'IB1',bulkIns:true,lf:gb,neckLen:gb,w:wb},bL,insertMesh(bL)); bI.nPerTube=bI.n*P.Nc; bI.arms=1;
    insClasses.push(bI);
    for(const pn of pins) asmTpu.push({pos:toPos(pn.insTris,0)});
    bulk={classes:bClasses,disks,pins,hL,tb,Rb,gb,wb,wL};
    classes.push(...bClasses);
  }
  const insert=Object.assign({},insClasses[0]||{},{classes:insClasses,minSide,need:0,minFit:NaN,nTips:tips.length,lf});
  const asm={rigid:asmRigid,tpu:asmTpu,Nc:P.Nc,H:G.Heff*k,disks:bulk?bulk.disks.map(d=>d.asm):[],lugs:bulk?bulk.disks.map(d=>d.lugPos):[]};
  return {classes,parts,Rp,sp,k,insert,hinges,tips,asm,bulk};
}
function stlBinary(tris,name){
  const buf=new ArrayBuffer(84+50*tris.length), dv=new DataView(buf);
  const hdr=('Tubo Auxetico '+(name||'')).slice(0,79); for(let i=0;i<hdr.length;i++) dv.setUint8(i,hdr.charCodeAt(i)&127);
  dv.setUint32(80,tris.length,true); let o=84;
  for(const [a,b,c] of tris){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx; const l=Math.hypot(nx,ny,nz)||1; nx/=l; ny/=l; nz/=l;
    for(const v of [[nx,ny,nz],a,b,c]){dv.setFloat32(o,v[0],true);dv.setFloat32(o+4,v[1],true);dv.setFloat32(o+8,v[2],true);o+=12;}
    dv.setUint16(o,0,true); o+=2;
  }
  return buf;
}
