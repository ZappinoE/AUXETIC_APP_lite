/* partenze asincrone (in origine nella vista 3D): qui, dopo che tutti i file sono caricati */
new ResizeObserver(resize).observe(vp);
(function loop(){requestAnimationFrame(loop); if(REC) return; if(READY) simTick(); if(READY&&bldRunning) bldTick(); if(READY&&cbRunning) cbTick(); if(PAGE==='model'){controls.update(); renderer.render(scene,camera);} else if(PAGE==='bld'){ if(BV){ BV.ctl.update(); if(bvDirty){ BV.r.render(BV.sc,BV.cam); bvDirty=false; } } } else if(PAGE==='print'&&PV){PV.ctl.update(); PV.r.render(PV.sc,PV.cam);} })();

matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

/* avvio: habitat gonfiabile a 0,9 atm, cerniere a lamina in PA12 (E = 1,7 GPa), forma finale a capsula */
PROF.preset='capsula'; $('preset').value='capsula'; applyPreset();
applyTheme(); resize();
stage=3; run(); fitView(); READY=true;
{ const h=(location.hash||'').replace('#','');
  showPage(h==='stampa'?'print':h==='bladder'?'bld':h==='progetto'?'model':h==='piano'?'plane':h==='modelli'?'doc':'cell'); }
