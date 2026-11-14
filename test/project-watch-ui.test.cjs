const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/js/app.js', 'utf8');
const start = source.indexOf('  function ownWatcherWrite(');
const end = source.indexOf('  async function reconcileProjectWatch(', start);
assert(start >= 0 && end > start);
function fixture() {
  const notices = [], statuses = [], docs = new Map();
  const state = { project: { id: 'p' }, files: [], dirs: [], open: [], dirty: new Set(), timers: new Map() };
  const tree = { scrollTop: 41 };
  const context = { state, docs, parsedCache: new Map(), watcherOwnWrites: new Map(), window: {}, Date, Set, clearTimeout, suppress: false,
    fileByPath: path => state.files.find(file => file.path === path),
    $: id => id === 'tree' ? tree : null,
    renderTree() {}, renderTabs() {}, renderTabsB() {}, renderMains() {}, refreshLocalProblems() {}, renderProblems() {},
    toast: text => notices.push(text), setSaveStatus: text => statuses.push(text)
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  return { state, docs, notices, statuses, context, tree };
}
test('adds and removes paths without changing the active document', () => {
  const f = fixture(); f.state.files.push({path:'old.java',content:'unsaved'}); f.state.open.push('old.java'); f.state.dirty.add('old.java');
  f.context.applyProjectChanges([{path:'src',type:'directory'}, {path:'src/New.java',type:'file',content:'class New {}'}, {path:'old.java',type:'delete'}]);
  assert.equal(f.state.dirs.includes('src'), true);
  assert.equal(f.state.files.find(x=>x.path==='src/New.java').content, 'class New {}');
  const old=f.state.files.find(x=>x.path==='old.java'); assert.equal(old.content,'unsaved'); assert.equal(old.missingFromDisk,true); assert.equal(old.externalConflict,true);
  assert.equal(f.tree.scrollTop,41); assert.equal(f.notices.length,1);
});
test('updates clean documents while preserving selections and protecting dirty ones', () => {
  const f=fixture(); f.state.files.push({path:'a.java',content:'old'}, {path:'b.java',content:'mine'}); f.state.dirty.add('b.java');
  f.state.active='a.java'; let restored=false;
  f.context.cm={getScrollInfo:()=>({left:12,top:75}),scrollTo:(left,top)=>{restored=left===12 && top===75}};
  let value='old', savedSelection=false; const doc={getValue:()=>value,listSelections:()=>[{anchor:{line:0,ch:1},head:{line:0,ch:1}}],posFromIndex:n=>({line:0,ch:n}),replaceRange:s=>{value=s},setSelections:()=>{savedSelection=true}}; f.docs.set('a.java',doc);
  f.context.applyProjectChanges([{path:'a.java',type:'file',content:'new'}, {path:'b.java',type:'file',content:'external'}]);
  assert.equal(value,'new'); assert.equal(savedSelection,true); assert.equal(restored,true); assert.equal(f.state.files[1].content,'mine'); assert.equal(f.state.files[1].externalConflict,true); assert.equal(f.state.dirty.has('b.java'),true);
});
test('ignores notifications caused by an in-flight save', () => {
  const f=fixture(); f.state.files.push({path:'a.java',content:'new edit'}); f.state.dirty.add('a.java');
  f.context.watcherOwnWrites.set('p\0a.java',[{content:'prior save',until:Date.now()+1000}]);
  f.context.applyProjectChanges([{path:'a.java',type:'file',content:'prior save'}]);
  assert.equal(f.state.files[0].externalConflict,undefined); assert.equal(f.state.files[0].content,'new edit');
});
test('keeps an open file visible when the filesystem temporarily cannot read it', () => {
  const f=fixture(); f.state.files.push({path:'a.java',content:'kept'}); f.state.open.push('a.java');
  f.context.applyProjectChanges([{path:'a.java',type:'unavailable'}]);
  assert.equal(f.state.files[0].content,'kept'); assert.equal(f.state.files[0].missingFromDisk,undefined);
  assert.equal(f.state.files[0].externalConflict,true);
});
test('background compile does not prompt for or overwrite conflicted edits', async () => {
  const begin=source.indexOf('  async function runCompileCheck()');
  const end=source.indexOf('  function openProjectSearch()',begin);
  assert(begin>=0 && end>begin);
  let background=false, called=false;
  const context={state:{project:{id:'p'},checkSeq:0,dirty:new Set(['x'])},flushSaves:async value=>{background=value},fileByPath:()=>({externalConflict:true}),api:()=>{called=true}};
  vm.createContext(context); vm.runInContext(source.slice(begin,end),context);
  await context.runCompileCheck(); assert.equal(background,true); assert.equal(called,false);
});
test('retains the event cursor if overflow recovery fails', async () => {
  const begin=source.indexOf('  let projectWatch = null;');
  const end=source.indexOf('  async function openProject(',begin);
  assert(begin>=0 && end>begin);
  let retries=0;
  const watch={project:'p',id:'w',cursor:3};
  const context={state:{project:{id:'p'},files:[],dirs:[]},watcherOwnWrites:new Map(),window:{},Date,Set,Map,clearTimeout,
    setTimeout:()=>{retries++;return 1}, api:async (method,path)=>{
      if (path.includes('/watch/')) return {cursor:20,overflow:true,changes:[]};
      const error=new Error('offline'); error.status=503; throw error;
    }};
  vm.createContext(context); vm.runInContext(source.slice(begin,end)+'\nglobalThis.setWatch = value => { projectWatch = value; };',context);
  context.setWatch(watch); await context.pollProjectWatch(watch);
  assert.equal(watch.cursor,3); assert.equal(retries,1);
});
test('does not consume filesystem events while the same file is saving', async () => {
  const begin=source.indexOf('  let projectWatch = null;');
  const end=source.indexOf('  async function openProject(',begin);
  const watch={project:'p',id:'w',cursor:3}; let retries=0;
  const writes=new Map([['p\0a.java',[{pending:true,content:'saved',until:Date.now()+1000}]]]);
  const context={state:{project:{id:'p'},files:[],dirs:[]},watcherOwnWrites:writes,window:{},Date,Set,Map,clearTimeout,
    setTimeout:()=>{retries++;return 1},api:async()=>({cursor:4,overflow:false,changes:[{path:'a.java',type:'delete'}]})};
  vm.createContext(context); vm.runInContext(source.slice(begin,end)+'\nglobalThis.setWatch = value => { projectWatch = value; };',context);
  context.setWatch(watch); await context.pollProjectWatch(watch);
  assert.equal(watch.cursor,3); assert.equal(retries,1);
});
