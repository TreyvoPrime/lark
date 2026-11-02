/* Two simulated Lark windows run the real share-editor.js + CodeMirror against an
   in-memory copy of the host's operation log (same dedupe/paging rules as ShareDocument.java).
   Run: npm i jsdom && node test/js/share-echo-check.js */
'use strict';
const fs = require('fs'), path = require('path'), { webcrypto } = require('crypto');
const { JSDOM } = require('jsdom');
const web = path.join(__dirname, '..', '..', 'web');
const read = f => fs.readFileSync(path.join(web, f), 'utf8');
const SEED = 'class Main {\n}\n';
const server = { log: [], seen: new Map(),
  handle(body) {
    const actor = body.writer;
    if (body.operation) { const key = body.operation.seq + '@' + body.operation.actor;
      if (!this.seen.has(key)) { this.seen.set(key, true); this.log.push(JSON.parse(JSON.stringify(body.operation))); } }
    if (body.action === 'files') return { ok: true, files: [{ path: 'Main.java' }] };
    const since = body.since | 0, end = Math.min(this.log.length, since + (body.action === 'open' ? 4 : 24));
    return { ok: true, seed: SEED, operations: this.log.slice(since, end), revision: end, head: this.log.length, actor, role: 'editor', participants: [] };
  } };
function client() {
  const dom = new JSDOM('<textarea id=t></textarea>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.document.createRange = () => ({ setEnd() {}, setStart() {}, getBoundingClientRect: () => ({}), getClientRects: () => [] });
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.eval(read('vendor/codemirror/codemirror.min.js'));
  const cm = w.CodeMirror.fromTextArea(w.document.getElementById('t')); const doc = w.CodeMirror.Doc(SEED); cm.swapDoc(doc);
  w.fetch = async (_, init) => { const body = JSON.parse(init.body); await new Promise(r => setTimeout(r, 5 + Math.random() * 20));
    const data = server.handle(body); return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) }; };
  w.LarkBirds = { make: () => w.document.createElement('span') };
  w.LarkEditorShare = { editor: () => cm, current: () => ({ path: 'Main.java', doc }), notice() {}, async flush() {}, async prepareHost() {}, async guest() {}, async leave() {}, open() {}, updated() {} };
  w.eval(read('js/share-document.js')); w.eval(read('js/share-editor.js'));
  return { w, cm, doc, type(text, at) { cm.operation(() => doc.replaceRange(text, doc.posFromIndex(at ?? doc.getValue().length), undefined, '+input')); },
    backspace(at) { cm.operation(() => doc.replaceRange('', doc.posFromIndex(at - 1), doc.posFromIndex(at), '+delete')); } };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let checks = 0; const check = (ok, msg) => { checks++; if (!ok) { console.error('FAIL: ' + msg); process.exit(1); } };
(async () => {
  const a = client(), b = client();
  await a.w.LarkShareEditing.start({ id: 's', identity: 'host', hosting: true, project: 'p', name: 'A' });
  await b.w.LarkShareEditing.start({ id: 's', identity: 'guest', hosting: false, project: 'p', name: 'B' });
  await wait(800);
  a.type('a', 12); await wait(1500);
  check(a.doc.getValue() === 'class Main {a\n}\n', 'one char in typer: ' + JSON.stringify(a.doc.getValue()));
  check(b.doc.getValue() === a.doc.getValue(), 'one char reaches peer: ' + JSON.stringify(b.doc.getValue()));
  check(server.log.length === 1, 'exactly one operation, got ' + server.log.length);
  const before = server.log.length; await wait(1500);
  check(server.log.length === before, 'no echo loop while idle');
  for (let i = 0; i < 40; i++) { a.type(String.fromCharCode(97 + i % 26)); b.type(String(i % 10), 0); await wait(10); }
  b.type('System.out.println("hi");\nint x = 1;\n', 0); a.backspace(a.doc.getValue().length); a.backspace(a.doc.getValue().length);
  for (let i = 0; i < 120 && (a.w.LarkShareEditing.pending() || b.w.LarkShareEditing.pending() || a.doc.getValue() !== b.doc.getValue()); i++) await wait(250);
  check(a.doc.getValue() === b.doc.getValue(), 'converged after rapid concurrent typing:\n' + JSON.stringify(a.doc.getValue()) + '\n' + JSON.stringify(b.doc.getValue()));
  check(a.doc.getValue().length === SEED.length + 1 + 40 + 40 + 37 - 2, 'no duplicated or lost characters (' + a.doc.getValue().length + ')');
  const settled = server.log.length; await wait(1500);
  check(server.log.length === settled, 'no runaway operations after burst');
  check(!a.w.LarkShareEditing.pending() && !b.w.LarkShareEditing.pending(), 'pending queues drained');
  console.log('share-echo-check: ' + checks + ' checks passed, ' + server.log.length + ' ops');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
