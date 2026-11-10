function readP(){
  const type=$('type').value, y0=Math.max(1e-4,+$('y0').value||0);
  return {
    R:Math.max(0.5,+$('R').value||0), H:Math.max(0.5,+$('H').value||0),
    type, Nc:Math.max(2,Math.round(+$('Nc').value||2)),
    theta:Math.max(0,+$('theta').value||0), y0, t:tOfY(y0,type),
    hw:Math.max(0.001,+$('hw').value||0.001), s:Math.max(0.01,+$('thk').value||0.01),
    k0:Math.max(1e-6,+$('kt').value||0), kth0:Math.max(0,+$('kth').value||0), kb0:Math.max(0,+$('kb').value||0),
    ends:$('ends').value, closed:$('ends').value==='bulkhead'||$('closed').checked, base:$('ends').value==='base',
    dev:{on:$('ends').value==='bulkhead'&&$('dev').checked, k1:Math.max(0,+$('dK1').value||0), k3:Math.max(0,+$('dK3').value||0), s0:Math.max(0,+$('dS0').value||0)}
  };
}

/* ---------- righe lungo z: θ (rastremazione), Y (larghezza alla radice), fattore k ---------- */
let ROWS=[], rowsNa=-1, SELROW=0, tableForce=true;
const PROF={preset:'uniforme',th:[0,0,0],y:[0.1,0.1,0.1],f:[1,1,1]};
function presetVals(name,th0,y0){
  const T=[th0,th0,th0];
  switch(name){
    case 'botte': return {th:T,y:[2*y0,y0,2*y0],f:[2,1,2]};
    case 'clessidra': return {th:T,y:[y0,2*y0,y0],f:[1,2,1]};
    case 'cono': return {th:T,y:[y0,1.5*y0,2*y0],f:[1,1.5,2]};
    case 'conoinv': return {th:T,y:[2*y0,1.5*y0,y0],f:[2,1.5,1]};
    case 'sequenza': return {th:T,y:[y0,y0,y0],f:[0.5,1,2]};
    case 'capsula': return {th:T,y:[3*y0,y0,3*y0],f:[1,1,1]};
    default: return {th:T,y:[y0,y0,y0],f:[1,1,1]};
  }
}
const interp3=(a,z)=>a[0]*2*(z-0.5)*(z-1)+a[1]*(-4*z*(z-1))+a[2]*2*z*(z-0.5);
/* colori delle Y per larghezza alla radice: sottile -> --ythin, spessa -> --ythick */
function rowColors(P,G){
  const ys=ROWS.map(r=>r.y), mn=Math.min(...ys), mx=Math.max(...ys);
  if(mx-mn<1e-9) return ROWS.map(()=>new THREE.Color(tok(P.type==='hex'?'--ythin':'--lat')));
  const c0=new THREE.Color(tok('--ythin')), c1=new THREE.Color(tok('--ythick'));
  return ys.map(y=>c0.clone().lerp(c1,(y-mn)/(mx-mn)));
}
const PROFIDS=[['thb','th',0],['thc','th',1],['tht','th',2],['yb','y',0],['yc','y',1],['yt','y',2],['fb','f',0],['fc','f',1],['ft','f',2]];
function fillProfInputs(){PROFIDS.forEach(([id,k,i])=>$(id).value=+(+PROF[k][i]).toFixed(4));}
function applyPreset(){
  const P=readP();
  if(PROF.preset!=='custom'){const v=presetVals(PROF.preset,P.theta,P.y0); PROF.th=v.th; PROF.y=v.y; PROF.f=v.f; fillProfInputs();}
}
function rowsFromProfile(Na){
  ROWS=[];
  for(let j=0;j<Na;j++){
    const z=Na>1?j/(Na-1):0.5;
    // capsula: parte centrale cilindrica (Y₀) e calotte vicino ai bulkhead, con Y che cresce verso le estremità.
    // Fattori tarati sul modello a colonna del tubo di default (Ø 4 m, L = 0,605 m) a 0,9 atm: profilo a semisfere di raggio ≈ 3,5 m.
    const capY=[3.0,2.15,1.3,0.95], dEnd=Math.min(j,Na-1-j);
    const yv=PROF.preset==='capsula'?(dEnd<capY.length?capY[dEnd]:1)*PROF.y[1]:interp3(PROF.y,z);
    ROWS.push({th:+Math.max(0,interp3(PROF.th,z)).toFixed(1), y:+Math.max(1e-4,yv).toFixed(3), f:+Math.max(0.01,interp3(PROF.f,z)).toFixed(2)});
  }
  rowsNa=Na; tableForce=true;
  $('pz').textContent=PROF.preset==='custom'?'personalizzato':$('preset').selectedOptions[0].textContent.split(' ·')[0].toLowerCase();
  $('pz').classList.toggle('done',PROF.preset!=='uniforme');
}
const rowParams=P=>ROWS.map(r=>({th:r.th,y:r.y,f:r.f,k:P.k0*r.f,kth:P.kth0*r.f,kb:P.kb0*r.f}));

function renderRowsTable(P,G){
  const tb=$('rowsBody');
  if(tableForce||tb.children.length!==ROWS.length){
    tb.innerHTML='';
    for(let j=ROWS.length-1;j>=0;j--){
      const tr=document.createElement('tr'); tr.dataset.j=j;
      tr.innerHTML='<td class="rn">'+(j+1)+'</td><td class="num" data-c="z"></td>'+
        '<td><input type="number" step="0.5" min="0" id="rth'+j+'" data-j="'+j+'" data-f="th"></td>'+
        '<td><input type="number" step="0.005" min="0.0001" id="ry'+j+'" data-j="'+j+'" data-f="y"></td>'+
        '<td><input type="number" step="0.1" min="0.01" id="rf'+j+'" data-j="'+j+'" data-f="f"></td>'+
        '<td class="num" data-c="k"></td><td class="num" data-c="ro"></td>';
      tb.appendChild(tr);
    }
    tableForce=false;
  }
  const cols=rowColors(P,G);
  for(const tr of tb.children){
    const j=+tr.dataset.j, r=ROWS[j];
    tr.querySelector('.rn').style.boxShadow='inset 4px 0 0 #'+cols[j].getHexString();
    tr.classList.toggle('sel',j===SELROW);
    for(const f of ['th','y','f']){const el=tr.querySelector('[data-f="'+f+'"]'); if(document.activeElement!==el) el.value=r[f];}
    tr.querySelector('[data-c="z"]').textContent=fmt(j*G.Hc,2)+'–'+fmt((j+1)*G.Hc,2);
    tr.querySelector('[data-c="k"]').textContent=fmt(P.k0*r.f/1000,1);
    const e=EST.get(estKey(P,G,r.th,tOfY(r.y,P.type)));
    tr.querySelector('[data-c="ro"]').textContent=e?(Number.isFinite(e.lopen)?fmt(e.lopen*P.R,3):'no'):'…';
    tr.classList.toggle('bad',!!(cur&&cur.A&&cur.A.badRows&&cur.A.badRows.includes(j)));
  }
}
