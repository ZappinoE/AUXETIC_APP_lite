/* ---------- disegni tecnici: dettaglio della cella (SVG/PNG) e tavola 16:9 ---------- */
const xe=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const nf=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'–';   // disegni tecnici in inglese: punto decimale
const fP=v=>{ if(!Number.isFinite(v)) return '–'; const a=Math.abs(v); return a===0?'0':a>=100?v.toFixed(0):String(+v.toPrecision(3)); };
/* stili della tavola: bn = bianco e nero a linee (retino sulle Y, cornice a zone), grigi = prospetti ombreggiati in scala di grigi, colore = colori essenziali */
const TD_STYLES={
  bn:{ink:'#000000',mute:'#333333',thin:'#666666',cut:'#000000',cutW:2.2,hinge:'#000000',acc:'#000000',tri:'#FFFFFF',y:'url(#hatchY)',frame:'#000000',font:"'Arial Narrow','Liberation Sans Narrow','DejaVu Sans Condensed',Arial,sans-serif",render:'line',zones:true,band:'#FFFFFF'},
  grigi:{ink:'#111111',mute:'#4A4A4A',thin:'#8C8C8C',cut:'#111111',cutW:1.8,hinge:'#111111',acc:'#111111',tri:'#FFFFFF',y:'#D9D9D9',frame:'#111111',font:"Arial,'Liberation Sans',Helvetica,sans-serif",render:'gray',zones:true,band:'#EFEFEF'},
  colore:{ink:'#1B2430',mute:'#5B6773',thin:'#8A949E',cut:'#C0392B',cutW:1.6,hinge:'#1F5FA8',acc:'#1F5FA8',tri:'#FFFFFF',y:'#E9DFCF',frame:'#1B2430',font:'Helvetica, Arial, sans-serif',render:'color',zones:false,band:'#EEF2F6'}
};
let TD=TD_STYLES.colore;
const svgDefs=()=>'<defs><pattern id="hatchY" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#FFFFFF"/><line x1="0" y1="0" x2="0" y2="6" stroke="#000000" stroke-width="0.9"/></pattern></defs>';
function zoneFrame(W,H){ // cornice con zone A..F e 1..8, come nelle tavole tecniche
  let g='<rect x="16" y="16" width="'+(W-32)+'" height="'+(H-32)+'" fill="none" stroke="'+TD.frame+'" stroke-width="2"/>'+
        '<rect x="8" y="8" width="'+(W-16)+'" height="'+(H-16)+'" fill="none" stroke="'+TD.frame+'" stroke-width="0.8"/>';
  const nx=8, ny=6;
  for(let i=0;i<nx;i++){ const x0=16+(W-32)*i/nx, xm=16+(W-32)*(i+0.5)/nx; if(i) g+=svgLine(x0,8,x0,16,TD.frame,0.8)+svgLine(x0,H-16,x0,H-8,TD.frame,0.8); g+=svgText(xm,14.5,String(i+1),{size:8,anchor:'middle'})+svgText(xm,H-9.5,String(i+1),{size:8,anchor:'middle'}); }
  for(let j=0;j<ny;j++){ const y0=16+(H-32)*j/ny, ym=16+(H-32)*(j+0.5)/ny, L='ABCDEF'[j]; if(j) g+=svgLine(8,y0,16,y0,TD.frame,0.8)+svgLine(W-16,y0,W-8,y0,TD.frame,0.8); g+=svgText(12,ym+3,L,{size:8,anchor:'middle'})+svgText(W-12,ym+3,L,{size:8,anchor:'middle'}); }
  return g;
}
function svgText(x,y,t,o={}){ return '<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" font-family="'+TD.font+'" font-size="'+(o.size||14)+'" fill="'+(o.fill||TD.ink)+'"'+(o.anchor?' text-anchor="'+o.anchor+'"':'')+(o.weight?' font-weight="'+o.weight+'"':'')+(o.rot?' transform="rotate('+o.rot+' '+x.toFixed(1)+' '+y.toFixed(1)+')"':'')+(o.ls?' letter-spacing="'+o.ls+'"':'')+(o.halo?' stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round" paint-order="stroke"':'')+'>'+xe(t)+'</text>'; }
const svgLine=(x1,y1,x2,y2,c=TD.ink,w=1,da)=>'<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+c+'" stroke-width="'+w+'"'+(da?' stroke-dasharray="'+da+'"':'')+'/>';
const arrowHead=(x,y,ang,c)=>{const a1=ang+2.7,a2=ang-2.7,l=9; return '<path d="M'+x.toFixed(1)+' '+y.toFixed(1)+' L'+(x+l*Math.cos(a1)).toFixed(1)+' '+(y+l*Math.sin(a1)).toFixed(1)+' L'+(x+l*Math.cos(a2)).toFixed(1)+' '+(y+l*Math.sin(a2)).toFixed(1)+' Z" fill="'+c+'"/>';};
/* quota fra (x1,y1) e (x2,y2), spostata di off in direzione normale, con linee di richiamo */
function svgDim(x1,y1,x2,y2,off,label,o={}){
  const dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, nx=-uy, ny=ux, c=o.c||TD.ink;
  const a=[x1+nx*off,y1+ny*off], b=[x2+nx*off,y2+ny*off], ext=Math.sign(off)*6;
  let g=svgLine(x1+nx*Math.sign(off)*3,y1+ny*Math.sign(off)*3,a[0]+nx*ext,a[1]+ny*ext,c,0.8)+svgLine(x2+nx*Math.sign(off)*3,y2+ny*Math.sign(off)*3,b[0]+nx*ext,b[1]+ny*ext,c,0.8);
  g+=svgLine(a[0],a[1],b[0],b[1],c,1)+arrowHead(a[0],a[1],Math.atan2(uy,ux),c)+arrowHead(b[0],b[1],Math.atan2(-uy,-ux),c);
  let ang=Math.atan2(uy,ux)*180/Math.PI; if(ang>90) ang-=180; if(ang<-90) ang+=180;
  const mx=(a[0]+b[0])/2+nx*Math.sign(off)*7, my=(a[1]+b[1])/2+ny*Math.sign(off)*7;
  return g+svgText(mx,my+(Math.abs(ang)<45?(Math.sign(off*ny)>0?12:-2):4),label,{size:o.size||13,anchor:'middle',rot:Math.abs(ang)>1?ang:0,fill:c,halo:true});
}
/* disegno quotato della cella della riga j nel riquadro (bx,by,bw,bh) */
function cellSVG(j,bx,by,BW,BH){
  const {P,A}=cur, G=A.G, g=cellGeom(j), L=g.L, r=ROWS[j];
  if(!g.B.ok) return svgText(bx+10,by+20,'Invalid geometry',{fill:TD.cut});
  const pad=70, sc=Math.min((BW-2*pad)/g.bw,(BH-2*pad)/g.bh), ox=bx+(BW-g.bw*sc)/2, oy=by+(BH+g.bh*sc)/2;
  const X=u=>ox+(u-g.u0)*sc, Y=v=>oy-(v-g.v0)*sc, pth=pts=>'M'+pts.map(p=>X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' L')+' Z';
  let o='';
  for(const p of g.S.parts) o+='<path d="'+pth(p.pts)+'" fill="'+(p.kind==='ROT'?TD.tri:TD.y)+'" stroke="'+TD.ink+'" stroke-width="0.9" stroke-linejoin="round"/>';
  for(const c of g.S.cuts) o+=svgLine(X(c[0]),Y(c[1]),X(c[2]),Y(c[3]),TD.cut,TD.cutW||1.6);
  for(const h of g.S.hinges) o+='<circle cx="'+X(h.p[0]).toFixed(1)+'" cy="'+Y(h.p[1]).toFixed(1)+'" r="3.2" fill="'+TD.hinge+'"/>';
  if(g.hexNode){
    const hn=g.hexNode, V=k=>[hn[0]+L*Math.cos(Math.PI/2+k*Math.PI/3),hn[1]+L*Math.sin(Math.PI/2+k*Math.PI/3)];
    o+='<path d="'+pth([0,1,2,3,4,5].map(V))+'" fill="none" stroke="'+TD.ink+'" stroke-width="1.2" stroke-dasharray="7 5"/>';
    o+=svgLine(X(hn[0])-8,Y(hn[1]),X(hn[0])+8,Y(hn[1]),TD.thin,0.8)+svgLine(X(hn[0]),Y(hn[1])-8,X(hn[0]),Y(hn[1])+8,TD.thin,0.8);
    // quote: larghezza fra i lati (√3 L), altezza fra i vertici (2L), lato L, larghezza del braccio Y
    o+=svgDim(X(hn[0]-S3/2*L),Y(hn[1]-L/2),X(hn[0]+S3/2*L),Y(hn[1]-L/2),(Y(hn[1]-L)-Y(hn[1]-L/2))+26,nf(S3*L,3)+' m');
    o+=svgDim(X(hn[0]+S3/2*L),Y(hn[1]+L),X(hn[0]+S3/2*L),Y(hn[1]-L),-34,nf(2*L,3)+' m');
    const va=V(0), vb=V(1); o+=svgDim(X(va[0]),Y(va[1]),X(vb[0]),Y(vb[1]),22,'L = '+nf(L,3));
    const yv=hn[1]+0.42*L; o+=svgDim(X(hn[0]-r.y/2),Y(yv),X(hn[0]+r.y/2),Y(yv),-14,'Y = '+nf(r.y,3),{c:TD.acc});
  } else {
    o+=svgDim(X(g.u0),Y(g.v0),X(g.u0+g.bw),Y(g.v0),26,nf(g.bw,3)+' m');
    o+=svgDim(X(g.u0+g.bw),Y(g.v0+g.bh),X(g.u0+g.bw),Y(g.v0),-30,nf(g.bh,3)+' m');
  }
  return o;
}
function cellLegend(x,y,j){
  const P=cur.P, r=ROWS[j];
  return '<rect x="'+x+'" y="'+(y-10)+'" width="16" height="10" fill="'+TD.y+'" stroke="'+TD.ink+'" stroke-width="0.8"/>'+svgText(x+22,y,'Y (outer part)',{size:12})+
    '<rect x="'+(x+150)+'" y="'+(y-10)+'" width="16" height="10" fill="'+TD.tri+'" stroke="'+TD.ink+'" stroke-width="0.8"/>'+svgText(x+172,y,'rotating triangle',{size:12})+
    svgLine(x+300,y-5,x+318,y-5,TD.cut,TD.cutW||1.6)+svgText(x+324,y,'cut',{size:12})+
    '<circle cx="'+(x+385)+'" cy="'+(y-5)+'" r="3.2" fill="'+TD.hinge+'"/>'+svgText(x+393,y,'hinge (w = '+nf(P.hw*1000,0)+' mm)',{size:12})+
    svgText(x,y+20,'θ = '+nf(r.th,1)+'°   ·   Y = '+nf(r.y,3)+' m   ·   t = '+nf(tOfY(r.y,P.type),4)+' m   ·   s = '+nf(P.s*1000,0)+' mm   ·   k factor = '+nf(r.f,2),{size:12,fill:TD.mute});
}
async function svgToPng(svg,W,H,scale){
  const img=new Image(); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  await new Promise((res,rej)=>{img.onload=res; img.onerror=()=>rej(new Error('rasterizzazione non riuscita'));});
  const c=document.createElement('canvas'); c.width=Math.round(W*scale); c.height=Math.round(H*scale); const x=c.getContext('2d');
  x.fillStyle='#FFFFFF'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
  return await new Promise(r=>c.toBlob(r,'image/png'));
}
const canSaveFiles=()=>location.protocol==='file:'||(typeof DL!=='undefined'&&!!DL);
async function saveCell(kind){
  const msg=$('cellMsg'); if(!cur||!cur.A.valid){ msg.textContent='Genera prima le celle.'; return; }
  if(!canSaveFiles()){ msg.textContent='Il salvataggio funziona nella versione offline del tool.'; return; }
  const W=900,H=760, j=SELROW, P=cur.P;
  const title=(P.type==='hex'?'Y pattern (hexagonal)':P.type==='square'?'Square cell':'Parallelogram cell')+' · row '+(j+1)+' of '+ROWS.length;
  TD=TD_STYLES[$('sheetStyle').value]||TD_STYLES.colore;
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><rect width="100%" height="100%" fill="#FFFFFF"/>'+svgDefs()+
    svgText(30,42,'Cell detail',{size:22,weight:700})+svgText(30,66,title,{size:14,fill:TD.mute})+
    cellSVG(j,20,80,W-40,H-170)+cellLegend(30,H-50,j)+'</svg>';
  const fname='cella_riga'+(j+1)+'.'+kind;
  const blob=kind==='svg'?new Blob([svg],{type:'image/svg+xml'}):await svgToPng(svg,W,H,2);
  msg.textContent=(await saveBlob(blob,fname))?'Salvato '+fname:'Salvataggio non riuscito: usa la versione offline.';
  setTimeout(()=>{msg.textContent='';},5000);
}
/* vista in prospetto (camera ortografica) di uno stato, sfondo bianco, alla scala pxm [px/m] */
function orthoShot(q,pxm,mode){
  applyState(q);
  const hideG=mode==='color'?[]:['surf','mesh'], was=hideG.map(k=>grp[k].visible); hideG.forEach(k=>grp[k].visible=false);
  const swaps=[], added=[];
  if(mode==='line'){
    // linee nere su facce bianche: spigoli (angolo > 30°) delle parti visibili, facce bianche che nascondono le linee dietro
    const white=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}), black=new THREE.LineBasicMaterial({color:0x000000});
    for(const k of ['lat','rot','hin','bulkB','bulkT','umb','cut']){ const gk=grp[k]; if(!gk||!gk.visible) continue;
      gk.traverse(o=>{ if(o.isMesh&&o.visible){ swaps.push([o,o.material]); o.material=white; const e=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,30),black); e.matrixAutoUpdate=false; o.updateMatrixWorld(true); e.matrix.copy(o.matrixWorld); scene.add(e); added.push(e); }
        else if(o.isLine&&o.visible){ swaps.push([o,o.material]); o.material=black; } }); }
  }
  const st=SOLV.profile(q), rmax=Math.max(...st.rs), z0=st.zs[0], z1=st.zs[st.zs.length-1], Hh=cur.A.G.Heff/2;
  const extra=($('vUmb').checked&&cur.P.type==='hex'?0.35:0.05)+cur.P.s, tb=Math.max(cur.P.s*2,cur.A.G.L*0.05);
  const wm=2*(rmax+extra)*1.04, y0=z0-Hh-tb-0.05, y1=z1-Hh+tb+0.05, hm=y1-y0;
  const Wp=Math.max(2,Math.round(wm*pxm)), Hp=Math.max(2,Math.round(hm*pxm));
  const cam=new THREE.OrthographicCamera(-wm/2,wm/2,hm/2,-hm/2,0.1,1000); cam.position.set(0,(y0+y1)/2,200); cam.lookAt(0,(y0+y1)/2,0);
  renderer.setPixelRatio(1); renderer.setSize(Wp,Hp,false); renderer.render(scene,cam);
  const c=document.createElement('canvas'); c.width=Wp; c.height=Hp; const x=c.getContext('2d'); x.fillStyle='#FFFFFF'; x.fillRect(0,0,Wp,Hp); x.drawImage(renderer.domElement,0,0);
  for(const [o,m] of swaps) o.material=m; for(const e of added){ scene.remove(e); e.geometry.dispose(); } hideG.forEach((k,i)=>grp[k].visible=was[i]);
  if(mode==='gray'){ const im=x.getImageData(0,0,Wp,Hp), d=im.data; for(let i=0;i<d.length;i+=4){ let l=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; l=Math.max(0,Math.min(255,(l-128)*1.18+140)); d[i]=d[i+1]=d[i+2]=l; } x.putImageData(im,0,0); }
  return {url:c.toDataURL('image/png'),Wp,Hp,wm,hm,rmax,H:z1-z0,y0,y1,st,zc:(y0+y1)/2};
}
async function exportSheet(){
  const msg=$('sheetMsg');
  if(!PATH||!PATH.done){ msg.textContent='Calcola prima l\'apertura (pulsante "Calcola apertura").'; return; }
  if(!canSaveFiles()){ msg.textContent='Il salvataggio funziona nella versione offline del tool.'; return; }
  const kind=$('sheetFmt').value, P=cur.P, G=cur.A.G, sty=$('sheetStyle').value; TD=TD_STYLES[sty]||TD_STYLES.colore;
  msg.textContent='Preparo la tavola…'; stopSim(); REC={};
  const bg0=scene.background, k0=SIM.k; scene.background=new THREE.Color('#FFFFFF'); if(grid) grid.visible=false;
  let svg='';
  try{
    const pT=Math.max(1e-9,(+$('pmax').value||0)/PU), kf=equilibriumFor(pT,0), stF=stateAt(kf);
    // scala comune per i due prospetti
    const stC=SOLV.profile(new Float64Array(SOLV.n)), HC=stC.zs[stC.zs.length-1]-stC.zs[0], HF=stF.zs[stF.zs.length-1]-stF.zs[0];
    const rF=Math.max(...stF.rs), rC=Math.max(...stC.rs), availH=700, availW=760;
    const pxm=Math.min(availH/(Math.max(HF,HC)+0.6), availW/(2*(rF+rC)+2.2));
    const SS=2;   // sovracampionamento delle immagini
    const shC=orthoShot(new Float64Array(SOLV.n),pxm*SS,TD.render), shF=orthoShot(stF.q,pxm*SS,TD.render);
    const W=1920,H=1080, today=new Date().toLocaleDateString('en-GB');
    const preset=({uniforme:'uniform',botte:'barrel',clessidra:'hourglass',cono:'cone',conoinv:'inverted cone',sequenza:'sequence',capsula:'capsule',custom:'custom'})[PROF.preset]||PROF.preset;
    const jC=Math.floor(ROWS.length/2);
    svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><rect width="100%" height="100%" fill="#FFFFFF"/>';
    svg+=svgDefs()+(TD.zones?zoneFrame(W,H):'<rect x="16" y="16" width="'+(W-32)+'" height="'+(H-32)+'" fill="none" stroke="'+TD.frame+'" stroke-width="2"/>');
    svg+=svgText(40,58,'Auxetic tube · '+(P.type==='hex'?'Y pattern with rotating triangles':P.type==='square'?'square cells':'parallelogram cells'),{size:26,weight:700});
    svg+=svgText(40,84,preset.charAt(0).toUpperCase()+preset.slice(1)+' profile · '+P.Nc+' cells around the circumference × '+G.Na+' rows · operating pressure '+fP(pT*PU)+' atm',{size:15,fill:TD.mute});
    svg+=svgLine(30,100,W-30,100,TD.ink,1);
    // colonna A: cella + righe
    const ax=40, aw=560;
    svg+=svgText(ax,130,'TYPICAL CELL · ROW '+(jC+1),{size:13,weight:700,ls:1.2});
    svg+=cellSVG(jC,ax-10,140,aw+20,390)+cellLegend(ax,552,jC);
    svg+=svgText(ax,610,'ROWS ALONG THE AXIS (FROM THE TOP)',{size:13,weight:700,ls:1.2});
    const cols=[['Row',0],['z [m]',60],['Y [m]',175],['θ [°]',260],['k factor',335],['R* [m]',440]], rh=Math.min(24,(1040-640)/(ROWS.length+1));
    cols.forEach(([t,dx])=>{svg+=svgText(ax+dx,636,t,{size:12,fill:TD.mute,weight:700});}); svg+=svgLine(ax,643,ax+aw-20,643,TD.thin,0.8);
    for(let i=0;i<ROWS.length;i++){ const j=ROWS.length-1-i, r=ROWS[j], yy=643+rh*(i+0.8), e=EST.get(estKey(P,G,r.th,tOfY(r.y,P.type))), fs=Math.min(12,rh*0.62);
      if(j===jC) svg+='<rect x="'+(ax-4)+'" y="'+(yy-rh*0.72)+'" width="'+(aw-12)+'" height="'+rh+'" fill="'+TD.band+'" stroke="'+(TD.band==='#FFFFFF'?TD.ink:'none')+'" stroke-width="0.6"/>';
      svg+=svgText(ax,yy,String(j+1),{size:fs})+svgText(ax+60,yy,nf(j*G.Hc,2)+'–'+nf((j+1)*G.Hc,2),{size:fs})+svgText(ax+175,yy,nf(r.y,3),{size:fs})+svgText(ax+260,yy,nf(r.th,1),{size:fs})+svgText(ax+335,yy,nf(r.f,2),{size:fs})+svgText(ax+440,yy,e&&Number.isFinite(e.lopen)?nf(e.lopen*P.R,2):'–',{size:fs}); }
    svg+=svgLine(620,115,620,1044,TD.thin,0.8);
    // colonna B: prospetti chiuso e aperto alla stessa scala
    const bx=640, bw2=820, baseY=990;
    svg+=svgText(bx,130,'ELEVATIONS AT THE SAME SCALE',{size:13,weight:700,ls:1.2});
    const place=(sh,cx,label,sub)=>{
      const w=sh.Wp/SS, h=sh.Hp/SS, x=cx-w/2, yTop=baseY-h; let g='<image x="'+x.toFixed(1)+'" y="'+yTop.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" href="'+sh.url+'" xlink:href="'+sh.url+'"/>';
      const yOf=yw=>baseY-(yw-sh.y0)*pxm, zb=sh.st.zs[0]-cur.A.G.Heff/2, zt=sh.st.zs[sh.st.zs.length-1]-cur.A.G.Heff/2;
      const rsA=Array.from(sh.st.rs), rM=Math.max(...rsA), mid=(rsA.length-1)/2; let li=0; rsA.forEach((r,i)=>{ if(r>rM-1e-3&&Math.abs(i-mid)<Math.abs(li-mid)) li=i; }); if(rsA[li]<rM-1e-3) li=rsA.indexOf(rM);
      const zr=sh.st.zs[li]-cur.A.G.Heff/2, rr=sh.st.rs[li];
      g+=svgDim(cx+rr*pxm,yOf(zt),cx+rr*pxm,yOf(zb),-(w/2-rr*pxm)-26,'H = '+nf(sh.H,2)+' m');
      g+=svgDim(cx-rr*pxm,yOf(zr),cx+rr*pxm,yOf(zr),-(yOf(zr)-yTop)-22,'Ø '+nf(2*rr,2)+' m  (R '+nf(rr,2)+' m)',{c:TD.acc});
      g+=svgLine(cx,yTop-6,cx,baseY+6,TD.thin,0.7,'14 4 2 4');
      g+=svgText(cx,baseY+34,label,{size:15,weight:700,anchor:'middle'})+svgText(cx,baseY+52,sub,{size:12,anchor:'middle',fill:TD.mute});
      return g; };
    const wC=shC.Wp/SS, wF=shF.Wp/SS, gap=(bw2-wC-wF)/3;
    svg+=place(shC,bx+gap+wC/2,'Closed','p = 0 · V/V₀ = 1');
    svg+=place(shF,bx+2*gap+wC+wF/2,'Deployed at '+fP(pT*PU)+' atm','V/V₀ = '+nf(stF.vr,2)+' · max rotation '+nf(stF.rot/D2R,0)+'°');
    // barra di scala
    const sb=[1,2,5].find(v=>v*pxm>=120)||5, sbx=bx+bw2-sb*pxm-100, sby=150;
    svg+='<rect x="'+sbx+'" y="'+(sby-6)+'" width="'+(sb*pxm/2).toFixed(1)+'" height="6" fill="'+TD.ink+'"/><rect x="'+(sbx+sb*pxm/2).toFixed(1)+'" y="'+(sby-6)+'" width="'+(sb*pxm/2).toFixed(1)+'" height="6" fill="none" stroke="'+TD.ink+'"/>';
    svg+=svgText(sbx,sby+16,'0',{size:11})+svgText(sbx+sb*pxm,sby+16,sb+' m',{size:11,anchor:'middle'})+svgText(sbx+sb*pxm+30,sby,'graphic scale',{size:11,fill:TD.mute});
    svg+=svgLine(1480,115,1480,1044,TD.thin,0.8);
    // colonna C: dati, profilo, cartiglio
    const cx0=1500, cw=380; let yy=130;
    const sec=t=>{svg+=svgText(cx0,yy,t,{size:13,weight:700,ls:1.2}); yy+=8; svg+=svgLine(cx0,yy,cx0+cw,yy,TD.thin,0.8); yy+=20;};
    const row=(a,b)=>{svg+=svgText(cx0,yy,a,{size:13,fill:TD.mute})+svgText(cx0+cw,yy,b,{size:13,anchor:'end'}); yy+=21;};
    sec('GEOMETRY'); row('Mean radius R / height H',nf(P.R,2)+' / '+nf(G.Heff,2)+' m'); row('Cells N_c × rows N_a',P.Nc+' × '+G.Na); row('Block side L',nf(G.L,3)+' m'); row('Plate thickness s / hinge width w',nf(P.s*1000,0)+' / '+nf(P.hw*1000,0)+' mm'); row('Y centre / ends',nf(ROWS[jC].y,3)+' / '+nf(ROWS[0].y,3)+' m');
    yy+=8; sec('HINGES (k factor = 1)'); row('k translational',(P.k0/1e6).toFixed(2)+' MN/m'); row('k_θ about the normal',nf(P.kth0,1)+' N·m/rad'); row('k_b out of plane',nf(P.kb0,0)+' N·m/rad');
    yy+=8; sec('DEPLOYMENT'); row('Snap-through pressure',fP(PATH.peak*PU)+' atm'); row('Operating pressure',fP(pT*PU)+' atm'); row('V/V₀ at operating pressure',nf(stF.vr,2)); row('Max Ø / deployed height',nf(2*rF,2)+' / '+nf(HF,2)+' m');
    if(devOn()){ const d=P.dev; row('Internal spring k / k₃',nf(d.k1/1000,0)+' kN/m / '+nf(d.k3,0)+' N/m³'); row('Damping c',nf(devC()/1000,0)+' kN·s/m'); }
    // profilo r(z)
    yy+=12; svg+=svgText(cx0,yy,'PROFILE r(z)',{size:13,weight:700,ls:1.2}); yy+=10;
    const ph=Math.max(120,930-yy), pw=cw, Rm=Math.max(rF,rC)*1.08, Zm=Math.max(HF,HC)*1.02, s2=Math.min((pw-40)/Rm,(ph-24)/Zm), ox=cx0+34, oyP=yy+ph-18;
    const poly=(st,c,da)=>{ const z0=st.zs[0]; return '<polyline fill="none" stroke="'+c+'" stroke-width="1.8"'+(da?' stroke-dasharray="'+da+'"':'')+' points="'+Array.from(st.rs).map((r,i)=>(ox+r*s2).toFixed(1)+','+(oyP-(st.zs[i]-z0)*s2).toFixed(1)).join(' ')+'"/>'; };
    svg+=svgLine(ox,oyP,ox+Rm*s2,oyP,TD.ink,0.8)+svgLine(ox,oyP,ox,oyP-Zm*s2,TD.ink,0.8);
    for(let v=0;v<=Rm;v+=1){ svg+=svgLine(ox+v*s2,oyP,ox+v*s2,oyP+4,TD.ink,0.8)+svgText(ox+v*s2,oyP+15,String(v),{size:10,anchor:'middle',fill:TD.mute}); }
    for(let v=0;v<=Zm;v+=2){ svg+=svgLine(ox-4,oyP-v*s2,ox,oyP-v*s2,TD.ink,0.8)+svgText(ox-7,oyP-v*s2+3,String(v),{size:10,anchor:'end',fill:TD.mute}); }
    svg+=poly(stC,TD.thin,'5 4')+poly(stF,TD.acc);
    svg+=svgText(ox+Rm*s2,oyP-Zm*s2-6,'— deployed   - - closed',{size:11,anchor:'end',fill:TD.mute})+svgText(ox+Rm*s2,oyP+15,'r [m]',{size:10,anchor:'end',fill:TD.mute})+svgText(ox-26,oyP-Zm*s2-6,'z [m]',{size:10,fill:TD.mute});
    // cartiglio
    const ty=944; svg+='<rect x="'+(cx0-10)+'" y="'+ty+'" width="'+(cw+20)+'" height="96" fill="none" stroke="'+TD.ink+'" stroke-width="1.2"/>';
    svg+=svgLine(cx0-10,ty+34,cx0+cw+10,ty+34,TD.ink,0.8)+svgLine(cx0+190,ty+34,cx0+190,ty+96,TD.ink,0.8)+svgLine(cx0-10,ty+65,cx0+cw+10,ty+65,TD.ink,0.8);
    svg+=svgText(cx0,ty+23,'AUXETIC · Auxetic tube',{size:15,weight:700});
    svg+=svgText(cx0,ty+52,'Date  '+today,{size:12})+svgText(cx0+200,ty+52,'Units  m, atm',{size:12});
    svg+=svgText(cx0,ty+84,'Sheet  1/1',{size:12})+svgText(cx0+200,ty+84,'Scale  graphic',{size:12});
    svg+='</svg>';
    const blob=kind==='svg'?new Blob([svg],{type:'image/svg+xml'}):await svgToPng(svg,W,H,2);
    const fname='tavola_tubo_auxetico_'+sty+'.'+kind;
    msg.textContent=(await saveBlob(blob,fname))?'Salvata '+fname+(kind==='png'?' (3840 × 2160 px)':''):'Salvataggio non riuscito: usa la versione offline.';
  }catch(e){ msg.textContent='Tavola non riuscita: '+e.message; }
  finally{
    scene.background=bg0; if(grid) grid.visible=true; renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); resize(); REC=null; setK(k0);
  }
  return svg;
}
