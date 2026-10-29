/* Lark Flow: SVG workspace backed by the JDK's Java syntax tree. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs = {}, text) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const html = (tag, text) => { const el = document.createElement(tag); if (text) el.textContent = text; return el; };
  let host, api, methods = [], current, graph, svg, layer, status, select, sidebar, crumb, mini;
  let controller, generation = 0, timer, resize, previousFocus, currentProject;
  let open = false, follow = true, trace = false, mode = 'method', selected, view = { x: 20, y: 20, z: 1 };
  let positions = new Map(), choices = new Map(), drag, pendingFit = false, navigating = false, stale = false;
  const sessionKey = () => 'lark.flow.' + currentProject;
  function save() {
    if (!host) return;
    try { localStorage.setItem(sessionKey(), JSON.stringify({ method: current?.id, mode, view, follow, expanded: host.classList.contains('flow-expanded'), sidebar: !sidebar.hidden, height:host.style.flexBasis })); } catch (_) { }
  }
  function button(label, action, title = label) {
    const b = html('button', label); b.type = 'button'; b.title = title;
    if(['−','+','100%','×'].includes(label)) b.setAttribute('aria-label',title);
    b.addEventListener('click', action); return b;
  }
  function notice(text) { status.textContent = text; }
  function enableControls() {host.querySelectorAll('.flow-tools button').forEach(b=>{b.disabled=!graph&&!['Refresh','Follow editor'].includes(b.textContent);});}
  function create() {
    host = html('section'); host.id = 'lark-flow'; host.setAttribute('aria-label', 'Lark Flow workspace');
    const divider=html('div');divider.className='flow-divider';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-label','Resize Lark Flow');divider.setAttribute('aria-orientation','horizontal');
    const setHeight=h=>{host.style.flex='0 0 '+Math.max(240,Math.min(host.parentElement.clientHeight-140,h))+'px';api.resize();save();};
    let sizing;
    divider.addEventListener('pointerdown',e=>{sizing={y:e.clientY,height:host.clientHeight};divider.setPointerCapture(e.pointerId);});
    divider.addEventListener('pointermove',e=>{if(sizing)setHeight(sizing.height+sizing.y-e.clientY);});
    divider.addEventListener('pointerup',()=>{sizing=null;});divider.addEventListener('pointercancel',()=>{sizing=null;});
    divider.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(host.clientHeight+(e.key==='ArrowUp'?30:-30));}});
    const top = html('div'); top.className = 'flow-toolbar';
    const heading = html('strong', 'Lark Flow');
    const side = button('Structure', () => { sidebar.hidden = !sidebar.hidden; side.setAttribute('aria-expanded', String(!sidebar.hidden)); save(); }); side.setAttribute('aria-expanded','false');
    select = html('select'); select.setAttribute('aria-label','Flow method');
    select.addEventListener('change', () => { current = methods.find(m => m.id === select.value); mode = 'method'; choices.clear(); show(true); });
    const close = button('×', closeFlow, 'Close Lark Flow'); close.setAttribute('aria-label','Close Lark Flow');
    const expand=button('Expand', () => { host.classList.toggle('flow-expanded'); expand.textContent=host.classList.contains('flow-expanded')?'Show code':'Expand'; api.resize(); save(); });expand.id='flow-expand';
    top.append(heading, side, select, expand, close);
    const tools = html('div'); tools.className = 'flow-toolbar flow-tools';
    const followButton = button('Follow editor', () => { follow = !follow; followButton.setAttribute('aria-pressed', String(follow)); save(); }); followButton.id = 'flow-follow'; followButton.setAttribute('aria-pressed', String(follow));
    const traceButton = button('Trace path', () => { trace = !trace; traceButton.setAttribute('aria-pressed', String(trace)); choices.clear(); render(); }); traceButton.id = 'flow-trace'; traceButton.setAttribute('aria-pressed','false');
    tools.append(button('−', () => zoom(.8), 'Zoom out'), button('+', () => zoom(1.25), 'Zoom in'), button('100%', () => { view.z = 1; transform(); save(); }, 'Reset zoom'), button('Fit', fit, 'Fit diagram to screen'), button('Auto layout', () => { layout(); render(); fit(); }), button('Refresh', () => refresh(true), 'Refresh diagram'), followButton, traceButton, button('Reset path', () => { choices.clear(); render(); }), button('SVG', () => exportDiagram('svg'), 'Export diagram as SVG'), button('PNG', () => exportDiagram('png'), 'Export diagram as PNG'));
    crumb = html('nav'); crumb.className = 'flow-breadcrumb'; crumb.setAttribute('aria-label','Flow navigation');
    const body = html('div'); body.className = 'flow-body';
    sidebar = html('aside'); sidebar.className = 'flow-structure'; sidebar.hidden = true; sidebar.setAttribute('aria-label','Program structure');
    const canvas = html('div'); canvas.className = 'flow-canvas';
    svg = make('svg', { role: 'group', 'aria-label': 'Java control flow diagram', tabindex: '0' });
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * .0015), e.clientX-r.left, e.clientY-r.top); }, { passive: false });
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const n = e.target.closest('[data-node]');
      drag = { id: n?.dataset.node, x: e.clientX, y: e.clientY, oldX: view.x, oldY: view.y, pos: n ? { ...positions.get(n.dataset.node) } : null, moved: false };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
      if (Math.abs(dx)+Math.abs(dy)>4) drag.moved=true;
      if (!drag.moved) return;
      if (drag.id) { positions.set(drag.id, { x: drag.pos.x+dx/view.z, y: drag.pos.y+dy/view.z }); render(); }
      else { view.x=drag.oldX+dx; view.y=drag.oldY+dy; transform(); }
    });
    svg.addEventListener('pointerup', e => { const d=drag; drag=null; if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId); if (d && !d.moved && d.id) selectNode(d.id,true); save(); });
    svg.addEventListener('pointercancel', () => { drag=null; });
    svg.addEventListener('dblclick', e => { const id=e.target.closest('[data-node]')?.dataset.node; if (mode!=='method' && id) { current=methods.find(m=>m.id===id); mode='method'; show(true); } });
    svg.addEventListener('keydown', e => {
      const id=e.target.closest('[data-node]')?.dataset.node;
      if ((e.key==='Enter'||e.key===' ') && id) { e.preventDefault(); if(mode!=='method') { current=methods.find(m=>m.id===id); mode='method'; show(true); } else selectNode(id,true); }
      if (e.key==='+' || e.key==='=') zoom(1.25);
      if (e.key==='-') zoom(.8);
      if (e.key==='0') fit();
      if (e.key.startsWith('Arrow')) { e.preventDefault(); const delta={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]}[e.key]; view.x+=delta[0]; view.y+=delta[1]; transform(); }
    });
    mini=make('svg',{class:'flow-map',role:'button',tabindex:0,'aria-label':'Diagram overview. Click to center; Enter fits diagram.'});
    mini.addEventListener('click',e=>{const b=bounds(),r=mini.getBoundingClientRect(),scale=Math.min(r.width/b.w,r.height/b.h),ox=(r.width-b.w*scale)/2,oy=(r.height-b.h*scale)/2;view.x=svg.clientWidth/2-(b.x+(e.clientX-r.left-ox)/scale)*view.z;view.y=svg.clientHeight/2-(b.y+(e.clientY-r.top-oy)/scale)*view.z;transform();save();});
    mini.addEventListener('keydown',e=>{if(e.key==='Enter'){fit();}});
    canvas.append(svg,mini); body.append(sidebar,canvas);
    status = html('div'); status.className='flow-status'; status.setAttribute('role','status');
    host.append(divider,top,tools,crumb,body,status); document.getElementById('editor-pane').append(host);enableControls();
    resize = new ResizeObserver(() => { if(pendingFit && graph) { pendingFit=false; fit(); } }); resize.observe(canvas);
  }
  async function refresh(force=false) {
    if(!open) return;
    clearTimeout(timer); controller?.abort(); controller=new AbortController(); const request=++generation;
    const files=api.files();
    notice('Analyzing Java…');
    try {
      const response=await fetch('/api/flow',{method:'POST',headers:{'Content-Type':'application/json','X-Lark':'1'},body:JSON.stringify({files}),signal:controller.signal});
      const data=await response.json();
      if(request!==generation || !open) return;
      if(!response.ok || !data.ok) throw new Error(data.error||'Flow analysis failed.');
      if(!data.valid) { stale=true; notice('Diagram is out of date · '+(data.diagnostics?.[0]?.message||'Fix Java syntax, then refresh.')); return; }
      stale=false; methods=data.methods;
      const cursor=api.cursor();
      current=methods.find(m=>m.id===current?.id) || methods.find(m=>m.path===cursor.path && cursor.offset>=m.start && cursor.offset<=m.end) || methods.find(m=>m.path===cursor.path) || methods[0];
      select.replaceChildren(...methods.map(m=>{ const o=html('option',m.signature); o.value=m.id; return o; }));
      show(force || !graph);
    } catch(err) { if(err.name!=='AbortError' && request===generation) { stale=true; notice('Diagram unavailable · '+err.message); } }
  }
  function show(reset=false) {
    if(!current) { graph=null; svg.replaceChildren(); mini.replaceChildren(); crumb.replaceChildren(); sidebar.replaceChildren(); enableControls(); notice('No method bodies found. Open a Java file with a method or constructor.'); return; }
    select.value=current.id;
    crumb.replaceChildren(button('Project',()=>{mode='project';show(true);}),html('span','/'),button(current.owner,()=>{mode='class';show(true);}),html('span','/'),button(current.name,()=>{mode='method';show(true);}));
    const list=methods.filter(m=>mode==='project'||m.owner===current.owner);
    sidebar.replaceChildren(...list.map(m=>{const b=button(m.signature,()=>{current=m;mode='method';show(true);}); b.title=m.path; return b;}));
    if(mode==='method') {
      const reachable=new Set(), byFrom=new Map();
      current.edges.forEach(e=>{if(!byFrom.has(e.from))byFrom.set(e.from,[]);byFrom.get(e.from).push(e.to);});
      const queue=[current.entry]; while(queue.length) {const id=queue.pop();if(reachable.has(id))continue;reachable.add(id);queue.push(...(byFrom.get(id)||[]));}
      graph={nodes:current.nodes.filter(n=>reachable.has(n.id)),edges:current.edges.filter(e=>reachable.has(e.from)&&reachable.has(e.to)),entry:current.entry};
    } else {
      const ids=new Set(list.map(m=>m.id));
      graph={nodes:list.map(m=>({id:m.id,kind:'call',label:m.signature,start:m.start,end:m.end,path:m.path})),edges:list.flatMap(m=>m.calls.filter(c=>c.target && ids.has(c.target)).map(c=>({from:m.id,to:c.target,label:'calls'}))),entry:list[0]?.id};
      graph.edges=graph.edges.filter((e,i,a)=>a.findIndex(x=>x.from===e.from&&x.to===e.to)===i);
    }
    if(graph.nodes.length>350) {
      graph={nodes:[{id:'large-overview',kind:'unsupported',label:'Large diagram · '+graph.nodes.length+' nodes. Choose a smaller method or class.',start:current.start,end:current.end}],edges:[],entry:'large-overview'};
    }
    choices.clear(); selected=null;
    layout(); render(); if(reset) {
      fit();
      if(mode==='method' && view.z<.55) {const p=positions.get(graph.entry)||{x:0,y:0};view.z=.8;view.x=svg.clientWidth/2-(p.x+120)*view.z;view.y=24-p.y*view.z;transform();}
      pendingFit=svg.clientWidth===0;
    }
    save();
  }
  function layout() {
    if(!graph) return;
    positions=new Map();
    const adj=new Map(graph.nodes.map(n=>[n.id,[]])), back=new Set(), visited=new Set(), stack=new Set(), order=[];
    graph.edges.forEach(e=>adj.get(e.from)?.push(e));
    function visit(id) { if(visited.has(id))return;visited.add(id);stack.add(id);for(const e of adj.get(id)||[]) {if(stack.has(e.to))back.add(e);else visit(e.to);}stack.delete(id);order.unshift(id); }
    if(graph.entry)visit(graph.entry);graph.nodes.forEach(n=>visit(n.id));
    const ranks=new Map(graph.nodes.map(n=>[n.id,0]));
    order.forEach(id=>(adj.get(id)||[]).forEach(e=>{if(!back.has(e))ranks.set(e.to,Math.max(ranks.get(e.to)||0,ranks.get(id)+1));}));
    const rows=new Map(); order.forEach(id=>{const r=ranks.get(id);if(!rows.has(r))rows.set(r,[]);rows.get(r).push(id);});
    const max=Math.max(1,...[...rows.values()].map(r=>r.length));
    for(const [rank,ids] of rows) ids.forEach((id,i)=>positions.set(id,{x:60+(max-ids.length)*155+i*310,y:40+rank*145}));
  }
  function bounds() {
    const ps=[...positions.values()];if(!ps.length)return{x:0,y:0,w:500,h:300};
    const x=Math.min(...ps.map(p=>p.x))-90,y=Math.min(...ps.map(p=>p.y))-35;
    return{x,y,w:Math.max(...ps.map(p=>p.x))+340-x,h:Math.max(...ps.map(p=>p.y))+135-y};
  }
  function fit() { if(!graph)return; const b=bounds();view.z=Math.max(.08,Math.min(1.2,(svg.clientWidth-32)/b.w,(svg.clientHeight-28)/b.h));view.x=(svg.clientWidth-b.w*view.z)/2-b.x*view.z;view.y=(svg.clientHeight-b.h*view.z)/2-b.y*view.z;transform();save(); }
  function zoom(factor,x=svg.clientWidth/2,y=svg.clientHeight/2) { const old=view.z;view.z=Math.max(.08,Math.min(3,old*factor));view.x=x-(x-view.x)*view.z/old;view.y=y-(y-view.y)*view.z/old;transform();save(); }
  function transform() {
    layer?.setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.z})`);
    if(!graph||!mini)return;
    const b=bounds();mini.setAttribute('viewBox',`${b.x} ${b.y} ${b.w} ${b.h}`);mini.replaceChildren();
    graph.nodes.forEach(n=>{const p=positions.get(n.id);if(p)mini.append(make('rect',{x:p.x,y:p.y,width:240,height:80,class:'flow-map-node'}));});
    mini.append(make('rect',{x:-view.x/view.z,y:-view.y/view.z,width:svg.clientWidth/view.z,height:svg.clientHeight/view.z,class:'flow-map-viewport'}));
  }
  function activeTrace() {
    const seen=new Set(), links=new Set(); let id=graph.entry;
    for(let i=0;i<1500 && id && !seen.has(id);i++) {
      seen.add(id); const exits=graph.edges.filter(e=>e.from===id);
      const e=choices.has(id)?exits.find(x=>edgeKey(x)===choices.get(id)):exits.length===1?exits[0]:null;
      if(!e)break;links.add(edgeKey(e));id=e.to;
    }
    return{seen,links};
  }
  const edgeKey=e=>e.from+'|'+e.to+'|'+e.label;
  function render() {
    if(!graph)return;
    enableControls();
    svg.replaceChildren();const defs=make('defs'),marker=make('marker',{id:'flow-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});marker.append(make('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(marker);svg.append(defs);
    layer=make('g');svg.append(layer);
    const active=trace?activeTrace():null;
    graph.edges.forEach((e,i)=>{
      const a=positions.get(e.from),b=positions.get(e.to);if(!a||!b)return;
      let d,tx,ty;
      if(b.y>a.y) {const mid=(a.y+80+b.y)/2;d=`M ${a.x+120} ${a.y+80} V ${mid} H ${b.x+120} V ${b.y}`;tx=(a.x+b.x)/2+125;ty=mid-6;}
      else {const x=Math.max(a.x,b.x)+265+(i%3)*14;d=`M ${a.x+240} ${a.y+40} H ${x} V ${b.y-18} H ${b.x+120} V ${b.y}`;tx=x+5;ty=(a.y+b.y)/2;}
      const g=make('g',{class:'flow-edge'+(active?(active.links.has(edgeKey(e))?' traced':' dimmed'):'' )});
      const path=make('path',{d,fill:'none','marker-end':'url(#flow-arrow)'});g.append(path);
      if(e.label)g.append(make('text',{x:tx,y:ty},e.label));
      if(trace) {
        g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label','Trace '+(e.label||'next statement'));
        const choose=()=>{choices.set(e.from,edgeKey(e));render();};g.addEventListener('click',choose);g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();choose();}});
        g.append(make('path',{d,fill:'none',stroke:'transparent','stroke-width':16,class:'flow-edge-hit'}));
      }
      layer.append(g);
    });
    graph.nodes.forEach(n=>{
      const p=positions.get(n.id); if(!p)return;
      const g=make('g',{transform:`translate(${p.x} ${p.y})`,'data-node':n.id,tabindex:'0',role:'button','aria-label':n.label,class:'flow-node '+n.kind+(n.id===selected?' selected':'')+(active&&!active.seen.has(n.id)?' dimmed':'')});
      let shape;
      if(n.kind==='decision')shape=make('polygon',{points:'120,0 240,40 120,80 0,40'});
      else if(n.kind==='io')shape=make('polygon',{points:'20,0 240,0 220,80 0,80'});
      else shape=make('rect',{width:240,height:80,rx:n.kind==='start'||n.kind==='end'?40:n.kind==='call'?12:3});
      g.append(shape,make('title',{},n.label));
      const words=n.label.match(/.{1,30}(?:\s|$)|.{1,30}/g)||[''];
      const lines=words.slice(0,3);if(words.length>3)lines[2]=lines[2].slice(0,26)+'…';
      const text=make('text',{'text-anchor':'middle',x:120,y:42-(lines.length-1)*8});
      lines.forEach((line,i)=>text.append(make('tspan',{x:120,dy:i?16:0},line.trim())));g.append(text);layer.append(g);
    });
    transform();
    const warn=mode==='method'?[...new Set(current.warnings)]:[];
    const unresolved=mode!=='method'?methods.filter(m=>mode==='project'||m.owner===current.owner).flatMap(m=>m.calls).filter(c=>!c.target).length:0;
    notice((stale?'Diagram out of date · ':'')+(trace?'Static trace · choose labeled arrows; loops stop after one cycle. ':'')+graph.nodes.length+' nodes · '+(warn.join(' ') || (unresolved?unresolved+' external or unresolved calls omitted.':'Click a node to view source. Drag background to pan; wheel to zoom.')));
  }
  function selectNode(id,navigate) {
    selected=id;
    // Keep DOM targets alive across the two clicks of a method double-click.
    svg.querySelectorAll('[data-node]').forEach(el=>el.classList.toggle('selected',el.dataset.node===id));
    const n=graph.nodes.find(n=>n.id===id);
    if(navigate&&n&&!stale) { navigating=true;api.navigate(n.path||current.path,n.start,n.end);navigating=false; }
    if(stale)notice('Diagram is out of date. Source navigation resumes after Java syntax is fixed.');
  }
  function cursorChanged(force=false) {
    if(!open||(!follow&&!force)||navigating||stale||!methods.length)return;
    const c=api.cursor(), m=methods.filter(m=>m.path===c.path&&c.offset>=m.start&&c.offset<=m.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0] || (force ? methods.find(m=>m.path===c.path) : null);
    if(!m)return;
    if(m.id!==current?.id||mode!=='method') {current=m;mode='method';show(true);}
    const n=graph.nodes.filter(n=>!['start','end'].includes(n.kind)&&c.offset>=n.start&&c.offset<n.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
    if(n&&selected!==n.id) {selected=n.id;render();const p=positions.get(n.id);view.x=svg.clientWidth/2-(p.x+120)*view.z;view.y=svg.clientHeight/2-(p.y+40)*view.z;transform();}
  }
  async function exportDiagram(type) {
    if(!graph)return;
    try {
      const clone=svg.cloneNode(true),b=bounds(),style=getComputedStyle(host);
      clone.setAttribute('xmlns',NS);clone.setAttribute('viewBox',`${b.x} ${b.y} ${b.w} ${b.h}`);clone.setAttribute('width',b.w);clone.setAttribute('height',b.h);clone.querySelector('g')?.removeAttribute('transform');
      const text=style.getPropertyValue('--text').trim(),bg=style.getPropertyValue('--bg-sunken').trim(),line=style.getPropertyValue('--muted').trim(),accent=style.getPropertyValue('--accent').trim();
      const css=make('style',{},`text{fill:${text};font:12px system-ui}.flow-node>rect,.flow-node>polygon{fill:${bg};stroke:${line};stroke-width:1.4}.flow-node.selected>rect,.flow-node.selected>polygon{stroke:${accent};stroke-width:2}.flow-edge>path{stroke:${line};stroke-width:1.4}.flow-edge text{font:11px system-ui;paint-order:stroke;stroke:${bg};stroke-width:4px}.flow-edge.traced>path{stroke:${accent};stroke-width:2}.dimmed{opacity:.25}.flow-edge-hit{display:none}`);
      clone.insertBefore(css,clone.firstChild);clone.insertBefore(make('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:bg}),clone.firstChild);
      const xml=new XMLSerializer().serializeToString(clone),blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'});
      let output=blob;
      if(type==='png') {
        const img=new Image();
        await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);});
          const scale=Math.min(2,12000/b.w,12000/b.h,Math.sqrt(24000000/(b.w*b.h))),canvas=document.createElement('canvas');canvas.width=Math.ceil(b.w*scale);canvas.height=Math.ceil(b.h*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);output=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      }
      if(!output)throw new Error('Image is too large. Use SVG.');
      const url=URL.createObjectURL(output),a=html('a');a.href=url;a.download='lark-flow-'+mode+'.'+type;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Exported '+type.toUpperCase()+' · complete diagram.');
    } catch(e) {notice('Export failed · '+(e.message||'Try SVG for this diagram.'));}
  }
  function closeFlow() {
    if(!open)return;save();open=false;generation++;controller?.abort();clearTimeout(timer);resize?.disconnect();host.remove();host=null;graph=null;api.resize();previousFocus?.focus();
  }
  window.LarkFlow={
    open(adapter,preferCursor=false) {
      if(open) { if(currentProject!==adapter.project()) {closeFlow();} else {if(preferCursor)cursorChanged(true);return;} }
      api=adapter;currentProject=api.project();previousFocus=document.activeElement;open=true;create();
      let saved;try{saved=JSON.parse(localStorage.getItem(sessionKey()));}catch(_){}
      current=!preferCursor&&saved?.method?{id:saved.method}:null;mode=preferCursor?'method':saved?.mode||'method';follow=saved?.follow!==false;document.getElementById('flow-follow').setAttribute('aria-pressed',String(follow));
      if(saved?.sidebar)sidebar.hidden=false;if(saved?.height)host.style.flex='0 0 '+saved.height;if(saved?.expanded){host.classList.add('flow-expanded');document.getElementById('flow-expand').textContent='Show code';}
      const openingHost=host;
      api.resize();refresh(false).then(()=>{if(open&&host===openingHost&&!preferCursor&&saved?.view){view=saved.view;transform();}});svg.focus();
    }, close:closeFlow, refresh:()=>refresh(true), fit,
    changed() { if(open) {stale=true;controller?.abort();generation++;clearTimeout(timer);timer=setTimeout(()=>refresh(false),650);} },
    cursor:cursorChanged,
    projectChanged() {if(open)closeFlow();}
  };
})();
