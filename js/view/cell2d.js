/* ---------- cella 2D (riga selezionata) ---------- */
/* geometria della cella disegnata (riga j): parti, tagli, cerniere e riquadro */
function cellGeom(j){
  const {P,A}=cur, G=A.G, B=A.Bf(j), hex=P.type==='hex', L=G.L;
  const P1=Object.assign({},P,{Nc:hex?2:1}), G1=Object.assign({},G,{Na:hex?3:1,C:1e9});
  let S=assemble(P1,G1,()=>B);
  let bw=P.type==='square'?2*L:3*L, bh=P.type==='square'?2*L:S3*L, u0=0, v0=0, hexNode=null;
  if(hex){
    // esagono attorno a un nodo: i 6 triangoli che lo circondano (Y centrale + terzi delle Y vicine)
    const h=S3/2*L; hexNode=[2*h,L];
    const keep=new Set(); S.parts.forEach(p=>{if(p.kind==='ROT'){const c=[p.pts.reduce((a,q)=>a+q[0],0)/3,p.pts.reduce((a,q)=>a+q[1],0)/3]; if(Math.hypot(c[0]-hexNode[0],c[1]-hexNode[1])<L*0.7) keep.add(p.block);}});
    const inHex=q=>Math.hypot(q[0]-hexNode[0],q[1]-hexNode[1])<L*1.001;
    S={parts:S.parts.filter(p=>keep.has(p.block)),cuts:S.cuts.filter(c=>inHex([c[0],c[1]])&&inHex([c[2],c[3]])),hinges:S.hinges.filter(hg=>inHex(hg.p))};
    bw=S3*L; bh=2*L; u0=hexNode[0]-S3/2*L; v0=hexNode[1]-L;
  }
  return {S,bw,bh,u0,v0,hexNode,B,L,hex};
}
function drawCell(){
  const cv=$('cellcv'), dpr=Math.min(window.devicePixelRatio||1,2);
  const w=cv.clientWidth,h=cv.clientHeight; if(!w) return; cv.width=w*dpr; cv.height=h*dpr;
  const x=cv.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0); x.clearRect(0,0,w,h);
  if(!cur) return;
  const {P,A}=cur, G=A.G, B=A.Bf(SELROW);
  $('celltitle').textContent=(P.type==='square'?'Cella quadrata':P.type==='hex'?'Pattern a Y (esagonale)':'Cella a parallelogramma')+' · riga '+(SELROW+1);
  if(!B.ok||A.badRows.includes(SELROW)){x.fillStyle=tok('--warn');x.font='12px '+tok('--sans');x.fillText('Geometria non valida',10,20);return;}
  const hex=P.type==='hex', L=G.L;
  const {S,bw,bh,u0,v0,hexNode}=cellGeom(SELROW);
  const pad=10, latC='#'+rowColors(P,G)[SELROW].getHexString();
  const sc=Math.min((w-2*pad)/bw,(h-2*pad-14)/bh), ox=(w-bw*sc)/2, oy=pad+bh*sc+((h-2*pad-14)-bh*sc)/2;
  const X=u=>ox+(u-u0)*sc, Y=v=>oy-(v-v0)*sc;
  const poly=(pts,fill)=>{x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(X(p[0]),Y(p[1])):x.moveTo(X(p[0]),Y(p[1]))); x.closePath(); x.fillStyle=fill; x.fill();};
  for(const p of S.parts) poly(p.pts,p.kind==='ROT'?tok(hex?'--rothex':'--rot'):latC);
  if(hex){ x.strokeStyle=tok('--line'); x.lineWidth=0.8; for(const p of S.parts){ if(p.kind!=='ROT') continue; x.beginPath(); p.pts.forEach((q,i)=>i?x.lineTo(X(q[0]),Y(q[1])):x.moveTo(X(q[0]),Y(q[1]))); x.closePath(); x.stroke(); } }
  x.strokeStyle=tok('--cut'); x.lineWidth=1.2;
  for(const c of S.cuts){x.beginPath();x.moveTo(X(c[0]),Y(c[1]));x.lineTo(X(c[2]),Y(c[3]));x.stroke();}
  x.fillStyle=tok('--hinge');
  for(const hg of S.hinges){x.beginPath();x.arc(X(hg.p[0]),Y(hg.p[1]),1.8,0,Math.PI*2);x.fill();}
  if(hexNode){ x.setLineDash([5,4]); x.strokeStyle=tok('--ink'); x.lineWidth=1.2; x.beginPath();
    for(let k=0;k<6;k++){const a=Math.PI/2+k*Math.PI/3, px=X(hexNode[0]+L*Math.cos(a)), py=Y(hexNode[1]+L*Math.sin(a)); k?x.lineTo(px,py):x.moveTo(px,py);} x.closePath(); x.stroke(); x.setLineDash([]); }
  x.fillStyle=tok('--muted'); x.font='11px '+tok('--mono');
  x.fillText('L '+L.toFixed(3)+' m · θ '+ROWS[SELROW].th+'° · Y '+fmt(ROWS[SELROW].y,3)+' m',4,h-3);
}
