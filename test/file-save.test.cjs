const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const source=fs.readFileSync('web/js/app.js','utf8');
const saveSource=source.slice(source.indexOf('  const saveQueues = new Map();'),source.indexOf('  async function flushSaves()'));
function harness(text, formatter=x=>x) {
 let content=text;
 const selections=[{anchor:{line:1,ch:8},head:{line:1,ch:8}}];
 const doc={getValue:()=>content,listSelections:()=>structuredClone(selections),setSelections:s=>assert.deepEqual(s,selections),replaceRange(value,from,to){const lines=content.split('\n');lines[from.line]=lines[from.line].slice(0,from.ch)+value+lines[to.line].slice(to.ch);content=lines.join('\n');}};
 const file={content:text};
 const state={project:{id:'test'},settings:{formatOnSave:true},dirty:new Set(['Main.java']),active:'Main.java'};
 const requests=[];
 const context={Map,Set,Promise,console,window:{LarkJava:{beautifyJava:formatter}},docs:new Map([['Main.java',doc]]),state,suppress:false,fileByPath:()=>file,api:(method,path,body)=>new Promise((resolve,reject)=>requests.push({body,resolve,reject})),renderTabs(){},renderTabsB(){},setSaveStatus(){},toast(){}};
 vm.createContext(context);vm.runInContext(saveSource+'\nthis.save=saveFile;',context);
 return {context,state,requests,doc,set:value=>{content=value;state.dirty.add('Main.java');}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('format-on-save retains the cursor line whitespace and selection',async()=>{
 const h=harness('class Main {\n        \n   int x;\n}',s=>s.split('\n').map(x=>x.trim()).join('\n'));
 const saving=h.context.save('Main.java');await tick();
 assert.equal(h.doc.getValue().split('\n')[1],'        ');
 assert.equal(h.requests[0].body.content.split('\n')[2],'int x;');
 h.requests[0].resolve({});await saving;
});
test('queued saves cannot finish out of order or clear a newer dirty edit',async()=>{
 const h=harness('old'); h.state.settings.formatOnSave=false;
 const first=h.context.save('Main.java');await tick();h.set('new');const second=h.context.save('Main.java');await tick();
 assert.equal(h.requests.length,1);h.requests[0].resolve({});await first;await tick();
 assert.equal(h.state.dirty.has('Main.java'),true);
 assert.equal(h.requests[1].body.content,'new');h.requests[1].resolve({});await second;
 assert.equal(h.state.dirty.size,0);
});
test('failed saves retain dirty state and reject so project switching can stop',async()=>{
 const h=harness('unsaved');h.state.settings.formatOnSave=false;
 const saving=h.context.save('Main.java');const rejected=assert.rejects(saving,/disk full/);await tick();h.requests[0].reject(new Error('disk full'));await rejected;assert.equal(h.state.dirty.size,1);
});
