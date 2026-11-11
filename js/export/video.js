/* ---------- esportazione video dell'apertura (GIF o AVI MJPEG, sfondo bianco) ---------- */
var REC=null;
function gifEncoder(w,h,palette,delayCs){
  const out=[]; const b=v=>out.push(v&255), w16=v=>{b(v); b(v>>8);};
  for(const c of 'GIF89a') b(c.charCodeAt(0));
  w16(w); w16(h); b(0xF7); b(0); b(0);
  for(let i=0;i<256;i++){ const c=palette[i]||[255,255,255]; b(c[0]); b(c[1]); b(c[2]); }
  b(0x21); b(0xFF); b(11); for(const c of 'NETSCAPE2.0') b(c.charCodeAt(0)); b(3); b(1); w16(0); b(0);
  function frame(idx,delay){
    b(0x21); b(0xF9); b(4); b(0); w16(delay==null?delayCs:delay); b(0); b(0);
    b(0x2C); w16(0); w16(0); w16(w); w16(h); b(0);
    // LZW, codice minimo 8 bit
    b(8); const clear=256, eoi=257; let size=9, next=258, dict=new Map(), buf=0, nb=0; const blk=[];
    const put=code=>{ buf|=code<<nb; nb+=size; while(nb>=8){ blk.push(buf&255); buf>>>=8; nb-=8; } };
    put(clear); let cur=idx[0];
    for(let i=1;i<idx.length;i++){ const k=idx[i], key=cur*256+k, v=dict.get(key);
      if(v!==undefined){ cur=v; continue; }
      put(cur); if(next<4096){ dict.set(key,next++); if(next>(1<<size)&&size<12) size++; } else { put(clear); dict=new Map(); next=258; size=9; }
      cur=k; }
    put(cur); put(eoi); if(nb>0) blk.push(buf&255);
    for(let i=0;i<blk.length;i+=255){ const n=Math.min(255,blk.length-i); b(n); for(let j=0;j<n;j++) b(blk[i+j]); }
    b(0);
  }
  return {frame, finish(){ b(0x3B); return new Uint8Array(out); }};
}
function buildPalette(samples){
  // popolarità su istogramma a 5 bit per canale, bianco sempre presente
  const hist=new Uint32Array(32768);
  for(const d of samples) for(let i=0;i<d.length;i+=8){ hist[((d[i]>>3)<<10)|((d[i+1]>>3)<<5)|(d[i+2]>>3)]++; }
  const bins=[]; for(let i=0;i<32768;i++) if(hist[i]) bins.push(i); bins.sort((a,b)=>hist[b]-hist[a]);
  const pal=[[255,255,255]], taken=new Set([32767]);
  for(const bn of bins){ if(pal.length>=256) break; if(taken.has(bn)) continue; taken.add(bn); pal.push([((bn>>10)&31)*8+4,((bn>>5)&31)*8+4,(bn&31)*8+4]); }
  const lut=new Uint8Array(32768);
  for(let i=0;i<32768;i++){ const r=((i>>10)&31)*8+4, g=((i>>5)&31)*8+4, bl=(i&31)*8+4; let bi=0,bd=1e9;
    for(let j=0;j<pal.length;j++){ const p=pal[j], d=(p[0]-r)*(p[0]-r)*3+(p[1]-g)*(p[1]-g)*4+(p[2]-bl)*(p[2]-bl)*2; if(d<bd){bd=d;bi=j;} } lut[i]=bi; }
  return {pal,lut};
}
function aviMjpeg(frames,w,h,fps){
  const parts=[]; let size=0; const push=u=>{parts.push(u); size+=u.length;};
  const str=(t)=>new TextEncoder().encode(t), u32=v=>{const a=new Uint8Array(4); new DataView(a.buffer).setUint32(0,v,true); return a;}, u16=v=>{const a=new Uint8Array(2); new DataView(a.buffer).setUint16(0,v,true); return a;};
  const cat=arr=>{let n=0; for(const a of arr) n+=a.length; const o=new Uint8Array(n); let p=0; for(const a of arr){o.set(a,p); p+=a.length;} return o;};
  const chunk=(id,data)=>{ const pad=data.length&1?new Uint8Array(1):new Uint8Array(0); return cat([str(id),u32(data.length),data,pad]); };
  const list=(type,data)=>cat([str('LIST'),u32(data.length+4),str(type),data]);
  const maxF=Math.max(...frames.map(f=>f.length)), us=Math.round(1e6/fps);
  const avih=chunk('avih',cat([u32(us),u32(maxF*fps),u32(0),u32(0x10),u32(frames.length),u32(0),u32(1),u32(maxF),u32(w),u32(h),u32(0),u32(0),u32(0),u32(0)]));
  const strh=chunk('strh',cat([str('vids'),str('MJPG'),u32(0),u16(0),u16(0),u32(0),u32(1),u32(fps),u32(0),u32(frames.length),u32(maxF),u32(0xFFFFFFFF),u32(0),u16(0),u16(0),u16(w),u16(h)]));
  const strf=chunk('strf',cat([u32(40),u32(w),u32(h),u16(1),u16(24),str('MJPG'),u32(w*h*3),u32(0),u32(0),u32(0),u32(0)]));
  const hdrl=list('hdrl',cat([avih,list('strl',cat([strh,strf]))]));
  const movParts=[], idx=[]; let off=4;
  for(const f of frames){ const c=chunk('00dc',f); movParts.push(c); idx.push(cat([str('00dc'),u32(0x10),u32(off),u32(f.length)])); off+=c.length; }
  const movi=list('movi',cat(movParts)), idx1=chunk('idx1',cat(idx));
  const body=cat([str('AVI '),hdrl,movi,idx1]);
  return cat([str('RIFF'),u32(body.length),body]);
}
function saveBlob(blob,fname){
  // ambiente con DL (salvataggio dell'host): lo si usa; altrimenti download normale del browser (file:, localhost, pagina web)
  if(typeof DL!=='undefined'&&DL) return DL.save({filename:fname,data:blob}).then(()=>true,()=>false);
  try{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fname; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},4000); return Promise.resolve(true); }
  catch(e){ return Promise.resolve(false); }
}
async function recordVideo(){
  const msg=$('recMsg');
  if(!PATH||!PATH.done){ msg.textContent='Calcola prima l\'apertura (pulsante "Calcola apertura").'; return; }
  if(false){ msg.textContent='In questa vista il salvataggio dei file non è disponibile: apri la versione offline del tool (file HTML sul tuo computer) e registra da lì.'; return; }
  const fmtV=$('recFmt').value, gif=fmtV==='gif', fps=gif?12:25, maxW=gif?640:1280;
  const keep=$('recKeep').checked, camPos=camera.position.clone(), tgt=controls.target.clone();
  stopSim(); REC={}; $('bRec').disabled=true; $('bSim').disabled=true;
  const bg0=scene.background; scene.background=new THREE.Color('#FFFFFF'); if(grid) grid.visible=false;
  const src=renderer.domElement, sw=src.width, sh=src.height, sc=Math.min(1,maxW/sw), W=Math.max(2,Math.round(sw*sc/2)*2), H=Math.max(2,Math.round(sh*sc/2)*2);
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H; const cx=cv.getContext('2d',{willReadFrequently:gif});
  const draw=()=>{ controls.update(); renderer.render(scene,camera); cx.fillStyle='#FFFFFF'; cx.fillRect(0,0,W,H); cx.drawImage(src,0,0,W,H);
    const st=stateAt(SIM.k), p=SIM.on||SIM.p>0?SIM.p:st.p;
    cx.fillStyle='#1B2430'; cx.font=Math.round(H*0.032)+'px system-ui,sans-serif'; cx.textBaseline='bottom';
    cx.fillText('p = '+fmtP(p*PU)+' atm   V/V₀ = '+st.vr.toFixed(2)+(devC()>0?'   t = '+(SIM.t||0).toFixed(0)+' s':''),Math.round(W*0.02),H-Math.round(H*0.02)); };
  const frames=[]; let enc=null, lut=null, nF=0;
  const tick=()=>new Promise(r=>setTimeout(r,0));
  try{
    // tavolozza per la GIF: stato chiuso, stato finale e intermedio
    if(gif){ const kf=equilibriumFor(Math.max(1e-9,(+$('pmax').value||0)/PU),0), smp=[];
      if(!keep) frameFinal();
      for(const k of [0,kf*0.5,kf]){ SIM.k=k; applyState(stateAt(k).q); draw(); smp.push(cx.getImageData(0,0,W,H).data); }
      const P=buildPalette(smp); lut=P.lut; enc=gifEncoder(W,H,P.pal,Math.round(100/fps)); }
    const addFrame=async()=>{
      draw();
      if(gif){ const d=cx.getImageData(0,0,W,H).data, idx=new Uint8Array(W*H); for(let i=0,j=0;j<idx.length;i+=4,j++) idx[j]=lut[((d[i]>>3)<<10)|((d[i+1]>>3)<<5)|(d[i+2]>>3)]; enc.frame(idx); }
      else { const bl=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.9)); frames.push(new Uint8Array(await bl.arrayBuffer())); }
      nF++; if(nF%5===0){ msg.textContent='Registrazione… '+nF+' fotogrammi'; await tick(); }
    };
    startSim(); if(keep){ camera.position.copy(camPos); controls.target.copy(tgt); controls.update(); }
    SIM.p=0; setK(0);
    for(let i=0;i<Math.round(fps*0.6);i++) await addFrame();
    const dt=1/fps; let guard=0;
    while(SIM.on&&guard<fps*180){ simTick(dt); await addFrame(); guard++; }
    for(let i=0;i<fps;i++) await addFrame();
    msg.textContent='Preparo il file…'; await tick();
    const blob=gif?new Blob([enc.finish()],{type:'image/gif'}):new Blob([aviMjpeg(frames,W,H,fps)],{type:'video/avi'});
    const fname='tubo_auxetico_apertura.'+(gif?'gif':'avi');
    const ok=await saveBlob(blob,fname);
    msg.textContent=ok?'Salvato '+fname+' · '+nF+' fotogrammi, '+(blob.size/1048576).toFixed(1)+' MB, '+W+' × '+H+' px.':'Salvataggio non riuscito in questa vista: usa la versione offline del tool.';
  }catch(e){ msg.textContent='Registrazione interrotta: '+e.message; }
  finally{
    scene.background=bg0; if(grid) grid.visible=true; REC=null; $('bRec').disabled=false; $('bSim').disabled=false; stopSim();
    if(keep){ camera.position.copy(camPos); controls.target.copy(tgt); controls.update(); }
  }
}
$('bRec').onclick=recordVideo;
