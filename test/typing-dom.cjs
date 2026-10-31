const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.LARK_JSDOM_PATH||'jsdom');
const dom=new JSDOM('<div id="editor"></div>',{url:'http://127.0.0.1',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0});w.Range.prototype.getClientRects=()=>[];
for(const file of ['web/vendor/codemirror/codemirror.min.js','web/vendor/codemirror/mode/clike/clike.min.js','web/js/typing.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
const cm=w.CodeMirror(w.document.getElementById('editor'),{mode:'text/x-java'});
for(const [source,expected,cursor] of [['System.out.pr','System.out.println()',19],['System.out.pr(123)','System.out.println(123)',19]]) {
 cm.setValue(source);cm.setCursor({line:0,ch:13});cm.clearHistory();
 const hints=w.LarkTyping.hint(cm),item=hints.list.find(x=>x.text==='println()');item.hint(cm,hints,item);
 assert.equal(cm.getValue(),expected);assert.equal(cm.getCursor().ch,cursor);
 cm.undo();assert.equal(cm.getValue(),source,'completion is a single undoable edit');
}
cm.setValue('// System.out.pr');cm.setCursor({line:0,ch:16});assert.equal(w.LarkTyping.hint(cm),null);
dom.window.close();console.log('Typing DOM checks passed: insertion range, cursor inside call, existing parentheses, single undo and comments.');
