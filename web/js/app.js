(function () {
  const THEME_NAMES = { ink: "Ink", paper: "Paper", tide: "Tide", copper: "Copper", chalk: "Chalk" };
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
    return THEME_NAMES[theme] || "Ink";
  }

  function applyTheme(theme, save) {
    if (!THEME_NAMES[theme]) theme = "ink";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("lark-theme", theme); } catch (e) {}
    $("theme").textContent = themeName(theme);
    if (save && state.settings) {
      api("PUT", "/api/settings", { theme: theme }).catch((err) => toast(err.message));
    }
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
      autoCloseBrackets: true,
      styleActiveLine: true,
      extraKeys: {
        "Tab": function (editor) {
          if (editor.somethingSelected()) editor.indentSelection("add");
          else editor.replaceSelection("    ", "end");
        },
        "Shift-Tab": "indentLess",
        "Ctrl-/": "toggleComment",
        "Cmd-/": "toggleComment",
        "Ctrl-F": "find",
        "Cmd-F": "find",
        "Ctrl-Space": (editor) => CodeMirror.showHint(editor, completeHint, { completeSingle: false })
      }
    });
    cm.on("change", () => {
      if (suppress || !state.active) return;
      const path = state.active;
      const file = fileByPath(path);
      if (file) file.content = cm.getValue();
      state.dirty.add(path);
      renderTabs();
      clearMarks();
      scheduleSave(path);
      renderOutline();
      setSaveStatus("Saving…");
    });
    cm.on("cursorActivity", () => {
      const cursor = cm.getCursor();
      $("status-cursor").textContent = "Ln " + (cursor.line + 1) + ", Col " + (cursor.ch + 1);
    });
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
      parsedFile(file).symbols.forEach((sym) => {
        if (!names.has(sym.name)) names.set(sym.name, sym.kind);
      });
    });
    const lower = prefix.toLowerCase();
    const list = [];
    names.forEach((kind, name) => {
      if (prefix && !name.startsWith(prefix) && !name.toLowerCase().startsWith(lower)) return;
      list.push({ text: name, displayText: name + "  " + kind });
    });
    if (prefix && "println".startsWith(lower)) {
      list.push({ text: "System.out.println(", displayText: "println" });
    }
    list.sort((a, b) => a.displayText.localeCompare(b.displayText));
    if (!list.length) return null;
    return {
      list: list.slice(0, 40),
      from: CodeMirror.Pos(cursor.line, from),
      to: CodeMirror.Pos(cursor.line, cursor.ch)
    };
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
    row.append(chev, name);
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
    $("empty").hidden = false;
    $("editor").hidden = true;
    renderOutline();
    $("status-path").textContent = state.project ? state.project.name : "Lark";
  }

  function openPath(path) {
    const file = fileByPath(path);
    if (!file) return;
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
    renderOutline();
    const cursor = cm.getCursor();
    $("status-cursor").textContent = "Ln " + (cursor.line + 1) + ", Col " + (cursor.ch + 1);
    const crumbs = path.split("/").join(" / ");
    const pkg = path.endsWith(".java") ? parsedFile(file).pkg : "";
    $("status-path").textContent = (pkg ? "package " + pkg + "  ·  " : "") + crumbs;
    document.title = "Lark — " + (state.project ? state.project.name : path);
    markErrors();
  }

  function renderOutline() {
    const box = $("outline-list");
    box.replaceChildren();
    const file = state.active ? fileByPath(state.active) : null;
    if (!file || !file.path.endsWith(".java")) {
      box.appendChild(note("Open a Java file to see its types."));
      return;
    }
    const symbols = parsedFile(file).symbols.filter((sym) => sym.kind !== "field");
    if (!symbols.length) {
      box.appendChild(note("No types in this file."));
      return;
    }
    symbols.forEach((sym) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "outline-row " + sym.kind;
      btn.style.paddingLeft = (8 + sym.indent * 12) + "px";
      btn.textContent = sym.name + (sym.kind === "method" ? sym.detail || "()" : "");
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
    setRunning(true);
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

  function setRunning(running) {
    $("run").textContent = running ? "Stop" : "Run";
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
        setRunning(false);
        if (state.problems.some((problem) => problem.severity === "error")) {
          showConsoleTab("problems");
          const first = state.problems.find((problem) => problem.severity === "error");
          if (first) jumpTo(first.file, first.line, first.column || 1);
        }
        return;
      }
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
    const count = state.problems.length;
    $("tab-problems").textContent = count ? "Problems " + count : "Problems";
    box.replaceChildren();
    if (!count) {
      box.appendChild(note("No problems."));
      return;
    }
    state.problems.forEach((problem) => {
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
    state.problems.forEach((problem) => {
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
      $("outline").classList.remove("open");
      return;
    }
    $("shell").classList.toggle("files-collapsed");
    if (cm) cm.refresh();
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

  function openDrawer() {
    closePopovers();
    $("drawer").hidden = false;
    $("scrim").hidden = false;
    if (state.settings && state.settings.githubLogin) {
      $("gh-status").textContent = "Connected as @" + state.settings.githubLogin;
      if (!$("gh-owner").value) $("gh-owner").value = state.settings.githubLogin;
    } else if (state.settings && state.settings.tokenSet) {
      $("gh-status").textContent = "A token is saved";
    } else {
      $("gh-status").textContent = "Not connected";
    }
    if (state.project && !$("gh-repo").value) $("gh-repo").value = state.project.id;
    if (state.settings && state.settings.tokenSet) loadRepos();
  }

  function closeDrawer() {
    $("drawer").hidden = true;
    $("scrim").hidden = true;
  }

  async function saveToken() {
    const token = $("gh-token").value.trim();
    if (!token) return toast("Paste a token, or use Forget token.");
    try {
      const data = await api("POST", "/api/github/token", { token: token });
      state.settings.tokenSet = Boolean(data.login);
      state.settings.githubLogin = data.login || "";
      $("gh-token").value = "";
      $("gh-status").textContent = data.login ? "Connected as @" + data.login : "Not connected";
      if (data.login) {
        $("gh-owner").value = data.login;
        toast("Connected as @" + data.login);
        loadRepos();
      }
    } catch (err) {
      $("gh-result").textContent = err.message;
    }
  }

  async function loadRepos() {
    try {
      const data = await api("GET", "/api/github/repos");
      const select = $("gh-repos");
      select.replaceChildren();
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = data.repos.length ? "Choose a repository" : "No repositories yet";
      select.appendChild(blank);
      data.repos.forEach((repo) => {
        const opt = document.createElement("option");
        opt.value = repo.fullName;
        opt.textContent = repo.fullName + (repo.private ? "  · private" : "");
        opt.dataset.owner = repo.owner;
        opt.dataset.name = repo.name;
        opt.dataset.branch = repo.defaultBranch || "main";
        select.appendChild(opt);
      });
    } catch (err) {
      $("gh-result").textContent = err.message;
    }
  }

  async function pushProject() {
    if (!state.project) return toast("Open a project first.");
    await flushSaves();
    $("gh-result").textContent = "Pushing…";
    $("gh-push").disabled = true;
    try {
      const data = await api("POST", "/api/github/push", {
        project: state.project.id,
        owner: $("gh-owner").value.trim(),
        repo: $("gh-repo").value.trim(),
        branch: $("gh-branch").value.trim() || "main",
        message: $("gh-message").value.trim(),
        create: $("gh-create").checked
      });
      $("gh-result").textContent = "";
      const link = document.createElement("a");
      link.href = data.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Pushed " + data.files + " files";
      $("gh-result").appendChild(link);
      loadRepos();
    } catch (err) {
      $("gh-result").textContent = err.message;
    } finally {
      $("gh-push").disabled = false;
    }
  }

  async function pullProject() {
    $("gh-result").textContent = "Pulling…";
    $("gh-pull").disabled = true;
    try {
      const data = await api("POST", "/api/github/pull", {
        owner: $("gh-owner").value.trim(),
        repo: $("gh-repo").value.trim(),
        branch: $("gh-branch").value.trim() || "main"
      });
      $("gh-result").textContent = "Brought in " + data.files + " files.";
      closeDrawer();
      await refreshProjects(data.id);
    } catch (err) {
      $("gh-result").textContent = err.message;
    } finally {
      $("gh-pull").disabled = false;
    }
  }

  function bindSplitters() {
    const style = document.documentElement.style;
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem("lark-panels") || "null"); } catch (e) { return null; }
    })();
    if (saved) {
      if (saved.files) style.setProperty("--files-w", saved.files);
      if (saved.outline) style.setProperty("--outline-w", saved.outline);
      if (saved.console) style.setProperty("--console-h", saved.console);
    }
    function drag(handle, onMove) {
      if (!handle) return;
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const start = {
          x: event.clientX,
          y: event.clientY,
          files: $("files").getBoundingClientRect().width,
          outline: $("outline").getBoundingClientRect().width,
          console: $("console").getBoundingClientRect().height
        };
        const move = (ev) => onMove(ev, start);
        const up = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          localStorage.setItem("lark-panels", JSON.stringify({
            files: getComputedStyle(document.documentElement).getPropertyValue("--files-w").trim(),
            outline: getComputedStyle(document.documentElement).getPropertyValue("--outline-w").trim(),
            console: getComputedStyle(document.documentElement).getPropertyValue("--console-h").trim()
          }));
          if (cm) cm.refresh();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
      });
    }
    drag(document.querySelector("[data-split=files]"), (ev, start) => {
      style.setProperty("--files-w", Math.min(420, Math.max(180, start.files + ev.clientX - start.x)) + "px");
    });
    drag(document.querySelector("[data-split=outline]"), (ev, start) => {
      style.setProperty("--outline-w", Math.min(360, Math.max(160, start.outline - (ev.clientX - start.x))) + "px");
    });
    drag(document.querySelector("[data-split=console]"), (ev, start) => {
      style.setProperty("--console-h", Math.min(window.innerHeight * 0.55, Math.max(96, start.console - (ev.clientY - start.y))) + "px");
    });
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
    $("outline-show").addEventListener("click", () => {
      if (window.innerWidth <= 1100) {
        $("outline").classList.toggle("open");
        $("files").classList.remove("open");
      } else {
        $("shell").classList.toggle("outline-collapsed");
        if (cm) cm.refresh();
      }
    });
    $("outline-toggle").addEventListener("click", () => {
      if (window.innerWidth <= 1100) $("outline").classList.remove("open");
      else {
        $("shell").classList.toggle("outline-collapsed");
        if (cm) cm.refresh();
      }
    });
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
    $("theme").addEventListener("click", (event) => togglePopover(event.currentTarget));
    $("help").addEventListener("click", (event) => togglePopover(event.currentTarget));
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
        "delete-project": deleteProject
      }[act];
      if (action) Promise.resolve(action()).catch((err) => toast(err.message));
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
    $("gh-save").addEventListener("click", saveToken);
    $("gh-forget").addEventListener("click", () => {
      $("gh-token").value = "";
      api("POST", "/api/github/token", { token: "" }).then(() => {
        state.settings.tokenSet = false;
        state.settings.githubLogin = "";
        $("gh-status").textContent = "Not connected";
        $("gh-repos").replaceChildren();
      }).catch((err) => toast(err.message));
    });
    $("gh-repos").addEventListener("change", () => {
      const opt = $("gh-repos").selectedOptions[0];
      if (!opt || !opt.dataset.owner) return;
      $("gh-owner").value = opt.dataset.owner;
      $("gh-repo").value = opt.dataset.name;
      $("gh-branch").value = opt.dataset.branch || "main";
    });
    $("gh-push").addEventListener("click", () => pushProject());
    $("gh-pull").addEventListener("click", () => pullProject());
    $("tab-output").addEventListener("click", () => showConsoleTab("output"));
    $("tab-problems").addEventListener("click", () => showConsoleTab("problems"));
    $("clear-console").addEventListener("click", () => {
      state.problems = [];
      clearMarks();
      renderProblems();
      renderConsole("");
      showConsoleTab("output");
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
        event.preventDefault();
        run().catch((err) => toast(err.message));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        flushSaves().catch((err) => toast(err.message));
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
    window.addEventListener("resize", () => { if (cm) cm.refresh(); });
    bindSplitters();
  }

  async function boot() {
    try {
      ensureEditor();
      bind();
      state.settings = await api("GET", "/api/settings");
      applyTheme(state.settings.theme, false);
      const version = (state.settings.javaVersion || "").split(".")[0];
      $("status-java").textContent = version ? "Java " + version : "";
      const data = await api("GET", "/api/projects");
      state.projects = data.projects;
      renderProjects();
      const hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
      const known = (id) => state.projects.some((project) => project.id === id);
      const id = known(hash) ? hash : known(state.settings.lastProject) ? state.settings.lastProject : (state.projects[0] && state.projects[0].id);
      if (id) await openProject(id);
      else showEmpty();
      $("boot").hidden = true;
      if (cm && state.active) {
        cm.refresh();
        cm.focus();
      }
    } catch (err) {
      $("boot").textContent = err.message || "Lark couldn't open.";
    }
  }

  boot();
})();
