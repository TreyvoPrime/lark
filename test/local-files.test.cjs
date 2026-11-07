const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const {test}=require('node:test');
function setup() {
 const saved=new Map();
 const indexedDB={open(){const request={};setImmediate(()=>{request.result={close(){},transaction(){const tx={};tx.objectStore=()=>({get(key){const req={result:saved.get(key)};setImmediate(()=>tx.oncomplete());return req;},put(value,key){saved.set(key,value);setImmediate(()=>tx.oncomplete());return {};}});return tx;}};request.onsuccess();});return request;}};
 const ctx={window:{},indexedDB,Map,Set};vm.createContext(ctx);vm.runInContext(fs.readFileSync('web/js/local-files.js','utf8'),ctx);return ctx.window.LarkLocalFiles;
}
function handle(name,text='original') {
 let value=text, stamp=1;
 return {kind:'file',name,queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',getFile:async()=>({name,size:Buffer.byteLength(value),lastModified:stamp,text:async()=>value}),createWritable:async()=>({write:async text=>{value=text;},close:async()=>{stamp++;},abort:async()=>{}}),external(text){value=text;stamp++;},value:()=>value};
}
test('linked file saves the original and refuses paths outside the selected file',async()=>{
 const local=setup(), f=handle('Main.java');await local.attach('p',f,[]);await local.read('p',await local.get('p'));
 await local.before('PUT','/api/projects/p/file',{path:'Main.java',content:'edited'});assert.equal(f.value(),'edited');
 await assert.rejects(local.before('PUT','/api/projects/p/file',{path:'neighbor.java',content:'bad'}),/Only the selected file/);
});
test('external edits are detected instead of silently overwritten',async()=>{
 const local=setup(),f=handle('file.txt');await local.attach('p',f,[]);await local.read('p',await local.get('p'));f.external('external edit');
 await assert.rejects(local.before('PUT','/api/projects/p/file',{path:'file.txt',content:'stale'}),/changed outside Lark/);assert.equal(f.value(),'external edit');
});
test('denied filesystem access does not mark a linked file writable',async()=>{
 const local=setup(),f=handle('file.txt');f.queryPermission=async()=> 'prompt';f.requestPermission=async()=> 'denied';
 await assert.rejects(local.attach('p',f,[]),/Allow access/);
});
