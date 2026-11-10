/* ===================== PAGINA "MODELLI": i modelli e i solutori delle sezioni Cella singola e Superficie piana =====================
   Testo fisso più una tabella con le rigidezze correnti della cella (lette dalla pagina Cella singola). */
function docShow(){
  const el=$('docBody'); if(!el) return;
  if(!el.dataset.done){ el.innerHTML=DOC_HTML; el.dataset.done='1'; }
  // rigidezze della cella in uso (se la pagina è già stata aperta) e quelle dal materiale con i valori del pannello
  const S=PL.cs, par=S&&S.par;
  const box=$('docLive'); if(!box) return;
  if(!par){ box.innerHTML='<p class="note">Apri la pagina Cella singola per vedere qui le rigidezze in uso.</p>'; return; }
  const nu=+(($('csNuT')||{}).value)||0.45, K=plHingeK(par.Eh||30,par.w||0.8,par.s,par.lh||3,nu);
  box.innerHTML='<table class="rows doc"><thead><tr><th>Rigidezza</th><th>in uso ('+xe(par.ksrc)+')</th><th>dal materiale</th><th>formula</th></tr></thead><tbody>'+
    '<tr><td>k lungo la striscia [N/mm]</td><td class="num">'+fmt(par.k,3)+'</td><td class="num">'+fmt(K.k,3)+'</td><td>E·w·s/ℓ</td></tr>'+
    '<tr><td>k<sub>t</sub> di traverso [N/mm]</td><td class="num">'+fmt(par.kt==null?par.k:par.kt,3)+'</td><td class="num">'+fmt(K.kt,3)+'</td><td>1/(ℓ³/(12EI) + ℓ/(κ G w s))</td></tr>'+
    '<tr><td>k<sub>θ</sub> [N·mm/rad]</td><td class="num">'+(par.tab?'M(φ), iniziale '+fmt(par.kth,4):fmt(par.kth,4))+'</td><td class="num">'+fmt(K.kth,4)+'</td><td>E·s·w³/(12ℓ) = EI/ℓ</td></tr>'+
    '<tr><td>k<sub>b</sub> fuori piano [N·mm/rad]</td><td class="num">–</td><td class="num">'+fmt(K.kb,4)+'</td><td>E·w·s³/(12ℓ)</td></tr>'+
    '</tbody></table><p class="note">E = '+fmt(par.Eh||30,1)+' MPa, w = '+fmt(par.w||0.8,2)+' mm, ℓ = '+fmt(par.lh||3,2)+' mm, s = '+fmt(par.s,2)+' mm, ν = '+fmt(nu,2)+', I = s·w³/12, G = E/(2(1+ν)), κ = 5/6.</p>';
}

const DOC_HTML=`
<h1>Modelli e solutori</h1>
<p class="lead">Cosa calcola ogni solutore delle sezioni <b>Cella singola</b> e <b>Superficie piana</b>, con quali ipotesi, e perché i risultati possono essere diversi. Unità: mm, N, MPa, N·mm (energia in mJ).</p>

<h2>1. La cella esagonale</h2>
<p>La cella è l'esagono attorno a un nodo di Y del reticolo a triangoli rotanti: la <b>Y centrale</b> (6 pezzi), i <b>6 triangoli</b> che le stanno attorno e, ai 6 vertici, i <b>pezzi delle Y vicine</b> (2 pezzi per vertice, quelli che toccano i triangoli della cella). Ogni triangolo ha 3 cerniere: 18 cerniere in tutto. Il punto di cerniera è lo spigolo H in cui il taglio incontra il poligono; la striscia di TPU corre lungo il taglio. L'origine è il nodo della Y centrale; i vertici alto e basso sono a (0, ±L).</p>

<h2>2. Solutore interno: modello a corpi rigidi</h2>
<ul>
<li><b>Gradi di libertà</b>: ogni corpo rigido (triangolo o Y) ha u<sub>x</sub>, u<sub>y</sub>, θ; con i vincoli di simmetria in più l'allungamento medio Λ = λ·I. Il punto P del corpo i (nell'immagine di traslazione s) sta in x = Λ s + c<sub>i</sub> + u<sub>i</sub> + R(θ<sub>i</sub>)(P − s − c<sub>i</sub>).</li>
<li><b>Cerniera</b> fra il poligono a e la Y b nel punto P: δ = x<sub>a</sub> − x<sub>b</sub>, φ = θ<sub>a</sub> − θ<sub>b</sub>,
  <div class="eq">E<sub>cerniera</sub> = ½ k (e·δ)² + ½ k<sub>t</sub> (n·δ)² + W(φ),&nbsp;&nbsp; e = R(θ<sub>b</sub>) e₀,&nbsp; n ⟂ e</div>
  e₀ è la direzione della striscia (il taglio nel punto di cerniera). La terna è <b>solidale alla Y</b>: la striscia esce dalla Y lungo il taglio ed è lì incastrata; con i vincoli di simmetria la Y non ruota e la terna resta fissa. W(φ) = ½ k<sub>θ</sub> φ². Con k<sub>t</sub> = k (casella "cerniera isotropa") si ritrova ½ k |δ|².</li>
<li><b>Gradiente e tangente esatti</b>: anche le derivate della terna rispetto a θ<sub>b</sub> (K' = JK − KJ, K'' = −2K − 2JKJ, J = rotazione di 90°). Verificati con differenze finite: errore relativo ~10⁻¹¹.</li>
<li><b>Vincoli</b>:
  <ul><li><b>simmetria</b>: Y centrale ferma e senza rotazione; le Y dei vertici sono immagini della centrale traslate di (λ − 1)·X<sub>v</sub>, senza rotazione; triangoli liberi. Sono le condizioni della cella dentro il reticolo con allungamento equibiassiale.</li>
  <li><b>cella libera</b>: Y del vertice basso incastrata; Y del vertice alto con spostamento y imposto (x libero, rotazione bloccata) oppure con forza y nel suo baricentro (x e rotazione libere). Con la forza imposta il carico entra come potenziale −F·u<sub>y</sub> e il grafico è forza–spostamento del vertice.</li></ul></li>
<li><b>Percorso di equilibrio</b>: g = ∂E/∂q = 0 sui gradi di libertà liberi, arc length a iperpiano su (q, t): segue anche i punti limite (scatto, snap-back). La fattorizzazione LDLᵀ della tangente conta gli autovalori negativi: i tratti instabili sono tratteggiati. Forza = ∂E/∂t (∂E/∂λ in simmetria, reazione del vertice nella cella libera).</li>
<li><b>Sfondo dei grafici</b>: il percorso del solutore interno per i vincoli correnti è sempre disegnato (grigio tratteggiato) sotto i risultati degli altri solutori.</li>
</ul>

<h2>3. Rigidezze della cerniera</h2>
<p>La cerniera è una striscia di TPU larga w, lunga ℓ (tratto libero), spessa s (lo stesso spessore delle piastre).</p>
<div id="docLive"></div>
<ul>
<li><b>Dal materiale</b> (trave di Eulero-Bernoulli/Timoshenko): k = E w s/ℓ (trazione); k<sub>t</sub> = taglio con le estremità che non ruotano, 12EI/ℓ³ in serie con il taglio κGA/ℓ, riferito al centro della striscia dove traslazione e rotazione sono disaccoppiate; k<sub>θ</sub> = EI/ℓ.</li>
<li><b>Valori dati</b>: k, k<sub>t</sub>, k<sub>θ</sub> scritti a mano.</li>
</ul>

`;

