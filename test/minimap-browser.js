const ed = CodeMirror(document.getElementById('editor'), {mode:'text/x-java',theme:'lark',lineNumbers:true});
let map;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rendered(lines) { for(let i=0;i<200;i++){ if(map.stats && map.stats.lines===lines && map.canvas.width) return; await wait(25); } throw Error('Render timeout'); }
function check(value,label){ if(!value) throw Error(label); document.getElementById('result').textContent+='PASS '+label+'\n'; }
const pixels = canvas => Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data).filter((v,i)=>i%4===3&&v).length;
document.getElementById('run').onclick=async()=>{
  document.getElementById('result').textContent='';
  try{
    if(map)map.dispose();
    ed.setValue('class Sample {\n'+Array.from({length:400},(_,i)=>'    int value'+i+' = '+i+'; // sample').join('\n')+'\n}');
    map=new LarkMinimap(ed,{enabled:true}); await rendered(402);
    // Synthetic events cannot acquire OS pointer capture; real mouse capture is checked in the app smoke test.
    map.node.setPointerCapture=()=>{};
    check(pixels(map.canvas)>100,'code overview paints actual document');
    const before=ed.getValue(); const rect=map.node.getBoundingClientRect();
    map.node.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,clientY:rect.top+200,bubbles:true}));
    map.node.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
    await wait(40);
    check(ed.getScrollInfo().top>1000,'click jumps into file');
    check(parseFloat(map.viewport.style.top)>0,'viewport follows scroll');
    const view=map.viewport.getBoundingClientRect(); const scroll=ed.getScrollInfo().top;
    map.viewport.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,clientY:view.top+2,bubbles:true}));
    map.node.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientY:view.top+42,bubbles:true}));
    map.node.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
    check(ed.getScrollInfo().top>scroll,'viewport drag scrolls');
    check(ed.getValue()===before,'navigation never edits source');
    map.node.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    check(ed.getScrollInfo().top===0,'keyboard Home navigation');
    map.configure({side:'left',width:64}); await wait(200);
    check(map.node.getBoundingClientRect().right<=ed.getWrapperElement().getBoundingClientRect().left+1,'left side reserves editor space');
    check(Math.round(map.node.getBoundingClientRect().width)===64,'custom width');
    map.setDiagnostics([{line:10,severity:'error'},{line:80,severity:'warning'}]); await wait(200);
    check(pixels(map.marks)>0,'diagnostic markers painted');
    map.configure({markers:false}); await wait(200); check(pixels(map.marks)===0,'diagnostics can be hidden');
    ed.state.search={query:'sample'}; map.scheduleMarkers(); await wait(250);
    check(pixels(map.marks)>0,'search matches painted independently');
    ed.state.search.query=null; map.scheduleMarkers(); await wait(200); check(pixels(map.marks)===0,'search markers clear');
    document.documentElement.dataset.theme='daylight'; await wait(200);
    check(map.colors().plain==='rgb(39, 54, 61)','light theme colors');
    map.configure({enabled:false}); check(map.node.hidden&&!ed.getWrapperElement().classList.contains('has-minimap'),'disable restores editor space');
    ed.swapDoc(new CodeMirror.Doc('class Empty {}','text/x-java')); map.configure({enabled:true,syntax:false}); await rendered(1);
    check(map.stats.lines===1&&map.diagnostics.length===0,'document switching clears old overview and diagnostics');
    ed.replaceRange('\n// addition',{line:0,ch:14}); await rendered(2); check(map.stats.lines===2,'editing updates overview');
    ed.setValue('class Large {\n'+'    int value = 42; // test\n'.repeat(10000)+'}');
    map.configure({syntax:true}); await rendered(10002);
    check(map.stats.maxSliceMs<30,'large-file rendering yields in short slices');
    const timing={...map.stats};
    const measure=async(enabled)=>{map.configure({enabled});await wait(250);let times=[];for(let i=0;i<60;i++){let start=performance.now();ed.replaceRange('x',{line:2,ch:4});times.push(performance.now()-start);await wait(4);}times.sort((a,b)=>a-b);return {p95:times[57],max:times[59]};};
    const off=await measure(false),on=await measure(true);
    document.getElementById('result').textContent+='METRICS '+JSON.stringify({render:timing,typingOff:off,typingOn:on})+'\n';
    map.dispose();check(!document.querySelector('.editor-minimap'),'dispose removes resources');
    document.getElementById('result').textContent+='ALL CHECKS PASSED';
  }catch(error){document.getElementById('result').textContent+='FAIL '+error.stack;}
};
