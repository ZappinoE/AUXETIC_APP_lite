/* grafico x-y con più serie, usato da tutte le pagine di analisi (era in export/matlab.js) */
function mlPlot(id,series,xl,yl,fx,fy){
  const c=prepCanvas(id); if(!c) return; const {x,w,h}=c;
  const ink=tok('--ink'), mut=tok('--muted'), ln=tok('--line');
  x.font='10.5px '+tok('--mono');
  const S=series.filter(s=>s&&s.x.length>1);
  if(!S.length){ x.fillStyle=mut; x.fillText('nessun dato',10,20); return; }
  const fin=v=>Number.isFinite(v), xs=[], ys=[];
  for(const s of S) for(let i=0;i<s.x.length;i++) if(fin(s.x[i])&&fin(s.y[i])){ xs.push(s.x[i]); ys.push(s.y[i]); }
  // asse y robusto: p = dW/dV può avere picchi isolati dove V quasi non cambia
  const sy0=[...ys].sort((a,b)=>a-b), q=f=>sy0[Math.min(sy0.length-1,Math.max(0,Math.round(f*(sy0.length-1))))];
  let x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(0,q(0.01)), y1=q(0.99);
  if(x1-x0<1e-12){ x0-=1; x1+=1; } if(y1-y0<1e-12){ y1=y0+1; }
  const pd=(y1-y0)*0.08; y1+=pd; if(y0<0) y0-=pd;
  const L=46,R=8,T=10,B=26, sx=v=>L+(v-x0)/(x1-x0)*(w-L-R), sy=v=>T+(y1-v)/(y1-y0)*(h-T-B);
  x.strokeStyle=ln; x.lineWidth=1; x.fillStyle=mut;
  for(const t of niceTicks(y0,y1,4)){ const yy=Math.round(sy(t))+0.5; x.beginPath(); x.moveTo(L,yy); x.lineTo(w-R,yy); x.stroke(); x.textAlign='right'; x.fillText(fy?fy(t):String(t),L-4,yy+3); }
  x.textAlign='center'; for(const t of niceTicks(x0,x1,4)) x.fillText(fx?fx(t):String(t),sx(t),h-B+13);
  x.fillText(xl,(L+w-R)/2,h-2); x.save(); x.translate(9,(T+h-B)/2); x.rotate(-Math.PI/2); x.fillText(yl,0,0); x.restore();
  x.save(); x.beginPath(); x.rect(L,T,w-L-R,h-T-B); x.clip(); x.lineJoin='round';
  for(const s of S){
    x.strokeStyle=tok(s.col); x.lineWidth=s.dash?1.4:2; x.setLineDash(s.dash?[5,3]:[]); x.beginPath(); let on=false;
    for(let i=0;i<s.x.length;i++){ if(!fin(s.x[i])||!fin(s.y[i])){ on=false; continue; } const px=sx(s.x[i]), py=sy(Math.max(y0-(y1-y0),Math.min(y1+(y1-y0),s.y[i]))); on?x.lineTo(px,py):x.moveTo(px,py); on=true; }
    x.stroke();
  }
  x.setLineDash([]); x.restore();
  // legenda
  x.textAlign='left'; let ly=T+12;
  for(const s of S){ if(!s.label) continue; const tw=x.measureText(s.label).width; x.fillStyle=tok('--field'); x.globalAlpha=0.85; x.fillRect(w-R-tw-34,ly-10,tw+30,14); x.globalAlpha=1;
    x.strokeStyle=tok(s.col); x.lineWidth=2; x.setLineDash(s.dash?[5,3]:[]); x.beginPath(); x.moveTo(w-R-tw-30,ly-3); x.lineTo(w-R-tw-12,ly-3); x.stroke(); x.setLineDash([]);
    x.fillStyle=ink; x.fillText(s.label,w-R-tw-6,ly); ly+=15; }
  return {x,sx,sy,T,B,h};
}
