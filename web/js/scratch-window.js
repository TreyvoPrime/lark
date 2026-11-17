(function () {
  'use strict';
  const id = decodeURIComponent(location.hash.slice(1));
  const recoveryKey = 'lark-scratch-recovery:' + id;
  const nameElement = document.getElementById('scratch-name');
  const status = document.getElementById('scratch-save');
  let item = null;
  let editor = null;
  let closing = false;

  function state() {
    return { selections: editor.listSelections(), scroll: editor.getScrollInfo(), history: editor.getHistory() };
  }
  function persist(action) {
    if (!item || !editor) return;
    item.source = editor.getValue();
    if (action === 'dock') item.detached = false;
    item.editorState = state();
    item.windowGeometry = { left: window.screenX, top: window.screenY, width: window.outerWidth, height: window.outerHeight };
    item.updatedAt = Date.now();
    try { localStorage.setItem(recoveryKey, JSON.stringify(item)); status.textContent = 'Saved locally'; }
    catch (_) { status.textContent = 'Could not save recovery'; }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ kind: 'lark-scratch', action: action || 'update', id, source: item.source, name: item.name, editorState: item.editorState, windowGeometry: item.windowGeometry, alwaysOnTop: !!item.alwaysOnTop }, location.origin);
    }
  }
  function initialize(data) {
    if (editor || !data || data.id !== id) return;
    item = data;
    nameElement.textContent = item.name || 'Scratch';
    document.title = 'Scratch: ' + nameElement.textContent + ' - Lark [Lark Scratch ' + id + ']';
    editor = CodeMirror(document.getElementById('detached-editor'), {
      value: item.source || '', mode: 'text/x-java', theme: 'lark', lineNumbers: true,
      indentUnit: 4, tabSize: 4, matchBrackets: true, autoCloseBrackets: true, lineWrapping: true
    });
    if (item.editorState) {
      try { editor.setHistory(item.editorState.history); editor.setSelections(item.editorState.selections); editor.scrollTo(item.editorState.scroll.left, item.editorState.scroll.top); } catch (_) { /* Preserve the text when old state is invalid. */ }
    }
    editor.on('change', () => persist());
    editor.on('cursorActivity', () => {
      const pos = editor.getCursor();
      document.getElementById('scratch-position').textContent = 'Ln ' + (pos.line + 1) + ', Col ' + (pos.ch + 1);
    });
    editor.focus();
    persist();
    if (item.alwaysOnTop) setAlwaysOnTop(true);
  }
  async function setAlwaysOnTop(enabled) {
    const button = document.getElementById('scratch-on-top');
    button.disabled = true;
    try {
      const response = await fetch('/api/scratch/always-on-top', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lark': '1' }, body: JSON.stringify({ id, enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Window control failed');
      item.alwaysOnTop = enabled;
      button.setAttribute('aria-pressed', String(enabled));
      status.textContent = enabled ? 'Always on top' : 'Saved locally';
      persist();
    } catch (error) { status.textContent = error.message || 'Window control failed'; }
    finally { button.disabled = false; }
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.opener || event.data?.kind !== 'lark-scratch' || event.data.id !== id) return;
    if (event.data.action === 'init') { if (event.data.theme) document.documentElement.dataset.theme = event.data.theme; initialize(event.data.item); }
    if (event.data.action === 'run-status') {
      const output = document.getElementById('scratch-output');
      output.hidden = false; output.textContent = event.data.output || '';
      document.getElementById('scratch-run').disabled = !event.data.done;
      document.getElementById('scratch-stop').disabled = !!event.data.done;
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === 'lark-theme' && event.newValue) document.documentElement.dataset.theme = event.newValue;
  });
  document.getElementById('scratch-rename').addEventListener('click', () => {
    if (!item) return;
    const value = window.prompt('Scratch name', item.name);
    if (value === null || !value.trim()) return;
    item.name = value.trim().slice(0, 24); nameElement.textContent = item.name;
    document.title = 'Scratch: ' + item.name + ' - Lark [Lark Scratch ' + id + ']'; persist();
  });
  document.getElementById('scratch-on-top').addEventListener('click', () => { if (item) setAlwaysOnTop(!item.alwaysOnTop); });
  document.getElementById('scratch-dock').addEventListener('click', () => {
    if (!window.opener || window.opener.closed) { status.textContent = 'Main Lark window is not open'; return; }
    closing = true; persist('dock'); window.close();
  });
  document.getElementById('scratch-insert').addEventListener('click', () => {
    if (!editor || !editor.somethingSelected()) { status.textContent = 'Select Scratch text first'; return; }
    if (!window.opener || window.opener.closed) { status.textContent = 'Main Lark window is not open'; return; }
    window.opener.postMessage({ kind: 'lark-scratch', action: 'insert', id, text: editor.getSelection() }, location.origin);
  });
  document.getElementById('scratch-run').addEventListener('click', () => {
    if (!editor || !window.opener || window.opener.closed) { status.textContent = 'Main Lark window is not open'; return; }
    document.getElementById('scratch-run').disabled = true;
    document.getElementById('scratch-stop').disabled = false;
    window.opener.postMessage({ kind: 'lark-scratch', action: 'run', id, source: editor.getValue() }, location.origin);
  });
  document.getElementById('scratch-stop').addEventListener('click', () => {
    if (window.opener && !window.opener.closed) window.opener.postMessage({ kind: 'lark-scratch', action: 'stop', id }, location.origin);
  });
  window.addEventListener('beforeunload', () => { if (!closing) persist('dock'); });
  function start() {
    if (window.opener && !window.opener.closed) window.opener.postMessage({ kind: 'lark-scratch', action: 'ready', id }, location.origin);
    else {
      try { initialize(JSON.parse(localStorage.getItem(recoveryKey) || 'null')); } catch (_) { status.textContent = 'Scratch recovery unavailable'; }
    }
  }
  if (navigator.locks) {
    navigator.locks.request('lark-scratch:' + id, { ifAvailable: true }, async lock => {
      if (!lock) { status.textContent = 'This Scratch pad is already open in another window'; return; }
      start();
      await new Promise(resolve => window.addEventListener('pagehide', resolve, { once: true }));
    }).catch(() => { status.textContent = 'Could not secure Scratch ownership'; });
  } else status.textContent = 'Scratch detachment requires browser lock support';
})();
