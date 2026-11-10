var PAGE='model';
/* ===================== PAGINA ===================== */
const $=id=>document.getElementById(id);
const tok=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const PU=1/101325; // pressioni mostrate in atm (calcolo interno in Pa)
const fmtP=v=>{ if(!Number.isFinite(v)) return '–'; const a=Math.abs(v); return a===0?'0':a>=100?v.toFixed(0):(+v.toPrecision(3)).toLocaleString('it-IT',{maximumSignificantDigits:3}); };
const fmt=(v,n=2)=>Number.isFinite(v)?v.toFixed(n):'–';
let stage=0, READY=false;

const sinN=type=>Math.sin(2*Math.PI/(type==='square'?4:3));
const tOfY=(y,type)=>y/(2*sinN(type));   // Y = larghezza alla radice del braccio = 2·t·sin(2π/N)
