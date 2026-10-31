/* Exercise the real Share polling code with a CodeMirror document/view double. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

(async () => {
  const seed = Array.from({ length: 400 }, (_, i) => `// line ${i}`).join('\n');
  let text = seed, selectionCalls = 0, updates = 0, tick, activePath = 'Main.java', inFlight;
  let selections = [{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } }], primary = 0;
  let scroll = { left: 150, top: 2400 }, nextResponse, syncHook, remoteRange, remoteWidget;
  const selectionOptions = [], followScrolls = [];
  const doc = {
    getValue: () => text,
    listSelections: () => structuredClone(selections),
    getCursor: which => selections[primary][which],
    indexFromPos: pos => text.split('\n').slice(0, pos.line).reduce((n, line) => n + line.length + 1, 0) + pos.ch,
    posFromIndex: index => { const lines = text.slice(0, index).split('\n'); return { line: lines.length - 1, ch: lines.at(-1).length }; },
    replaceRange(value, from, to) {
      const start = this.indexFromPos(from), end = this.indexFromPos(to);
      text = text.slice(0, start) + value + text.slice(end);
      // Model CodeMirror's potential view adjustment during a remote edit.
      if (activePath === 'Main.java') scroll = { left: 0, top: 0 };
    },
    setSelections(ranges, index, options) {
      selectionCalls++; selections = structuredClone(ranges); primary = index || 0;
      selectionOptions.push(options);
      if (!options || options.scroll !== false) scroll = { left: 0, top: 0 };
    },
    on() {}, setBookmark: (pos, options) => { remoteWidget = options.widget; return { clear() {} }; }, markText: (from, to) => { remoteRange = [from, to]; return { clear() {} }; }
  };
  const cm = {
    state: {}, setOption() {},
    getScrollInfo: () => ({ ...scroll }), scrollTo: (left, top) => { scroll = { left, top }; },
    operation: fn => fn(), listSelections: doc.listSelections, indexFromPos: doc.indexFromPos,
    scrollIntoView: (pos, margin) => { followScrolls.push({ pos, margin }); scroll = { left: 0, top: pos.line * 20 }; }
  };
  const bridge = {
    editor: () => cm, current: () => ({ path: activePath, doc: activePath === 'Main.java' ? doc : {} }),
    flush: async () => {}, prepareHost: async () => {}, updated: () => updates++, open: () => {}, notice() {}
  };
  const storage = new Map();
  const context = vm.createContext({
    console, crypto: webcrypto, structuredClone,
    CodeMirror: { commands: { undo() {}, redo() {} } },
    window: { LarkEditorShare: bridge, LarkBirds: { make: (id) => ({ bird: id }) }, addEventListener() {} },
    document: { dispatchEvent() {}, getElementById: () => null, createElement: () => ({ style: {}, children: [], append(...nodes) { this.children.push(...nodes); } }), createTextNode: text => ({ text }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    localStorage: { setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    setInterval: fn => { tick = fn; return 1; }, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    fetch: async (_, options) => {
      const body = JSON.parse(options.body);
      let data;
      if (body.action === 'files') data = { files: [{ path: 'Main.java' }] };
      else if (body.action === 'open') data = { seed, actor: 'local', role: 'editor', revision: 0, head: 0, operations: [] };
      else if (body.action === 'sync') {
        if (syncHook) { const hook = syncHook; syncHook = null; await hook(); }
        data = nextResponse || { operations: [], revision: 0, role: 'editor', participants: [] };
        nextResponse = null;
      } else if (body.action === 'presence') data = { participants: [] };
      else throw new Error('Unexpected request: ' + body.action);
      return { ok: true, json: async () => ({ ok: true, ...data }) };
    }
  });
  const root = path.resolve(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'web/js/share-document.js'), 'utf8'), context);
  context.LarkShareDocument = context.window.LarkShareDocument;
  vm.runInContext(fs.readFileSync(path.join(root, 'web/js/share-editor.js'), 'utf8'), context);
  const share = context.window.LarkShareEditing;
  await share.start({ id: 'test', identity: 'host', hosting: true, project: 'test' });

  for (let i = 0; i < 8; i++) await tick();
  assert.deepEqual(scroll, { left: 150, top: 2400 }, 'idle polls preserve horizontal and vertical scroll with caret offscreen');
  assert.equal(selectionCalls, 0, 'idle polls never reset selections');
  assert.equal(updates, 0, 'idle polls do not redraw the file tabs');

  syncHook = () => new Promise(resolve => { inFlight = resolve; });
  const delayed = tick();
  selections = [{ anchor: { line: 120, ch: 2 }, head: { line: 120, ch: 4 } }];
  scroll = { left: 230, top: 3100 };
  inFlight(); await delayed;
  assert.equal(selections[0].head.line, 120, 'cursor moves during the request survive an unchanged response');
  assert.deepEqual(scroll, { left: 230, top: 3100 }, 'scrolling during an in-flight request is preserved');

  const entry = share.debug().documents.get('Main.java');
  const remote = new context.LarkShareDocument(entry.model.seed);
  const operations = remote.edit(0, 0, '// remote edit\n', 'peer');
  selections = [
    { anchor: { line: 20, ch: 1 }, head: { line: 20, ch: 2 } },
    { anchor: { line: 120, ch: 2 }, head: { line: 120, ch: 4 } }
  ]; primary = 1;
  nextResponse = { operations, revision: operations.length, role: 'editor', participants: [] };
  await tick();
  assert(text.startsWith('// remote edit\n'), 'remote editing is still applied');
  assert.deepEqual(scroll, { left: 230, top: 3100 }, 'remote edits do not yank the viewport to the caret');
  assert.equal(selections[1].head.line, 121, 'cursor anchors move with remotely inserted source');
  assert.equal(primary, 1, 'primary selection is retained');
  assert.equal(selectionOptions.at(-1).scroll, false, 'remote selection restoration disables CodeMirror auto-scroll');

  syncHook = () => new Promise(resolve => { inFlight = resolve; });
  nextResponse = { operations: remote.edit(0, 0, '// later\n', 'peer'), revision: 2, role: 'editor', participants: [] };
  const later = tick();
  selections = [{ anchor: { line: 180, ch: 1 }, head: { line: 180, ch: 3 } }]; primary = 0;
  scroll = { left: 300, top: 4000 };
  inFlight(); await later;
  assert.equal(selections[0].head.line, 181, 'remote response preserves the latest cursor, not the cursor before the request');
  assert.deepEqual(scroll, { left: 300, top: 4000 });

  syncHook = () => new Promise(resolve => { inFlight = resolve; });
  nextResponse = { operations: remote.edit(0, 0, '// background\n', 'peer'), revision: 3, role: 'editor', participants: [] };
  const background = tick(); activePath = 'Other.java'; scroll = { left: 77, top: 888 };
  inFlight(); await background;
  assert.deepEqual(scroll, { left: 77, top: 888 }, 'background synchronization never changes the newly selected file viewport');

  activePath = 'Main.java'; share.follow('peer');
  nextResponse = { operations: [], revision: 3, role: 'editor', participants: [{ id: 'peer', file: 'Main.java', head: entry.model.anchor(200), connected: false }] };
  await tick(); assert.equal(followScrolls.length, 1, 'explicit Follow still scrolls to the participant');
  share.follow(null); scroll = { left: 100, top: 2200 }; await tick();
  assert.equal(followScrolls.length, 1, 'Stop following restores independent navigation');
  assert.deepEqual(scroll, { left: 100, top: 2200 });
  nextResponse = { operations: [], revision: 3, role: 'viewer', participants: [] };
  await tick();
  assert.deepEqual(scroll, { left: 100, top: 2200 }, 'viewers can scroll independently too');
  nextResponse = { operations: [], revision: 3, role: 'editor', participants: [{ id: 'peer', name: 'Remote', bird: 'cardinal', color: '#d94141', file: 'Main.java', anchor: entry.model.anchor(35), head: entry.model.anchor(5), connected: true }] };
  await tick();
  assert(remoteRange, 'a backward remote selection is rendered');
  assert(doc.indexFromPos(remoteRange[0]) < doc.indexFromPos(remoteRange[1]), 'remote selection endpoints are ordered');
  assert.equal(remoteWidget.children[0].children[0].bird, 'cardinal', 'remote cursor uses the participant bird');
  console.log('Share scroll regression checks passed: idle polling, in-flight navigation, remote edits, multiple selections, background files, and Follow.');
})().catch(error => { console.error(error); process.exitCode = 1; });
