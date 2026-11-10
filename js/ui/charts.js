/* ---------- grafici ---------- */
let hoverI=-1;
function niceTicks(a,b,n){const span=b-a||1, st=Math.pow(10,Math.floor(Math.log10(span/n))), m=[1,2,2.5,5,10].find(k=>span/(st*k)<=n)*st; const t=[]; for(let v=Math.ceil(a/m)*m;v<=b+1e-12;v+=m) t.push(+v.toFixed(10)); return t;}
function prepCanvas(id){const cv=$(id), dpr=Math.min(window.devicePixelRatio||1,2), w=cv.clientWidth, h=cv.clientHeight; if(!w) return null; cv.width=w*dpr; cv.height=h*dpr; const x=cv.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0); x.clearRect(0,0,w,h); return {cv,x,w,h};}
function drawChart(){
  const c=prepCanvas('chart'); if(!c) return; const {cv,x,w,h}=c;
  const mono=tok('--mono'), ink=tok('--ink'), mut=tok('--muted'), ln=tok('--line'), acc=tok('--accent');
  x.font='10.5px '+mono;
  if(!PATH||PATH.p.length<2){x.fillStyle=mut; x.fillText(stage>=3?(cur&&cur.A.valid?'Calcolo del percorso…':'Geometria non valida'):'Genera le celle',10,20); return;}
  const X=PATH.vr, Yk=PATH.p.map(v=>v*PU), pmax=(+$('pmax').value||0);
  let y0=Math.min(0,...Yk), y1=Math.max(...Yk,PATH.done?pmax:0);
  if(PATH.done&&Number.isFinite(PATH.peakMax)) y1=Math.min(y1,Math.max(PATH.peakMax*PU*2.4,pmax*1.5,Math.max(0,-y0)*1.5));
  const pad=(y1-y0)*0.08||1; y0-=y0<0?pad:0; y1+=pad;
  const x0=1, x1=Math.max(1.05,...X);
  const L=40,R=8,T=10,B=26, sx=v=>L+(v-x0)/(x1-x0)*(w-L-R), sy=v=>T+(y1-v)/(y1-y0||1)*(h-T-B);
  x.strokeStyle=ln; x.lineWidth=1; x.fillStyle=mut;
  for(const t of niceTicks(y0,y1,4)){const yy=Math.round(sy(t))+0.5; x.beginPath(); x.moveTo(L,yy); x.lineTo(w-R,yy); x.stroke(); x.textAlign='right'; x.fillText(fmtP(t),L-4,yy+3);}
  x.textAlign='center'; for(const t of niceTicks(x0,x1,4)){ if(t<x0-1e-9) continue; x.fillText(String(t),sx(t),h-B+13);}
  x.fillText('V/V₀',(L+w-R)/2,h-2); x.save(); x.translate(9,(T+h-B)/2); x.rotate(-Math.PI/2); x.fillText('p [atm]',0,0); x.restore();
  x.strokeStyle=mut; x.beginPath(); x.moveTo(L,sy(0)); x.lineTo(w-R,sy(0)); x.stroke();
  if(PATH.done){x.setLineDash([3,3]); x.strokeStyle=tok('--warn'); x.beginPath(); x.moveTo(L,sy(pmax)); x.lineTo(w-R,sy(pmax)); x.stroke(); x.setLineDash([]);}
  x.save(); x.beginPath(); x.rect(L,T,w-L-R,h-T-B); x.clip();
  x.lineWidth=2; x.lineJoin='round';
  for(let i=1;i<X.length;i++){const up=Yk[i]>=Yk[i-1]; x.strokeStyle=up?acc:mut; x.setLineDash(up?[]:[4,3]); x.beginPath(); x.moveTo(sx(X[i-1]),sy(Yk[i-1])); x.lineTo(sx(X[i]),sy(Yk[i])); x.stroke();}
  x.setLineDash([]); x.restore(); x.fillStyle=ink; x.textAlign='left';
  if(PATH.done&&PATH.peakI>0) x.fillText('innesco '+fmtP(PATH.peak*PU)+' atm',Math.min(sx(X[PATH.peakI])+5,w-R-90),sy(Yk[PATH.peakI])-4);
  if(PATH.done&&PATH.zeros) for(const z of PATH.zeros){x.beginPath(); x.arc(sx(z.vr),sy(0),4,0,7); x.strokeStyle=tok('--ok'); x.lineWidth=2; x.stroke();}
  if(PATH.done){const st=stateAt(SIM.k); x.beginPath(); x.arc(sx(st.vr),sy(st.p*PU),5,0,7); x.fillStyle=acc; x.fill(); x.lineWidth=2; x.strokeStyle=tok('--field'); x.stroke();}
  if(SIM.on){x.strokeStyle=tok('--warn'); x.lineWidth=1; x.beginPath(); x.moveTo(L,sy(SIM.p*PU)); x.lineTo(w-R,sy(SIM.p*PU)); x.stroke();}
  if(hoverI>=0&&hoverI<X.length){
    const hx=sx(X[hoverI]), hy=sy(Yk[hoverI]);
    x.strokeStyle=mut; x.lineWidth=1; x.beginPath(); x.moveTo(hx,T); x.lineTo(hx,h-B); x.stroke();
    x.beginPath(); x.arc(hx,hy,4,0,7); x.fillStyle=ink; x.fill();
    const txt='V/V₀ '+X[hoverI].toFixed(3)+'  p '+fmtP(Yk[hoverI])+' atm', tw=x.measureText(txt).width+10;
    const bx=Math.min(Math.max(L,hx-tw/2),w-R-tw);
    x.fillStyle=tok('--panel'); x.strokeStyle=ln; x.fillRect(bx,T,tw,18); x.strokeRect(bx+.5,T+.5,tw-1,17);
    x.fillStyle=ink; x.textAlign='left'; x.fillText(txt,bx+5,T+12);
  }
  cv._sx=sx;
}
function drawProfile(st){
  const c=prepCanvas('prof'); if(!c) return; const {x,w,h}=c;
  const mut=tok('--muted'), acc=tok('--accent'), ln=tok('--line');
  x.font='10px '+tok('--mono'); x.fillStyle=mut; x.textAlign='center';
  if(!cur||stage<3){return;}
  const P=cur.P, G=cur.A.G;
  let rs=null,zs=null;
  if(st){rs=st.rs; zs=st.zs;} else if(PATH&&PATH.done){const s0=stateAt(SIM.k); rs=s0.rs; zs=s0.zs;}
  const rmax=Math.max(P.R,...(rs||[P.R])), zmin=Math.min(0,...(zs||[0])), zmax=Math.max(G.Heff,...(zs||[G.Heff]));
  const T=10,B=16, sc=Math.min((w-8)/(2*rmax*1.05),(h-T-B)/(zmax-zmin)), cx=w/2, Y=z=>h-B-(z-zmin)*sc;
  x.strokeStyle=ln; x.setLineDash([3,3]); x.lineWidth=1;
  x.strokeRect(cx-P.R*sc,Y(G.Heff),2*P.R*sc,G.Heff*sc); x.setLineDash([]);
  x.beginPath(); x.moveTo(cx,T-4); x.lineTo(cx,h-B+2); x.strokeStyle=mut; x.stroke();
  if(rs){
    x.beginPath(); for(let l=0;l<rs.length;l++){const px=cx+rs[l]*sc, py=Y(zs[l]); l?x.lineTo(px,py):x.moveTo(px,py);}
    for(let l=rs.length-1;l>=0;l--) x.lineTo(cx-rs[l]*sc,Y(zs[l])); x.closePath();
    x.fillStyle=acc; x.globalAlpha=0.18; x.fill(); x.globalAlpha=1; x.strokeStyle=acc; x.lineWidth=1.6; x.stroke();
  }
  x.fillStyle=mut; x.fillText('profilo r(z)',cx,h-3);
}
$('chart').addEventListener('mousemove',e=>{ if(!PATH||!PATH.done) return; const cv=$('chart'), r=cv.getBoundingClientRect(), mx=e.clientX-r.left; let best=-1,bd=1e9; PATH.vr.forEach((v,i)=>{const d=Math.abs(cv._sx(v)-mx); if(d<bd){bd=d;best=i;}}); hoverI=best; drawChart(); });
$('chart').addEventListener('mouseleave',()=>{hoverI=-1; drawChart();});
$('chart').addEventListener('click',()=>{ if(PATH&&PATH.done&&hoverI>=0){stopSim(); setK(hoverI);} });
