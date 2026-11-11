/* ===================== SEZIONI "CELLA SINGOLA" E "SUPERFICIE PIANA" =====================
   Una sola implementazione per le due pagine (prefisso c = cella, p = piano). Unità: mm, N, MPa, N·mm. */
const LT=(typeof LITE!=='undefined')&&LITE;   // versione web: solo solutore interno
const PLC={hinge:null};   // rigidezza della cerniera calcolata con MUL2 (condivisa fra le due pagine): {k, kth, tab, info}
const PL={};               // stato delle pagine: PL.c, PL.p

function plFieldsHTML(px,kind){
  const f=(id,lab,u,val,step,min)=>'<label class="f">'+lab+(u?' <span class="u">'+u+'</span>':'')+'<input type="number" id="'+px+id+'" value="'+val+'" step="'+step+'"'+(min!=null?' min="'+min+'"':'')+'></label>';
  const cell=kind==='cell';
  return '<header><h1>'+(cell?'Cella singola':'Superficie piana')+'</h1><p>'+(cell?
      'Cella di corpi rigidi (esagonale: Y centrale e 6 triangoli rotanti; quadrata: 4 blocchi specchiati) uniti da cerniere elastiche: con i vincoli di simmetria oppure libera, tirata dall\u2019alto e incastrata in basso. Percorso di equilibrio con rotazioni, spostamenti ed energia di ogni cerniera.':
      'Pannello piano di N<sub>x</sub> × N<sub>y</sub> celle: scegli i corpi da bloccare e quelli da tirare e segui il percorso di equilibrio fino allo scatto.')+'</p></header>'+
  '<section class="step"><div class="step-head"><span class="n">1</span><h2>Geometria</h2></div>'+
    (cell?'<label class="f">Tipo di cella<select id="csType"><option value="hex" selected>Esagonale · Y centrale, 6 triangoli rotanti</option><option value="square">Quadrata · 4 blocchi quadrati specchiati</option></select></label>':
    '<label class="f">Tipo di cella<select id="'+px+'Type"><option value="hex" selected>Esagonale · Y con triangoli rotanti</option><option value="square">Quadrata · 4 blocchi quadrati specchiati</option><option value="para">Parallelogramma · 8 blocchi triangolari</option></select></label>')+
    '<div class="grid2">'+f('L','Lato del blocco L','mm',20,1,0.1)+f('Th','Angolo di taglio θ','gradi',0,0.5,0)+f('Y','Larghezza Y alla radice','mm',5,0.1,0.01)+f('S','Spessore piastre s','mm',3,0.5,0.01)+
    (cell?'':f('Nx','Celle N<sub>x</sub>','',4,1,1)+f('Ny','Celle N<sub>y</sub>','',4,1,1))+'</div>'+
    '<div class="info" id="'+px+'GeoInfo"></div><div class="msg" id="'+px+'GeoMsg"></div><div class="sketch" id="'+px+'Sketch"></div></section>'+
  '<section class="step"><div class="step-head"><span class="n">2</span><h2>Cerniera</h2><span class="pill" id="'+px+'KPill">materiale</span></div>'+
    '<label class="f">Rigidezza<select id="'+px+'KSrc"><option value="mat" selected>Dalla lamina: E, w, ℓ, s</option><option value="val">Valori dati</option>'+(LT?'':'<option value="mul2">Calcolata con MUL2 (anche non lineare)</option>')+'</select></label>'+
    '<div class="grid3" id="'+px+'KMat">'+f('E','Modulo E','MPa',30,1,0.001)+f('W','Larghezza w','mm',0.8,0.1,0.001)+f('Lh','Lunghezza ℓ','mm',3,0.1,0.001)+'</div>'+
    '<div class="sketch" id="'+px+'HSketch">'+plHingeSketch(px)+'</div>'+
    '<div class="grid3" id="'+px+'KVal" hidden>'+f('K','k lungo la striscia','N/mm',24,1,0)+f('Kt','k di traverso','N/mm',1.4,0.1,0)+f('Kth','k<sub>θ</sub> per cerniera','N·mm/rad',1.28,0.1,0)+'</div>'+
    '<label class="chk"><input type="checkbox" id="'+px+'Iso" checked> Stessa rigidezza in tutte le direzioni del piano (come nella tesi)</label>'+
    '<div class="info" id="'+px+'KInfo"></div>'+
    (LT?'':'<details><summary style="font-size:12px">Dati per MUL2 (piastre con strisce di TPU)</summary><div class="grid3" style="margin-top:6px">'+
      f('Gap','Gioco dei tagli','mm',0.3,0.05,0.01)+f('Epla','E delle parti rigide (PLA)','MPa',3500,100,1)+f('NuT','ν della cerniera (TPU)','',0.45,0.01,0)+
      '<label class="f">Legge della cerniera<select id="'+px+'Law"><option value="NEOHOOKE" selected>Neo-Hooke</option><option value="SVK">Saint-Venant-Kirchhoff</option></select></label>'+f('Nst','Passi arc length','',60,10,10)+'</div>'+
      '<p class="note">La cerniera di MUL2 è la striscia di TPU larga w, lunga ℓ (tratto libero), spessa s, fra parti rigide separate dal gioco dei tagli.</p></details>'+
    '<div class="row"><button class="ghost" id="'+px+'KMul2">Calcola k e k<sub>θ</sub>(φ) con MUL2</button><span class="note" id="'+px+'KMul2Msg"></span></div>'+
    '<canvas id="'+px+'KChart" class="mlc" hidden aria-label="Momento in funzione della rotazione della cerniera (MUL2)"></canvas>')+
    '<p class="note">La cerniera tiene uniti il poligono e la Y nel punto di cerniera con due rigidezze: k lungo la striscia (la direzione del taglio, solidale alla Y) e k<sub>t</sub> di traverso, dove la striscia si flette ed è molto più cedevole; ne frena la rotazione relativa φ con k<sub>θ</sub> (energia ½k<sub>θ</sub>φ² per <b>ogni</b> cerniera, oppure la curva M(φ) calcolata con MUL2). Dal materiale: k = E·w·s/ℓ, k<sub>t</sub> = 1/(ℓ³/(12EI) + ℓ/(κGws)) con I = s·w³/12 (taglio con le estremità che non ruotano), k<sub>θ</sub> = E·s·w³/(12ℓ).</p></section>'+
  '<section class="step"><div class="step-head"><span class="n">3</span><h2>'+(cell?'Carico':'Vincoli e carico')+'</h2></div>'+
    (cell?
      '<input type="hidden" id="csBc" value="sym"><p class="note">Vincoli di simmetria: cella periodica, Y senza rotazione, espansione equibiassiale (λ).</p>'+
      '<label class="f">Carico<select id="csCtrl"><option value="disp" selected>Spostamento imposto</option><option value="force">Forza imposta</option></select></label>'+
      '<div class="grid2">'+f('Lmax','Allungamento massimo λ','',1.6,0.05,1.001)+f('Fl','Forza generalizzata massima ∂E/∂λ','N·mm',1500,50,1)+'</div>'+
      '<label class="chk"><input type="checkbox" id="csRel"> Alla fine lascia andare: il carico si annulla e la cella torna a un equilibrio (solutore interno)</label>'+
      '<p class="note">Con lo spostamento imposto si segue il percorso a controllo di spostamento, con la forza imposta quello a controllo di forza (lo scatto compare come tratto che torna indietro). Il rilascio parte dall\u2019ultimo stato, toglie il carico e rilassa la struttura al minimo di energia: è il ramo verde della curva e gli ultimi stati del cursore.</p>'
    :
      '<div class="row"><span class="note">Clic sui corpi:</span><span class="seg" id="psTools"><button data-t="fix" aria-pressed="true">Blocca</button><button data-t="pull" aria-pressed="false">Tira</button><button data-t="free" aria-pressed="false">Libera</button></span></div>'+
      '<div class="row"><select id="psPreset"><option value="lr">Bordo sinistro bloccato, destro tirato</option><option value="bt">Bordo inferiore bloccato, superiore tirato</option><option value="lr2">Tirati i due bordi laterali (simmetrico)</option><option value="none">Tutti liberi</option></select><button class="ghost" id="psPresetGo">Applica</button></div>'+
      '<div class="grid3"><label class="f">Direzione<select id="psDir"><option value="x" selected>x</option><option value="y">y</option><option value="a">angolo</option></select></label>'+f('Ang','Angolo','gradi',0,5)+f('Dmax','Spostamento massimo','mm',20,1,0.01)+'</div>'+
      '<label class="chk"><input type="checkbox" id="psGrip" checked> Presa rigida (corpi tirati senza spostamento trasversale né rotazione)</label>'+
      '<div class="info" id="psBcInfo"></div>')+
    '</section>'+
  '<section class="step"><div class="step-head"><span class="n">4</span><h2>Analisi</h2><span class="pill" id="'+px+'RunPill">–</span></div>'+
    '<label class="f"'+(LT?' hidden':'')+'>Solutore<select id="'+px+'Solver"><option value="int" selected>Interno (immediato)</option>'+(LT?'':'<option value="matlab">'+(cell?'MATLAB · Simscape Multibody (corpi rigidi, dinamica lenta)':'MATLAB (solutore indipendente)')+'</option><option value="mul2">MUL2 (piastre CUF, non lineare 108)</option><option value="adams">ADAMS (remoto)</option>')+'</select></label>'+
    '<div class="row"><button class="go" id="'+px+'Run">Calcola</button><button class="ghost" id="'+px+'Stop" hidden>Interrompi</button><div class="bar"><div id="'+px+'Bar"></div></div></div>'+
    '<div class="msg" id="'+px+'Msg"></div><div class="state" id="'+px+'State"></div>'+
    '<div class="row"><select id="'+px+'Yq"><option value="F" selected>'+(cell?'Forza generalizzata ∂E/∂λ':'Reazione F')+'</option>'+'<option value="E">Energia elastica</option></select></div>'+
    '<canvas id="'+px+'ChartF" class="mlc" aria-label="Curva di equilibrio"></canvas>'+
    '<label class="f">Stato sul percorso<input type="range" id="'+px+'Scrub" min="0" max="0" value="0" step="1" style="width:100%;margin-top:6px"></label>'+
    '<div class="info" id="'+px+'Info"></div>'+
    '<p class="note">Percorso a spostamento imposto con arc length: segue anche i rami instabili (tratteggiati: la tangente ha autovalori negativi). Un ramo tratteggiato fra due stabili vuol dire scatto sotto forza imposta; un tratto in cui la curva torna indietro è uno snap-back.</p></section>'+
  '<section class="step"><div class="step-head"><span class="n">5</span><h2>Cerniere</h2></div>'+
    '<div class="row"><select id="'+px+'Hq"><option value="phi" selected>Rotazione relativa φ</option><option value="d">Spostamento relativo |δ|</option><option value="E">Energia totale</option><option value="Er">Energia di rotazione</option><option value="Et">Energia di traslazione</option><option value="M">Momento M</option></select><span class="note" id="'+px+'HSel">clic su una cerniera nella vista</span></div>'+
    '<canvas id="'+px+'ChartH" class="mlc" aria-label="Evoluzione della cerniera scelta"></canvas>'+
    '<div class="tblwrap"><table class="rows"><thead><tr><th>Cerniera</th><th>φ [°]</th><th>|δ| [mm]</th><th>E [mJ]</th><th>quota</th></tr></thead><tbody id="'+px+'HTab"></tbody></table></div></section>'+
  '<section class="step"><div class="step-head"><span class="n">6</span><h2>Esporta</h2></div>'+
    '<div class="row"><button class="ghost" id="'+px+'XCsv">Risultati CSV</button><button class="ghost" id="'+px+'XJson">Modello JSON</button>'+(LT?'':'<button class="ghost" id="'+px+'XMul2">MUL2 (ZIP)</button><button class="ghost" id="'+px+'XAdams">ADAMS .cmd</button>')+'</div>'+
    '<div class="msg" id="'+px+'XMsg"></div></section>';
}

