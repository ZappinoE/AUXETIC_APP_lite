# Auxetic App · versione web

Strumento per celle auxetiche bistabili a blocchi con tagli: cella singola (esagonale e quadrata), superficie piana,
cilindro con apertura in pressione, stampa 3D e bladder. Tutto gira nel browser, senza installazione.

Solutore: interno (corpi rigidi con cerniere elastiche, percorso di equilibrio con arc length). Si possono esportare i
risultati (CSV, JSON) e i modelli per Simscape Multibody (ZIP con lo script MATLAB).

Aprire `index.html` da un server web (per esempio la pagina pubblicata), oppure in locale:

    python -m http.server 8000

e poi http://localhost:8000.

File generato da `crea_lite.py` del repository di sviluppo: non modificarlo a mano.
