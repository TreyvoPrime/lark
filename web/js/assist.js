/* Assist placement: document-free previews and one atomic edit, using CodeMirror 5. */
(function (root) {
  "use strict";
  const cache = new WeakMap();
  // Cache lexical boundaries once per document generation, never once per pointer event.
  function boundaries(editor) {
    const doc = editor.getDoc();
    const generation = doc.changeGeneration();
    const cached = cache.get(doc);
    if (cached && cached.generation === generation) return cached.rows;
    const rows = [], stack = [];
    let mode = "code", header = "", parens = 0;
    for (let line = 0; line < editor.lineCount(); line++) {
      const text = editor.getLine(line);
      rows.push({ mode, stack: stack.slice(), parens, header: header.trim() });
      for (let i = 0; i < text.length; i++) {
        const c = text[i], n = text[i + 1];
        if (mode === "comment") { if (c === "*" && n === "/") { mode = "code"; i++; } continue; }
        if (mode === "text") { if (text.slice(i, i + 3) === '"""') { mode = "code"; i += 2; } else if (c === "\\") i++; continue; }
        if (mode !== "code") { if (c === "\\") i++; else if (c === mode) mode = "code"; continue; }
        if (c === "/" && n === "/") break;
        if (c === "/" && n === "*") { mode = "comment"; i++; continue; }
        if (text.slice(i, i + 3) === '"""') { mode = "text"; i += 2; continue; }
        if (c === '"' || c === "'") { mode = c; continue; }
        if (c === "(") parens++;
        if (c === ")") parens = Math.max(0, parens - 1);
        if (c === "{") { stack.push(/\b(class|interface|enum|record)\s+\w/.test(header) ? "class" : "block"); header = ""; }
        else if (c === "}" ) { stack.pop(); header = ""; }
        else if (c === ";" && !parens) header = "";
        else header += c;
      }
      header += " ";
    }
    cache.set(doc, { generation, rows });
    return rows;
  }
  function plan(editor, pos, meta) {
    if (!editor || editor.getOption("readOnly") || editor.getOption("disableInput")) return { error: "This editor is read-only." };
    if (!/java/.test(String(editor.getOption("mode")))) return { error: "Open a Java file." };
    if (!meta || !String(meta.code || "").trim()) return { error: "This snippet is empty." };
    const line = Math.max(0, Math.min(editor.lastLine(), pos.line));
    const context = boundaries(editor)[line];
    if (context.mode !== "code" || context.parens || context.header) return { error: "Choose a line between complete statements or declarations." };
    const top = context.stack[context.stack.length - 1];
    if (meta.place === "member" ? top !== "class" : top !== "block") return { error: meta.place === "member" ? "Choose a line inside a class, outside a method." : "Choose a line inside a method or block." };
    const unit = editor.getOption("indentWithTabs") ? "\t" : " ".repeat(editor.getOption("indentUnit") || 4);
    const current = editor.getLine(line), previous = line ? editor.getLine(line - 1) : "";
    let base = (current.match(/^\s*/) || [""])[0];
    if (!current.trim()) base = previous.match(/^\s*/)[0] + (/\{\s*(?:\/\/.*)?$/.test(previous) ? unit : "");
    else if (/^\s*}/.test(current)) base += unit;
    const lines = String(meta.code).replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
    const columns = s => s.replace(/\t/g, "    ").match(/^ */)[0].length;
    const common = Math.min(...lines.filter(s => s.trim()).map(columns));
    const text = lines.map(s => {
      if (!s.trim()) return "";
      const indent = columns(s) - common;
      return base + unit.repeat(Math.floor(indent / 4)) + " ".repeat(indent % 4) + s.trimStart();
    }).join("\n") + "\n";
    return { at: { line, ch: 0 }, text, doc: editor.getDoc(), generation: editor.getDoc().changeGeneration() };
  }
  function commit(editor, prepared, meta, replace) {
    if (!prepared || prepared.error || editor.getOption("readOnly") || editor.getOption("disableInput") || editor.getDoc() !== prepared.doc || !prepared.doc.isClean(prepared.generation)) return false;
    const doc = editor.getDoc();
    if (replace && editor.listSelections().length !== 1) return false;
    doc.changeGeneration(true);
    editor.operation(() => {
      const from = replace ? editor.getCursor("from") : prepared.at;
      const to = replace ? editor.getCursor("to") : from;
      let text = prepared.text;
      if (replace) {
        if (from.ch > 0) text = text.replace(/^[ \t]*/, "");
        if (to.ch !== 0 || to.line === from.line) text = text.replace(/\n$/, "");
      }
      editor.replaceRange(text, from, to, "assist");
      const mark = doc.setBookmark(from);
      // Apply only the changed import range; setValue would destroy history and markers.
      const before = doc.getValue("\n");
      const after = root.LarkJava && root.LarkJava.ensureImports(before, meta.imports || []);
      if (after && after !== before) {
        let start = 0, end = before.length, nextEnd = after.length;
        while (start < end && start < nextEnd && before[start] === after[start]) start++;
        while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
        editor.replaceRange(after.slice(start, nextEnd), doc.posFromIndex(start), doc.posFromIndex(end), "assist");
      }
      const at = mark.find(); mark.clear();
      if (at) editor.setCursor(at);
    });
    doc.changeGeneration(true);
    editor.focus();
    return true;
  }
  function controller(getPayload, onDrop, onCancel = () => {}) {
    let preview = null, frame = 0, pointer = null;
    function clear() {
      cancelAnimationFrame(frame); frame = 0; pointer = null;
      if (preview) { preview.editor.getWrapperElement().classList.remove("assist-drop-over", "assist-drop-invalid"); preview.widget.clear(); preview = null; }
    }
    function render(editor, prepared, meta) {
      const key = prepared.error || prepared.at.line;
      if (preview && preview.editor === editor && preview.key === key) return;
      const saved = pointer; clear(); pointer = saved;
      const node = document.createElement("div");
      node.className = "assist-ghost" + (prepared.error ? " assist-ghost-warning" : "");
      node.setAttribute("aria-hidden", "true");
      node.style.tabSize = editor.getOption("tabSize");
      if (prepared.error) node.textContent = prepared.error;
      else {
        const mode = CodeMirror.getMode(editor.options, editor.getOption("mode")), state = CodeMirror.startState(mode);
        prepared.text.replace(/\n$/, "").split("\n").forEach(text => {
          const row = document.createElement("div"), stream = new CodeMirror.StringStream(text, editor.getOption("tabSize"));
          while (!stream.eol()) {
            stream.start = stream.pos;
            const type = mode.token(stream, state);
            if (stream.pos <= stream.start) stream.pos++;
            const span = document.createElement("span");
            span.className = (type || "").split(/\s+/).filter(Boolean).map(t => "cm-" + t).join(" ");
            span.textContent = stream.current(); row.append(span);
          }
          if (!text) row.textContent = " ";
          node.append(row);
        });
        if (meta.imports && meta.imports.length) node.title = "Required imports are added on insertion: " + meta.imports.join(", ");
      }
      const line = prepared.error ? editor.coordsChar({ left: pointer.x, top: pointer.y }, "window").line : prepared.at.line;
      const widget = editor.addLineWidget(line, node, { above: true, coverGutter: false });
      editor.getWrapperElement().classList.add(prepared.error ? "assist-drop-invalid" : "assist-drop-over");
      preview = { editor, key, widget, node, prepared };
    }
    function update() {
      frame = 0;
      if (!pointer || !getPayload()) return clear();
      const { editor, x, y, rect } = pointer;
      if (!editor.getWrapperElement().isConnected) return clear();
      const speed = y < rect.top + 32 ? -12 : y > rect.bottom - 32 ? 12 : 0;
      if (speed) editor.scrollTo(null, editor.getScrollInfo().top + speed);
      const bounds = preview && preview.editor === editor && preview.node.getBoundingClientRect();
      if (!bounds || y < bounds.top || y > bounds.bottom) {
        const pos = editor.coordsChar({ left: x, top: y }, "window");
        render(editor, plan(editor, pos, getPayload()), getPayload());
      }
      if (pointer && speed) frame = requestAnimationFrame(update);
    }
    function wire(editor) {
      const wrap = editor.getWrapperElement();
      wrap.addEventListener("dragover", event => {
        if (!getPayload()) return;
        event.preventDefault(); event.stopPropagation();
        pointer = { editor, x: event.clientX, y: event.clientY, rect: wrap.getBoundingClientRect() };
        event.dataTransfer.dropEffect = preview && preview.prepared.error ? "none" : "copy";
        if (!frame) frame = requestAnimationFrame(update);
      }, true);
      wrap.addEventListener("dragleave", event => { if (!wrap.contains(event.relatedTarget)) clear(); });
      wrap.addEventListener("drop", event => {
        if (!getPayload() && !Array.from(event.dataTransfer.types || []).includes("text/lark-assist")) return;
        event.preventDefault(); event.stopPropagation();
        const meta = getPayload();
        if (meta) {
          cancelAnimationFrame(frame);
          pointer = { editor, x: event.clientX, y: event.clientY, rect: wrap.getBoundingClientRect() };
          update();
        }
        const prepared = preview && preview.editor === editor ? preview.prepared : meta && plan(editor, editor.coordsChar({ left: event.clientX, top: event.clientY }, "window"), meta);
        clear();
        if (meta && prepared && !prepared.error) onDrop(editor, prepared, meta);
      }, true);
      editor.on("swapDoc", cancel); editor.on("changes", cancel);
      editor.on("optionChange", cancel);
    }
    function cancel() { clear(); onCancel(); }
    document.addEventListener("dragend", cancel);
    document.addEventListener("drop", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", event => { if (event.key === "Escape") cancel(); });
    window.addEventListener("pagehide", cancel);
    return { wire, clear };
  }
  root.LarkAssist = { plan, commit, controller };
  if (typeof module !== "undefined") module.exports = root.LarkAssist;
})(typeof window === "undefined" ? globalThis : window);
