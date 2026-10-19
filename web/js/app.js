(function () {
  const THEME_NAMES = {
    desk: "Desk",
    daylight: "Daylight",
    moss: "Moss",
    ember: "Ember",
    fog: "Fog",
    ink: "Desk",
    paper: "Daylight",
    tide: "Moss",
    copper: "Ember",
    chalk: "Fog"
  };
  const THEME_CANON = {
    ink: "desk",
    paper: "daylight",
    tide: "moss",
    copper: "ember",
    chalk: "fog"
  };
  const state = {
    settings: null,
    projects: [],
    project: null,
    files: [],
    dirs: [],
    open: [],
    active: null,
    selected: null,
    collapsed: new Set(),
    problems: [],
    localProblems: [],
    job: null,
    poll: null,
    dirty: new Set(),
    timers: new Map()
  };
  const docs = new Map();
  const parsedCache = new Map();
  const lineMarks = [];
  let cm = null;
  let suppress = false;
  let paletteIndex = 0;
  let modalResolve = null;

  const $ = (id) => document.getElementById(id);

  async function api(method, path, body) {
    const res = await fetch(path, {
      method: method,
      headers: { "Content-Type": "application/json", "X-Lark": "1" },
      body: body == null ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Lark sent a response that wasn't JSON." }));
    if (!res.ok || data.ok === false) throw new Error(data.error || "Request failed");
    return data;
  }

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function themeName(theme) {
    return THEME_NAMES[theme] || "Desk";
  }

  function applyTheme(theme, save) {
    theme = THEME_CANON[theme] || theme;
    if (!THEME_NAMES[theme] || !["desk", "daylight", "moss", "ember", "fog"].includes(theme)) theme = "desk";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("lark-theme", theme); } catch (e) {}
    $("theme").textContent = themeName(theme);
    if (save && state.settings) {
      api("PUT", "/api/settings", { theme: theme }).catch((err) => toast(err.message));
    }
  }

  function applyDisplay(opts, save) {
    if (!state.settings) state.settings = {};
    let fontSize = Number(opts && opts.fontSize != null ? opts.fontSize : state.settings.fontSize || 14);
    let zoom = Number(opts && opts.zoom != null ? opts.zoom : state.settings.zoom || 100);
    if (!Number.isFinite(fontSize)) fontSize = 14;
    if (!Number.isFinite(zoom)) zoom = 100;
    fontSize = Math.min(24, Math.max(11, Math.round(fontSize)));
    zoom = Math.min(150, Math.max(80, Math.round(zoom / 5) * 5));
    state.settings.fontSize = fontSize;
    state.settings.zoom = zoom;
    document.documentElement.style.setProperty("--editor-font-size", fontSize + "px");
    document.documentElement.style.setProperty("--ui-zoom", String(zoom / 100));
    const fontSlider = $("setting-font");
    const zoomSlider = $("setting-zoom");
    if (fontSlider) fontSlider.value = String(fontSize);
    if (zoomSlider) zoomSlider.value = String(zoom);
    if ($("setting-font-out")) $("setting-font-out").textContent = String(fontSize);
    if ($("setting-zoom-out")) $("setting-zoom-out").textContent = zoom + "%";
    if (cm) {
      cm.getWrapperElement().style.fontSize = fontSize + "px";
      cm.refresh();
    }
    if (save) {
      api("PUT", "/api/settings", { fontSize: fontSize, zoom: zoom }).catch((err) => toast(err.message));
    }
  }

  function bumpZoom(delta) {
    const current = state.settings && state.settings.zoom ? state.settings.zoom : 100;
    applyDisplay({ zoom: current + delta }, true);
  }

  function fileByPath(path) {
    return state.files.find((file) => file.path === path);
  }

  function parsedFile(file) {
    const hit = parsedCache.get(file.path);
    if (hit && hit.source === file.content) return hit.result;
    const result = window.LarkJava.parseJava(file.content || "");
    parsedCache.set(file.path, { source: file.content, result: result });
    return result;
  }

  function modeFor(path) {
    return path.endsWith(".java") ? "text/x-java" : null;
  }

  function parentDir(path) {
    const i = path.lastIndexOf("/");
    return i < 0 ? "" : path.slice(0, i);
  }

  function selectedDir() {
    if (!state.selected) return "src";
    if (state.dirs.includes(state.selected)) return state.selected;
    return parentDir(state.selected) || "src";
  }

  function packageFor(dir) {
    if (dir === "src") return "";
    if (dir.startsWith("src/")) return dir.slice(4).replaceAll("/", ".");
    return "";
  }

  function ensureEditor() {
    if (cm) return;
    cm = CodeMirror($("editor"), {
      value: "",
      mode: "text/x-java",
      theme: "lark",
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      lineWrapping: false,
      matchBrackets: true,
      // Do not auto-pair /* */ — that fights IntelliJ-style /** Javadoc expansion.
      autoCloseBrackets: { pairs: "()[]{}''\"\"", explode: "[]{}" },
      styleActiveLine: true,
      extraKeys: {
        "Tab": function (editor) {
          if (editor.somethingSelected()) editor.indentSelection("add");
          else editor.replaceSelection("    ", "end");
        },
        "Shift-Tab": "indentLess",
        "Enter": function (editor) {
          if (tryExpandJavadoc(editor)) return;
          return CodeMirror.Pass;
        },
        "Ctrl-/": "toggleComment",
        "Cmd-/": "toggleComment",
        "Ctrl-F": "find",
        "Cmd-F": "find",
        "Ctrl-H": "replace",
        "Cmd-Alt-F": "replace",
        "Ctrl-Space": (editor) => CodeMirror.showHint(editor, completeHint, { completeSingle: false }),
        "Cmd-Space": (editor) => CodeMirror.showHint(editor, completeHint, { completeSingle: false })
      }
    });
    cm.on("change", (editor, change) => {
      if (suppress || !state.active) return;
      maybeExpandJavadoc(editor, change);
      const path = state.active;
      const file = fileByPath(path);
      if (file) file.content = cm.getValue();
      state.dirty.add(path);
      renderTabs();
      clearMarks();
      scheduleSave(path);
      renderStructure();
      refreshLocalProblems();
      renderProblems();
      markErrors();
      setSaveStatus("Saving…");
    });
    cm.on("cursorActivity", () => {
      const cursor = cm.getCursor();
      $("status-cursor").textContent = "Ln " + (cursor.line + 1) + ", Col " + (cursor.ch + 1);
      updateSignatureHelp();
    });
  }

  function javadocTriggerLine(line) {
    const trimmed = (line || "").trim();
    // Bare opener, or the broken form autoCloseBrackets sometimes leaves behind.
    return trimmed === "/**" || trimmed === "/***" || trimmed === "/**/" || trimmed === "/***/";
  }

  function buildJavadocStub(editor, lineNo, indent) {
    const lines = [indent + "/**", indent + " * "];
    const following = [];
    for (let i = lineNo + 1; i < Math.min(editor.lineCount(), lineNo + 8); i++) {
      const text = (editor.getLine(i) || "").trim();
      if (!text) continue;
      if (text.startsWith("@") || text.startsWith("//") || text.startsWith("*")) continue;
      following.push(text);
      if (text.includes("{") || text.includes(";")) break;
    }
    const joined = following.join(" ");
    const method = joined.match(/^(?:public|protected|private|static|final|synchronized|native|abstract|default|\s)+([A-Za-z_][\w.<>,\[\]?]*)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    const ctor = !method && joined.match(/^(?:public|protected|private|\s)+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    const params = (method ? method[3] : (ctor ? ctor[2] : "") || "").trim();
    if (params) {
      params.split(",").forEach((part) => {
        const bits = part.trim().replace(/^final\s+/, "").split(/\s+/).filter(Boolean);
        const name = bits[bits.length - 1];
        if (name) lines.push(indent + " * @param " + name + " ");
      });
    }
    if (method && method[1] && method[1] !== "void") {
      lines.push(indent + " * @return ");
    }
    lines.push(indent + " */");
    return lines.join("\n");
  }

  function expandJavadocAt(editor, lineNo) {
    const line = editor.getLine(lineNo) || "";
    if (!javadocTriggerLine(line)) return false;
    // Already a finished block on the next lines? Don't double-expand.
    const next = editor.getLine(lineNo + 1) || "";
    if (/^\s*\*\s/.test(next) || /^\s*\*\//.test(next)) return false;
    const indent = line.match(/^\s*/)[0];
    const stub = buildJavadocStub(editor, lineNo, indent);
    suppress = true;
    editor.replaceRange(stub, { line: lineNo, ch: 0 }, { line: lineNo, ch: line.length });
    editor.setCursor({ line: lineNo + 1, ch: (indent + " * ").length });
    suppress = false;
    return true;
  }

  function tryExpandJavadoc(editor) {
    const cursor = editor.getCursor();
    return expandJavadocAt(editor, cursor.line);
  }

  function maybeExpandJavadoc(editor, change) {
    if (!change || !change.text || change.origin === "setValue") return;
    // Expand as soon as the opener is typed, and also when Enter inserts a newline after /**.
    const lineNo = change.from.line;
    const line = editor.getLine(lineNo) || "";
    if (javadocTriggerLine(line)) {
      // Defer so the typed character is fully in the document.
      setTimeout(() => {
        if (suppress) return;
        expandJavadocAt(editor, lineNo);
      }, 0);
      return;
    }
    if (change.text.length === 1 && change.text[0] === "" && change.from.line === change.to.line) {
      // no-op
    }
  }

  function completeHint(editor) {
    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);
    let prefix = token.string || "";
    let from = token.start;
    if (!/^[\w$]+$/.test(prefix)) {
      prefix = "";
      from = cursor.ch;
    }
    const names = new Map();
    state.files.forEach((file) => {
      if (!file.path.endsWith(".java")) return;
      const parsed = parsedFile(file);
      parsed.symbols.forEach((sym) => {
        if (!names.has(sym.name)) names.set(sym.name, sym.kind + (sym.signature ? "  " + sym.signature : ""));
      });
    });
    (window.LarkJava.keywords || []).forEach((word) => {
      if (!names.has(word)) names.set(word, "keyword");
    });
    (window.LarkJava.typeWords || []).forEach((word) => {
      if (!names.has(word)) names.set(word, "type");
    });
    const lower = prefix.toLowerCase();
    const list = [];
    names.forEach((kind, name) => {
      if (prefix && !name.startsWith(prefix) && !name.toLowerCase().startsWith(lower)) return;
      list.push({ text: name, displayText: name + "  " + kind });
    });
    if (!prefix || "println".startsWith(lower)) {
      list.push({ text: "System.out.println(", displayText: "println  snippet" });
    }
    if (!prefix || "printf".startsWith(lower)) {
      list.push({ text: "System.out.printf(", displayText: "printf  snippet" });
    }
    list.sort((a, b) => a.displayText.localeCompare(b.displayText));
    if (!list.length) return null;
    return {
      list: list.slice(0, 60),
      from: CodeMirror.Pos(cursor.line, from),
      to: CodeMirror.Pos(cursor.line, cursor.ch)
    };
  }

  function updateSignatureHelp() {
    const el = $("status-sig");
    if (!el || !cm || !state.active || !state.active.endsWith(".java")) {
      if (el) el.textContent = "";
      return;
    }
    const file = fileByPath(state.active);
    if (!file) { el.textContent = ""; return; }
    const parsed = parsedFile(file);
    const line = cm.getCursor().line + 1;
    let best = null;
    parsed.symbols.forEach((sym) => {
      if ((sym.kind === "method" || sym.kind === "ctor") && sym.line <= line) best = sym;
    });
    el.textContent = best && best.signature ? best.signature : "";
  }

  function scheduleSave(path) {
    clearTimeout(state.timers.get(path));
    state.timers.set(path, setTimeout(() => {
      state.timers.delete(path);
      saveFile(path);
    }, 400));
  }

  async function saveFile(path) {
    const doc = docs.get(path);
    const content = doc ? doc.getValue() : (fileByPath(path) || {}).content;
    if (content == null || !state.project) return;
    try {
      await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", {
        path: path,
        content: content
      });
      const file = fileByPath(path);
      if (file) file.content = content;
      state.dirty.delete(path);
      renderTabs();
      setSaveStatus(state.dirty.size ? "Saving…" : "Saved");
    } catch (err) {
      setSaveStatus("Not saved");
      toast(err.message);
    }
  }

  async function flushSaves() {
    const pending = [...state.timers.keys()];
    state.timers.forEach((timer) => clearTimeout(timer));
    state.timers.clear();
    if (state.active) pending.push(state.active);
    const unique = [...new Set(pending)];
    for (const path of unique) await saveFile(path);
  }

  function setSaveStatus(text) {
    $("status-save").textContent = text || "";
  }

  function renderProjects() {
    const select = $("project");
    select.replaceChildren();
    if (!state.projects.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No project";
      select.appendChild(opt);
      return;
    }
    state.projects.forEach((project) => {
      const opt = document.createElement("option");
      opt.value = project.id;
      opt.textContent = project.name;
      select.appendChild(opt);
    });
    if (state.project) select.value = state.project.id;
  }

  function buildTree() {
    const map = new Map();
    const root = { name: "", path: "", dir: true, children: [] };
    map.set("", root);
    function ensure(path) {
      if (map.has(path)) return map.get(path);
      const parent = ensure(parentDir(path));
      const node = { name: path.slice(path.lastIndexOf("/") + 1), path: path, dir: true, children: [] };
      parent.children.push(node);
      map.set(path, node);
      return node;
    }
    state.dirs.forEach((dir) => ensure(dir));
    state.files.forEach((file) => {
      const parent = ensure(parentDir(file.path));
      parent.children.push({ name: file.path.slice(file.path.lastIndexOf("/") + 1), path: file.path, dir: false });
    });
    function sort(node) {
      node.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
      node.children.forEach((child) => { if (child.dir) sort(child); });
    }
    sort(root);
    return root;
  }

  function renderTree() {
    const box = $("tree");
    box.replaceChildren();
    const root = buildTree();
    if (!root.children.length) {
      const p = document.createElement("p");
      p.className = "muted pad";
      p.textContent = "This project is empty.";
      box.appendChild(p);
      return;
    }
    root.children.forEach((node) => box.appendChild(renderNode(node, 0)));
  }

  function renderNode(node, depth) {
    const wrap = document.createElement("div");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row" + (node.path === state.active ? " active" : "") + (node.path === state.selected ? " selected" : "") + (node.path.endsWith(".java") ? " java" : "");
    row.style.paddingLeft = (8 + depth * 14) + "px";
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = node.dir ? (state.collapsed.has(node.path) ? "▸" : "▾") : "";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = node.name;
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = node.dir ? "Folder" : node.path.endsWith(".java") ? "Class" : "File";
    row.append(chev, name, kind);
    row.addEventListener("click", () => {
      state.selected = node.path;
      if (node.dir) {
        if (state.collapsed.has(node.path)) state.collapsed.delete(node.path);
        else state.collapsed.add(node.path);
        renderTree();
      } else {
        openPath(node.path);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      state.selected = node.path;
      openContext(event.clientX, event.clientY, node);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Delete") {
        event.preventDefault();
        removePath(node.path);
      }
    });
    wrap.appendChild(row);
    if (node.dir && !state.collapsed.has(node.path)) {
      node.children.forEach((child) => wrap.appendChild(renderNode(child, depth + 1)));
    }
    return wrap;
  }

  function renderTabs() {
    const box = $("tabs");
    box.replaceChildren();
    state.open.forEach((path) => {
      const tab = document.createElement("div");
      tab.className = "tab" + (path === state.active ? " on" : "");
      const label = document.createElement("button");
      label.type = "button";
      label.className = "tab-name";
      label.textContent = path.slice(path.lastIndexOf("/") + 1);
      label.addEventListener("click", () => openPath(path));
      if (state.problems.some((problem) => problem.file === path && problem.severity === "error")) {
        const dot = document.createElement("span");
        dot.className = "dot";
        label.prepend(dot);
      }
      const close = document.createElement("button");
      close.type = "button";
      close.className = "close";
      close.textContent = "×";
      close.setAttribute("aria-label", "Close " + path);
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(path);
      });
      tab.addEventListener("auxclick", (event) => {
        if (event.button === 1) closeTab(path);
      });
      tab.append(label, close);
      box.appendChild(tab);
    });
  }

  function closeTab(path) {
    saveFile(path);
    state.open = state.open.filter((item) => item !== path);
    if (state.active === path) {
      state.active = state.open[state.open.length - 1] || null;
      if (state.active) openPath(state.active);
      else showEmpty();
    }
    renderTabs();
  }

  function showEmpty() {
    hideWelcome();
    $("empty").hidden = false;
    $("editor").hidden = true;
    renderStructure();
    $("status-path").textContent = state.project ? state.project.name : "Lark";
  }

  function showWelcome() {
    const welcome = $("welcome");
    if (!welcome) return;
    $("empty").hidden = true;
    $("editor").hidden = true;
    welcome.hidden = false;
    renderWelcomeRecent();
    $("status-path").textContent = "Welcome";
    document.title = "Lark";
  }

  function hideWelcome() {
    const welcome = $("welcome");
    if (welcome) welcome.hidden = true;
  }

  function renderWelcomeRecent() {
    const box = $("welcome-recent");
    if (!box) return;
    box.replaceChildren();
    if (!state.projects.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No projects yet. Create one to begin.";
      box.appendChild(p);
      return;
    }
    state.projects.slice(0, 8).forEach((project) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = project.name;
      btn.addEventListener("click", () => openProject(project.id).catch((err) => toast(err.message)));
      box.appendChild(btn);
    });
  }

  function openPath(path) {
    const file = fileByPath(path);
    if (!file) return;
    hideWelcome();
    ensureEditor();
    if (!state.open.includes(path)) state.open.push(path);
    state.active = path;
    state.selected = path;
    let doc = docs.get(path);
    if (!doc) {
      doc = CodeMirror.Doc(file.content || "", modeFor(path));
      docs.set(path, doc);
    }
    suppress = true;
    cm.swapDoc(doc);
    suppress = false;
    $("empty").hidden = true;
    $("editor").hidden = false;
    cm.setOption("mode", modeFor(path));
    cm.refresh();
    renderTabs();
    renderTree();
    renderStructure();
    const cursor = cm.getCursor();
    $("status-cursor").textContent = "Ln " + (cursor.line + 1) + ", Col " + (cursor.ch + 1);
    const crumbs = path.split("/").join(" / ");
    const pkg = path.endsWith(".java") ? parsedFile(file).pkg : "";
    $("status-path").textContent = (pkg ? "package " + pkg + "  ·  " : "") + crumbs;
    document.title = "Lark — " + (state.project ? state.project.name : path);
    refreshLocalProblems();
    markErrors();
    updateSignatureHelp();
  }

  function renderStructure() {
    const box = $("structure-list");
    if (!box) return;
    box.replaceChildren();
    const file = state.active ? fileByPath(state.active) : null;
    if (!file || !file.path.endsWith(".java")) {
      box.appendChild(note("Open a .java file."));
      return;
    }
    const symbols = parsedFile(file).symbols;
    if (!symbols.length) {
      box.appendChild(note("No members yet."));
      return;
    }
    symbols.forEach((sym) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "outline-row " + sym.kind;
      btn.style.paddingLeft = (6 + sym.indent * 10) + "px";
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = sym.kind;
      const label = sym.kind === "method" || sym.kind === "ctor"
        ? sym.name + (sym.detail || "()")
        : (sym.kind === "field" ? sym.detail + " " + sym.name : sym.name);
      btn.append(document.createTextNode(label), kind);
      btn.title = sym.signature || label;
      btn.addEventListener("click", () => jumpTo(file.path, sym.line, 1));
      box.appendChild(btn);
    });
  }

  function note(text) {
    const p = document.createElement("p");
    p.className = "muted pad";
    p.textContent = text;
    return p;
  }

  function renderMains() {
    const select = $("main-class");
    const current = state.project ? (state.project.mainClass || "") : "";
    const found = [];
    state.files.forEach((file) => {
      if (!file.path.endsWith(".java")) return;
      parsedFile(file).mains.forEach((name) => {
        if (!found.includes(name)) found.push(name);
      });
    });
    if (current && !found.includes(current)) found.unshift(current);
    select.replaceChildren();
    if (!found.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No main method";
      select.appendChild(opt);
      return;
    }
    found.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    select.value = current && found.includes(current) ? current : found[0];
    if (state.project && !current && found[0]) {
      state.project.mainClass = found[0];
      api("PUT", "/api/projects/" + encodeURIComponent(state.project.id), { mainClass: found[0] }).catch(() => {});
    }
  }

  function fileForMain(mainClass) {
    if (!mainClass) return null;
    const type = mainClass.includes(".") ? mainClass.slice(mainClass.lastIndexOf(".") + 1) : mainClass;
    const pkg = mainClass.includes(".") ? mainClass.slice(0, mainClass.lastIndexOf(".")) : "";
    const match = state.files.find((file) => {
      if (!file.path.endsWith(".java")) return false;
      const parsed = parsedFile(file);
      return parsed.pkg === pkg && parsed.symbols.some((sym) => sym.indent === 0 && sym.name === type && sym.kind !== "method" && sym.kind !== "field");
    });
    return match ? match.path : null;
  }

  async function openProject(id) {
    hideWelcome();
    try { localStorage.setItem("lark-skip-welcome", "1"); } catch (e) {}
    const data = await api("GET", "/api/projects/" + encodeURIComponent(id));
    state.project = data.project;
    state.files = (data.project.files || []).filter((file) => !file.binary && !file.tooBig);
    state.dirs = data.project.dirs || [];
    state.open = [];
    state.active = null;
    state.selected = null;
    state.problems = [];
    state.dirty.clear();
    state.timers.forEach((timer) => clearTimeout(timer));
    state.timers.clear();
    docs.clear();
    parsedCache.clear();
    clearMarks();
    location.hash = encodeURIComponent(id);
    document.title = "Lark — " + data.project.name;
    $("path-note").textContent = data.project.path;
    renderProjects();
    renderTree();
    renderMains();
    renderProblems();
    const file = fileForMain(data.project.mainClass) || (state.files.find((item) => item.path.endsWith(".java")) || {}).path;
    if (file) openPath(file);
    else showEmpty();
    api("PUT", "/api/settings", { lastProject: id }).catch(() => {});
  }

  async function refreshProjects(id) {
    const data = await api("GET", "/api/projects");
    state.projects = data.projects;
    renderProjects();
    if (id) await openProject(id);
    else if (!state.projects.length) {
      state.project = null;
      state.files = [];
      state.dirs = [];
      showEmpty();
      renderTree();
    }
  }

  function classTemplate(kind, name, pkg) {
    const head = pkg ? "package " + pkg + ";\n\n" : "";
    if (kind === "interface") return head + "public interface " + name + " {\n}\n";
    if (kind === "record") return head + "public record " + name + "() {\n}\n";
    if (kind === "enum") return head + "public enum " + name + " {\n}\n";
    return head + "public class " + name + " {\n}\n";
  }

  async function createClass() {
    if (!state.project) return toast("Create a project first.");
    // Pause console autofocus while the dialog is open.
    const reply = $("console-reply");
    if (reply) reply.dataset.armed = "1";
    const dir = selectedDir();
    const values = await formDialog({
      title: "New class",
      ok: "Create",
      fields: [
        { name: "className", label: "Class name", value: "" },
        { name: "packageName", label: "Package", value: packageFor(dir) },
        { name: "kind", label: "Kind", type: "select", value: "class", options: ["class", "interface", "record", "enum"] }
      ]
    });
    if (!values) return;
    const name = values.className.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return toast("Use a Java name, like Book or Shelf.");
    const pkg = values.packageName.trim();
    if (pkg && !/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/.test(pkg)) return toast("Packages look like library or library.shelf.");
    const path = "src/" + (pkg ? pkg.replaceAll(".", "/") + "/" : "") + name + ".java";
    if (fileByPath(path)) return toast("There's already a file at " + path + ".");
    const content = classTemplate(values.kind, name, pkg);
    await writeNewFile(path, content);
  }

  function currentJavaParsed() {
    if (!state.active || !state.active.endsWith(".java")) return null;
    const file = fileByPath(state.active);
    return file ? parsedFile(file) : null;
  }

  function insertBeforeClassClose(code) {
    if (!cm || !code) return;
    const text = cm.getValue();
    let depth = 0;
    let insertPos = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          insertPos = i;
          break;
        }
      }
    }
    if (insertPos == null) insertPos = text.length;
    const before = text.slice(0, insertPos);
    const line = cm.posFromIndex(insertPos).line;
    const insert = (before.endsWith("\n") ? "" : "\n") + "\n" + code + (code.endsWith("\n") ? "" : "\n");
    suppress = true;
    cm.replaceRange(insert, cm.posFromIndex(insertPos), cm.posFromIndex(insertPos));
    suppress = false;
    cm.setCursor({ line: line + 2, ch: 0 });
    const file = fileByPath(state.active);
    if (file) file.content = cm.getValue();
    state.dirty.add(state.active);
    scheduleSave(state.active);
    renderStructure();
    refreshLocalProblems();
    renderProblems();
    markErrors();
  }

  async function pickFields(title, fields) {
    if (!fields.length) {
      toast("This class has no fields yet.");
      return null;
    }
    const box = $("modal-fields");
    $("modal-title").textContent = title;
    $("modal-note").textContent = "Choose fields, then continue.";
    $("modal-ok").textContent = "Generate";
    box.replaceChildren();
    fields.forEach((field, index) => {
      const label = document.createElement("label");
      label.className = "field-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "f" + index;
      input.checked = true;
      input.value = field.name;
      label.append(input, document.createTextNode(" " + (field.type || field.detail || "?") + " " + field.name));
      box.appendChild(label);
    });
    $("modal").hidden = false;
    box.querySelector("input")?.focus();
    return new Promise((resolve) => {
      modalResolve = (values) => {
        if (!values) return resolve(null);
        const chosen = fields.filter((_, index) => {
          const el = box.querySelector('input[name="f' + index + '"]');
          return el && el.checked;
        });
        resolve(chosen);
      };
    });
  }

  async function runAssist(act) {
    const parsed = currentJavaParsed();
    if (!parsed && act !== "explain") return toast("Open a Java class first.");
    if (act === "explain") {
      await formDialog({
        title: "Java modifiers",
        ok: "Got it",
        note:
          window.LarkJava.explain("private") + "\n\n" +
          window.LarkJava.explain("public") + "\n\n" +
          window.LarkJava.explain("static") + "\n\n" +
          window.LarkJava.explain("this"),
        fields: []
      });
      return;
    }
    const summary = window.LarkJava.classSummary(parsed);
    if (act === "summary") {
      const lines = [];
      summary.types.forEach((t) => lines.push(t.kind + " " + t.name));
      if (summary.fields.length) {
        lines.push("", "Fields:");
        summary.fields.forEach((f) => lines.push("  " + (f.mods || []).join(" ") + " " + (f.type || f.detail) + " " + f.name));
      }
      if (summary.constructors.length) {
        lines.push("", "Constructors:");
        summary.constructors.forEach((c) => lines.push("  " + (c.signature || c.name + c.detail)));
      }
      if (summary.methods.length) {
        lines.push("", "Methods:");
        summary.methods.forEach((m) => lines.push("  " + (m.signature || m.name + m.detail)));
      }
      await formDialog({ title: "Class members", ok: "Close", note: lines.join("\n") || "Nothing found.", fields: [] });
      return;
    }
    if (act === "getters") {
      const chosen = await pickFields("Generate getters / setters", summary.fields);
      if (!chosen || !chosen.length) return;
      const mode = await formDialog({
        title: "What to generate",
        ok: "Insert",
        fields: [{
          name: "which",
          label: "Generate",
          type: "select",
          value: "both",
          options: ["both", "getters", "setters"]
        }]
      });
      if (!mode) return;
      const wantGet = mode.which !== "setters";
      const wantSet = mode.which !== "getters";
      const code = window.LarkJava.generateGetterSetter(chosen, wantGet, wantSet);
      insertBeforeClassClose(code);
      toast("Inserted accessors.");
      return;
    }
    if (act === "ctor") {
      const chosen = await pickFields("Generate constructor", summary.fields);
      if (!chosen || !chosen.length) return;
      const type = summary.types.find((t) => t.kind === "class") || summary.types[0];
      if (!type) return toast("No class found in this file.");
      const code = window.LarkJava.generateConstructor(type.name, chosen);
      insertBeforeClassClose(code);
      toast("Inserted constructor.");
      return;
    }
    if (act === "import") {
      if (!cm) return;
      const token = cm.getTokenAt(cm.getCursor()).string.replace(/[^\w]/g, "");
      if (!token) return toast("Put the cursor on a type name first.");
      const projectTypes = [];
      state.files.forEach((file) => {
        if (!file.path.endsWith(".java")) return;
        const p = parsedFile(file);
        p.symbols.forEach((sym) => {
          if (sym.indent === 0 && (sym.kind === "class" || sym.kind === "interface" || sym.kind === "enum" || sym.kind === "record")) {
            projectTypes.push({ name: sym.name, pkg: p.pkg });
          }
        });
      });
      const suggestions = window.LarkJava.suggestImports(token, projectTypes);
      if (!suggestions.length) return toast("No import suggestion for " + token + ".");
      const already = parsed.imports || [];
      const pick = suggestions.find((s) => !already.includes(s)) || suggestions[0];
      if (already.includes(pick)) return toast(pick + " is already imported.");
      const text = cm.getValue();
      let insertAt = 0;
      const pkgMatch = text.match(/^\s*package\s+[\w.]+\s*;\s*\n/);
      if (pkgMatch) insertAt = pkgMatch[0].length;
      const line = "import " + pick + ";\n";
      suppress = true;
      cm.replaceRange(pkgMatch ? line : line + "\n", { line: 0, ch: insertAt }, { line: 0, ch: insertAt });
      suppress = false;
      const file = fileByPath(state.active);
      if (file) file.content = cm.getValue();
      state.dirty.add(state.active);
      scheduleSave(state.active);
      toast("Added import " + pick);
      return;
    }
    if (act === "fix") {
      const missing = (parsed.accessors || []).filter((info) => {
        const mods = info.field.mods || [];
        return mods.indexOf("private") >= 0 && (!info.hasGetter || !info.hasSetter);
      });
      if (!missing.length) return toast("No missing accessors found.");
      const fields = missing.map((info) => info.field);
      const code = window.LarkJava.generateGetterSetter(fields, true, true);
      insertBeforeClassClose(code);
      toast("Added missing getters/setters.");
    }
  }

  async function createFile() {
    if (!state.project) return toast("Create a project first.");
    const values = await formDialog({
      title: "New file",
      ok: "Create",
      fields: [{ name: "path", label: "Path", value: selectedDir() ? selectedDir() + "/" : "src/" }]
    });
    if (!values) return;
    const path = values.path.trim().replace(/^\/+/, "");
    if (fileByPath(path)) return toast("There's already a file at " + path + ".");
    let content = "";
    if (path.endsWith(".java")) {
      const base = path.slice(path.lastIndexOf("/") + 1, -5);
      const dir = parentDir(path);
      content = classTemplate("class", base, packageFor(dir));
    }
    await writeNewFile(path, content);
  }

  async function createFolder() {
    if (!state.project) return toast("Create a project first.");
    const values = await formDialog({
      title: "New folder",
      ok: "Create",
      fields: [{ name: "path", label: "Folder path", value: "src/" }]
    });
    if (!values) return;
    const path = values.path.trim().replace(/^\/+|\/+$/g, "");
    await api("POST", "/api/projects/" + encodeURIComponent(state.project.id) + "/mkdir", { path: path });
    if (!state.dirs.includes(path)) state.dirs.push(path);
    path.split("/").slice(0, -1).forEach((_, index, arr) => {
      const partial = path.split("/").slice(0, index + 1).join("/");
      if (partial && !state.dirs.includes(partial)) state.dirs.push(partial);
    });
    state.selected = path;
    renderTree();
  }

  async function writeNewFile(path, content) {
    await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", { path: path, content: content });
    state.files.push({ path: path, content: content });
    const parts = path.split("/");
    parts.pop();
    let acc = "";
    parts.forEach((part) => {
      acc = acc ? acc + "/" + part : part;
      if (!state.dirs.includes(acc)) state.dirs.push(acc);
    });
    openPath(path);
    renderMains();
  }

  async function removePath(path) {
    if (!state.project || !path) return;
    const yes = await formDialog({
      title: "Delete " + path.split("/").pop(),
      ok: "Delete",
      note: "This removes it from the project folder on disk."
    });
    if (!yes) return;
    await api("DELETE", "/api/projects/" + encodeURIComponent(state.project.id) + "/file?path=" + encodeURIComponent(path));
    const prefix = path + "/";
    state.files = state.files.filter((file) => file.path !== path && !file.path.startsWith(prefix));
    state.dirs = state.dirs.filter((dir) => dir !== path && !dir.startsWith(prefix));
    state.open.filter((item) => item === path || item.startsWith(prefix)).forEach((item) => docs.delete(item));
    state.open = state.open.filter((item) => item !== path && !item.startsWith(prefix));
    if (!state.active || state.active === path || state.active.startsWith(prefix)) {
      state.active = state.open[state.open.length - 1] || null;
      if (state.active) openPath(state.active);
      else showEmpty();
    }
    if (state.selected === path) state.selected = null;
    renderTree();
    renderTabs();
    renderMains();
  }

  async function renamePath(path) {
    const values = await formDialog({
      title: "Rename",
      ok: "Rename",
      fields: [{ name: "path", label: "New path", value: path }]
    });
    if (!values) return;
    const to = values.path.trim().replace(/^\/+/, "");
    if (!to || to === path) return;
    await api("POST", "/api/projects/" + encodeURIComponent(state.project.id) + "/move", { from: path, to: to });
    const file = fileByPath(path);
    if (file) {
      let content = file.content || "";
      content = fixPackage(path, to, content);
      file.path = to;
      file.content = content;
      if (content !== (docs.get(path) ? docs.get(path).getValue() : content)) {
        // content may have a new package line
      }
      const doc = docs.get(path);
      if (doc) {
        docs.delete(path);
        if (content !== doc.getValue()) {
          const cursor = doc.getCursor();
          doc.setValue(content);
          doc.setCursor(cursor);
        }
        docs.set(to, doc);
        await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", { path: to, content: content });
      }
    }
    state.dirs = state.dirs.map((dir) => dir === path ? to : dir.startsWith(path + "/") ? to + dir.slice(path.length) : dir);
    state.files.forEach((item) => {
      if (item.path.startsWith(path + "/")) item.path = to + item.path.slice(path.length);
    });
    state.open = state.open.map((item) => item === path ? to : item.startsWith(path + "/") ? to + item.slice(path.length) : item);
    if (state.active === path) state.active = to;
    state.selected = to;
    if (state.active === to) openPath(to);
    else renderTree();
  }

  function fixPackage(oldPath, newPath, content) {
    if (!oldPath.endsWith(".java") || !newPath.endsWith(".java")) return content;
    const oldPkg = packageFor(parentDir(oldPath));
    const newPkg = packageFor(parentDir(newPath));
    if (parentDir(oldPath).indexOf("src") !== 0 && parentDir(newPath).indexOf("src") !== 0) return content;
    if (oldPkg === newPkg) return content;
    if (!oldPkg && newPkg && !/^\s*package\s+/m.test(content)) return "package " + newPkg + ";\n\n" + content;
    if (!oldPkg) return content;
    const re = new RegExp("^(\\s*package\\s+)" + oldPkg.replace(/\./g, "\\.") + "(\\s*;)", "m");
    if (!re.test(content)) return content;
    if (!newPkg) return content.replace(re, "");
    return content.replace(re, "$1" + newPkg + "$2");
  }

  function openContext(x, y, node) {
    const menu = $("context");
    menu.replaceChildren();
    const items = [
      ["New class", () => { state.selected = node.dir ? node.path : parentDir(node.path); createClass(); }],
      ["New file", () => { state.selected = node.dir ? node.path : parentDir(node.path); createFile(); }],
      ["Rename", () => renamePath(node.path)],
      ["Delete", () => removePath(node.path)]
    ];
    items.forEach(([label, action]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        menu.hidden = true;
        action();
      });
      menu.appendChild(btn);
    });
    menu.hidden = false;
    menu.style.left = Math.min(x, window.innerWidth - 200) + "px";
    menu.style.top = Math.min(y, window.innerHeight - 180) + "px";
  }

  function formDialog({ title, ok, note, fields }) {
    $("modal-title").textContent = title;
    $("modal-ok").textContent = ok || "OK";
    $("modal-note").textContent = note || "";
    $("modal-note").hidden = !note;
    $("modal-note").style.whiteSpace = note && note.includes("\n") ? "pre-wrap" : "";
    const box = $("modal-fields");
    box.replaceChildren();
    (fields || []).forEach((field) => {
      const label = document.createElement("label");
      label.textContent = field.label;
      let input;
      if (field.type === "select") {
        input = document.createElement("select");
        field.options.forEach((option) => {
          const el = document.createElement("option");
          el.value = option;
          el.textContent = option;
          input.appendChild(el);
        });
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.spellcheck = false;
      }
      input.name = field.name;
      input.value = field.value || "";
      label.appendChild(input);
      box.appendChild(label);
    });
    $("modal").hidden = false;
    const first = box.querySelector("input, select");
    if (first) first.focus();
    return new Promise((resolve) => { modalResolve = resolve; });
  }

  function closeModal(values) {
    $("modal").hidden = true;
    if (modalResolve) modalResolve(values);
    modalResolve = null;
  }

  async function run() {
    if (!state.project) return toast("Create a project first.");
    if (state.job && !state.job.done) {
      await api("POST", "/api/run/" + state.job.id + "/stop", {});
      return;
    }
    await flushSaves();
    renderMains();
    const mainClass = $("main-class").value;
    setRunning(true, false);
    showConsoleTab("output");
    try {
      const data = await api("POST", "/api/run", {
        project: state.project.id,
        mainClass: mainClass,
        args: $("args").value,
        stdin: $("stdin").value
      });
      poll(data.id);
    } catch (err) {
      setRunning(false);
      toast(err.message);
    }
  }

  function isDialogTyping() {
    const modal = $("modal");
    if (modal && !modal.hidden) return true;
    const welcome = $("welcome");
    if (welcome && !welcome.hidden) return true;
    const el = document.activeElement;
    if (!el) return false;
    if (el.id === "console-input" || el.id === "console-send") return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function setRunning(running, acceptsInput) {
    $("run").textContent = running ? "Stop" : "Run";
    const reply = $("console-reply");
    if (!reply) return;
    const show = !!(running && acceptsInput);
    const wasHidden = reply.hidden;
    reply.hidden = !show;
    if (!show) {
      delete reply.dataset.armed;
      return;
    }
    // Only steal focus the first time the reply box appears — never while naming a class.
    if (wasHidden || !reply.dataset.armed) {
      reply.dataset.armed = "1";
      const input = $("console-input");
      if (input && !isDialogTyping()) {
        setTimeout(() => {
          if (isDialogTyping()) return;
          if (reply.hidden) return;
          input.focus();
        }, 120);
      }
    }
  }

  async function sendConsoleInput() {
    if (!state.job || state.job.done) return toast("Run a program first.");
    const input = $("console-input");
    const text = input.value;
    input.value = "";
    try {
      await api("POST", "/api/run/" + state.job.id + "/input", { text: text });
      input.focus();
    } catch (err) {
      toast(err.message);
    }
  }

  async function poll(id) {
    try {
      const job = await api("GET", "/api/run/" + id);
      state.job = job;
      renderConsole(job.output || "");
      state.problems = job.problems || [];
      renderProblems();
      markErrors();
      renderTabs();
      if (job.done) {
        setRunning(false, false);
        if (state.problems.some((problem) => problem.severity === "error")) {
          showConsoleTab("problems");
          const first = state.problems.find((problem) => problem.severity === "error");
          if (first) jumpTo(first.file, first.line, first.column || 1);
        }
        return;
      }
      setRunning(true, job.acceptsInput !== false && job.phase === "run");
      state.poll = setTimeout(() => poll(id), 200);
    } catch (err) {
      setRunning(false);
      toast(err.message);
    }
  }

  function renderConsole(text) {
    const pre = $("console-out");
    const stick = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 48;
    pre.replaceChildren();
    if (!text) {
      pre.textContent = "Run a class and the output shows up here.";
      return;
    }
    const re = /([\w./-]+\.java):(\d+)/g;
    let last = 0;
    let match;
    while ((match = re.exec(text))) {
      pre.appendChild(document.createTextNode(text.slice(last, match.index)));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "linkish";
      btn.textContent = match[0];
      const file = match[1];
      const line = Number(match[2]);
      btn.addEventListener("click", () => jumpTo(file, line, 1));
      pre.appendChild(btn);
      last = match.index + match[0].length;
    }
    pre.appendChild(document.createTextNode(text.slice(last)));
    if (stick) pre.scrollTop = pre.scrollHeight;
  }

  function renderProblems() {
    const box = $("problems");
    const problems = allProblems();
    const count = problems.length;
    $("tab-problems").textContent = count ? "Problems " + count : "Problems";
    box.replaceChildren();
    if (!count) {
      box.appendChild(note("No problems."));
      return;
    }
    problems.forEach((problem) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "problem " + problem.severity;
      const where = document.createElement("span");
      where.textContent = problem.file + ":" + problem.line;
      const msg = document.createElement("span");
      msg.textContent = problem.message;
      btn.append(where, msg);
      btn.addEventListener("click", () => {
        showConsoleTab("problems");
        jumpTo(problem.file, problem.line, problem.column || 1);
      });
      box.appendChild(btn);
    });
  }

  function showConsoleTab(which) {
    const output = which === "output";
    $("tab-output").classList.toggle("on", output);
    $("tab-problems").classList.toggle("on", !output);
    $("console-out").hidden = !output;
    $("problems").hidden = output;
  }

  function clearMarks() {
    lineMarks.forEach((mark) => mark.doc.removeLineClass(mark.line, "background", mark.cls));
    lineMarks.length = 0;
  }

  function markErrors() {
    clearMarks();
    allProblems().forEach((problem) => {
      const doc = docs.get(problem.file) || docs.get(resolveProblemFile(problem.file));
      if (!doc) return;
      const line = problem.line - 1;
      if (line < 0 || line >= doc.lineCount()) return;
      const cls = problem.severity === "warning" ? "cm-warn-line" : "cm-problem-line";
      doc.addLineClass(line, "background", cls);
      lineMarks.push({ doc: doc, line: line, cls: cls });
    });
  }

  function resolveProblemFile(path) {
    if (fileByPath(path)) return path;
    const found = state.files.find((file) => file.path === path || file.path.endsWith("/" + path) || file.path.endsWith(path));
    return found ? found.path : path;
  }

  function jumpTo(path, line, column) {
    const resolved = resolveProblemFile(path);
    if (!fileByPath(resolved)) return;
    openPath(resolved);
    const l = Math.max(0, line - 1);
    const ch = Math.max(0, (column || 1) - 1);
    cm.setCursor({ line: l, ch: ch });
    cm.scrollIntoView({ line: l, ch: ch }, 80);
    cm.focus();
  }

  function closePopovers() {
    document.querySelectorAll(".popover").forEach((el) => { el.hidden = true; });
    $("context").hidden = true;
  }

  function togglePopover(button) {
    const pop = $(button.dataset.pop);
    const willOpen = pop.hidden;
    closePopovers();
    if (!willOpen) return;
    pop.hidden = false;
    const rect = button.getBoundingClientRect();
    pop.style.top = (rect.bottom + 6) + "px";
    pop.style.left = Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8) + "px";
  }

  function toggleFiles() {
    if (window.innerWidth <= 760) {
      $("files").classList.toggle("open");
      return;
    }
    $("shell").classList.toggle("files-collapsed");
    if (cm) cm.refresh();
  }

  function refreshLocalProblems() {
    if (!state.active || !state.active.endsWith(".java")) {
      state.localProblems = [];
      return;
    }
    const file = fileByPath(state.active);
    if (!file) {
      state.localProblems = [];
      return;
    }
    const warnings = parsedFile(file).warnings || [];
    state.localProblems = warnings.map((item) => ({
      file: file.path,
      line: item.line,
      column: item.column || 1,
      severity: item.severity || "warning",
      message: item.message,
      code: item.code || ""
    }));
  }

  function allProblems() {
    const compile = state.problems || [];
    const local = state.localProblems || [];
    return compile.concat(local);
  }

  function openPalette() {
    if (!$("modal").hidden) return;
    closePopovers();
    paletteIndex = 0;
    $("palette").hidden = false;
    $("palette-input").value = "";
    renderPalette("");
    $("palette-input").focus();
  }

  function renderPalette(query) {
    const q = query.trim().toLowerCase();
    const files = state.files.map((file) => file.path).filter((path) => !q || path.toLowerCase().includes(q));
    const list = $("palette-list");
    list.replaceChildren();
    if (!files.length) {
      list.appendChild(note("No matching file."));
      return;
    }
    files.slice(0, 40).forEach((path, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "palette-item" + (index === paletteIndex ? " active" : "");
      btn.textContent = path;
      btn.addEventListener("click", () => {
        $("palette").hidden = true;
        openPath(path);
      });
      list.appendChild(btn);
    });
  }

  function paletteFiles() {
    const q = $("palette-input").value.trim().toLowerCase();
    return state.files.map((file) => file.path).filter((path) => !q || path.toLowerCase().includes(q)).slice(0, 40);
  }

  async function newProject() {
    const values = await formDialog({
      title: "New project",
      ok: "Create",
      fields: [
        { name: "name", label: "Name", value: "" },
        { name: "template", label: "Start from", type: "select", value: "empty", options: ["empty", "library"] }
      ]
    });
    if (!values || !values.name.trim()) return;
    const data = await api("POST", "/api/projects", { name: values.name.trim(), template: values.template });
    await refreshProjects(data.id);
  }

  async function deleteProject() {
    if (!state.project) return;
    const yes = await formDialog({
      title: "Delete " + state.project.name,
      ok: "Delete",
      note: "The folder is removed from this computer."
    });
    if (!yes) return;
    const id = state.project.id;
    await api("DELETE", "/api/projects/" + encodeURIComponent(id));
    state.projects = state.projects.filter((project) => project.id !== id);
    const next = state.projects[0];
    if (next) await openProject(next.id);
    else {
      state.project = null;
      state.files = [];
      state.dirs = [];
      state.open = [];
      renderProjects();
      renderTree();
      showEmpty();
    }
  }

  async function downloadZip() {
    if (!state.project) return;
    const res = await fetch("/api/projects/" + encodeURIComponent(state.project.id) + "/export");
    if (!res.ok) return toast("Couldn't download the project.");
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = state.project.id + ".zip";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importFolder(fileList) {
    const files = [];
    for (const file of fileList) {
      if (file.size > 400000) continue;
      const rel = file.webkitRelativePath || file.name;
      const path = rel.split("/").slice(1).join("/");
      if (!path || path.split("/").some((part) => part.startsWith(".") || part === "out" || part === "bin")) continue;
      files.push({ path: path, content: await file.text() });
    }
    if (!files.length) return toast("That folder didn't have any text files Lark could read.");
    const name = (fileList[0].webkitRelativePath || "Imported").split("/")[0];
    const data = await api("POST", "/api/import", { name: name, files: files });
    await refreshProjects(data.id);
  }

  async function importZip(file) {
    const name = file.name.replace(/\.zip$/i, "") || "Imported";
    const res = await fetch("/api/import?name=" + encodeURIComponent(name), {
      method: "POST",
      headers: { "Content-Type": "application/zip", "X-Lark": "1" },
      body: file
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Couldn't read that zip." }));
    if (!res.ok || data.ok === false) throw new Error(data.error || "Couldn't read that zip.");
    await refreshProjects(data.id);
  }

  let githubPoll = 0;
  let githubRepos = [];
  let githubTarget = null;

  function openDrawer() {
    closePopovers();
    const drawer = $("drawer");
    const scrim = $("scrim");
    drawer.hidden = false;
    scrim.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add("show");
      scrim.classList.add("show");
    });
    showGithub();
    if (state.settings && state.settings.tokenSet) loadRepos();
  }

  function closeDrawer() {
    $("drawer").classList.remove("show");
    $("scrim").classList.remove("show");
    setTimeout(() => {
      if ($("drawer").classList.contains("show")) return;
      $("drawer").hidden = true;
      $("scrim").hidden = true;
    }, 180);
  }

  function showGithub() {
    const signedIn = Boolean(state.settings && state.settings.tokenSet);
    $("gh-signed-out").hidden = signedIn;
    $("gh-signed-in").hidden = !signedIn;
    $("github").classList.toggle("connected", signedIn);
    if (signedIn) {
      const login = state.settings.githubLogin ? "Connected as @" + state.settings.githubLogin : "Connected";
      $("gh-status").textContent = login;
    }
    renderGithubTarget();
  }

  function renderGithubTarget() {
    const target = $("gh-target");
    if (!target) return;
    if (!githubTarget) {
      target.textContent = "Choose a repository to push this project, or create a new one.";
      return;
    }
    target.textContent = "Push goes to " + githubTarget.owner + "/" + githubTarget.repo + " on " + githubTarget.branch + ".";
  }

  async function saveToken() {
    const token = $("gh-token").value.trim();
    if (!token) return toast("Paste the token from GitHub first.");
    $("gh-wait").textContent = "Checking that token with GitHub…";
    try {
      const data = await api("POST", "/api/github/token", { token: token });
      state.settings.tokenSet = Boolean(data.login);
      state.settings.githubLogin = data.login || "";
      $("gh-token").value = "";
      $("gh-wait").textContent = "";
      showGithub();
      if (data.login) {
        toast("Connected as @" + data.login);
        loadRepos();
      }
    } catch (err) {
      $("gh-wait").textContent = err.message;
      toast(err.message);
    }
  }

  async function signIn() {
    const popup = window.open("", "lark-github", "width=540,height=760");
    $("gh-wait").textContent = "GitHub is opening. Authorize Lark there, and choose All repositories.";
    try {
      const before = await api("GET", "/api/github/status");
      const data = await api("POST", "/api/github/login");
      if (popup) popup.location.href = data.url;
      else window.open(data.url, "_blank", "noopener");
      window.clearInterval(githubPoll);
      let ticks = 0;
      githubPoll = window.setInterval(async () => {
        ticks += 1;
        if (ticks > 90) {
          window.clearInterval(githubPoll);
          $("gh-wait").textContent = "Still waiting. If you closed the window, click Sign in again.";
          return;
        }
        try {
          const status = await api("GET", "/api/github/status");
          if (status.generation !== before.generation && status.tokenSet) {
            window.clearInterval(githubPoll);
            state.settings.tokenSet = true;
            state.settings.githubLogin = status.login || "";
            $("gh-wait").textContent = "";
            showGithub();
            toast("Signed in as @" + (status.login || "GitHub"));
            loadRepos();
          }
        } catch (err) {
          // Keep waiting. The next tick tries again.
        }
      }, 1000);
    } catch (err) {
      if (popup) popup.close();
      $("gh-wait").textContent = err.message;
    }
  }

  function renderRepoList() {
    const box = $("gh-repo-list");
    const query = ($("gh-filter").value || "").trim().toLowerCase();
    box.replaceChildren();
    const rows = githubRepos.filter((repo) => !query || repo.fullName.toLowerCase().includes(query));
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = githubRepos.length ? "No repository matches that search." : "No repositories yet. Choose All repositories when you authorize, then sign in again.";
      box.appendChild(empty);
      return;
    }
    rows.forEach((repo) => {
      const row = document.createElement("div");
      const selected = githubTarget && githubTarget.owner === repo.owner && githubTarget.repo === repo.name;
      row.className = "repo" + (selected ? " on" : "");
      const meta = document.createElement("div");
      meta.className = "meta";
      const title = document.createElement("strong");
      title.textContent = repo.fullName;
      const detail = document.createElement("span");
      detail.textContent = (repo.private ? "Private" : "Public") + " · " + (repo.defaultBranch || "main");
      meta.append(title, detail);
      const clone = document.createElement("button");
      clone.type = "button";
      clone.className = "action";
      clone.textContent = "Clone";
      clone.addEventListener("click", (event) => {
        event.stopPropagation();
        cloneRepo(repo);
      });
      row.addEventListener("click", () => {
        githubTarget = { owner: repo.owner, repo: repo.name, branch: repo.defaultBranch || "main", create: false };
        renderGithubTarget();
        renderRepoList();
      });
      row.append(meta, clone);
      box.appendChild(row);
    });
  }

  async function loadRepos() {
    const box = $("gh-repo-list");
    box.textContent = "Loading repositories…";
    try {
      const data = await api("GET", "/api/github/repos");
      githubRepos = data.repos || [];
      renderRepoList();
    } catch (err) {
      box.textContent = err.message;
    }
  }

  async function pushProject(createNew) {
    if (!state.project) return toast("Open a project first.");
    let target = githubTarget;
    if (createNew) {
      const repo = (state.project.id || "project").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "project";
      target = { owner: state.settings.githubLogin || "", repo: repo, branch: "main", create: true };
    }
    if (!target || !target.owner || !target.repo) return toast("Choose a repository first.");
    await flushSaves();
    $("gh-result").textContent = createNew ? "Creating and pushing…" : "Pushing…";
    $("gh-push").disabled = true;
    try {
      const data = await api("POST", "/api/github/push", {
        project: state.project.id,
        owner: target.owner,
        repo: target.repo,
        branch: target.branch || "main",
        message: $("gh-message").value.trim(),
        create: Boolean(target.create)
      });
      $("gh-result").textContent = "";
      const link = document.createElement("a");
      link.href = data.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Pushed " + data.files + " files";
      $("gh-result").appendChild(link);
      githubTarget = { owner: target.owner, repo: target.repo, branch: target.branch || "main", create: false };
      renderGithubTarget();
      loadRepos();
    } catch (err) {
      $("gh-result").textContent = err.message;
    } finally {
      $("gh-push").disabled = false;
    }
  }

  async function cloneRepo(repo) {
    $("gh-result").textContent = "Cloning " + repo.fullName + "…";
    try {
      const data = await api("POST", "/api/github/pull", {
        owner: repo.owner,
        repo: repo.name,
        branch: repo.defaultBranch || "main"
      });
      toast("Cloned " + repo.fullName + " (" + data.files + " files)");
      closeDrawer();
      await refreshProjects(data.id);
    } catch (err) {
      $("gh-result").textContent = err.message;
    }
  }

  function savePanels() {
    localStorage.setItem("lark-panels", JSON.stringify({
      files: getComputedStyle(document.documentElement).getPropertyValue("--files-w").trim(),
      console: getComputedStyle(document.documentElement).getPropertyValue("--console-h").trim()
    }));
  }

  function bindSplitters() {
    const style = document.documentElement.style;
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem("lark-panels") || "null"); } catch (e) { return null; }
    })();
    if (saved) {
      if (saved.files) style.setProperty("--files-w", saved.files);
      if (saved.console) style.setProperty("--console-h", saved.console);
    }
    function drag(handle, kind, onMove) {
      if (!handle) return;
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add(kind === "row" ? "dragging" : "dragging-col");
        const start = {
          x: event.clientX,
          y: event.clientY,
          files: $("files").getBoundingClientRect().width,
          console: $("console").getBoundingClientRect().height,
          center: $("center").getBoundingClientRect().height
        };
        const move = (ev) => {
          if (!handle.hasPointerCapture(ev.pointerId)) return;
          onMove(ev, start);
        };
        const up = (ev) => {
          try { handle.releasePointerCapture(ev.pointerId); } catch (e) {}
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          document.body.classList.remove("dragging", "dragging-col");
          savePanels();
          if (cm) cm.refresh();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });
    }
    drag(document.querySelector("[data-split=files]"), "col", (ev, start) => {
      style.setProperty("--files-w", Math.min(420, Math.max(160, start.files + ev.clientX - start.x)) + "px");
    });
    const consoleSplit = document.querySelector("[data-split=console]");
    drag(consoleSplit, "row", (ev, start) => {
      const max = Math.max(140, start.center - 96);
      const next = Math.min(max, Math.max(72, start.console - (ev.clientY - start.y)));
      style.setProperty("--console-h", next + "px");
    });
    if (consoleSplit) {
      consoleSplit.addEventListener("dblclick", () => {
        style.setProperty("--console-h", "188px");
        savePanels();
        if (cm) cm.refresh();
      });
    }
  }

  function isTyping(target) {
    if (!target) return false;
    if (target.closest && target.closest(".CodeMirror")) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }

  function bind() {
    $("run").addEventListener("click", () => run().catch((err) => toast(err.message)));
    $("new-class").addEventListener("click", () => createClass().catch((err) => toast(err.message)));
    $("empty-new").addEventListener("click", () => createClass().catch((err) => toast(err.message)));
    $("new-file").addEventListener("click", () => createFile().catch((err) => toast(err.message)));
    $("new-folder").addEventListener("click", () => createFolder().catch((err) => toast(err.message)));
    $("files-toggle").addEventListener("click", toggleFiles);
    $("project").addEventListener("change", () => {
      const id = $("project").value;
      if (id && (!state.project || state.project.id !== id)) {
        openProject(id).catch((err) => toast(err.message));
      }
    });
    $("main-class").addEventListener("change", () => {
      if (!state.project) return;
      state.project.mainClass = $("main-class").value;
      api("PUT", "/api/projects/" + encodeURIComponent(state.project.id), { mainClass: state.project.mainClass })
        .catch((err) => toast(err.message));
    });
    $("project-menu").addEventListener("click", (event) => togglePopover(event.currentTarget));
    if ($("java-assist")) $("java-assist").addEventListener("click", (event) => togglePopover(event.currentTarget));
    $("theme").addEventListener("click", (event) => togglePopover(event.currentTarget));
    $("settings").addEventListener("click", (event) => togglePopover(event.currentTarget));
    $("help").addEventListener("click", (event) => togglePopover(event.currentTarget));
    $("setting-font").addEventListener("input", () => {
      applyDisplay({ fontSize: Number($("setting-font").value) }, false);
    });
    $("setting-font").addEventListener("change", () => {
      applyDisplay({ fontSize: Number($("setting-font").value) }, true);
    });
    $("setting-zoom").addEventListener("input", () => {
      applyDisplay({ zoom: Number($("setting-zoom").value) }, false);
    });
    $("setting-zoom").addEventListener("change", () => {
      applyDisplay({ zoom: Number($("setting-zoom").value) }, true);
    });
    $("setting-zoom-reset").addEventListener("click", () => applyDisplay({ zoom: 100 }, true));
    const feedInput = $("setting-update-feed");
    if (feedInput) {
      feedInput.addEventListener("change", async () => {
        try {
          state.settings = await api("PUT", "/api/settings", { updateFeed: feedInput.value.trim() });
          toast("Update feed saved.");
        } catch (err) {
          toast(err.message);
        }
      });
    }
    const checkBtn = $("setting-check-updates");
    if (checkBtn) checkBtn.addEventListener("click", () => checkUpdates(true));
    on("update-later", "click", () => hideUpdateBanner());
    on("update-skip", "click", () => skipUpdate().catch((err) => toast(err.message)));
    on("update-now", "click", () => installUpdate().catch((err) => toast(err.message)));
    on("update-restart", "click", () => restartAfterUpdate().catch((err) => toast(err.message)));
    $("menu-project").addEventListener("click", (event) => {
      const act = event.target.dataset.act;
      if (!act) return;
      closePopovers();
      const action = {
        "new-project": newProject,
        "import-folder": () => $("import-folder").click(),
        "import-zip": () => $("import-zip").click(),
        download: downloadZip,
        "copy-path": async () => {
          if (!state.project) return;
          await navigator.clipboard.writeText(state.project.path);
          toast("Copied " + state.project.path);
        },
        "show-welcome": () => { showWelcome(); },
        "delete-project": deleteProject
      }[act];
      if (action) Promise.resolve(action()).catch((err) => toast(err.message));
    });
    if ($("menu-assist")) {
      $("menu-assist").addEventListener("click", (event) => {
        const act = event.target.dataset.assist;
        if (!act) return;
        closePopovers();
        runAssist(act).catch((err) => toast(err.message));
      });
    }
    document.querySelectorAll("[data-welcome]").forEach((button) => {
      button.addEventListener("click", () => {
        const act = button.dataset.welcome;
        if (act === "new-project") newProject().catch((err) => toast(err.message));
        else if (act === "import-folder") $("import-folder").click();
        else if (act === "import-zip") $("import-zip").click();
        else if (act === "github") $("github").click();
      });
    });
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.themeChoice, true);
        closePopovers();
      });
    });
    $("import-folder").addEventListener("change", (event) => {
      const files = [...event.target.files];
      event.target.value = "";
      if (files.length) importFolder(files).catch((err) => toast(err.message));
    });
    $("import-zip").addEventListener("change", (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      if (file) importZip(file).catch((err) => toast(err.message));
    });
    $("github").addEventListener("click", openDrawer);
    $("drawer-close").addEventListener("click", closeDrawer);
    $("scrim").addEventListener("click", closeDrawer);
    const ghSignIn = $("gh-oauth") || $("gh-signin");
    if (ghSignIn) ghSignIn.addEventListener("click", () => signIn());
    $("gh-create-token").addEventListener("click", () => {
      window.open(
        "https://github.com/settings/tokens/new?description=Lark&scopes=repo",
        "_blank",
        "noopener"
      );
      $("gh-wait").textContent = "After GitHub shows the token, copy it, come back here, and paste it below.";
      $("gh-token").focus();
    });
    $("gh-save").addEventListener("click", () => saveToken());
    $("gh-token").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveToken();
      }
    });
    $("gh-filter").addEventListener("input", renderRepoList);
    $("gh-forget").addEventListener("click", () => {
      $("gh-token").value = "";
      api("POST", "/api/github/token", { token: "" }).then(() => {
        state.settings.tokenSet = false;
        state.settings.githubLogin = "";
        githubRepos = [];
        githubTarget = null;
        showGithub();
      }).catch((err) => toast(err.message));
    });
    $("gh-push").addEventListener("click", () => pushProject(false));
    $("gh-new-repo").addEventListener("click", () => pushProject(true));
    $("tab-output").addEventListener("click", () => showConsoleTab("output"));
    $("tab-problems").addEventListener("click", () => showConsoleTab("problems"));
    $("clear-console").addEventListener("click", () => {
      state.problems = [];
      clearMarks();
      renderProblems();
      renderConsole("");
      showConsoleTab("output");
    });
    $("console-send").addEventListener("click", () => {
      sendConsoleInput().catch((err) => toast(err.message));
    });
    $("console-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendConsoleInput().catch((err) => toast(err.message));
      }
    });
    $("modal-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const values = {};
      $("modal-fields").querySelectorAll("input, select").forEach((input) => { values[input.name] = input.value; });
      closeModal(values);
    });
    $("modal-cancel").addEventListener("click", () => closeModal(null));
    $("modal").addEventListener("click", (event) => { if (event.target === $("modal")) closeModal(null); });
    $("palette").addEventListener("click", (event) => { if (event.target === $("palette")) $("palette").hidden = true; });
    $("palette-input").addEventListener("input", () => {
      paletteIndex = 0;
      renderPalette($("palette-input").value);
    });
    $("palette-input").addEventListener("keydown", (event) => {
      const files = paletteFiles();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        paletteIndex = Math.min(files.length - 1, paletteIndex + 1);
        renderPalette($("palette-input").value);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        paletteIndex = Math.max(0, paletteIndex - 1);
        renderPalette($("palette-input").value);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const path = files[paletteIndex];
        $("palette").hidden = true;
        if (path) openPath(path);
      } else if (event.key === "Escape") {
        $("palette").hidden = true;
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".popover") || event.target.closest("[data-pop]") || event.target.closest("#context")) return;
      closePopovers();
    });
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        if (!$("palette").hidden) { $("palette").hidden = true; return; }
        if (!$("modal").hidden) { closeModal(null); return; }
        if (!$("drawer").hidden) { closeDrawer(); return; }
        closePopovers();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (!$("modal").hidden || isDialogTyping()) return;
        event.preventDefault();
        run().catch((err) => toast(err.message));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        flushSaves().catch((err) => toast(err.message));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+" || event.code === "Equal")) {
        event.preventDefault();
        bumpZoom(5);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "-" || event.code === "Minus")) {
        event.preventDefault();
        bumpZoom(-5);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (key === "0" || event.code === "Digit0")) {
        event.preventDefault();
        applyDisplay({ zoom: 100 }, true);
        return;
      }
      if (isTyping(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && key === "p") {
        event.preventDefault();
        openPalette();
      } else if ((event.ctrlKey || event.metaKey) && key === "b") {
        event.preventDefault();
        toggleFiles();
      }
    });
    window.addEventListener("resize", () => {
      const consoleH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--console-h")) || 188;
      const center = $("center").getBoundingClientRect().height;
      const max = Math.max(140, center - 96);
      if (consoleH > max) {
        document.documentElement.style.setProperty("--console-h", max + "px");
        savePanels();
      }
      if (cm) cm.refresh();
    });
    bindSplitters();
  }

  function hideUpdateBanner() {
    const banner = $("update-banner");
    if (banner) banner.hidden = true;
  }

  function showUpdateBanner(info) {
    const banner = $("update-banner");
    if (!banner) return;
    state.updateInfo = info;
    $("update-title").textContent = "Lark " + (info.latest || "") + " is ready";
    $("update-notes").textContent = info.notes || ("You have " + (info.current || "") + ".");
    banner.hidden = false;
  }

  async function checkUpdates(manual) {
    const status = $("setting-update-status");
    try {
      if (manual && $("setting-update-feed") && state.settings) {
        const feed = $("setting-update-feed").value.trim();
        if (feed !== (state.settings.updateFeed || "")) {
          state.settings = await api("PUT", "/api/settings", { updateFeed: feed });
        }
      }
      const info = await api("GET", "/api/update/check");
      if (status) status.textContent = info.message || "";
      if (info.available) showUpdateBanner(info);
      else {
        hideUpdateBanner();
        if (manual) toast(info.message || "No updates.");
      }
      return info;
    } catch (err) {
      if (status) status.textContent = err.message;
      if (manual) toast(err.message);
      return null;
    }
  }

  async function skipUpdate() {
    const info = state.updateInfo;
    if (!info || !info.latest) return hideUpdateBanner();
    await api("POST", "/api/update/skip", { version: info.latest });
    hideUpdateBanner();
    toast("Skipped Lark " + info.latest + ".");
  }

  async function installUpdate() {
    const info = state.updateInfo || {};
    toast("Downloading update…");
    const result = await api("POST", "/api/update/install", { download: info.download || "" });
    toast(result.message || "Update ready. Restart Lark.");
    const restartBtn = $("update-restart");
    const nowBtn = $("update-now");
    if (result.canRestart && restartBtn) {
      if ($("update-banner")) $("update-banner").hidden = false;
      restartBtn.hidden = false;
      if (nowBtn) nowBtn.hidden = true;
      $("update-title").textContent = "Update ready";
      $("update-notes").textContent = result.message || "Restart Lark to finish.";
    } else {
      hideUpdateBanner();
    }
  }

  async function restartAfterUpdate() {
    toast("Restarting Lark…");
    await api("POST", "/api/update/restart", {});
  }

  async function boot() {
    try {
      ensureEditor();
      bind();
      state.settings = await api("GET", "/api/settings");
      applyTheme(state.settings.theme, false);
      applyDisplay({
        fontSize: state.settings.fontSize || 14,
        zoom: state.settings.zoom || 100
      }, false);
      if ($("setting-update-feed")) $("setting-update-feed").value = state.settings.updateFeed || "";
      showGithub();
      const version = (state.settings.javaVersion || "").split(".")[0];
      $("status-java").textContent = version ? "Java " + version : "";
      const data = await api("GET", "/api/projects");
      state.projects = data.projects;
      renderProjects();
      const hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
      const known = (id) => state.projects.some((project) => project.id === id);
      const skipWelcome = (() => {
        try { return localStorage.getItem("lark-skip-welcome") === "1"; } catch (e) { return false; }
      })();
      const id = known(hash) ? hash : (skipWelcome && known(state.settings.lastProject) ? state.settings.lastProject : "");
      $("boot").hidden = true;
      if (id) {
        try { localStorage.setItem("lark-skip-welcome", "1"); } catch (e) {}
        await openProject(id);
      } else if (state.projects.length && known(state.settings.lastProject) && skipWelcome) {
        await openProject(state.settings.lastProject);
      } else {
        showWelcome();
      }
      if (cm && state.active) {
        cm.refresh();
        cm.focus();
      }
      checkUpdates(false).catch(() => {});
    } catch (err) {
      $("boot").textContent = err.message || "Lark couldn't open.";
    }
  }

  boot();
})();
