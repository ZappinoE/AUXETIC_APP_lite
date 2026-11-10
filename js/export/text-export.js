/* ---------- esportazione ---------- */
$('bExp').onclick=()=>{
  if(!curS){$('exp').value='Genera prima le celle (passo 3) con una geometria valida.';return;}
  const P=cur.P,G=cur.A.G, f=n=>n.toFixed(5);
  const xyz=p=>{const a=p[0]/P.R; return f(P.R*Math.cos(a))+' '+f(P.R*Math.sin(a))+' '+f(p[1]);};
  const L=['** Tubo auxetico bistabile · cella '+(P.type==='square'?'quadrata':'parallelogramma')+
    ' · R='+P.R+' Heff='+G.Heff.toFixed(3)+' Nc='+P.Nc+' Na='+G.Na+' L='+G.L.toFixed(4)+' cerniera='+P.hw+' spessore='+P.s,
    '** righe (dal basso): '+ROWS.map((r,j)=>(j+1)+': theta='+r.th+' Y='+r.y+' t='+tOfY(r.y,P.type).toFixed(5)+' k='+(P.k0*r.f).toPrecision(4)+' kth='+(P.kth0*r.f).toPrecision(4)+' kb='+(P.kb0*r.f).toPrecision(4)).join(' | '),
    '*PART, id, tipo, blocco, riga, gruppo, nvert, x y z ...'];
  curS.parts.forEach((p,i)=>L.push((i+1)+', '+p.kind+', '+(p.block+1)+', '+(p.row+1)+', '+p.group+', '+p.pts.length+', '+p.pts.map(xyz).join(', ')));
  L.push('*HINGE, id, x y z, parte_rotante, parte_esterna, riga');
  curS.hinges.forEach((h,i)=>L.push((i+1)+', '+xyz(h.p)+', '+(h.rot+1)+', '+(h.est+1)+', '+(h.row+1)));
  $('exp').value=L.join('\n');
};
$('bCopy').onclick=()=>{
  const ta=$('exp'); if(!ta.value) $('bExp').onclick();
  const done=()=>{$('bCopy').textContent='Copiato'; setTimeout(()=>$('bCopy').textContent='Copia',1400);};
  try{ navigator.clipboard.writeText(ta.value).then(done,()=>{ta.focus();ta.select();}); }catch(e){ta.focus();ta.select();}
};
