const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.LARK_JSDOM_PATH||'jsdom');
(async()=>{
 const root=path.resolve(__dirname,'..');
 let files=[{path:'src/Main.java',content:'public class Main {\n public static void main(String[] args) {}\n}\n'}], project={id:'sample',name:'Sample',mainClass:'Main',files};
 const dom=new JSDOM(fs.readFileSync(path.join(root,'web-mobile/index.html'),'utf8'),{url:'http://127.0.0.1:43125',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0});w.Range.prototype.getClientRects=()=>[];
 w.confirm=()=>true;let promptValue='src/Renamed.java';w.prompt=()=>promptValue;
 w.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):{};
  let data={ok:true};
  if(url==='/api/health')data={ok:true,mobile:true,version:'4.0.5',edition:'mobile'};
  else if(url==='/api/settings')data={theme:'slate',lastProject:'sample'};
  else if(url==='/api/templates')data={templates:['empty']};
  else if(url==='/api/projects')data={projects:[project]};
  else if(url==='/api/projects/sample')data={project:{...project,files}};
  else if(url.endsWith('/file')&&options.method==='PUT'){files.find(f=>f.path===body.path).content=body.content;}
  else if(url.endsWith('/move')){files.find(f=>f.path===body.from).path=body.to;}
  else if(url.includes('/file?')&&options.method==='DELETE'){files=files.filter(f=>f.path!==decodeURIComponent(url.split('path=')[1]));}
  else if(url==='/api/mobile/info')data={lan:false};
  return {ok:true,json:async()=>data};
 };
 for(const file of ['web-mobile/vendor/codemirror/codemirror.min.js','web-mobile/vendor/codemirror/mode/clike/clike.min.js','web-mobile/vendor/codemirror/addon/edit/closebrackets.min.js','web-mobile/vendor/codemirror/addon/hint/show-hint.min.js','web-mobile/js/java.js','web-mobile/js/typing.js','web-mobile/js/mobile.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 const settle=()=>new Promise(r=>setTimeout(r,40));await settle();
 assert.equal(w.document.querySelectorAll('#file-list button').length,1,'nested project files render');
 w.document.querySelector('#file-list button').click();await settle();
 const cm=w.document.querySelector('.CodeMirror').CodeMirror;
 assert.equal(w.document.querySelector('#edit-status').textContent,'Saved','opening source does not mark it dirty');
 cm.replaceRange('// edit\n',{line:0,ch:0});w.document.getElementById('btn-undo').click();assert(!cm.getValue().startsWith('// edit'));w.document.getElementById('btn-redo').click();assert(cm.getValue().startsWith('// edit'));
 w.document.getElementById('btn-save').click();await settle();assert(files[0].content.startsWith('// edit'));
 w.document.getElementById('btn-rename').click();await settle();assert.equal(files[0].path,'src/Renamed.java');
 assert(w.document.querySelectorAll('#symbols button').length>=10);
 w.document.getElementById('btn-delete').click();await settle();assert.equal(files.length,0);
 dom.window.close();console.log('Mobile DOM checks passed: explorer, clean open, undo/redo, save, rename/delete and symbol controls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