/* schizzo della cerniera: la striscia di lamina fra due parti rigide */
function plHingeSketch(px){
  const t=(x,y,c,ex)=>'<text x="'+x+'" y="'+y+'" text-anchor="middle" '+(ex||'')+'>'+c+'</text>';
  const dim=(x1,y1,x2,y2,tx,ty,c)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" style="stroke:var(--ink)" stroke-width=".9" marker-start="url(#ar'+px+')" marker-end="url(#ar'+px+')"/>'+t(tx,ty,c);
  let g='<defs><marker id="ar'+px+'" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L6,3L0,6z" style="fill:var(--ink)"/></marker></defs>';
  // vista in pianta: due parti rigide e la striscia
  g+=t(150,14,'Vista nel piano della cella','style="fill:var(--muted)"');
  g+='<rect x="20" y="30" width="80" height="70" rx="3" style="fill:var(--lat);stroke:var(--vpgrid)"/><rect x="200" y="30" width="80" height="70" rx="3" style="fill:var(--lat);stroke:var(--vpgrid)"/>'+
     '<rect x="100" y="55" width="100" height="20" style="fill:var(--accent);opacity:.85"/>';
  g+=t(60,68,'parte rigida')+t(240,68,'parte rigida')+t(143,69,'lamina','style="fill:var(--accent-ink)"');
  g+=dim(100,112,200,112,150,126,'ℓ (lunghezza libera)')+dim(184,55,184,75,0,0,'')+t(190,69,'w','text-anchor="start" style="fill:var(--accent-ink)"');
  // sezione della striscia: w nel piano, s fuori dal piano
  g+=t(150,150,'Sezione della striscia','style="fill:var(--muted)"');
  g+='<rect x="125" y="160" width="50" height="26" style="fill:var(--accent);opacity:.85;stroke:var(--ink)" stroke-width=".8"/>'+
     dim(125,196,175,196,150,210,'w')+dim(190,160,190,186,200,176,'')+t(206,170,'s (spessore)','text-anchor="start"');
  return '<svg class="sm" viewBox="0 0 300 220" role="img" aria-label="Schizzo della cerniera: striscia di lamina fra due parti rigide">'+g+'</svg>'+
    '<ul class="legend"><li>La cerniera è la <b>striscia di lamina</b> che resta fra le due parti rigide dopo i tagli: larga <b>w</b> (nel piano), lunga <b>ℓ</b> (tratto libero) e spessa <b>s</b> (come la piastra, fuori dal piano).</li>'+
    '<li><b>Dalla lamina</b> = rigidezze calcolate dal materiale come una trave tozza: allungamento <b>k = E·w·s/ℓ</b>, rotazione nel piano <b>k<sub>θ</sub> = E·I/ℓ</b> con <b>I = s·w³/12</b>.</li>'+
    '<li>Il punto di cerniera è sempre il <b>vertice</b> della figura rotante, dove si incontrano i tagli (come nella tesi).</li>'+
    '<li><b>Stessa rigidezza in tutte le direzioni</b>: la cerniera è una molla che trattiene il punto di cerniera con la stessa rigidezza k lungo la striscia e di traverso (come nella tesi). Se la spegni, di traverso la striscia è più cedevole (flessione e taglio).</li></ul>';
}

/* parametri letti dal pannello */
function plPar(px){
  const v=(id,d)=>{ const e=$(px+id), x=e?+e.value:NaN; return Number.isFinite(x)?x:d; };
  const par={type:$(px+'Type').value, L:Math.max(0.01,v('L',20)), th:Math.max(0,v('Th',0)), Y:Math.max(1e-3,v('Y',3)), s:Math.max(1e-3,v('S',3))};
  const src=$(px+'KSrc').value;
  if(src==='val'){ par.k=Math.max(0,v('K',1)); par.kt=Math.max(0,v('Kt',par.k)); par.kth=Math.max(0,v('Kth',0)); par.tab=null; par.ksrc='valori dati'; }
  else if(src==='mul2'&&PLC.hinge){ par.k=PLC.hinge.k; par.kt=PLC.hinge.kt==null?PLC.hinge.k:PLC.hinge.kt; par.kth=PLC.hinge.kth; par.tab=PLC.hinge.tab; par.ksrc='MUL2'; }
  else { const K=plHingeK(v('E',30),v('W',0.8),par.s,v('Lh',3),v('NuT',0.45)); par.k=K.k; par.kt=K.kt; par.kth=K.kth; par.tab=null; par.ksrc=src==='mul2'?'materiale (MUL2 non ancora calcolato)':'materiale'; par.Eh=v('E',30); par.w=v('W',0.8); par.lh=v('Lh',3); }
  if($(px+'Iso').checked) par.kt=par.k;
  par.pivot='corner'; par.gap=Math.max(0.01,v('Gap',0.3));
  if(src!=='mat'){ par.Eh=v('E',30); par.w=v('W',0.8); par.lh=v('Lh',3); }
  if(px==='ps'){ par.nx=Math.max(1,Math.min(30,Math.round(v('Nx',4)))); par.ny=Math.max(1,Math.min(30,Math.round(v('Ny',4)))); }
  return par;
}

/* costruzione del modello della pagina (senza risultati) */
function plBuild(S){
  const par=plPar(S.px); S.par=par; S.res=null; S.hist=null; S.k=0;
  $(S.px+'GeoMsg').textContent='';
  try{
    if(S.kind==='cell'){ const bc='sym', ct=$('csCtrl').value, show=(id,on)=>{ $(id).closest('label').hidden=!on; };
      show('csLmax',bc==='sym'&&ct==='disp'); show('csFl',bc==='sym'&&ct==='force');
      S.M=par.type==='square'?plSquareCellModel(par,bc,$('csCtrl').value):plHexModel(par,bc,$('csCtrl').value); }
    else {
      const key=[par.type,par.L,par.th,par.Y,par.nx,par.ny].join('|');
      S.M=plPlaneModel(par,par.nx,par.ny);
      if(S.bcKey!==key){ S.bc=new Map(); S.bcKey=key; plPreset(S,'lr'); }
    }
  }catch(e){ S.M=null; $(S.px+'GeoMsg').textContent=e.message; }
  plInfo(S); plFit(S); plDraw(S); plCharts(S);
}

/* schizzo del blocco con il significato dei parametri (si aggiorna con i valori correnti) */
function plSketch(par){
  const {B,N,t}=plBlock(par); if(!B.ok) return '';
  const W=300, Hh=270, pad=44, V=B.V, xy=q=>P(q).split(',');
  let mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18; for(const q of V){ mnx=Math.min(mnx,q[0]); mny=Math.min(mny,q[1]); mxx=Math.max(mxx,q[0]); mxy=Math.max(mxy,q[1]); }
  const sc=Math.min((W-2*pad)/((mxx-mnx)||1),(Hh-2*pad)/((mxy-mny)||1)), ox=(W-(mxx-mnx)*sc)/2-mnx*sc, oy=(Hh+(mxy-mny)*sc)/2+mny*sc;
  function P(q){ return (ox+q[0]*sc).toFixed(1)+','+(oy-q[1]*sc).toFixed(1); }
  const L=par.L, ext=2*Math.PI/N;
  const e=[(V[1][0]-V[0][0])/L,(V[1][1]-V[0][1])/L], nrm=[e[1],-e[0]];          // lato 0 e normale uscente
  const add=(a,b,k)=>[a[0]+b[0]*k,a[1]+b[1]*k];
  const txt=(q,c,extra)=>{ const z=xy(q); return '<text x="'+z[0]+'" y="'+z[1]+'" text-anchor="middle" '+(extra||'')+'>'+c+'</text>'; };
  let g='<polygon points="'+V.map(P).join(' ')+'" fill="none" style="stroke:var(--muted)" stroke-width="1" stroke-dasharray="4 3"/>'+
    '<polygon points="'+B.H.map(P).join(' ')+'" style="fill:var(--rot);stroke:var(--vpgrid)" stroke-width="1" opacity=".9"/>';
  for(let i=0;i<N;i++) g+='<polyline points="'+P(B.A[i])+' '+P(B.H[(i+1)%N])+'" fill="none" style="stroke:var(--cut)" stroke-width="1.6"/>';
  for(const h of B.H){ const z=xy(h); g+='<circle cx="'+z[0]+'" cy="'+z[1]+'" r="3.2" style="fill:var(--hinge);stroke:var(--ink)" stroke-width=".8"/>'; }
  // quota L sul lato 0, fuori dal blocco
  const o1=add(V[0],nrm,0.12*L), o2=add(V[1],nrm,0.12*L), mid=add(add(V[0],e,L/2),nrm,0.2*L);
  g+='<polyline points="'+P(V[0])+' '+P(o1)+' '+P(o2)+' '+P(V[1])+'" fill="none" style="stroke:var(--ink)" stroke-width=".9"/>'+txt(mid,'L');
  // t: distanza dell'inizio del taglio dal vertice V1, sul lato 0
  g+='<polyline points="'+P(B.A[0])+' '+P(V[1])+'" fill="none" style="stroke:var(--accent)" stroke-width="3.2"/>'+txt(add(add(V[1],e,-t/2),nrm,-0.12*L),'t','style="fill:var(--accent)"');
  // θ: angolo fra il taglio e il lato adiacente (θ = 0: taglio parallelo al lato successivo)
  const a0=Math.atan2(e[1],e[0])+ext, a1=a0+par.th*D2R, r=0.25*L, A0=B.A[0], za=xy(A0), zb=xy(add(A0,[Math.cos(a0),Math.sin(a0)],0.4*L));
  g+='<line x1="'+za[0]+'" y1="'+za[1]+'" x2="'+zb[0]+'" y2="'+zb[1]+'" style="stroke:var(--muted)" stroke-width=".9" stroke-dasharray="2 2"/>';
  const arc=[]; for(let k=0;k<=12;k++){ const a=a0+(a1-a0)*k/12; arc.push(P(add(A0,[Math.cos(a),Math.sin(a)],r))); }
  const am=(a0+a1)/2;
  if(par.th>0.5) g+='<polyline points="'+arc.join(' ')+'" fill="none" style="stroke:var(--ink)" stroke-width="1"/>';
  g+=txt(add(A0,[Math.cos(am+0.45),Math.sin(am+0.45)],r*1.6),'θ');
  const cc=B.H.reduce((a,h)=>[a[0]+h[0]/N,a[1]+h[1]/N],[0,0]);
  g+=txt(cc,'rotante','dy="4" style="fill:var(--accent-ink)"');
  return '<svg viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="Schizzo del blocco con i parametri L, θ, t, Y">'+g+'</svg>'+
    '<ul class="legend"><li><b>L</b> lato del blocco (tratteggiato); i tagli sono in rosso, i punti sono le cerniere sui vertici del poligono rotante.</li>'+
    '<li><b>θ</b> angolo del taglio rispetto al lato adiacente (0° = taglio parallelo al lato successivo).</li>'+
    '<li><b>t</b> distanza dell’inizio del taglio dal vertice: t = Y / (2 sin '+Math.round(360/N)+'°) = '+fmt(t,3)+' mm.</li>'+
    '<li><b>Y</b> larghezza del braccio della Y alla radice (fra i due tagli che partono dallo stesso vertice).</li>'+
    '<li><b>s</b> spessore della piastra, fuori dal piano: non compare nel disegno ma entra nelle rigidezze della cerniera (k = E·w·s/ℓ).</li></ul>';
}
function plInfo(S){
  const par=S.par, M=S.M, px=S.px;
  const kp=$(px+'KPill'); kp.textContent=par.ksrc; kp.classList.toggle('done',par.ksrc==='MUL2');
  $(px+'KInfo').innerHTML='<span>k lungo la striscia · di traverso</span><b>'+fmt(par.k,3)+' · '+fmt(par.kt,3)+' N/mm</b><span>k<sub>θ</sub> per cerniera</span><b>'+(par.tab?'curva M(φ), iniziale '+fmt(par.kth,4):fmt(par.kth,4))+' N·mm/rad</b>';
  let sk=''; try{ sk=plSketch(par); }catch(e){}
  $(px+'Sketch').innerHTML=sk;
  if(!M){ $(px+'GeoInfo').innerHTML=''; return; }
  const {B}=plBlock(par);
  $(px+'GeoInfo').innerHTML='<span>Corpi · cerniere</span><b>'+M.bodies.length+' · '+M.hinges.length+'</b>'+
    '<span>Lato poligono centrale</span><b>'+fmt(B.side,3)+' mm</b><span>Rotazione poligono</span><b>'+fmt(B.rotDeg,1)+'°</b>'+
    (M.area?'<span>Area della cella</span><b>'+fmt(M.area,1)+' mm²</b>':'<span>Ingombro</span><b>'+fmt(M.box[2]-M.box[0],1)+' × '+fmt(M.box[3]-M.box[1],1)+' mm</b>');
  if(S.kind==='plane'){ let nf=0,np=0; S.bc.forEach(v=>{ if(v==='fix') nf++; else if(v==='pull') np++; }); $('psBcInfo').innerHTML='<span>Corpi bloccati · tirati</span><b>'+nf+' · '+np+'</b>'; }
}
/* vincoli preimpostati della superficie */
function plPreset(S,name){
  const M=S.M; if(!M) return; S.bc=new Map();
  const [x0,y0,x1,y1]=M.box, tol=0.55*S.par.L;
  M.bodies.forEach((b,i)=>{
    const near=(v,e)=>b.pts.some(pc=>pc.some(q=>Math.abs(q[v]-e)<1e-6*S.par.L))&&Math.abs(b.c[v]-e)<tol;
    if(name==='lr'){ if(near(0,x0)) S.bc.set(i,'fix'); else if(near(0,x1)) S.bc.set(i,'pull'); }
    else if(name==='bt'){ if(near(1,y0)) S.bc.set(i,'fix'); else if(near(1,y1)) S.bc.set(i,'pull'); }
    else if(name==='lr2'){ if(near(0,x0)) S.bc.set(i,'pullneg'); else if(near(0,x1)) S.bc.set(i,'pull'); }
  });
  if(name==='bt'){ $('psDir').value='y'; } else if(name!=='none'){ $('psDir').value='x'; }
}
function plDirVec(){ const d=$('psDir').value; if(d==='x') return [1,0]; if(d==='y') return [0,1]; const a=(+$('psAng').value||0)*D2R; return [Math.cos(a),Math.sin(a)]; }
/* modello con i vincoli correnti, pronto per il calcolo */
function plReady(S){
  if(!S.M) throw new Error($(S.px+'GeoMsg').textContent||'geometria non valida');
  if(S.kind==='cell'){
    {
      if(S.M.ctrl==='force'){ const Fm=Math.max(1e-6,+$('csFl').value||1500); return {M:S.M, tmax:Fm, tscale:Fm, xlab:'λ', x0:0, force:true}; }
      return {M:S.M, tmax:Math.max(0.001,(+$('csLmax').value||1.6)-1), tscale:1, xlab:'λ', x0:1};
    }
  }
  const fix=[], pull=[], neg=[]; S.bc.forEach((v,i)=>{ if(v==='fix') fix.push(i); else if(v==='pull') pull.push(i); else if(v==='pullneg') neg.push(i); });
  if(!fix.length&&!neg.length) throw new Error('blocca almeno un corpo (oppure tira da due lati opposti)');
  if(!pull.length&&!neg.length) throw new Error('scegli almeno un corpo da tirare');
  const d=plDirVec(), grip=$('psGrip').checked;
  plPlaneBC(S.M,fix,pull,d,grip);
  if(neg.length){ const M2={ctl:[]}; plPlaneBC(M2,[],neg,[-d[0],-d[1]],grip); S.M.ctl=S.M.ctl.concat(M2.ctl); }
  // senza corpi bloccati (tirati da due lati) resta libera la traslazione trasversale e la rotazione rigida: si blocca il corpo centrale in quella direzione
  if(!fix.length){ let best=0,bd=1e18; const cx=(S.M.box[0]+S.M.box[2])/2, cy=(S.M.box[1]+S.M.box[3])/2; S.M.bodies.forEach((b,i)=>{ const dd=Math.hypot(b.c[0]-cx,b.c[1]-cy); if(dd<bd){bd=dd;best=i;} }); S.M.ctl.push({dof:3*best+(Math.abs(d[0])>=Math.abs(d[1])?1:0)}); }
  const Dmax=Math.max(0.01,+$('psDmax').value||20);
  // con due lati tirati lo spostamento relativo è 2t
  return {M:S.M, tmax:Dmax, tscale:S.par.L, xlab:'spostamento [mm]', x0:0};
}

/* ---------- calcolo ---------- */
function plRun(S){
  const px=S.px, msg=$(px+'Msg'); msg.textContent='';
  const solver=$(px+'Solver').value;
  plBuild(S);
  let R; try{ R=plReady(S); }catch(e){ msg.textContent=e.message; return; }
  if(solver!=='int'&&S.kind==='cell'&&S.par.type!=='hex'){ msg.textContent='La cella quadrata è disponibile solo con il solutore interno.'; return; }
  if(solver!=='int'&&S.kind==='cell'&&S.M&&S.M.bc==='sym'&&S.M.ctrl==='force'){ msg.textContent='Il carico a forza in simmetria è disponibile solo con il solutore interno.'; return; }
  if(solver==='matlab') return plRunMatlab(S,R);
  if(solver==='mul2') return plRunMul2(S,R);
  if(solver==='adams') return plRunAdams(S,R);
  plState(S,'Calcolo…','--accent'); $(px+'Bar').style.width='10%';
  setTimeout(()=>{
    const t0=performance.now();
    try{ S.res=plPath(R.M,{tmax:R.tmax,tscale:R.tscale,maxSteps:600}); }
    catch(e){ msg.textContent='Calcolo non riuscito: '+e.message; plState(S,''); return; }
    S.res.src='interno'; S.res.ms=performance.now()-t0; S.R=R;
    if(S.kind==='cell'&&$('csRel')&&$('csRel').checked){ try{ plAddRelease(S,R,S.res); }catch(e){ msg.textContent='Rilascio non riuscito: '+e.message; } }
    plResults(S);
  },30);
}
function plState(S,txt,col){ $(S.px+'State').innerHTML=txt?'<span class="dot" style="background:'+tok(col||'--muted')+'"></span>'+xe(txt):''; }
/* risultati pronti (da qualunque solutore che restituisce t, F, E, neg, z) */
function plResults(S){
  const px=S.px, r=S.res, n=r.t.length;
  S.hist=null; S.k=n-1; $(px+'Bar').style.width='100%';
  const sc=$(px+'Scrub'); sc.max=Math.max(0,n-1); sc.value=n-1;
  const nUn=r.neg.filter(v=>v>0).length;
  plState(S,'Percorso di '+n+' stati ('+r.src+(r.ms?', '+Math.round(r.ms)+' ms':'')+')'+(r.stopped?': '+r.stopped:''),nUn?'--warn':'--ok');
  const pill=$(px+'RunPill'); pill.textContent=r.src; pill.classList.add('done');
  plFit(S); plDraw(S); plCharts(S);
}
/* rilascio: aggiunge al percorso gli stati del ritorno all'equilibrio (carico nullo; ascissa = grandezza misurata) */
function plAddRelease(S,R,res){
  const M=R.M, nb=M.bodies.length, n=res.t.length, rel=plRelease(M,res.z[n-1],{}), per=M.periodic;
  for(let k=1;k<rel.z.length;k++){ const z=rel.z[k];
    res.t.push((per?(z[3*nb]+z[3*nb+1])/2:z[3*M.iTop+1])-R.x0); res.F.push(0); res.E.push(rel.E[k]); res.neg.push(0); res.z.push(z); res.iters.push(0); }
  res.nPath=n; res.release={converged:rel.converged,neg:rel.neg,n:rel.z.length-1};
}
/* storia di ogni cerniera (calcolata quando serve) */
function plHist(S){
  if(S.hist) return S.hist;
  const r=S.res, M=S.R.M, nh=M.hinges.length, n=r.t.length, H={phi:[],d:[],E:[],Er:[],Et:[],M:[]};
  for(const q of Object.keys(H)) for(let h=0;h<nh;h++) H[q].push(new Float64Array(n));
  for(let k=0;k<n;k++){ const st=plHingeState(M,r.z[k]); for(let h=0;h<nh;h++){ const s=st[h]; H.phi[h][k]=s.phi/D2R; H.d[h][k]=s.d; H.E[h][k]=s.Et+s.Er; H.Er[h][k]=s.Er; H.Et[h][k]=s.Et; H.M[h][k]=s.M; } }
  S.hist=H; return H;
}

/* ---------- grafici ---------- */
function plSplit(x,y,neg){   // serie stabile (continua) e instabile (tratteggiata), spezzate con NaN
  const a=[], b=[];
  for(let i=0;i<x.length;i++){ const un=neg[i]>0, unP=i>0&&neg[i-1]>0;
    a.push(un&&!(i>0&&!unP)?NaN:y[i]); b.push(un||unP?y[i]:NaN); }
  return [a,b];
}
/* percorso del solutore interno per i vincoli correnti, sempre disegnato sullo sfondo del grafico (ricalcolato solo
   quando cambiano modello, vincoli o carico massimo) */
function plBackground(S){
  if(!S.M) return null;
  let R; try{ R=plReady(S); }catch(e){ return null; }
  const M=R.M, sig=[R.tmax,R.tscale,M.ctl.map(c=>c.dof+':'+(c.coef||0)+':'+(c.base||0)).join(','),(M.loads||[]).map(l=>l.dof).join(',')].join('|');
  if(S.bg&&S.bgM===M&&S.bgSig===sig) return S.bg;
  let res=null; try{ res=plPath(M,{tmax:R.tmax,tscale:R.tscale,maxSteps:600}); res.R=R; }catch(e){}
  S.bg=res; S.bgM=M; S.bgSig=sig; return res;
}
function plCharts(S){
  const px=S.px, r=S.res, fC=$(px+'ChartF'), hC=$(px+'ChartH');
  if(!fC||!hC) return;
  const bg=plBackground(S), q=$(px+'Yq').value;
  // grandezza del grafico per un percorso qualunque (risultato o sfondo)
  const yOf=(rr,M)=>q==='E'?rr.E:q==='lt'?(rr.z&&rr.z[0]&&!M.periodic?rr.z.map(z=>plHexLateral(M,z)):null):rr.F;
  const bgSer=R=>{ if(!bg) return null; const y=yOf(bg,bg.R.M); return y?{x:bg.t.map(t=>bg.R.x0+t),y,col:'--muted',dash:1,label:'solutore interno'}:null; };
  if((!r||!r.t.length)&&bg){
    const R=bg.R, yl=q==='E'?'energia [mJ]':q==='lt'?'ε_x (vertici laterali)':S.kind==='cell'&&R.M.periodic?'∂E/∂λ [N·mm]':'F [N]';
    mlPlot(px+'ChartF',[bgSer(R)],R.xlab,yl,v=>fmt(v,2),v=>fmtP(v));
    const c=prepCanvas(px+'ChartH'); if(c){ c.x.font='11px '+tok('--mono'); c.x.fillStyle=tok('--muted'); c.x.fillText('Calcola il percorso (passo 4)',10,20); }
    $(px+'Info').innerHTML='<span>Solutore interno (sfondo)</span><b>'+bg.t.length+' stati</b>'; $(px+'HTab').innerHTML=''; return;
  }
  if(!r||!r.t.length){ for(const id of [px+'ChartF',px+'ChartH']){ const c=prepCanvas(id); if(c){ c.x.font='11px '+tok('--mono'); c.x.fillStyle=tok('--muted'); c.x.fillText('Calcola il percorso (passo 4)',10,20);} } $(px+'Info').innerHTML=''; $(px+'HTab').innerHTML=''; return; }
  const R=S.R, x=r.t.map(t=>R.x0+t);
  let y, yl;
  if(q==='E'){ y=r.E; yl='energia [mJ]'; }
  else if(q==='lt'&&r.z&&r.z[0]&&!R.M.periodic){ y=r.z.map(z=>plHexLateral(R.M,z)); yl='ε_x (vertici laterali)'; }
  else { y=r.F; yl=S.kind==='cell'&&R.M.periodic?'∂E/∂λ [N·mm]':'F [N]'; }
  const nP=r.nPath||x.length, [ya,yb]=plSplit(x.slice(0,nP),y.slice(0,nP),r.neg.slice(0,nP));
  // il percorso interno sta sotto (primo disegnato); se il risultato è dell'interno è lo stesso e non si ripete
  const ser=[], b=r.src==='interno'?null:bgSer(R); if(b) ser.push(b);
  ser.push({x:x.slice(0,nP),y:ya,col:'--accent',label:r.src+' · stabile'},{x:x.slice(0,nP),y:yb,col:'--warn',dash:1,label:'instabile'});
  if(nP<x.length) ser.push({x:x.slice(nP-1),y:y.slice(nP-1),col:'--ok',label:'rilascio'});
  plMarker(mlPlot(px+'ChartF',ser,R.xlab,yl,v=>fmt(v,2),v=>fmtP(v)),x[S.k],y[S.k]);
  // informazioni dello stato corrente
  const k=S.k, nb=R.M.bodies.length, inf=[];
  const per=R.M.periodic;
  inf.push([per?(R.force?'λ':'λ imposto'):R.force?'Spostamento del vertice alto':'Spostamento imposto',fmt(x[k],4)+(per?'':' mm')]);
  if(S.kind==='cell'&&!per&&r.z&&r.z[k]){ const ex=plHexLateral(R.M,r.z[k]), ey=x[k]/(R.M.topNode[1]-R.M.botNode[1]); inf.push(['ε_x (vertici laterali) · ε_y',fmt(ex,4)+' · '+fmt(ey,4)]); if(Math.abs(ey)>1e-9) inf.push(['ν effettivo = −ε_x/ε_y',fmt(-ex/ey,3)]); }
  inf.push([per?'∂E/∂λ':R.force?'Forza imposta F':'Reazione F',fmtP(r.F[k])+(per?' N·mm':' N')]);
  inf.push(['Energia elastica',fmtP(r.E[k])+' mJ']);
  inf.push(['Stabilità',r.neg[k]>0?r.neg[k]+' modi instabili':'stabile']);
  // picchi e stati stabili a forza nulla
  let pk=-1; for(let i=1;i<nP-1;i++) if(r.F[i]>r.F[i-1]&&r.F[i]>=r.F[i+1]&&r.F[i]>0){ pk=i; break; }
  if(pk>0) inf.push(['Primo massimo di forza',fmtP(r.F[pk])+(S.kind==='cell'?' N·mm':' N')+' a '+fmt(x[pk],3)]);
  // forza nulla: dove la forza risale è uno stato stabile anche a forza imposta, dove scende è la barriera
  const zs=[], zb=[]; for(let i=2;i<nP;i++){ const a=r.F[i-1], b=r.F[i], xi=x[i-1]+(x[i]-x[i-1])*a/((a-b)||1);
    if(a<0&&b>=0) zs.push(fmt(xi,3)); else if(a>0&&b<=0) zb.push(fmt(xi,3)); }
  if(zs.length) inf.push(['Stato stabile a forza nulla',zs.join(', ')]);
  if(zb.length) inf.push(['Barriera (forza nulla, instabile)',zb.join(', ')]);
  if(r.nPath&&r.release){ const e=x.length-1; inf.push(['Rilascio: equilibrio raggiunto a',fmt(x[e],3)+(per?'':' mm')+' · E = '+fmtP(r.E[e])+' mJ'+(r.release.converged?'':' (non converge: stato instabile o incerto)')]); }
  $(px+'Info').innerHTML=inf.map(([a,b])=>'<span>'+a+'</span><b>'+b+'</b>').join('');
  // cerniere
  if((!r.z||!r.z.length||!r.z[0])&&r.hE){
    // solo energie delle cerniere (MUL2: somma delle energie degli elementi di ogni striscia)
    const nh=r.hE.length, sel=S.sel==null?r.hE.reduce((b,a,h)=>a[k]>r.hE[b][k]?h:b,0):S.sel, sers=[];
    for(let h=0;h<nh;h++) if(h!==sel) sers.push({x,y:Array.from(r.hE[h]),col:'--line',label:''});
    sers.push({x,y:Array.from(r.hE[sel]),col:'--accent',label:'cerniera '+(sel+1)});
    plMarker(mlPlot(px+'ChartH',sers,R.xlab,'E della striscia [mJ] ('+r.src+')',v=>fmt(v,2),v=>fmtP(v)),x[k],r.hE[sel][k]);
    let Et=0; for(let h=0;h<nh;h++) Et+=r.hE[h][k];
    const idx=[...Array(nh).keys()].sort((a,b)=>r.hE[b][k]-r.hE[a][k]);
    $(px+'HTab').innerHTML=idx.map(h=>'<tr data-h="'+h+'"'+(h===sel?' class="sel"':'')+'><td class="rn">'+(h+1)+'</td><td class="num">–</td><td class="num">–</td><td class="num">'+fmtP(r.hE[h][k])+'</td><td class="num">'+(Et>0?fmt(100*r.hE[h][k]/Et,1)+'%':'–')+'</td></tr>').join('')+
      '<tr><td colspan="5">'+r.src+': energia delle strisce '+fmtP(Et)+' mJ su '+fmtP(r.E[k])+' mJ totali (il resto è nel PLA)</td></tr>';
    return;
  }
  if(!r.z||!r.z.length||!r.z[0]){ $(px+'HTab').innerHTML='<tr><td colspan="5">grandezze delle cerniere non disponibili per questo solutore</td></tr>'; const c=prepCanvas(px+'ChartH'); if(c){ c.x.font='11px '+tok('--mono'); c.x.fillStyle=tok('--muted'); c.x.fillText('non disponibile per '+r.src,10,20);} return; }
  const H=plHist(S), hq=$(px+'Hq').value, nh=R.M.hinges.length, sel=S.sel==null?plMaxHinge(S):S.sel;
  const ylH={phi:'φ [°]',d:'|δ| [mm]',E:'E [mJ]',Er:'E rotazione [mJ]',Et:'E traslazione [mJ]',M:'M [N·mm]'}[hq];
  const sers=[]; const step=Math.max(1,Math.ceil(nh/120));
  for(let h=0;h<nh;h+=step) if(h!==sel) sers.push({x,y:Array.from(H[hq][h]),col:'--line',label:''});
  sers.push({x,y:Array.from(H[hq][sel]),col:'--accent',label:'cerniera '+(sel+1)});
  plMarker(mlPlot(px+'ChartH',sers,R.xlab,ylH,v=>fmt(v,2),v=>fmtP(v)),x[k],H[hq][sel][k]);
  $(px+'HSel').textContent='cerniera '+(sel+1)+' (corpi '+(R.M.hinges[sel].a+1)+'–'+(R.M.hinges[sel].b+1)+')';
  // tabella: le cerniere più cariche nello stato corrente
  let Etot=0; for(let h=0;h<nh;h++) Etot+=H.E[h][k];
  const idx=[...Array(nh).keys()].sort((a,b)=>H.E[b][k]-H.E[a][k]).slice(0,40);
  if(!idx.includes(sel)) idx.unshift(sel);
  $(px+'HTab').innerHTML=idx.map(h=>'<tr data-h="'+h+'"'+(h===sel?' class="sel"':'')+'><td class="rn">'+(h+1)+'</td><td class="num">'+fmt(H.phi[h][k],2)+'</td><td class="num">'+H.d[h][k].toExponential(2)+'</td><td class="num">'+fmtP(H.E[h][k])+'</td><td class="num">'+(Etot>0?fmt(100*H.E[h][k]/Etot,1)+'%':'–')+'</td></tr>').join('');
}
/* deformazione media lungo x della cella libera: spostamento medio dei vertici a destra meno quello dei vertici a
   sinistra, diviso la loro distanza */
function plHexLateral(M,z){
  let ur=0,nr=0,ul=0,nl=0,xr=0,xl=0;
  const c0=M.nodeC?M.nodeC[0]:0;
  M.bodies.forEach((b,i)=>{ if(!b.node||Math.abs(b.node[0]-c0)<1e-9) return; const p=plPoint(M,z,i,b.node,null), rx=b.node[0]-c0;
    if(rx>0){ ur+=p[0]-b.node[0]; xr+=rx; nr++; } else { ul+=p[0]-b.node[0]; xl+=rx; nl++; } });
  return nr&&nl?(ur/nr-ul/nl)/(xr/nr-xl/nl):NaN;
}
function plMaxHinge(S){ const H=plHist(S), k=S.k; let b=0; for(let h=1;h<H.E.length;h++) if(H.E[h][k]>H.E[b][k]) b=h; return b; }
/* stato corrente sopra un grafico disegnato da mlPlot (g = scale restituite da mlPlot) */
function plMarker(g,xk,yk){
  if(!g||!Number.isFinite(xk)) return;
  const c=g.x, px=g.sx(xk);
  c.save(); c.strokeStyle=tok('--muted'); c.setLineDash([2,3]); c.lineWidth=1; c.beginPath(); c.moveTo(px,g.T); c.lineTo(px,g.h-g.B); c.stroke(); c.setLineDash([]);
  if(Number.isFinite(yk)){ c.beginPath(); c.arc(px,g.sy(yk),4.5,0,7); c.fillStyle=tok('--accent'); c.fill(); c.strokeStyle=tok('--field'); c.lineWidth=2; c.stroke(); }
  c.restore();
}

/* ---------- vista 2D ---------- */
function plDrawItems(S,z){
  const M=S.M; if(!M) return [];
  const R=S.R&&S.R.M===M?S.R.M:M, out=[];
  const tiles=M.tiles||(M.periodic?[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]]:[[0,0]]);
  const nb=M.bodies.length, lx=M.periodic&&z?z[3*nb]:1, ly=M.periodic&&z?z[3*nb+1]:1;
  for(const [i,j] of tiles){
    const tx=M.a1?(i*M.a1[0]+j*M.a2[0])*lx:0, ty=M.a1?(i*M.a1[1]+j*M.a2[1])*ly:0, main=i===0&&j===0;
    for(const d of M.draw){ const pts=d.pts.map(p=>{ const q=z?plPoint(R,z,d.body,p,d.s):[p[0],p[1]]; return [q[0]+tx,q[1]+ty]; }); out.push({pts,body:d.body,kind:d.kind,main}); }
  }
  return out;
}
function plFit(S){
  const cv=$(S.px==='cs'?'csView':'psView'); if(!cv||!S.M) return;
  let mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;
  const zs=[null]; if(S.res&&S.res.z&&S.res.z.length&&S.res.z[0]){ const n=S.res.z.length; for(let k=0;k<n;k+=Math.max(1,Math.floor(n/12))) zs.push(S.res.z[k]); zs.push(S.res.z[n-1]); }
  for(const z of zs) for(const it of plDrawItems(S,z)) if(it.main||S.M.periodic) for(const p of it.pts){ mnx=Math.min(mnx,p[0]); mny=Math.min(mny,p[1]); mxx=Math.max(mxx,p[0]); mxy=Math.max(mxy,p[1]); }
  S.box=[mnx,mny,mxx,mxy];
}
function plDraw(S){
  const id=S.px==='cs'?'csView':'psView', cv=$(id); if(!cv||$(S.px==='cs'?'pgCell':'pgPlane').hidden) return;
  const dpr=Math.min(window.devicePixelRatio||1,2), w=cv.clientWidth, h=cv.clientHeight; if(!w||!h) return;
  cv.width=w*dpr; cv.height=h*dpr; const x=cv.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0);
  x.fillStyle=tok('--vp'); x.fillRect(0,0,w,h);
  if(!S.M||!S.box){ x.fillStyle=tok('--muted'); x.font='13px '+tok('--sans'); x.fillText($(S.px+'GeoMsg').textContent||'Geometria non valida',20,30); return; }
  const [mnx,mny,mxx,mxy]=S.box, pad=40, sc=Math.min((w-2*pad)/((mxx-mnx)||1),(h-2*pad)/((mxy-mny)||1));
  const ox=(w-(mxx-mnx)*sc)/2-mnx*sc, oy=(h+(mxy-mny)*sc)/2+mny*sc, X=p=>[ox+p[0]*sc,oy-p[1]*sc];
  S.view={ox,oy,sc};
  const z=S.res&&S.res.z&&S.res.z[S.k]?S.res.z[S.k]:null;
  const items=plDrawItems(S,z);
  const bcCol={fix:tok('--cut'),pull:tok('--accent'),pullneg:tok('--accent')};
  for(const it of items){
    const st=S.kind==='plane'?S.bc.get(it.body):S.M.iTop>=0?(it.body===S.M.iTop?'pull':it.body===S.M.iBot?'fix':null):null;
    x.beginPath(); it.pts.forEach((p,i)=>{ const q=X(p); i?x.lineTo(q[0],q[1]):x.moveTo(q[0],q[1]); }); x.closePath();
    x.globalAlpha=it.main?1:0.35;
    x.fillStyle=st?bcCol[st]:it.kind==='ROT'?tok('--rot'):tok('--lat'); x.fill();
    x.strokeStyle=tok('--vpgrid'); x.lineWidth=0.6; x.stroke(); x.globalAlpha=1;
  }
  // cerniere: colore dall'energia nello stato corrente
  const M=S.R&&S.R.M===S.M?S.R.M:S.M; let Hs=null, Em=0;
  if(z){ Hs=plHingeState(M,z); for(const s of Hs) Em=Math.max(Em,s.Et+s.Er); }
  const sel=S.res&&S.res.z&&S.res.z[0]?(S.sel==null?plMaxHinge(S):S.sel):S.sel;
  M.hinges.forEach((h,i)=>{
    const p=z?plPoint(M,z,h.a,h.P,h.sa):h.P, q=X(p), e=Hs&&Em>0?(Hs[i].Et+Hs[i].Er)/Em:0;
    x.beginPath(); x.arc(q[0],q[1],i===sel?5:2.6,0,7);
    x.fillStyle=e>0?'hsl('+Math.round(220-200*e)+',70%,'+(45+10*e)+'%)':tok('--hinge'); x.fill();
    if(i===sel){ x.strokeStyle=tok('--ink'); x.lineWidth=1.5; x.stroke(); }
  });
  // assi e didascalia
  const r=S.res, k=S.k, hud=$(S.px==='cs'?'csHud':'psHud');
  hud.innerHTML=!r?'riferimento (non deformato)':(S.R.M.periodic?'λ = '+fmt(S.R.x0+r.t[k],3):'spostamento '+fmt(r.t[k],2)+' mm')+' · E = '+fmtP(r.E[k])+' mJ · '+(r.nPath&&k>=r.nPath?'rilascio · ':'')+(r.neg[k]>0?'<span style="color:'+tok('--warn')+'">instabile</span>':'stabile')+
    (S.kind==='plane'||S.M.iTop>=0?' · <span style="color:'+tok('--cut')+'">■</span> bloccati <span style="color:'+tok('--accent')+'">■</span> tirati':'')+' · cerniere colorate per energia';
}
/* clic nella vista: piano = vincoli (strumento attivo), cella = scelta della cerniera */
function plClick(S,ev){
  if(!S.view||!S.M) return;
  const cv=ev.currentTarget, r=cv.getBoundingClientRect(), mx=ev.clientX-r.left, my=ev.clientY-r.top;
  const P=[(mx-S.view.ox)/S.view.sc,(S.view.oy-my)/S.view.sc];
  const z=S.res&&S.res.z&&S.res.z[S.k]?S.res.z[S.k]:null, M=S.R&&S.R.M===S.M?S.R.M:S.M;
  // cerniera vicina?
  let bh=-1, bd=1e18; M.hinges.forEach((h,i)=>{ const p=z?plPoint(M,z,h.a,h.P,h.sa):h.P, d=Math.hypot(p[0]-P[0],p[1]-P[1]); if(d<bd){bd=d;bh=i;} });
  const near=bd*S.view.sc<8;
  if(S.kind==='cell'||near&&S.res){ if(near){ S.sel=bh; plDraw(S); plCharts(S); } return; }
  // corpo sotto il clic
  const inside=(pts,p)=>{ let c=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){ const a=pts[i], b=pts[j]; if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
  for(const it of plDrawItems(S,z)) if(inside(it.pts,P)){ const t=S.tool||'fix'; if(t==='free'||S.bc.get(it.body)===t) S.bc.delete(it.body); else S.bc.set(it.body,t); S.res=null; S.hist=null; plInfo(S); plDraw(S); plCharts(S); return; }
}

/* ---------- esportazioni ---------- */
function plModelJSON(S,R){
  const M=R.M;
  return {formato:'auxetic-planare-1', unita:'mm, N, rad', tipo:S.kind, parametri:S.par, periodico:M.periodic,
    corpi:M.bodies.map(b=>({c:b.c,blocca_rotazione:!!b.lockRot,tipo:b.kind})),
    cerniere:M.hinges.map(h=>({a:h.a+1,b:h.b+1,P:h.P,sa:h.sa,sb:h.sb,k:h.k,kth:h.kth,tab:h.tab})), carichi:(M.loads||[]).map(l=>({dof:l.dof+1,coef:l.coef})),
    vincoli:M.ctl.map(c=>({dof:c.dof+1,base:c.base||0,coef:c.coef||0})), ordine:(M.order||M.bodies.map((b,i)=>i)).map(i=>i+1),
    controllo:{tmax:R.tmax,tscale:R.tscale,L:M.L}, area:M.area||null};
}
async function plExport(S,what){
  const px=S.px, msg=$(px+'XMsg'); msg.textContent='';
  let R; try{ R=plReady(S); }catch(e){ msg.textContent=e.message; return; }   // senza plBuild: ricostruire il modello azzererebbe i risultati da esportare
  const name=(S.kind==='cell'?'cella':'piano')+'_'+S.par.type;
  if(what==='json'){ const ok=await saveBlob(new Blob([JSON.stringify(plModelJSON(S,R),null,1)],{type:'application/json'}),name+'.json'); msg.textContent=ok?'Salvato '+name+'.json':'Salvataggio non riuscito: usa la versione offline.'; return; }
  if(what==='csv'){
    if(!S.res){ msg.textContent='Calcola prima il percorso.'; return; }
    const r=S.res, L=['passo;'+(S.kind==='cell'?'lambda':'spostamento_mm')+';F;E_mJ;modi_instabili'];
    r.t.forEach((t,k)=>L.push(k+';'+(R.x0+t)+';'+r.F[k]+';'+r.E[k]+';'+r.neg[k]));
    const files=[{name:name+'_percorso.csv',data:new TextEncoder().encode(L.join('\r\n'))}];
    if(r.z&&r.z[0]){ const H=plHist(S), nh=R.M.hinges.length; for(const q of ['phi','d','E','M']){ const T=['passo;'+[...Array(nh).keys()].map(h=>'c'+(h+1)).join(';')]; r.t.forEach((t,k)=>T.push(k+';'+H[q].map(a=>a[k]).join(';'))); files.push({name:name+'_cerniere_'+q+'.csv',data:new TextEncoder().encode(T.join('\r\n'))}); } }
    const ok=await saveBlob(makeZip(files),name+'_risultati.zip'); msg.textContent=ok?'Salvato '+name+'_risultati.zip':'Salvataggio non riuscito: usa la versione offline.'; return;
  }
  if((what==='mul2'||what==='adams')&&S.kind==='cell'&&S.par.type!=='hex'){ msg.textContent='Esportazione MUL2/ADAMS disponibile solo per la cella esagonale.'; return; }
  if(what==='mul2') return plExportMul2(S,R);
  if(what==='adams') return plExportAdams(S,R);
}

/* sezioni del pannello come schede (secTabs in ui/nav.js) */
function plTabs(S){
  const aside=$(S.px==='cs'?'csAside':'psAside');
  S.showTab=secTabs(aside,'pl_'+S.px,S.kind==='cell'?['Geometria','Cerniera','Carico','Analisi','Cerniere','Esporta']:['Geometria','Cerniera','Vincoli','Analisi','Cerniere','Esporta']);
}
/* ---------- pagina ---------- */
function plInit(px,kind){
  if(PL[px]) return PL[px];
  const S={px,kind,sel:null,bc:new Map(),tool:'fix'}; PL[px]=S;
  $(px==='cs'?'csAside':'psAside').innerHTML=plFieldsHTML(px,kind);
  plTabs(S);
  const rebuild=()=>{ plBuild(S); };
  ['Type','L','Th','Y','S','E','W','Lh','K','Kt','Kth','Iso','NuT','Gap'].concat(kind==='plane'?['Nx','Ny']:['Ctrl','Lmax','Fl']).forEach(id=>{ const el=$(px+id); if(el) el.addEventListener('change',rebuild); });
  $(px+'KSrc').onchange=()=>{ const v=$(px+'KSrc').value; $(px+'KMat').hidden=v==='val'; $(px+'KVal').hidden=v!=='val'; rebuild(); };
  $(px+'Run').onclick=()=>{ S.showTab(3); plRun(S); };
  $(px+'Stop').onclick=()=>{ if(typeof plStopExternal==='function') plStopExternal(S); };
  $(px+'Scrub').addEventListener('input',e=>{ S.k=+e.target.value; plDraw(S); plCharts(S); });
  $(px+'Yq').onchange=()=>plCharts(S); $(px+'Hq').onchange=()=>plCharts(S);
  $(px+'HTab').addEventListener('click',e=>{ const tr=e.target.closest('tr'); if(tr&&tr.dataset.h){ S.sel=+tr.dataset.h; plDraw(S); plCharts(S); } });
  $(px==='cs'?'csView':'psView').addEventListener('click',e=>plClick(S,e));
  $(px+'XCsv').onclick=()=>plExport(S,'csv'); $(px+'XJson').onclick=()=>plExport(S,'json'); if($(px+'XMul2')){ $(px+'XMul2').onclick=()=>plExport(S,'mul2'); $(px+'XAdams').onclick=()=>plExport(S,'adams'); }
  if($(px+'KMul2')) $(px+'KMul2').onclick=()=>plHingeMul2(S);
  if(kind==='plane'){
    $('psTools').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; S.tool=b.dataset.t; for(const x of $('psTools').children) x.setAttribute('aria-pressed',x===b); });
    $('psPresetGo').onclick=()=>{ plPreset(S,$('psPreset').value); S.res=null; plInfo(S); plDraw(S); plCharts(S); };
    $('psDir').onchange=()=>{ S.res=null; plCharts(S); };
  }
  new ResizeObserver(()=>{ plDraw(S); }).observe($(px==='cs'?'csView':'psView'));
  window.addEventListener('resize',()=>{ if(PAGE===(kind==='cell'?'cell':'plane')) plCharts(S); });
  ['Gap','Epla','NuT','Law','Nst'].forEach(id=>{ const e=$(px+id); if(e) e.addEventListener('change',()=>{ S.res=null; plCharts(S); }); });
  plBuild(S); if(typeof plHingeChart==='function') plHingeChart(S);
  if(typeof plToolsInfo==='function') plToolsInfo();
  return S;
}
function plCellShow(){ const S=plInit('cs','cell'); requestAnimationFrame(()=>{ plDraw(S); plCharts(S); }); }
function plPlaneShow(){ const S=plInit('ps','plane'); requestAnimationFrame(()=>{ plDraw(S); plCharts(S); }); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{ for(const S of Object.values(PL)){ plDraw(S); plCharts(S); } });

