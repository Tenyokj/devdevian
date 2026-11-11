// The host validates the grid and moves named regions; no private DOM access.
(async()=>{
 await devdevian.panel.configure({placement:'hidden',title:'Studio Shell'});
 await devdevian.layout.apply({areas:[['nav'],['content'],['aside'],['footer']],columns:['minmax(0, 1fr)'],gap:20});
})();
