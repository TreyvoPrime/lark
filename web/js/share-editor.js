/* Shared documents keep their own operation history, independent of file navigation. */
(() => {
  'use strict';
  const writer = crypto.randomUUID().replace(/-/g, '');
  const documents = new Map(), opening = new Map();
  let session = null, timer = null, working = false, following = null, presence = [], lastPresence = 0;
  const marks = [];
  const request = async (action, body = {}) => {
    const response = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lark': '1' }, body: JSON.stringify({ action, writer, ...body }) });
    const data = await response.json(); if (!response.ok || !data.ok) { const error = new Error(data.error || 'Share request failed'); error.code = response.status; throw error; } return data;
  };
  const recoveryKey = path => `lark-share-recovery:${session?.id}:${path}`;
  const recover = entry => {
    try { localStorage.setItem(recoveryKey(entry.path), JSON.stringify({ session: session.id, path: entry.path, seed: entry.model.seed, pending: entry.pending, text: entry.model.text(), writer, revision: entry.revision, at: Date.now() })); }
    catch (_) { window.LarkEditorShare?.notice('Share recovery storage is full. Export local recovery text before closing.'); }
  };
  function status(text) { document.dispatchEvent(new CustomEvent('lark-share-state', { detail: text })); }
  function paint(entry) {
    const doc = entry.doc, text = entry.model.text(), old = doc.getValue();
    if (old === text) return false;
    let prefix = 0, suffix = 0;
    while (prefix < old.length && prefix < text.length && old[prefix] === text[prefix]) prefix++;
    while (suffix < old.length - prefix && suffix < text.length - prefix && old[old.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
    entry.remote = true;
    try { doc.replaceRange(text.slice(prefix, text.length - suffix), doc.posFromIndex(prefix), doc.posFromIndex(old.length - suffix), '+share'); }
    finally { entry.remote = false; }
    // Cursor anchors captured before remote application are restored by pull(), below.
    window.LarkEditorShare?.updated(entry.path, text);
    return true;
  }
  function offset(text, pos) { const lines = text.split('\n'); let result = 0; for (let i = 0; i < pos.line; i++) result += (lines[i]?.length || 0) + 1; return result + pos.ch; }
  function enqueue(entry, operations) { entry.pending.push(...operations); clearTimeout(entry.recoveryTimer); entry.recoveryTimer = setTimeout(() => { if (entry.pending.length) recover(entry); }, 350); status('Synchronizing'); }
  function bind(entry) {
    entry.doc.on('change', (_, change) => {
      if (entry.remote || !session || documents.get(entry.path) !== entry) return;
      const before = entry.model.text(), start = offset(before, change.from), end = offset(before, change.to), text = change.text.join('\n');
      const anchor = entry.model.anchor(start), removed = before.slice(start, end);
      const ops = entry.model.edit(start, end - start, text, entry.actor);
      if (!entry.historyAction) { entry.undo.push({ anchor, removed, inserted: ops.flatMap(op => Array.from({ length: op.text.length }, (_, i) => `${op.seq + i}@${op.actor}`)) }); entry.redo = []; }
      enqueue(entry, ops);
    });
  }
  function open(path, doc) {
    if (opening.has(path)) return opening.get(path);
    const promise = doOpen(path, doc).finally(() => opening.delete(path)); opening.set(path, promise); return promise;
  }
  async function doOpen(path, doc) {
    if (!session || !session.paths.has(path)) return false;
    let entry = documents.get(path);
    if (!entry) {
      status('Synchronizing');
      const data = await request('open', { path, since: 0 });
      entry = { path, model: new LarkShareDocument(data.seed), actor: data.actor, role: data.role, revision: data.revision, pending: [], undo: [], redo: [], doc, remote: true };
      data.operations.forEach(op => entry.model.apply(op)); documents.set(path, entry);
      while (entry.revision < data.head) { const page = await request('sync', { path, since: entry.revision }); page.operations.forEach(op => entry.model.apply(op)); entry.revision = page.revision; }
      entry.remote = false; paint(entry); bind(entry);
    } else if (entry.doc !== doc) throw new Error('Shared document identity changed. Reopen the shared project.');
    const cm = window.LarkEditorShare?.editor();
    if (cm && window.LarkEditorShare?.current().doc === entry.doc) {
      cm.setOption('readOnly', entry.role === 'viewer');
      cm.state.larkShare = entry;
    }
    return true;
  }
  async function pull(entry) {
    const operation = entry.pending[0];
    const data = await request('sync', { path: entry.path, since: entry.revision, ...(operation ? { operation } : {}) });
    // Read the user's current view AFTER the request: they may have scrolled,
    // moved the caret, switched files, or typed while waiting for the network.
    const ranges = entry.doc.listSelections(), primaryHead = entry.doc.getCursor('head'), primaryAnchor = entry.doc.getCursor('anchor');
    const primary = Math.max(0, ranges.findIndex(s => s.head.line === primaryHead.line && s.head.ch === primaryHead.ch && s.anchor.line === primaryAnchor.line && s.anchor.ch === primaryAnchor.ch));
    const selections = ranges.map(s => ({ anchor: entry.model.anchor(entry.doc.indexFromPos(s.anchor)), head: entry.model.anchor(entry.doc.indexFromPos(s.head)) }));
    const cm = window.LarkEditorShare?.editor();
    const viewport = cm && window.LarkEditorShare?.current()?.doc === entry.doc ? cm.getScrollInfo() : null;
    if (operation) entry.pending.shift();
    data.operations.forEach(op => entry.model.apply(op)); entry.revision = data.revision; entry.role = data.role;
    presence = data.participants;
    let changed = false;
    const apply = () => {
      changed = paint(entry);
      // An idle poll must not reset selections or scroll the caret into view.
      if (!changed) return;
      entry.doc.setSelections(selections.map(s => ({ anchor: entry.doc.posFromIndex(entry.model.index(s.anchor)), head: entry.doc.posFromIndex(entry.model.index(s.head)) })), primary, { scroll: false });
      if (viewport) cm.scrollTo(viewport.left, viewport.top);
    };
    if (viewport) cm.operation(apply); else apply();
    if (entry.pending.length) { clearTimeout(entry.recoveryTimer); entry.recoveryTimer = setTimeout(() => { if (entry.pending.length) recover(entry); }, 350); } else { clearTimeout(entry.recoveryTimer); if (operation && !changed) window.LarkEditorShare?.updated(entry.path, entry.model.text()); try { localStorage.removeItem(recoveryKey(entry.path)); } catch (_) {} }
  }
  async function tick() {
    if (!session || working) return; working = true;
    try {
      for (const entry of documents.values()) {
        if (entry.pending.length || entry.path === window.LarkEditorShare?.current()?.path || Date.now() - (entry.lastPoll || 0) > 5000) {
          await pull(entry); entry.lastPoll = Date.now();
        }
      }
      const current = window.LarkEditorShare?.current(), entry = documents.get(current?.path);
      if (entry && Date.now() - lastPresence > 700) {
        const cm = window.LarkEditorShare.editor(), selection = cm.listSelections()[0];
        const data = await request('presence', { path: entry.path, since: entry.revision, anchor: entry.model.anchor(cm.indexFromPos(selection.anchor)), head: entry.model.anchor(cm.indexFromPos(selection.head)) });
        presence = data.participants; lastPresence = Date.now();
      }
      status([...documents.values()].some(e => e.pending.length) ? 'Synchronizing' : 'Connected');
      drawPresence();
    } catch (error) { for (const entry of documents.values()) if (entry.pending.length) recover(entry); status(error.code === 403 || error.code === 410 ? 'Connection Lost' : 'Reconnecting'); document.dispatchEvent(new CustomEvent('lark-share-error', { detail: error.message })); }
    finally { working = false; }
  }
  function drawPresence() {
    marks.splice(0).forEach(mark => mark.clear());
    const current = window.LarkEditorShare?.current(), entry = documents.get(current?.path), cm = window.LarkEditorShare?.editor();
    if (!entry || !cm) return;
    cm.setOption('readOnly', entry.role === 'viewer');
    cm.state.larkShare = entry;
    presence.filter(p => p.file === entry.path && p.id !== session.identity && p.connected).forEach((person, i) => {
      const color = /^#[a-f0-9]{6}$/i.test(person.color) ? person.color : '#6495ed';
      const head = entry.doc.posFromIndex(entry.model.index(person.head)), anchor = entry.doc.posFromIndex(entry.model.index(person.anchor));
      const label = document.createElement('span'); label.className = 'share-cursor'; label.style.borderColor = color; label.style.color = color; label.textContent = person.name;
      marks.push(entry.doc.setBookmark(head, { widget: label, insertLeft: true }));
      if (person.anchor !== person.head) marks.push(entry.doc.markText(anchor, head, { css: `background: ${color}30` }));
    });
    document.dispatchEvent(new CustomEvent('lark-share-presence', { detail: presence }));
    const person = presence.find(p => p.id === following);
    if (person?.file && session.paths.has(person.file)) {
      if (current.path !== person.file) window.LarkEditorShare.open(person.file);
      const target = documents.get(person.file); if (target) cm.scrollIntoView(target.doc.posFromIndex(target.model.index(person.head)), 80);
    }
  }
  function hash(s) { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n; }
  function undo(entry, redo) {
    const source = redo ? entry.redo : entry.undo, target = redo ? entry.undo : entry.redo, record = source.pop(); if (!record) return;
    const removedIds = record.inserted.filter(id => entry.model.nodes.has(id) && !entry.model.nodes.get(id).deleted);
    const operations = [], removedText = removedIds.map(id => entry.model.nodes.get(id).value).join('');
    for (let i = 0; i < removedIds.length; i += 128) { const op = { seq: ++entry.model.clock, actor: entry.actor, after: record.anchor, text: '', remove: removedIds.slice(i, i + 128) }; entry.model.apply(op); operations.push(op); }
    const inserted = entry.model.edit(entry.model.index(record.anchor), 0, record.removed, entry.actor); operations.push(...inserted);
    target.push({ anchor: record.anchor, removed: removedText, inserted: inserted.flatMap(op => Array.from({ length: op.text.length }, (_, i) => `${op.seq + i}@${op.actor}`)) });
    paint(entry); enqueue(entry, operations);
  }
  const originalUndo = CodeMirror.commands.undo, originalRedo = CodeMirror.commands.redo;
  CodeMirror.commands.undo = cm => cm.state.larkShare ? (!cm.getOption('readOnly') && undo(cm.state.larkShare, false)) : originalUndo(cm);
  CodeMirror.commands.redo = cm => cm.state.larkShare ? (!cm.getOption('readOnly') && undo(cm.state.larkShare, true)) : originalRedo(cm);
  window.LarkShareEditing = {
    async start(data) {
      if (session) return;
      await window.LarkEditorShare.flush();
      const files = await request('files');
      session = { id: data.id, identity: data.identity, paths: new Set(files.files.map(f => f.path)), hosting: data.hosting, project: data.project };
      if (!data.hosting) await window.LarkEditorShare.guest(data.name, files.files);
      else await window.LarkEditorShare.prepareHost(data.project);
      if (document.getElementById('split-editor')) document.getElementById('split-editor').disabled = true;
      timer = setInterval(tick, 250);
      const current = window.LarkEditorShare.current(); if (current?.path) await open(current.path, current.doc);
      status('Connected');
    },
    updateRole(role) {
      if (!session || session.hosting) return;
      for (const entry of documents.values()) entry.role = role;
      const cm = window.LarkEditorShare?.editor(); if (cm) cm.setOption('readOnly', role !== 'editor');
    },
    sessionActive: () => !!session,
    active: path => !!session?.paths.has(path), hosting: () => session?.hosting, project: () => session?.project, open,
    changed: path => { if (session?.paths.has(path)) return true; return false; },
    async stop() { clearInterval(timer); timer = null; for (const entry of documents.values()) if (entry.pending.length) recover(entry); documents.clear(); opening.clear(); if (document.getElementById('split-editor')) document.getElementById('split-editor').disabled = false; marks.splice(0).forEach(m => m.clear()); session = null; following = null; document.dispatchEvent(new CustomEvent('lark-share-presence', { detail: [] })); document.dispatchEvent(new CustomEvent('lark-share-follow', { detail: false })); const cm = window.LarkEditorShare?.editor(); if (cm) { cm.state.larkShare = null; cm.setOption('readOnly', false); } await window.LarkEditorShare?.leave(); },
    follow: id => { following = id; document.dispatchEvent(new CustomEvent('lark-share-follow', { detail: !!id })); },
    position(person) { const entry = documents.get(person.file); if (!entry) return ''; const pos = entry.doc.posFromIndex(entry.model.index(person.head)); return `Ln ${pos.line + 1}, Col ${pos.ch + 1}`; },
    async flush() {
      const end = Date.now() + 8000;
      while ([...documents.values()].some(entry => entry.pending.length)) {
        if (Date.now() > end) throw new Error('Shared changes are not synchronized. Export recovery and reconnect before running.');
        await tick(); await new Promise(resolve => setTimeout(resolve, 60));
      }
    },
    exportRecovery() { const text = [...documents.values()].map(e => `// ${e.path}\n${e.model.text()}`).join('\n\n'); const blob = new Blob([text], { type: 'text/plain' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'lark-share-recovery.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); },
    recoveries() {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i); if (!key.startsWith('lark-share-recovery:')) continue;
        try { const data = JSON.parse(localStorage.getItem(key)); if (typeof data.text === 'string') out.push({ ...data, key }); } catch (_) {}
      }
      return out;
    },
    mergeRecovery(key, text) {
      const saved = JSON.parse(localStorage.getItem(key)), current = window.LarkEditorShare.current();
      if (!session || !saved || current.path !== saved.path || !documents.has(saved.path)) throw new Error('Open the corresponding shared file before merging recovery.');
      if (documents.get(saved.path).role === 'viewer') throw new Error('A Viewer cannot merge source. Export the draft for an Editor.');
      current.doc.setValue(text); localStorage.removeItem(key);
    },
    pending: () => [...documents.values()].some(e => e.pending.length),
    debug: () => ({ session, documents })
  };
  window.addEventListener('beforeunload', event => { if (window.LarkShareEditing.pending()) { for (const entry of documents.values()) recover(entry); event.preventDefault(); event.returnValue = ''; } });
})();
