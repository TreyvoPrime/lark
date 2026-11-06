/* Exercise the real Share polling code with a CodeMirror document/view double. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

(async () => {
  const seed = Array.from({ length: 400 }, (_, i) => `// line ${i}`).join('\n');
  let text = seed, selectionCalls = 0, updates = 0, tick, activePath = 'Main.java', inFlight, immediatePolls = 0, now = Date.now(), retryVisible = false, syncCount = 0;
  let selections = [{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } }], primary = 0;
  let scroll = { left: 150, top: 2400 }, nextResponse, syncHook, remoteRange, remoteWidget;
  const gutterWidgets = new Map(), listeners = {}, options = { gutters: ['CodeMirror-linenumbers'] };
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
    on() {}, setBookmark: (pos, options) => { remoteWidget = options.widget; return { clear() {} }; }, markText: (from, to) => { remoteRange = [from, to]; return { clear() {} }; },
    clearGutter: () => gutterWidgets.clear(), setGutterMarker: (line, _, marker) => gutterWidgets.set(line, marker)
  };
  const cm = {
    state: {}, setOption: (name, value) => { options[name] = value; }, getOption: name => options[name],
    getWrapperElement: () => ({ addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: name => { delete listeners[name]; } }),
    getScrollInfo: () => ({ ...scroll }), scrollTo: (left, top) => { scroll = { left, top }; },
    operation: fn => fn(), listSelections: doc.listSelections, indexFromPos: doc.indexFromPos,
    scrollIntoView: (pos, margin) => { followScrolls.push({ pos, margin }); scroll = { left: 0, top: pos.line * 20 }; }
  };
  const bridge = {
    editor: () => cm, current: () => ({ path: activePath, doc: activePath === 'Main.java' ? doc : {} }),
    flush: async () => {}, prepareHost: async () => {}, leave: async () => {}, updated: () => updates++, open: () => {}, notice() {}
  };
  const storage = new Map();
  const context = vm.createContext({
    console, crypto: webcrypto, structuredClone, Date: class extends Date { static now() { return now; } },
    CodeMirror: { commands: { undo() {}, redo() {} } },
    window: { LarkEditorShare: bridge, LarkBirds: { make: (id) => ({ bird: id }) }, addEventListener() {} },
    document: { dispatchEvent(event) { if (event.type === 'lark-share-retry') retryVisible = event.detail; }, getElementById: () => null, createElement: () => ({ style: {}, children: [], setAttribute() {}, append(...nodes) { this.children.push(...nodes); } }), createTextNode: text => ({ text }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    localStorage: { setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    setInterval: fn => { tick = fn; return 1; }, clearInterval() {}, setTimeout: (_, delay) => { if (delay === 16) immediatePolls++; return 1; }, clearTimeout() {},
    fetch: async (_, options) => {
      const body = JSON.parse(options.body);
      let data;
      if (body.action === 'files') data = { files: [{ path: 'Main.java' }] };
      else if (body.action === 'open') data = { seed, actor: 'local', role: 'editor', revision: 0, head: 0, operations: [] };
      else if (body.action === 'sync') {
        syncCount++;
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
  // A malformed response must not discard edits that were sent in the request.
  // The host may already have accepted them, so the next request retries the same IDs.
  const local = entry.model.edit(0, 0, 'local', entry.actor);
  entry.pending.push(...local);
  nextResponse = { operations: [{ seq: 1, actor: 'bad', after: 'missing', text: 'x', remove: [] }], revision: 1, role: 'editor', participants: [] };
  await tick();
  assert.equal(entry.pending.length, local.length, 'unapplied response retains pending edits');
  assert.equal(entry.revision, 0, 'unapplied response does not advance the revision');
  nextResponse = { operations: local, revision: local.length, role: 'editor', participants: [] };
  await tick();
  assert.equal(entry.pending.length, 0, 'successful retry acknowledges the same edits');
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
  nextResponse = { operations: [], revision: 3, role: 'editor', participants: [{ id: 'peer', name: 'Remote', file: 'Main.java', head: entry.model.anchor(200), connected: true }] };
  await tick(); assert.equal(followScrolls.length, 1, 'explicit Follow still scrolls to the participant');
  nextResponse = { operations: [], revision: 3, role: 'editor', participants: [{ id: 'peer', name: 'Remote', file: 'Main.java', head: entry.model.anchor(200), connected: true }] };
  await tick(); assert.equal(followScrolls.length, 1, 'unchanged presence does not repeatedly scroll');
  listeners.wheel({ type: 'wheel' });
  nextResponse = { operations: [], revision: 3, role: 'editor', participants: [{ id: 'peer', name: 'Remote', file: 'Main.java', head: entry.model.anchor(210), connected: true }] };
  await tick(); assert.equal(followScrolls.length, 1, 'manual scrolling cancels Follow');
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
  assert.equal(remoteWidget.className, 'share-cursor', 'remote caret remains at the editing position without an overlaid badge');
  assert.equal([...gutterWidgets.values()][0].textContent, 'Remote', 'participant name is in the gutter');
  nextResponse = { operations: [], revision: 3, role: 'editor', participants: [
    { id: 'peer', name: 'Remote', color: '#d94141', file: 'Main.java', anchor: entry.model.anchor(5), head: entry.model.anchor(5), connected: true },
    { id: 'peer2', name: 'Second', color: '#2775c9', file: 'Main.java', anchor: entry.model.anchor(6), head: entry.model.anchor(6), connected: true }
  ] };
  await tick();
  assert.equal([...gutterWidgets.values()][0].textContent, 'Remote +1', 'participants on one line share one gutter marker');
  assert.equal([...gutterWidgets.values()][0].title, 'Remote, Second', 'grouped names remain accessible');
  nextResponse = { operations: remote.edit(0, 0, '// more\n', 'peer'), revision: 4, head: 5, role: 'editor', participants: [] };
  await tick();
  assert.equal(immediatePolls, 1, 'unread history schedules the next page immediately');
  for (let i = 0; i < 8; i++) { syncHook = () => { throw new Error('offline'); }; await tick(); now += 60_000; }
  assert.equal(retryVisible, true, 'repeated network failures offer a manual retry');
  const stoppedCount = syncCount;
  await tick();
  assert.equal(syncCount, stoppedCount, 'automatic retries stop after the limit');
  share.retry();
  assert.equal(retryVisible, false, 'retry clears the retry prompt');
  await tick();
  assert.equal(syncCount, stoppedCount + 1, 'manual retry resumes synchronization');
  syncHook = () => new Promise(resolve => { inFlight = resolve; });
  nextResponse = { operations: remote.edit(0, 0, '// stale\n', 'peer'), revision: 5, head: 5, role: 'editor', participants: [] };
  const stale = tick();
  const beforeStop = text;
  await share.stop();
  inFlight(); await stale;
  assert.equal(text, beforeStop, 'a response arriving after leaving cannot paint an old document');
  assert.equal(share.debug().documents.size, 0, 'a response arriving after leaving cannot restore old documents');
  console.log('Share scroll regression checks passed: idle polling, in-flight navigation, remote edits, multiple selections, background files, and Follow.');
})().catch(error => { console.error(error); process.exitCode = 1; });
