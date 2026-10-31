/* Real CodeMirror + DOM event regression; complements physical-browser testing. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require(process.env.LARK_JSDOM_PATH || 'jsdom');
(async () => {
 const dom = new JSDOM('<div id="editor"></div>', { url:'http://127.0.0.1:43123', runScripts:'outside-only', pretendToBeVisual:true });
 const w=dom.window;
 w.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0});
 w.Range.prototype.getClientRects=()=>[];
 let tick;
 w.setInterval=fn=>{tick=fn;return 1;}; w.clearInterval=()=>{};
 const root=path.resolve(__dirname,'..');
 for(const file of ['web/vendor/codemirror/codemirror.min.js','web/js/share-document.js']) w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 const cm=w.CodeMirror(w.document.getElementById('editor'),{value:'class Main {}\n'}), doc=cm.getDoc();
 w.LarkEditorShare={editor:()=>cm,current:()=>({path:'Main.java',doc}),flush:async()=>{},prepareHost:async()=>{},updated:()=>{},leave:async()=>{}};
 w.fetch=async(_, options)=>{
  const body=JSON.parse(options.body);
  const data=body.action==='files'?{files:[{path:'Main.java'}]}:body.action==='open'?{seed:'class Main {}\n',actor:'local',role:'editor',revision:0,head:0,operations:[]}:{operations:[],revision:0,role:'editor',participants:[]};
  return {ok:true,json:async()=>({ok:true,...data})};
 };
 w.eval(fs.readFileSync(path.join(root,'web/js/share-editor.js'),'utf8'));
 await w.LarkShareEditing.start({id:'keyboard-test',identity:'host',hosting:true,project:'test'});
 const key=(name,values={})=>{const event=new w.KeyboardEvent('keydown',{key:name,ctrlKey:true,bubbles:true,cancelable:true,...values});cm.getInputField().dispatchEvent(event);return event;};
 cm.replaceRange('// local\n',{line:0,ch:0});
 assert(cm.getValue().startsWith('// local'));
 assert(key('z').defaultPrevented); assert.equal(cm.getValue(),'class Main {}\n');
 for(let i=0;i<20;i++) assert(key('z',{repeat:true}).defaultPrevented);
 assert.equal(cm.getValue(),'class Main {}\n','held empty undo cannot insert literal z');
 key('y');assert(cm.getValue().startsWith('// local'));
 key('z');key('z',{shiftKey:true});assert(cm.getValue().startsWith('// local'));
 key('z');cm.replaceRange('// replacement\n',{line:0,ch:0});key('y');
 assert(!cm.getValue().includes('// local'),'new local edits invalidate redo');
 const entry=w.LarkShareEditing.debug().documents.get('Main.java');entry.role='viewer';cm.setOption('readOnly',true);
 const before=cm.getValue();assert(key('z').defaultPrevented);assert.equal(cm.getValue(),before);
 await w.LarkShareEditing.stop(); dom.window.close();
 console.log('CodeMirror DOM keyboard checks passed: undo, both redo shortcuts, held repeat, empty history, redo invalidation and viewers.');
})().catch(error=>{console.error(error);process.exitCode=1;});
