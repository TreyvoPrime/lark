/* Shared documents keep their own operation history, independent of file navigation. */
(() => {
  'use strict';
  const writer = crypto.randomUUID().replace(/-/g, '');
  const documents = new Map(), opening = new Map();
  let session = null, timer = null, working = false, following = null, presence = [], lastPresence = 0;
  let connectionFailures = 0, retryAfter = 0, retryPaused = false;
  const marks = [];
  let presenceKey = '', gutterDoc = null, followViewKey = '', followOpening = null, followInput = null;
  const gutterName = 'lark-share-gutter';
  const request = async (action, body = {}) => {
    let response;
    try { response = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lark': '1' }, body: JSON.stringify({ action, writer, ...body }) }); }
    catch (error) { error.network = true; throw error; }
    const data = await response.json(); if (!response.ok || !data.ok) { const error = new Error(data.error || 'Share request failed'); error.code = response.status; error.network = response.status >= 500; throw error; } return data;
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
  function enqueue(entry, operations) { entry.pending.push(...operations); clearTimeout(entry.recoveryTimer); entry.recoveryTimer = setTimeout(() => { if (entry.pending.length) recover(entry); }, 350); status('Synchronizing'); soon(); }
  // Local edits go out on the next frame-ish tick rather than waiting for the poll interval.
  let soonTimer = null;
  function soon() { if (!soonTimer) soonTimer = setTimeout(() => { soonTimer = null; tick(); }, 16); }
  function bind(entry) {
    entry.doc.on('change', (_, change) => {
      // CodeMirror defers doc "change" events to the end of an outer operation, so the
      // entry.remote flag alone is not enough: remote/undo paints are tagged '+share'.
      if (entry.remote || change.origin === '+share' || !session || documents.get(entry.path) !== entry) return;
      const before = entry.model.text(), start = offset(before, change.from), end = offset(before, change.to), text = change.text.join('\n');
      const anchor = entry.model.anchor(start), removed = before.slice(start, end);
      const ops = entry.model.edit(start, end - start, text, entry.actor);
      if (!entry.historyAction) { entry.undo.push({ anchor, removed, inserted: ops.flatMap(op => Array.from({ length: op.text.length }, (_, i) => `${op.seq + i}@${op.actor}`)) }); entry.redo = []; }
      enqueue(entry, ops);
    });
  }
  function open(path, doc) {
    if (opening.has(path)) return opening.get(path);
    const promise = doOpen(path, doc).finally(() => { if (opening.get(path) === promise) opening.delete(path); }); opening.set(path, promise); return promise;
  }
  async function doOpen(path, doc) {
    if (!session || !session.paths.has(path)) return false;
    const active = session;
    let entry = documents.get(path);
    if (!entry) {
      status('Synchronizing');
      const data = await request('open', { path, since: 0 });
      if (session !== active) return false;
      entry = { path, model: new LarkShareDocument(data.seed), actor: data.actor, role: data.role, revision: data.revision, pending: [], undo: [], redo: [], doc, remote: true };
      data.operations.forEach(op => entry.model.apply(op)); documents.set(path, entry);
      while (entry.revision < data.head) { const page = await request('sync', { path, since: entry.revision }); if (session !== active) return false; page.operations.forEach(op => entry.model.apply(op)); entry.revision = page.revision; }
      entry.remote = false; paint(entry); bind(entry);
    } else if (entry.doc !== doc) throw new Error('Shared document identity changed. Reopen the shared project.');
    const cm = window.LarkEditorShare?.editor();
    if (cm && window.LarkEditorShare?.current().doc === entry.doc) {
      cm.setOption('readOnly', entry.role === 'viewer');
      cm.state.larkShare = entry;
    }
    return true;
  }
  async function pull(entry, active) {
    const operation = entry.pending[0];
    // Send up to 32 queued operations per round trip; hosts without batching only take the first.
    const batch = operation ? entry.pending.slice(1, 32) : [];
    const data = await request('sync', { path: entry.path, since: entry.revision, ...(operation ? { operation } : {}), ...(batch.length ? { operations: batch } : {}) });
    if (session !== active) return false;
    if (Number.isSafeInteger(data.head) && data.head > data.revision && (!Array.isArray(data.operations) || !data.operations.length))
      throw new Error('Share synchronization made no progress. Reconnect or export recovery.');
    // Read the user's current view AFTER the request: they may have scrolled,
    // moved the caret, switched files, or typed while waiting for the network.
    const ranges = entry.doc.listSelections(), primaryHead = entry.doc.getCursor('head'), primaryAnchor = entry.doc.getCursor('anchor');
    const primary = Math.max(0, ranges.findIndex(s => s.head.line === primaryHead.line && s.head.ch === primaryHead.ch && s.anchor.line === primaryAnchor.line && s.anchor.ch === primaryAnchor.ch));
    const selections = ranges.map(s => ({ anchor: entry.model.anchor(entry.doc.indexFromPos(s.anchor)), head: entry.model.anchor(entry.doc.indexFromPos(s.head)) }));
    const cm = window.LarkEditorShare?.editor();
    const viewport = cm && window.LarkEditorShare?.current()?.doc === entry.doc ? cm.getScrollInfo() : null;
    // Our own operation comes back in the page; the model already applied it locally and
    // LarkShareDocument.apply() ignores known operation ids, so apply every operation.
    data.operations.forEach(op => entry.model.apply(op));
    entry.revision = data.revision;
    // Keep acknowledged edits recoverable if an invalid or incomplete response cannot be applied.
    // Retrying them is safe because the host deduplicates operation identities.
    if (operation) entry.pending.splice(0, 1 + Math.min(batch.length, Number(data.accepted) || 0));
    entry.role = data.role;
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
    return entry.pending.length > 0 || (Number.isSafeInteger(data.head) && entry.revision < data.head);
  }
  async function tick() {
    if (!session || working || retryPaused || Date.now() < retryAfter) return; working = true;
    const active = session;
    let more = false, succeeded = false;
    try {
      for (const entry of documents.values()) {
        if (entry.pending.length || entry.path === window.LarkEditorShare?.current()?.path || Date.now() - (entry.lastPoll || 0) > 5000) {
          more = await pull(entry, active) || more; if (session !== active) return; entry.lastPoll = Date.now();
        }
      }
      const current = window.LarkEditorShare?.current(), entry = documents.get(current?.path);
      if (entry && Date.now() - lastPresence > 700) {
        const cm = window.LarkEditorShare.editor(), selection = cm.listSelections()[0];
        const data = await request('presence', { path: entry.path, since: entry.revision, anchor: entry.model.anchor(cm.indexFromPos(selection.anchor)), head: entry.model.anchor(cm.indexFromPos(selection.head)) });
        if (session !== active) return;
        presence = data.participants; lastPresence = Date.now();
      }
      status([...documents.values()].some(e => e.pending.length) ? 'Synchronizing' : 'Connected');
      drawPresence();
      connectionFailures = 0; retryAfter = 0;
      succeeded = true;
    } catch (error) {
      if (session !== active) return;
      for (const entry of documents.values()) if (entry.pending.length) recover(entry);
      if (error.network) {
        connectionFailures++;
        retryPaused = connectionFailures >= 8;
        retryAfter = Date.now() + Math.min(8000, 250 * 2 ** Math.min(connectionFailures - 1, 5));
      }
      status(retryPaused || error.code === 403 || error.code === 410 ? 'Connection Lost' : 'Reconnecting');
      document.dispatchEvent(new CustomEvent('lark-share-error', { detail: retryPaused ? 'Connection lost. Retry when the network is available.' : error.message }));
      document.dispatchEvent(new CustomEvent('lark-share-retry', { detail: retryPaused }));
    }
    finally { working = false; if (succeeded && more && session) soon(); }
  }
  function drawPresence() {
    const current = window.LarkEditorShare?.current(), entry = documents.get(current?.path), cm = window.LarkEditorShare?.editor();
    if (!entry || !cm) return;
    cm.setOption('readOnly', entry.role === 'viewer');
    cm.state.larkShare = entry;
    const showPositions = localStorage.getItem?.('lark-share-show-positions') !== 'false';
    const key = JSON.stringify([entry.path, entry.model.clock, presence, showPositions]);
    if (key !== presenceKey || gutterDoc !== entry.doc) {
      marks.splice(0).forEach(mark => mark.clear());
      if (gutterDoc) gutterDoc.clearGutter(gutterName);
      gutterDoc = entry.doc; presenceKey = key;
      const gutters = cm.getOption('gutters') || [];
      const peopleHere = (showPositions ? presence : []).filter(p => p.file === entry.path && p.id !== session.identity && p.connected);
      if (peopleHere.length && !gutters.includes(gutterName)) cm.setOption('gutters', [...gutters, gutterName]);
      else if (!peopleHere.length && gutters.includes(gutterName)) cm.setOption('gutters', gutters.filter(g => g !== gutterName));
      const lines = new Map();
      peopleHere.forEach(person => {
        const color = /^#[a-f0-9]{6}$/i.test(person.color) ? person.color : '#6495ed';
        const headIndex = entry.model.index(person.head), anchorIndex = entry.model.index(person.anchor);
        const head = entry.doc.posFromIndex(headIndex);
        const cursor = document.createElement('span'); cursor.className = 'share-cursor'; cursor.style.borderColor = color;
        cursor.setAttribute('aria-label', person.name + ' cursor');
        marks.push(entry.doc.setBookmark(head, { widget: cursor, insertLeft: true }));
        if (!lines.has(head.line)) lines.set(head.line, []);
        lines.get(head.line).push({ name: person.name, color });
        if (anchorIndex !== headIndex) {
          const from = entry.doc.posFromIndex(Math.min(anchorIndex, headIndex)), to = entry.doc.posFromIndex(Math.max(anchorIndex, headIndex));
          marks.push(entry.doc.markText(from, to, { css: `background: ${color}30` }));
        }
      });
      lines.forEach((people, line) => {
        const label = document.createElement('span'); label.className = 'share-gutter-label';
        label.style.borderColor = people[0].color;
        label.textContent = people[0].name + (people.length > 1 ? ' +' + (people.length - 1) : '');
        label.title = people.map(p => p.name).join(', ');
        entry.doc.setGutterMarker(line, gutterName, label);
      });
      document.dispatchEvent(new CustomEvent('lark-share-presence', { detail: presence }));
    }
    const person = presence.find(p => p.id === following);
    if (person?.connected && person.file && session.paths.has(person.file)) {
      if (current.path !== person.file) {
        if (followOpening !== person.file) {
          const path = person.file; followOpening = path;
          Promise.resolve(window.LarkEditorShare.open(path)).catch(error => { document.dispatchEvent(new CustomEvent('lark-share-error', { detail: error.message })); }).finally(() => { if (followOpening === path) followOpening = null; });
        }
      } else {
        const target = documents.get(person.file), next = target && JSON.stringify([person.id, person.file, person.head, target.model.clock]);
        if (target && next !== followViewKey) { followViewKey = next; cm.scrollIntoView(target.doc.posFromIndex(target.model.index(person.head)), 80); }
      }
    }
  }
  function setFollowing(id, name) {
    following = id; followViewKey = ''; followOpening = null;
    document.dispatchEvent(new CustomEvent('lark-share-follow', { detail: id ? { id, name: name || presence.find(p => p.id === id)?.name || 'participant' } : false }));
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
      connectionFailures = 0; retryAfter = 0; retryPaused = false;
      await window.LarkEditorShare.flush();
      const files = await request('files');
      session = { id: data.id, identity: data.identity, paths: new Set(files.files.map(f => f.path)), hosting: data.hosting, project: data.project };
      if (!data.hosting) await window.LarkEditorShare.guest(data.name, files.files);
      else await window.LarkEditorShare.prepareHost(data.project);
      const wrapper = window.LarkEditorShare.editor()?.getWrapperElement?.();
      if (wrapper) {
        const cancel = event => { if (following && (event.type !== 'pointerdown' || event.target.closest('.CodeMirror-vscrollbar, .CodeMirror-hscrollbar'))) setFollowing(null); };
        wrapper.addEventListener('wheel', cancel, { passive: true }); wrapper.addEventListener('touchstart', cancel, { passive: true }); wrapper.addEventListener('pointerdown', cancel);
        followInput = { wrapper, cancel };
      }
      if (document.getElementById('split-editor')) document.getElementById('split-editor').disabled = true;
      timer = setInterval(tick, 120);
      const current = window.LarkEditorShare.current(); if (current?.path) await open(current.path, current.doc);
      status('Connected');
    },
    updateRole(role) {
      if (!session || session.hosting) return;
      for (const entry of documents.values()) entry.role = role;
      const cm = window.LarkEditorShare?.editor(); if (cm) cm.setOption('readOnly', role !== 'editor');
    },
    sessionActive: () => !!session,
    refreshPositions() { presenceKey = ''; drawPresence(); },
    async snapshot() {
      if (!session) throw new Error('The Share session is no longer active.');
      const result = [];
      for (const path of session.paths) {
        const entry = documents.get(path);
        const content = entry ? entry.model.text() : (await request('source', {path})).content;
        result.push({path,content});
      }
      return result;
    },
    retry() { connectionFailures = 0; retryAfter = 0; retryPaused = false; document.dispatchEvent(new CustomEvent('lark-share-retry', { detail: false })); soon(); },
    active: path => !!session?.paths.has(path), hosting: () => session?.hosting, project: () => session?.project, open,
    changed: path => { if (session?.paths.has(path)) return true; return false; },
    async stop() { clearInterval(timer); timer = null; clearTimeout(soonTimer); soonTimer = null; for (const entry of documents.values()) { clearTimeout(entry.recoveryTimer); if (entry.pending.length) recover(entry); } documents.clear(); opening.clear(); if (document.getElementById('split-editor')) document.getElementById('split-editor').disabled = false; marks.splice(0).forEach(m => m.clear()); if (gutterDoc) gutterDoc.clearGutter(gutterName); gutterDoc = null; presenceKey = ''; if (followInput) { for (const type of ['wheel', 'touchstart', 'pointerdown']) followInput.wrapper.removeEventListener(type, followInput.cancel); followInput = null; } session = null; setFollowing(null); document.dispatchEvent(new CustomEvent('lark-share-presence', { detail: [] })); document.dispatchEvent(new CustomEvent('lark-share-retry', { detail: false })); const cm = window.LarkEditorShare?.editor(); if (cm) { cm.state.larkShare = null; cm.setOption('readOnly', false); cm.setOption('gutters', (cm.getOption('gutters') || []).filter(g => g !== gutterName)); } await window.LarkEditorShare?.leave(); },
    follow: setFollowing,
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