/* solutori esterni: definiti in planar/external.js (MATLAB, MUL2, ADAMS) */


/* dal cilindro: porta la cella mostrata nel riquadro (riga selezionata) nella pagina Cella singola. Si trasferiscono il tipo,
   l'angolo di taglio θ e la larghezza Y in proporzione al lato (Y/L); il lato L e lo spessore restano quelli della pagina
   (la cella singola è un provino in mm, il cilindro è in scala reale). */
function plFromCylinder(){
  const msg=$('cellMsg'); if(!cur||!ROWS[SELROW]){ if(msg) msg.textContent='Genera prima il cilindro.'; return; }
  const P=cur.P, G=cur.A.G, r=ROWS[SELROW];
  if(P.type==='para'){ if(msg) msg.textContent='Il parallelogramma non è disponibile nella cella singola (esagonale o quadrata).'; return; }
  const S=plInit('cs','cell'), set=(id,v)=>{ const e=$('cs'+id); e.value=v; };
  const Lc=Math.max(0.01,+$('csL').value||20), yc=+(r.y/G.L*Lc).toFixed(3);
  set('Type',P.type); set('Th',r.th); set('Y',yc);
  showPage('cell'); plBuild(S); if(S.showTab) S.showTab(0);
  const m=$('csGeoMsg'); if(m&&!m.textContent) m.textContent='';
  if(msg) msg.textContent='';
}
$('bCellTo').onclick=plFromCylinder;
