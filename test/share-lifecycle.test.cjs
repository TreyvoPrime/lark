/* Delayed transport replies must not revive a stopped Share editor. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function harness() {
  const requests = [], intervals = new Set(), listeners = new Set();
  let text = 'local', attached = 0;
  const doc = { getValue: () => text, posFromIndex: ch => ({line:0,ch}),
    replaceRange: value => { text = value; }, clearHistory() {},
    on: (_, fn) => listeners.add(fn), off: (_, fn) => listeners.delete(fn) };
  const cm = {state:{}, setOption() {}};
  const context = vm.createContext({crypto:webcrypto, console,
    window:{addEventListener() {}, LarkEditorShare:{flush:async()=>{},prepareHost:async()=>{attached++;},leave:async()=>{},
      current:()=>({path:'Main.java',doc}),editor:()=>cm,updated() {}}},
    document:{getElementById:()=>null,dispatchEvent() {}},CustomEvent:class {},
    localStorage:{setItem() {},removeItem() {}},
    CodeMirror:{commands:{undo() {},redo() {}}},setTimeout:()=>1,clearTimeout() {},
    setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),
    fetch:(_,options)=>{const d=deferred();requests.push({body:JSON.parse(options.body),reply:data=>d.resolve({ok:true,json:async()=>({ok:true,...data})})});return d.promise;}
  });
  for(const file of ['share-document.js','share-editor.js']) {
    vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../web/js',file),'utf8'),context);
    context.LarkShareDocument=context.window.LarkShareDocument;
  }
  const turn=()=>new Promise(resolve=>setImmediate(resolve));
  return {share:context.window.LarkShareEditing,requests,intervals,listeners,cm,turn,get text(){return text;},get attached(){return attached;}};
}
const session=id=>({id,identity:'host',hosting:true,project:'test'});
const files={files:[{path:'Main.java'}]};
const opened=(seed='shared',head=0)=>({seed,actor:'local',role:'editor',revision:0,head,operations:[]});
(async()=>{
  { const h=harness(), start=h.share.start(session('old'));
    assert.equal(h.share.start(session('old')),start,'concurrent startup uses one task');
    await h.turn(); assert.equal(h.requests.length,1);
    await h.share.stop();h.requests[0].reply(files);await start;
    assert.equal(h.share.sessionActive(),false);assert.equal(h.attached,0);assert.equal(h.intervals.size,0);
  }
  { const h=harness(), old=h.share.start(session('old'));await h.turn();h.requests[0].reply(files);await h.turn();
    h.requests[1].reply(opened('old',1));await h.turn();assert.equal(h.requests[2].body.action,'sync');
    assert.equal(h.share.debug().documents.size,0,'partial history is never published');
    await h.share.stop();const fresh=h.share.start(session('new'));await h.turn();h.requests[3].reply(files);await h.turn();
    h.requests[2].reply({revision:1,operations:[]});await old;
    h.requests[4].reply(opened('new'));await fresh;
    assert.equal(h.text,'new');assert.equal(h.share.debug().session.id,'new');assert.equal(h.intervals.size,1);
    assert.equal(h.listeners.size,1);await h.share.stop();assert.equal(h.listeners.size,0);assert.equal(h.intervals.size,0);
    assert.equal(h.cm.state.larkShare,null);
  }
  { const h=harness(), start=h.share.start(session('broken'));await h.turn();h.requests[0].reply(files);await h.turn();
    h.requests[1].reply(opened('partial',1));await h.turn();
    const rejection=assert.rejects(start,/did not advance/);h.requests[2].reply({revision:0,operations:[]});await rejection;
    assert.equal(h.share.sessionActive(),false);assert.equal(h.text,'local');assert.equal(h.intervals.size,0);
  }
  console.log('Share lifecycle checks passed: duplicate start, cancellation, stale pagination, restart, listener cleanup and failed startup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
