/* Small, scalable Share portraits. IDs are protocol values, never user-provided markup. */
(() => {
  const birds = [
    ['classic','Classic Lark','#46A6D8','#dff4ff','#267dae'], ['blue-jay','Blue Jay','#2775C9','#f4f7fb','#26313e'],
    ['cardinal','Cardinal','#D94141','#ef7c6b','#4b2630'], ['goldfinch','Goldfinch','#E9B936','#f8dc71','#2f3037'],
    ['robin','Robin','#9b745c','#C77742','#654c40'], ['snow-owl','Snow Owl','#E8EDF2','#ffffff','#b4c4d1'],
    ['hummingbird','Hummingbird','#29A987','#8fe0d0','#166a76'], ['raven','Raven','#343849','#555069','#242635'],
    ['eagle','Eagle','#805632','#f7f7f1','#513b2e'], ['falcon','Falcon','#647D98','#d8e1e8','#34475a']
  ];
  const ns='http://www.w3.org/2000/svg';
  function make(id, size=32) {
    const b=birds.find(x=>x[0]===id)||birds[0];
    const svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 64 64'); svg.setAttribute('width',size); svg.setAttribute('height',size); svg.setAttribute('aria-hidden','true'); svg.classList.add('share-bird');
    function shape(tag, attrs) { const el=document.createElementNS(ns,tag); for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v); svg.append(el); }
    const [key,,base,chest,dark]=b;
    if (key==='classic') { shape('path',{d:'M18 23 Q15 10 22 8 L26 15 Q29 8 34 10 L34 22 Z',fill:base}); }
    if (key==='cardinal'||key==='blue-jay') shape('path',{d:'M18 22 L19 4 L34 16 Z',fill:base});
    shape('ellipse',{cx:31,cy:36,rx:23,ry:24,fill:base});
    shape('ellipse',{cx:31,cy:44,rx:16,ry:15,fill:chest});
    shape('path',{d:'M10 31 Q4 43 17 52 Q26 47 23 35 Z',fill:dark});
    if(key==='snow-owl') { shape('circle',{cx:39,cy:27,r:11,fill:'#fff'}); shape('circle',{cx:38,cy:27,r:6,fill:'#d49b22'}); }
    if(key==='eagle') shape('path',{d:'M14 26 Q18 8 35 12 Q48 12 53 24 L49 32 L18 33 Z',fill:'#fafaf7'});
    if(key==='falcon') shape('path',{d:'M40 25 L49 23 L47 40 L41 37 Z',fill:dark});
    if(key==='classic') { shape('path',{d:'M18 36 Q21 31 25 35',fill:'none',stroke:'#8bd8f4','stroke-width':3,'stroke-linecap':'round'}); shape('circle',{cx:34,cy:34,r:3,fill:'#f48e84',opacity:'.65'}); }
    if(key==='blue-jay') shape('path',{d:'M24 26 Q33 17 46 23',fill:'none',stroke:dark,'stroke-width':3});
    shape('circle',{cx:40,cy:27,r:3.5,fill:'#172433'}); shape('circle',{cx:41,cy:26,r:1,fill:'#fff'});
    shape('path',{d:key==='hummingbird'?'M50 30 L64 27 L50 34 Z':'M49 30 L59 34 L49 38 Z',fill:key==='raven'?'#202431':'#e6aa35'});
    return svg;
  }
  window.LarkBirds={birds,make,selected(){try{return birds.some(x=>x[0]===localStorage.getItem('lark-share-bird'))?localStorage.getItem('lark-share-bird'):'classic';}catch(_){return 'classic';}},save(id){try{localStorage.setItem('lark-share-bird',id);}catch(_){}}};
})();
