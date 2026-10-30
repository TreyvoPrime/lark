(function () {
  const THEMES = [
    ["slate", "Slate"],
    ["desk", "Desk"],
    ["studio", "Studio"],
    ["daylight", "Daylight"],
    ["moss", "Moss"],
    ["cedar", "Cedar"],
    ["inkwell", "Inkwell"],
    ["porcelain", "Porcelain"],
    ["hearth", "Hearth"],
    ["canopy", "Canopy"],
    ["obsidian", "Obsidian"],
    ["glacier", "Glacier"],
    ["prism", "Prism"],
    ["volt", "Volt"],
    ["flare", "Flare"],
    ["reef", "Reef"],
    ["magma", "Magma"]
  ];

  const state = {
    pair: "",
    settings: null,
    projects: [],
    project: null,
    files: [],
    path: null,
    dirty: false,
    cm: null,
    job: null,
    poll: null,
    updateDownload: "",
    view: "home"
  };

  const $ = (id) => document.getElementById(id);

  function pairFromUrl() {
    try {
      const u = new URL(location.href);
      return (u.searchParams.get("pair") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function loadPair() {
    const fromUrl = pairFromUrl();
    if (fromUrl) {
      state.pair = fromUrl;
      try { sessionStorage.setItem("lark-pair", fromUrl); } catch (e) {}
      return;
    }
    try {
      state.pair = sessionStorage.getItem("lark-pair") || "";
    } catch (e) {
      state.pair = "";
    }
  }

  async function api(method, path, body) {
    const headers = { "Content-Type": "application/json", "X-Lark": "1" };
    if (state.pair) headers["X-Lark-Pair"] = state.pair;
    const res = await fetch(path, {
      method: method,
      headers: headers,
      body: body == null ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Bad response from Lark Mobile." }));
    if (!res.ok || data.ok === false) throw new Error(data.error || "Request failed");
    return data;
  }

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function insertAtCursor(code, message) {
    const cm = ensureEditor();
    if (!cm || !code) return;
    if (!state.path) return toast("Open a file first.");
    const cur = cm.getCursor();
    const lineText = cm.getLine(cur.line) || "";
    const indent = (lineText.match(/^\s*/) || [""])[0];
    let indented = code.split("\n").map((line, i) => (i === 0 ? line : indent + line)).join("\n");
    if (!indented.endsWith("\n")) indented += "\n";
    cm.replaceRange(indented, cur);
    cm.focus();
    toast(message || "Inserted code block.");
  }

  function insertMatrixPrint() {
    if (!state.path) {
      toast("Open a Java file in Edit first.");
      setView("edit");
      return;
    }
    const raw = window.prompt("Matrix variable name", "matrix");
    if (raw == null) return;
    const code = window.LarkJava
      ? window.LarkJava.generateMatrixPrint(raw, true)
      : null;
    if (!code) return toast("Java helpers failed to load.");
    insertAtCursor(code, "Inserted matrix print loops.");
    setView("edit");
  }

  function insertHomeworkBlock() {
    if (!state.path) {
      toast("Open a Java file in Edit first.");
      setView("edit");
      return;
    }
    if (!window.LarkJava || !window.LarkJava.generateHomeworkBlock) {
      return toast("Java helpers failed to load.");
    }
    const ids = window.LarkJava.homeworkBlockIds || [];
    const snips = (window.LarkJava.snippets || []).filter((s) => ids.indexOf(s.id) >= 0);
    if (!snips.length) return toast("No homework blocks available.");
    const list = snips.map((s, i) => (i + 1) + ") " + s.id + " — " + s.label).join("\n");
    const pick = window.prompt("Homework block number or id:\n\n" + list, "arrfill");
    if (pick == null) return;
    const trimmed = String(pick).trim();
    let kind = trimmed;
    const asNum = parseInt(trimmed, 10);
    if (Number.isFinite(asNum) && asNum >= 1 && asNum <= snips.length) {
      kind = snips[asNum - 1].id;
    } else if (trimmed.indexOf("—") >= 0 || trimmed.indexOf("-") >= 0) {
      kind = trimmed.split(/—|-/)[0].trim();
    }
    const snip = snips.find((s) => s.id === kind);
    if (!snip) return toast("Unknown block: " + trimmed);
    let options = {};
    if (kind === "arrfill") {
      const name = window.prompt("Array variable name", "nums");
      if (name == null) return;
      const size = window.prompt("Length", "10");
      if (size == null) return;
      options = { name: name, size: size };
    } else if (kind === "arrstats" || kind === "arrcopy" || kind === "arrrev") {
      const name = window.prompt("Array variable name", "nums");
      if (name == null) return;
      options = { name: name };
    } else if (kind === "linsearch") {
      const name = window.prompt("Array variable name", "nums");
      if (name == null) return;
      options = { name: name, target: "target" };
    } else if (kind === "countocc") {
      const mode = window.prompt("Count in: array or string", "array");
      if (mode == null) return;
      const name = window.prompt("Array or String name", mode.indexOf("str") >= 0 ? "text" : "nums");
      if (name == null) return;
      options = { mode: mode, name: name };
    } else if (kind === "sentinel") {
      const mode = window.prompt("Sentinel: int (-1) or string (quit)", "int");
      if (mode == null) return;
      options = { mode: mode };
    } else if (kind === "fileio") {
      const mode = window.prompt("Mode: both, read, or write", "both");
      if (mode == null) return;
      options = { mode: mode };
    } else if (kind === "matfill") {
      const name = window.prompt("Matrix variable name", "matrix");
      if (name == null) return;
      const rows = window.prompt("Rows", "3");
      if (rows == null) return;
      const cols = window.prompt("Columns", "3");
      if (cols == null) return;
      options = { name: name, rows: rows, cols: cols };
    }
    const code = window.LarkJava.generateHomeworkBlock(kind, options);
    if (!code) return toast("Could not build that block.");
    insertAtCursor(code, "Inserted " + snip.label + ".");
    setView("edit");
  }

  function setView(name) {
    state.view = name;
    document.querySelectorAll(".view").forEach((el) => {
      const on = el.dataset.view === name;
      el.hidden = !on;
      el.classList.toggle("active", on);
    });
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });
    const editing = name === "edit" && !!state.path;
    $("btn-save").hidden = !editing;
    $("btn-run-top").hidden = !(state.project && (name === "edit" || name === "run"));
    if (name === "edit" && state.cm) {
      setTimeout(() => state.cm.refresh(), 40);
    }
  }

  function ensureEditor() {
    if (state.cm) return state.cm;
    const showLines = !(state.settings && state.settings.lineNumbers === false);
    state.cm = CodeMirror($("editor-host"), {
      mode: "text/x-java",
      lineNumbers: showLines,
      lineWrapping: true,
      indentUnit: 4,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      viewportMargin: 12
    });
    state.cm.setOption("extraKeys", { "Ctrl-Space": cm => cm.showHint({ hint: window.LarkTyping.hint, completeSingle: false }), "Tab": "indentMore", "Shift-Tab": "indentLess" });
    state.cm.on("inputRead", (cm, change) => {
      if (!change.text || !/[\w$.]/.test(change.text.join("")) || cm.state.completionActive) return;
      cm.showHint({ hint: window.LarkTyping.hint, completeSingle: false });
    });
    state.cm.on("change", () => {
      if (!state.path) return;
      state.dirty = true;
      $("edit-status").textContent = "Unsaved";
      $("edit-status").className = "dirty";
      if (state._problemTimer) clearTimeout(state._problemTimer);
      state._problemTimer = setTimeout(() => refreshMobileProblems(), 400);
    });
    return state.cm;
  }

  function applyFont(size) {
    const n = Math.min(22, Math.max(14, Number(size) || 16));
    document.documentElement.style.setProperty("--editor-font-size", n + "px");
    $("font-range").value = String(n);
    if (state.cm) {
      state.cm.getWrapperElement().style.fontSize = n + "px";
      state.cm.refresh();
    }
    return n;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme || "slate";
    $("theme-select").value = theme || "slate";
  }

  async function refreshProjects() {
    $("home-error").hidden = true;
    try {
      const data = await api("GET", "/api/projects");
      state.projects = data.projects || [];
      renderProjects();
    } catch (err) {
      $("home-error").hidden = false;
      $("home-error").textContent = err.message;
    }
  }

  function renderProjects() {
    const host = $("project-list");
    host.innerHTML = "";
    $("home-empty").hidden = state.projects.length > 0;
    state.projects.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "row" + (state.project && state.project.id === p.id ? " active" : "");
      btn.innerHTML = "<div><strong></strong><small></small></div>";
      btn.querySelector("strong").textContent = p.name || p.id;
      btn.querySelector("small").textContent = p.mainClass ? "main · " + p.mainClass : "Open project";
      btn.addEventListener("click", () => openProject(p.id));
      host.appendChild(btn);
    });
  }

  async function openProject(id) {
    if (state.dirty) await saveFile();
    const data = await api("GET", "/api/projects/" + encodeURIComponent(id));
    state.project = data.project || data;
    state.files = (data.project || data).files || [];
    state.path = null;
    state.dirty = false;
    if (state.settings) {
      api("PUT", "/api/settings", { lastProject: id }).catch(() => {});
    }
    renderProjects();
    renderFiles();
    $("files-title").textContent = state.project.name || "Files";
    const main = (state.project.mainClass || "").replace(/\./g, "/") + ".java";
    const preferred = state.files.find((f) => f.path.endsWith(main)) || state.files.find((f) => f.path.endsWith(".java"));
    if (preferred) await openFile(preferred.path);
    setView("files");
    toast("Opened " + (state.project.name || id));
  }

  function renderFiles() {
    const host = $("file-list");
    host.innerHTML = "";
    const files = (state.files || []).slice().sort((a, b) => a.path.localeCompare(b.path));
    $("files-empty").hidden = !!state.project && files.length > 0;
    if (!state.project) {
      $("files-empty").hidden = false;
      $("files-empty").textContent = "Open a project from Home first.";
      return;
    }
    if (!files.length) {
      $("files-empty").textContent = "No files yet.";
      return;
    }
    files.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "row" + (state.path === f.path ? " active" : "");
      btn.innerHTML = "<div><strong></strong><small>Open in editor</small></div>";
      btn.querySelector("strong").textContent = f.path;
      btn.addEventListener("click", () => openFile(f.path).then(() => setView("edit")));
      host.appendChild(btn);
    });
  }

  async function openFile(path) {
    if (state.dirty && state.path && state.path !== path) {
      await saveFile();
    }
    const file = state.files.find((f) => f.path === path);
    if (!file) throw new Error("File not found.");
    const cm = ensureEditor();
    state.path = null;
    cm.setValue(file.content || "");
    cm.clearHistory();
    state.path = path;
    state.dirty = false;
    $("edit-path").textContent = path;
    $("edit-status").textContent = "Saved";
    $("edit-status").className = "ok";
    renderFiles();
    $("btn-save").hidden = state.view !== "edit";
    refreshMobileProblems();
  }

  function refreshMobileProblems() {
    const tip = $("edit-problem");
    const btn = $("btn-quickfix");
    if (!tip || !btn) return;
    tip.hidden = true;
    btn.hidden = true;
    state.fixable = null;
    if (!state.cm || !state.path || !state.path.endsWith(".java") || !window.LarkJava) return;
    const source = state.cm.getValue();
    const warnings = (window.LarkJava.parseJava(source).warnings || []);
    const fixable = warnings.find((w) => window.LarkJava.isQuickFixable && window.LarkJava.isQuickFixable(w));
    if (!fixable) return;
    state.fixable = fixable;
    tip.hidden = false;
    tip.textContent = (fixable.plain || fixable.message || "Issue found") + (fixable.hint ? " — " + fixable.hint : "");
    btn.hidden = false;
    btn.textContent = "Quick fix";
  }

  async function applyMobileQuickFix() {
    if (!state.cm || !state.path || !state.fixable || !window.LarkJava) return toast("Nothing to fix.");
    const problem = state.fixable;
    const code = window.LarkJava.inferQuickFixCode ? window.LarkJava.inferQuickFixCode(problem) : problem.code;
    const source = state.cm.getValue();
    if (code === "missing-accessors" || code === "missing-getter") {
      const parsed = window.LarkJava.parseJava(source);
      const missing = (parsed.accessors || []).filter((info) => {
        const mods = info.field.mods || [];
        if (mods.indexOf("private") < 0) return false;
        if (problem.field && info.field.name !== problem.field) return false;
        return !info.hasGetter || !info.hasSetter;
      });
      if (!missing.length) return toast("Couldn't find the field to fix.");
      const gen = window.LarkJava.generateGetterSetter(missing.map((i) => i.field), true, true);
      const closeAt = window.LarkJava.classCloseIndex(source);
      if (closeAt < 0) return toast("Couldn't find where to insert inside the class.");
      const before = source.slice(0, closeAt);
      const insert = (before.endsWith("\n") ? "" : "\n") + "\n" + gen + (gen.endsWith("\n") ? "" : "\n");
      const next = source.slice(0, closeAt) + insert + source.slice(closeAt);
      state.cm.setValue(next);
      state.dirty = true;
      $("edit-status").textContent = "Unsaved";
      $("edit-status").className = "dirty";
      refreshMobileProblems();
      toast("Added missing getters/setters.");
      return;
    }
    const result = window.LarkJava.applyQuickFix(source, problem, []);
    if (!result || result.source == null || result.source === source) {
      return toast("Couldn't apply that quick fix.");
    }
    state.cm.setValue(result.source);
    state.dirty = true;
    $("edit-status").textContent = "Unsaved";
    $("edit-status").className = "dirty";
    refreshMobileProblems();
    toast(result.note || "Quick fix applied.");
  }

  async function saveFile() {
    if (!state.project || !state.path || !state.cm) return;
    const content = state.cm.getValue(), savedPath = state.path, savedProject = state.project.id;
    await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", {
      path: state.path,
      content: content
    });
    if (state.project.id !== savedProject || state.path !== savedPath) return;
    const file = state.files.find((f) => f.path === savedPath);
    if (file) file.content = content;
    if (state.cm.getValue() !== content) return;
    state.dirty = false;
    $("edit-status").textContent = "Saved";
    $("edit-status").className = "ok";
    toast("Saved");
  }

  async function runProject() {
    if (!state.project) return toast("Open a project first.");
    if (state.dirty) await saveFile();
    setView("run");
    $("run-out").textContent = "";
    $("run-state").textContent = "Starting…";
    if (state.poll) clearInterval(state.poll);
    const data = await api("POST", "/api/run", {
      project: state.project.id,
      mainClass: state.project.mainClass || "",
      args: "",
      stdin: $("run-stdin").value || ""
    });
    state.job = data.id;
    $("run-state").textContent = "Running";
    state.poll = setInterval(pollRun, 400);
  }

  async function pollRun() {
    if (!state.job) return;
    try {
      const snap = await api("GET", "/api/run/" + encodeURIComponent(state.job));
      $("run-out").textContent = snap.output || "(no output yet)";
      if (snap.done) {
        clearInterval(state.poll);
        state.poll = null;
        const code = snap.exit;
        $("run-state").textContent = code === 0 ? "Finished" : "Finished (" + (code ?? "?") + ")";
      }
    } catch (err) {
      clearInterval(state.poll);
      state.poll = null;
      $("run-state").textContent = "Error";
      toast(err.message);
    }
  }

  async function stopRun() {
    if (!state.job) return;
    await api("POST", "/api/run/" + encodeURIComponent(state.job) + "/stop", {});
    $("run-state").textContent = "Stopped";
  }

  async function loadTemplates() {
    const data = await api("GET", "/api/templates");
    const sel = $("sheet-template");
    sel.innerHTML = "";
    const list = data.templates || [];
    list.forEach((t) => {
      const opt = document.createElement("option");
      const id = typeof t === "string" ? t : (t.id || t.name);
      const label = typeof t === "string" ? t : (t.label || t.name || t.id);
      opt.value = id;
      opt.textContent = label;
      sel.appendChild(opt);
    });
    if (!sel.options.length) {
      ["empty", "hello", "quiz", "factorial"].forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        sel.appendChild(opt);
      });
    }
  }

  function openSheet() {
    $("sheet").hidden = false;
    $("sheet-name").value = "";
    $("sheet-name").focus();
  }

  function closeSheet() {
    $("sheet").hidden = true;
  }

  async function createProject() {
    const name = $("sheet-name").value.trim();
    if (!name) return toast("Name the project.");
    const template = $("sheet-template").value || "empty";
    const data = await api("POST", "/api/projects", { name: name, template: template });
    closeSheet();
    await refreshProjects();
    await openProject(data.id);
  }

  async function newFile() {
    if (!state.project) return toast("Open a project first.");
    const name = prompt("New file path", "src/Main.java");
    if (!name) return;
    const path = name.replace(/^\/+/, "");
    if (state.files.some(file => file.path === path)) return toast("That file already exists. Open it from Files.");
    if (state.dirty) await saveFile();
    const stub = path.endsWith(".java")
      ? "public class " + (path.split("/").pop() || "Main").replace(/\.java$/, "") + " {\n    public static void main(String[] args) {\n        System.out.println(\"Hello from Lark Mobile\");\n    }\n}\n"
      : "";
    await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", {
      path: path,
      content: stub
    });
    const data = await api("GET", "/api/projects/" + encodeURIComponent(state.project.id));
    state.files = (data.project || data).files || [];
    await openFile(path);
    setView("edit");
  }

  async function loadPairCard() {
    try {
      const info = await api("GET", "/api/mobile/info");
      if (!info.lan) {
        $("pair-card").hidden = true;
        return;
      }
      const url = (info.urls && info.urls[0]) || info.local || "";
      if (!url) {
        $("pair-card").hidden = true;
        return;
      }
      $("pair-card").hidden = false;
      $("pair-url").textContent = url;
      $("btn-copy-pair").onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast("Phone link copied");
        } catch (e) {
          toast(url);
        }
      };
      if (info.pair && !state.pair) {
        state.pair = info.pair;
        try { sessionStorage.setItem("lark-pair", info.pair); } catch (e) {}
      }
    } catch (e) {
      $("pair-card").hidden = true;
    }
  }

  async function checkUpdate() {
    $("update-msg").textContent = "Checking…";
    $("btn-install-update").hidden = true;
    try {
      const data = await api("GET", "/api/update/check");
      if (data.available) {
        $("update-msg").textContent = "Update " + data.latest + " ready. " + (data.notes || "");
        state.updateDownload = data.download || "";
        $("btn-install-update").hidden = !state.updateDownload;
      } else {
        $("update-msg").textContent = data.message || "You're on the latest Lark Mobile.";
      }
    } catch (err) {
      $("update-msg").textContent = err.message;
    }
  }

  async function installUpdate() {
    if (!state.updateDownload) return;
    $("update-msg").textContent = "Installing…";
    const data = await api("POST", "/api/update/install", { download: state.updateDownload });
    $("update-msg").textContent = data.message || "Update installed.";
    if (data.canRestart) {
      if (confirm("Restart Lark Mobile now?")) {
        await api("POST", "/api/update/restart", {});
      }
    }
  }

  function bind() {
    ["undo", "redo", "find"].forEach(command => $("btn-" + command).onclick = () => { if (state.path) ensureEditor().execCommand(command); });
    $("btn-complete").onclick = () => { if (state.path) ensureEditor().showHint({ hint: window.LarkTyping.hint, completeSingle: false }); };
    $("btn-rename").onclick = async () => {
      try {
        if (!state.path) return;
        const from = state.path, to = prompt("New file path", from);
        if (!to || to === from) return;
        if (state.dirty) await saveFile();
        await api("POST", "/api/projects/" + encodeURIComponent(state.project.id) + "/move", { from, to });
        await openProject(state.project.id); await openFile(to); setView("edit");
      } catch (e) { toast(e.message); }
    };
    $("btn-delete").onclick = async () => {
      try {
        if (!state.path || !confirm("Delete " + state.path + "? This cannot be undone.")) return;
        await api("DELETE", "/api/projects/" + encodeURIComponent(state.project.id) + "/file?path=" + encodeURIComponent(state.path));
        state.dirty = false; state.path = null; await openProject(state.project.id);
      } catch (e) { toast(e.message); }
    };
    ['{', '}', '(', ')', '[', ']', ';', '"', '=', '<', '>'].forEach(symbol => {
      const button = document.createElement("button"); button.className = "ghost"; button.textContent = symbol;
      button.onclick = () => { if (state.path) { state.cm.replaceSelection(symbol, "end", "+input"); state.cm.focus(); } };
      $("symbols").appendChild(button);
    });
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => setView(tab.dataset.tab));
    });
    $("btn-new").addEventListener("click", openSheet);
    $("sheet-cancel").addEventListener("click", closeSheet);
    $("sheet-ok").addEventListener("click", () => createProject().catch((e) => toast(e.message)));
    $("btn-new-file").addEventListener("click", () => newFile().catch((e) => toast(e.message)));
    $("btn-save").addEventListener("click", () => saveFile().catch((e) => toast(e.message)));
    $("btn-run").addEventListener("click", () => runProject().catch((e) => toast(e.message)));
    $("btn-run-top").addEventListener("click", () => runProject().catch((e) => toast(e.message)));
    $("btn-stop").addEventListener("click", () => stopRun().catch((e) => toast(e.message)));
    $("btn-blocks").addEventListener("click", () => insertHomeworkBlock());
    $("btn-blocks-more").addEventListener("click", () => insertHomeworkBlock());
    $("btn-matrix").addEventListener("click", () => insertMatrixPrint());
    $("btn-matrix-more").addEventListener("click", () => insertMatrixPrint());
    if ($("btn-quickfix")) {
      $("btn-quickfix").addEventListener("click", () => applyMobileQuickFix().catch((e) => toast(e.message)));
    }
    $("btn-check-update").addEventListener("click", () => checkUpdate().catch((e) => toast(e.message)));
    $("btn-install-update").addEventListener("click", () => installUpdate().catch((e) => toast(e.message)));
    $("theme-select").addEventListener("change", () => {
      const theme = $("theme-select").value;
      applyTheme(theme);
      api("PUT", "/api/settings", { theme: theme }).catch((e) => toast(e.message));
    });
    $("font-range").addEventListener("input", () => {
      applyFont($("font-range").value);
    });
    $("font-range").addEventListener("change", () => {
      const fontSize = applyFont($("font-range").value);
      api("PUT", "/api/settings", { fontSize: fontSize }).catch(() => {});
    });
    const lineToggle = $("line-numbers");
    if (lineToggle) {
      lineToggle.addEventListener("change", () => {
        const on = !!lineToggle.checked;
        if (state.settings) state.settings.lineNumbers = on;
        const cm = ensureEditor();
        cm.setOption("lineNumbers", on);
        cm.refresh();
        api("PUT", "/api/settings", { lineNumbers: on }).catch(() => {});
      });
    }
  }

  async function boot() {
    loadPair();
    bind();
    const sel = $("theme-select");
    THEMES.forEach(([id, label]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = label;
      sel.appendChild(opt);
    });
    try {
      const health = await api("GET", "/api/health");
      if (!health.mobile && health.edition !== "mobile") {
        toast("This UI expects Lark Mobile. Start with Start Lark Mobile.");
      }
      $("version-line").textContent = "Lark Mobile " + (health.version || "") + " · " + (health.edition || "mobile");
      state.settings = await api("GET", "/api/settings");
      applyTheme(state.settings.theme || "slate");
      applyFont(Math.max(14, state.settings.fontSize || 16));
      if ($("line-numbers")) {
        $("line-numbers").checked = state.settings.lineNumbers !== false;
      }
      await loadTemplates();
      await refreshProjects();
      await loadPairCard();
      if (state.settings.lastProject) {
        const exists = state.projects.some((p) => p.id === state.settings.lastProject);
        if (exists) await openProject(state.settings.lastProject);
      }
      setView(state.project ? "files" : "home");
    } catch (err) {
      $("home-error").hidden = false;
      $("home-error").textContent = err.message + (state.pair ? "" : " If you're on a phone, open the full Phone URL with the pair code.");
    }
  }

  window.addEventListener("beforeunload", event => { if (state.dirty) { event.preventDefault(); event.returnValue = ""; } });
  boot();
})();
