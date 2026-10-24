(function () {
  const THEME_NAMES = {
    desk: "Desk", slate: "Slate", studio: "Studio", daylight: "Daylight", moss: "Moss",
    ember: "Ember", fog: "Fog", blossom: "Blossom", candy: "Candy", midnight: "Midnight",
    citrus: "Citrus", harbor: "Harbor", graphite: "Graphite & Teal", navy: "Midnight Blue",
    terminal: "Terminal Green", parchment: "Paper & Ink", ultraviolet: "Ultraviolet",
    forest: "Forest", monochrome: "Monochrome", amber: "Amber Terminal", lagoon: "Lagoon",
    rosewood: "Rosewood", nova: "Nova", atelier: "Atelier", obsidian: "Obsidian",
    glacier: "Glacier", cedar: "Cedar", inkwell: "Inkwell", porcelain: "Porcelain",
    hearth: "Hearth", canopy: "Canopy"
  };
  const THEME_CANON = {
    ink: "desk", paper: "daylight", tide: "moss", copper: "ember", chalk: "fog",
    kawaii: "blossom", pink: "blossom"
  };
  const THEME_IDS = Object.keys(THEME_NAMES);
  const THEME_SWATCHES = {
    desk: { bg: "#2b2b2b", accent: "#cc7832" },
    slate: { bg: "#2a2e33", accent: "#8aa4b8" },
    studio: { bg: "#2c2926", accent: "#d19a66" },
    daylight: { bg: "#f5f5f5", accent: "#0033b3" },
    moss: { bg: "#1e2622", accent: "#e0a070" },
    ember: { bg: "#241c18", accent: "#e89a5c" },
    fog: { bg: "#eef1f4", accent: "#1750eb" },
    blossom: { bg: "#fff0f6", accent: "#ff6b9d" },
    candy: { bg: "#2a1520", accent: "#ff7eb3" },
    midnight: { bg: "#0f1724", accent: "#5b9fd4" },
    citrus: { bg: "#fff8e8", accent: "#e8a317" },
    harbor: { bg: "#12262a", accent: "#3db8c5" },
    graphite: { bg: "#171a1f", accent: "#36cfc9" },
    navy: { bg: "#101827", accent: "#4d8dff" },
    terminal: { bg: "#111311", accent: "#9fe870" },
    parchment: { bg: "#f6f5f1", accent: "#4169a1" },
    ultraviolet: { bg: "#191720", accent: "#a78bfa" },
    forest: { bg: "#171d1a", accent: "#8fc9a3" },
    monochrome: { bg: "#151515", accent: "#d4d4d4" },
    amber: { bg: "#181512", accent: "#ffb454" },
    lagoon: { bg: "#0f1f22", accent: "#2aa8a0" },
    rosewood: { bg: "#24181c", accent: "#c45c6a" },
    nova: { bg: "#12161c", accent: "#3de0d0" },
    atelier: { bg: "#1a1c22", accent: "#3d5a80" },
    obsidian: { bg: "#121212", accent: "#d4a45a" },
    glacier: { bg: "#e8eef3", accent: "#4a7a9b" },
    cedar: { bg: "#221c18", accent: "#c4784a" },
    inkwell: { bg: "#14161a", accent: "#7aa2c7" },
    porcelain: { bg: "#f7f5f2", accent: "#3d6ea3" },
    hearth: { bg: "#241e1a", accent: "#e0a06a" },
    canopy: { bg: "#1a221c", accent: "#8fc9a3" }
  };

  const state = {
    apiBase: "",
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
    debug: null,
    updateDownload: "",
    view: "home",
    saveTimer: null,
    connected: false
  };

  const $ = (id) => document.getElementById(id);

  function pairFromUrl() {
    try {
      return (new URL(location.href).searchParams.get("pair") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function loadConnection() {
    const fromUrl = pairFromUrl();
    if (fromUrl) {
      state.pair = fromUrl;
      try { sessionStorage.setItem("lark-pair", fromUrl); } catch (e) {}
    } else {
      try { state.pair = sessionStorage.getItem("lark-pair") || localStorage.getItem("lark-pair") || ""; } catch (e) { state.pair = ""; }
    }
    try { state.apiBase = (localStorage.getItem("lark-api-base") || "").replace(/\/$/, ""); } catch (e) { state.apiBase = ""; }
    if ($("api-base")) $("api-base").value = state.apiBase;
    if ($("pair-input")) $("pair-input").value = state.pair;
  }

  function saveConnection() {
    state.apiBase = ($("api-base").value || "").trim().replace(/\/$/, "");
    state.pair = ($("pair-input").value || "").trim();
    try {
      localStorage.setItem("lark-api-base", state.apiBase);
      if (state.pair) {
        localStorage.setItem("lark-pair", state.pair);
        sessionStorage.setItem("lark-pair", state.pair);
      }
    } catch (e) {}
  }

  function apiUrl(path) {
    if (!path.startsWith("/")) path = "/" + path;
    return (state.apiBase || "") + path;
  }

  async function api(method, path, body) {
    const headers = { "Content-Type": "application/json", "X-Lark": "1" };
    if (state.pair) headers["X-Lark-Pair"] = state.pair;
    const res = await fetch(apiUrl(path), {
      method: method,
      headers: headers,
      body: body == null ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Bad response from Lark." }));
    if (!res.ok || data.ok === false) throw new Error(data.error || ("HTTP " + res.status));
    return data;
  }

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function themeName(id) { return THEME_NAMES[id] || "Desk"; }

  function applyTheme(theme, save) {
    theme = THEME_CANON[theme] || theme;
    if (!THEME_NAMES[theme]) theme = "desk";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("lark-theme", theme); } catch (e) {}
    document.querySelectorAll(".theme-tile").forEach((tile) => {
      const on = tile.dataset.themeChoice === theme;
      tile.classList.toggle("active", on);
      const meta = tile.querySelector(".theme-tile-meta");
      if (meta) meta.textContent = on ? "Active" : "Tap to apply";
    });
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    const sw = THEME_SWATCHES[theme];
    if (metaTheme && sw) metaTheme.setAttribute("content", sw.bg);
    if (save && state.settings) {
      api("PUT", "/api/settings", { theme: theme }).catch((err) => toast(err.message));
    }
  }

  function renderThemeGrid() {
    const grid = $("theme-grid");
    if (!grid || grid.dataset.ready === "1") return;
    grid.innerHTML = "";
    THEME_IDS.forEach((id) => {
      const sw = THEME_SWATCHES[id] || { bg: "#333", accent: "#6897bb" };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-tile";
      btn.dataset.themeChoice = id;
      btn.innerHTML =
        '<span class="theme-tile-preview" style="--tile-bg:' + sw.bg + ";--tile-accent:" + sw.accent + '"></span>'
        + '<span class="theme-tile-name">' + themeName(id) + "</span>"
        + '<span class="theme-tile-meta">Tap to apply</span>';
      btn.addEventListener("click", () => applyTheme(id, true));
      grid.appendChild(btn);
    });
    grid.dataset.ready = "1";
    applyTheme(document.documentElement.dataset.theme || "desk", false);
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
    $("btn-run-top").hidden = !(state.project && (name === "edit" || name === "run" || name === "files"));
    if (name === "edit" && state.cm) setTimeout(() => state.cm.refresh(), 40);
  }

  function ensureEditor() {
    if (state.cm) return state.cm;
    const showLines = !(state.settings && state.settings.lineNumbers === false);
    state.cm = CodeMirror($("editor-host"), {
      mode: "text/x-java",
      lineNumbers: showLines,
      lineWrapping: true,
      indentUnit: (state.settings && state.settings.indentSize) || 4,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      viewportMargin: Infinity
    });
    state.cm.on("change", () => {
      if (!state.path) return;
      state.dirty = true;
      $("edit-status").textContent = "Unsaved";
      $("edit-status").className = "dirty";
      scheduleAutoSave();
    });
    return state.cm;
  }

  function scheduleAutoSave() {
    if (!(state.settings && state.settings.autoSave !== false)) return;
    clearTimeout(state.saveTimer);
    const delay = (state.settings && state.settings.autoSaveDelayMs) || 800;
    state.saveTimer = setTimeout(() => {
      if (state.dirty) saveFile().catch((e) => toast(e.message));
    }, delay);
  }

  function applyFont(size) {
    const n = Math.min(22, Math.max(13, Number(size) || 15));
    document.documentElement.style.setProperty("--editor-font-size", n + "px");
    $("font-range").value = String(n);
    if (state.cm) {
      state.cm.getWrapperElement().style.fontSize = n + "px";
      state.cm.refresh();
    }
    return n;
  }

  async function probeConnection() {
    $("connect-status").textContent = "Checking…";
    try {
      const health = await api("GET", "/api/health");
      state.connected = true;
      $("connect-status").textContent =
        "Connected · " + (health.edition || "lark") + " " + (health.version || "")
        + (state.apiBase ? " via " + state.apiBase : " (this host)");
      $("version-line").textContent = "Lark Mobile UI · engine " + (health.version || "?");
      return true;
    } catch (err) {
      state.connected = false;
      $("connect-status").textContent = "Not connected — " + err.message
        + ". For the APK, start Lark Mobile on a PC and paste the host URL + pair code.";
      return false;
    }
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
      btn.innerHTML = "<div><strong></strong><small></small></div><span class='chev'>›</span>";
      btn.querySelector("strong").textContent = p.name || p.id;
      btn.querySelector("small").textContent = p.mainClass ? "main · " + p.mainClass : "Open project";
      btn.addEventListener("click", () => openProject(p.id).catch((e) => toast(e.message)));
      host.appendChild(btn);
    });
  }

  async function openProject(id) {
    const data = await api("GET", "/api/projects/" + encodeURIComponent(id));
    state.project = data.project || data;
    state.files = ((state.project && state.project.files) || data.files || [])
      .filter((f) => f && !f.binary && !f.tooBig);
    state.path = null;
    state.dirty = false;
    if (state.settings) api("PUT", "/api/settings", { lastProject: id }).catch(() => {});
    renderProjects();
    renderFiles();
    $("files-title").textContent = state.project.name || "Files";
    const main = (state.project.mainClass || "").replace(/\./g, "/") + ".java";
    const preferred = state.files.find((f) => f.path.endsWith(main))
      || state.files.find((f) => f.path.endsWith(".java"));
    if (preferred) await openFile(preferred.path);
    setView(preferred ? "edit" : "files");
    toast("Opened " + (state.project.name || id));
  }

  function renderFiles() {
    const host = $("file-list");
    host.innerHTML = "";
    const files = (state.files || []).slice().sort((a, b) => a.path.localeCompare(b.path));
    if (!state.project) {
      $("files-empty").hidden = false;
      $("files-empty").textContent = "Open a project from Home first.";
      return;
    }
    $("files-empty").hidden = files.length > 0;
    if (!files.length) {
      $("files-empty").textContent = "No files yet.";
      return;
    }
    files.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "row" + (state.path === f.path ? " active" : "");
      btn.innerHTML = "<div><strong></strong><small>Open in editor</small></div><span class='chev'>›</span>";
      btn.querySelector("strong").textContent = f.path;
      btn.addEventListener("click", () => openFile(f.path).catch((e) => toast(e.message)));
      host.appendChild(btn);
    });
  }

  async function openFile(path) {
    if (!state.project) return;
    if (state.dirty && state.path && state.path !== path) {
      try { await saveFile(); } catch (e) { toast(e.message); }
    }
    let file = (state.files || []).find((f) => f.path === path);
    if (!file || file.content == null) {
      const data = await api("GET", "/api/projects/" + encodeURIComponent(state.project.id));
      state.project = data.project || data;
      state.files = ((state.project && state.project.files) || []).filter((f) => f && !f.binary && !f.tooBig);
      file = state.files.find((f) => f.path === path);
    }
    if (!file) throw new Error("File not found: " + path);
    ensureEditor();
    state.path = path;
    state.cm.setValue(file.content || "");
    state.dirty = false;
    $("edit-path").textContent = path;
    $("edit-status").textContent = "Saved";
    $("edit-status").className = "saved";
    renderFiles();
    setView("edit");
    setTimeout(() => state.cm.refresh(), 40);
  }

  async function saveFile() {
    if (!state.project || !state.path || !state.cm) return;
    const content = state.cm.getValue();
    await api("PUT",
      "/api/projects/" + encodeURIComponent(state.project.id) + "/file",
      { path: state.path, content: content });
    const file = (state.files || []).find((f) => f.path === state.path);
    if (file) file.content = content;
    state.dirty = false;
    $("edit-status").textContent = "Saved";
    $("edit-status").className = "saved";
  }

  async function createProject() {
    $("sheet-title").textContent = "New project";
    $("sheet-template-wrap").hidden = false;
    $("sheet-name").value = "";
    const templates = await api("GET", "/api/templates").catch(() => ({ templates: [] }));
    const sel = $("sheet-template");
    sel.innerHTML = "";
    (templates.templates || [{ id: "hello", name: "Hello" }]).forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id || t.name;
      opt.textContent = t.name || t.id;
      sel.appendChild(opt);
    });
    $("sheet").hidden = false;
    $("sheet-ok").onclick = async () => {
      const name = $("sheet-name").value.trim();
      if (!name) return toast("Name required");
      const data = await api("POST", "/api/projects", {
        name: name,
        template: $("sheet-template").value
      });
      $("sheet").hidden = true;
      await refreshProjects();
      const id = (data.project && data.project.id) || data.id;
      if (id) await openProject(id);
    };
  }

  async function createFile() {
    if (!state.project) return toast("Open a project first");
    $("sheet-title").textContent = "New file";
    $("sheet-template-wrap").hidden = true;
    $("sheet-name").value = "Main.java";
    $("sheet").hidden = false;
    $("sheet-ok").onclick = async () => {
      let path = $("sheet-name").value.trim().replace(/^\/+/, "");
      if (!path) return toast("Path required");
      if (!path.includes(".")) path += ".java";
      const starter = "public class " + path.replace(/\.java$/, "").split("/").pop()
        + " {\n  public static void main(String[] args) {\n    System.out.println(\"Hello\");\n  }\n}\n";
      await api("PUT",
        "/api/projects/" + encodeURIComponent(state.project.id) + "/file",
        { path: path, content: starter });
      $("sheet").hidden = true;
      const data = await api("GET", "/api/projects/" + encodeURIComponent(state.project.id));
      state.project = data.project || data;
      state.files = ((state.project && state.project.files) || []).filter((f) => f && !f.binary && !f.tooBig);
      await openFile(path);
    };
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
    toast(message || "Inserted.");
  }

  function insertMatrixPrint() {
    if (!state.path) { toast("Open a Java file first."); setView("edit"); return; }
    const raw = window.prompt("Matrix variable name", "matrix");
    if (raw == null) return;
    const code = window.LarkJava ? window.LarkJava.generateMatrixPrint(raw, true) : null;
    if (!code) return toast("Java helpers failed to load.");
    insertAtCursor(code, "Inserted matrix print loops.");
    setView("edit");
  }

  function insertHomeworkBlock() {
    if (!state.path) { toast("Open a Java file first."); setView("edit"); return; }
    if (!window.LarkJava || !window.LarkJava.generateHomeworkBlock) return toast("Java helpers failed to load.");
    const ids = window.LarkJava.homeworkBlockIds || [];
    const snips = (window.LarkJava.snippets || []).filter((s) => ids.indexOf(s.id) >= 0);
    if (!snips.length) return toast("No homework blocks available.");
    const list = snips.map((s, i) => (i + 1) + ") " + s.id + " — " + s.label).join("\n");
    const pick = window.prompt("Homework block number or id:\n\n" + list, "arrfill");
    if (pick == null) return;
    const trimmed = String(pick).trim();
    let kind = trimmed;
    const asNum = parseInt(trimmed, 10);
    if (Number.isFinite(asNum) && asNum >= 1 && asNum <= snips.length) kind = snips[asNum - 1].id;
    const snip = snips.find((s) => s.id === kind);
    if (!snip) return toast("Unknown block: " + trimmed);
    let options = {};
    if (kind === "arrfill") {
      const name = window.prompt("Array variable name", "nums"); if (name == null) return;
      const size = window.prompt("Length", "10"); if (size == null) return;
      options = { name: name, size: size };
    } else if (kind === "matfill") {
      const name = window.prompt("Matrix variable name", "matrix"); if (name == null) return;
      const rows = window.prompt("Rows", "3"); if (rows == null) return;
      const cols = window.prompt("Columns", "3"); if (cols == null) return;
      options = { name: name, rows: rows, cols: cols };
    }
    const code = window.LarkJava.generateHomeworkBlock(kind, options);
    if (!code) return toast("Could not build that block.");
    insertAtCursor(code, "Inserted " + snip.label + ".");
    setView("edit");
  }

  function beautify() {
    if (!state.cm || !state.path) return toast("Open a file first.");
    if (!window.LarkJava || !window.LarkJava.beautifyJava) return toast("Beautify helper missing.");
    const next = window.LarkJava.beautifyJava(state.cm.getValue());
    if (typeof next === "string") {
      state.cm.setValue(next);
      toast("Beautified.");
    }
  }

  async function checkCode() {
    if (!state.project) return toast("Open a project first.");
    if (state.dirty) await saveFile();
    const data = await api("POST", "/api/check", { project: state.project.id });
    const host = $("problems");
    const problems = data.problems || data.diagnostics || [];
    host.hidden = false;
    host.innerHTML = "";
    if (!problems.length) {
      host.innerHTML = "<p class='muted'>No problems.</p>";
      toast("Check clean.");
      return;
    }
    problems.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "problem " + ((p.severity || "").indexOf("error") >= 0 || p.error ? "err" : "warn");
      const where = (p.path || p.file || "") + (p.line ? ":" + p.line : "");
      btn.textContent = (where ? where + " — " : "") + (p.message || p.text || JSON.stringify(p));
      btn.addEventListener("click", async () => {
        if (p.path || p.file) await openFile(p.path || p.file);
        if (p.line && state.cm) state.cm.setCursor({ line: Math.max(0, (p.line | 0) - 1), ch: Math.max(0, (p.column | 0) - 1) });
      });
      host.appendChild(btn);
    });
    setView("edit");
  }

  async function runProject() {
    if (!state.project) return toast("Open a project first.");
    if (state.dirty) await saveFile();
    setView("run");
    $("run-state").textContent = "Starting…";
    $("run-out").textContent = "";
    const data = await api("POST", "/api/run", {
      project: state.project.id,
      mainClass: state.project.mainClass || "",
      args: ($("run-args").value || "").trim(),
      stdin: $("run-stdin").value || ""
    });
    state.job = data.id;
    $("run-state").textContent = "Running";
    pollJob();
  }

  async function stopJob() {
    if (!state.job) return;
    await api("POST", "/api/run/" + encodeURIComponent(state.job) + "/stop", {});
    $("run-state").textContent = "Stopped";
  }

  function pollJob() {
    clearInterval(state.poll);
    state.poll = setInterval(async () => {
      if (!state.job) return clearInterval(state.poll);
      try {
        const data = await api("GET", "/api/run/" + encodeURIComponent(state.job));
        if (data.output != null) $("run-out").textContent = data.output;
        if (data.done) {
          clearInterval(state.poll);
          $("run-state").textContent = "Done" + (data.exitCode != null ? " · exit " + data.exitCode : "");
          state.job = null;
        }
      } catch (err) {
        clearInterval(state.poll);
        $("run-state").textContent = "Error";
        toast(err.message);
      }
    }, 400);
  }

  async function startDebug() {
    if (!state.project) return toast("Open a project first.");
    if (state.dirty) await saveFile();
    setView("run");
    $("debug-bar").hidden = false;
    $("dbg-badge").textContent = "Starting…";
    const data = await api("POST", "/api/debug", {
      project: state.project.id,
      mainClass: state.project.mainClass || "",
      args: ($("run-args").value || "").trim(),
      breakpoints: []
    });
    state.debug = data;
    $("dbg-badge").classList.add("on");
    $("dbg-badge").textContent = "Debug";
    if (data.output) $("run-out").textContent = data.output;
    if (data.id) pollDebug(data.id);
  }

  function pollDebug(id) {
    clearInterval(state.poll);
    state.poll = setInterval(async () => {
      try {
        const data = await api("GET", "/api/debug/" + encodeURIComponent(id));
        state.debug = data;
        if (data.output) $("run-out").textContent = data.output;
        $("dbg-badge").textContent = data.paused ? "Paused" : (data.done ? "Done" : "Running");
        if (data.done) {
          clearInterval(state.poll);
          $("dbg-badge").classList.remove("on");
        }
      } catch (err) {
        clearInterval(state.poll);
        toast(err.message);
      }
    }, 500);
  }

  async function debugCmd(action) {
    if (!state.debug || !state.debug.id) return;
    if (action === "stop") {
      await api("POST", "/api/debug/" + encodeURIComponent(state.debug.id) + "/stop", {});
      clearInterval(state.poll);
      $("dbg-badge").classList.remove("on");
      $("dbg-badge").textContent = "Stopped";
      return;
    }
    const data = await api("POST",
      "/api/debug/" + encodeURIComponent(state.debug.id) + "/command",
      { command: action === "cont" ? "cont" : "step" });
    state.debug = data;
    if (data.output) $("run-out").textContent = data.output;
    $("dbg-badge").textContent = data.paused ? "Paused" : (data.done ? "Done" : "Running");
  }

  async function projectSearch() {
    if (!state.project) return toast("Open a project first.");
    const q = ($("search-q").value || "").trim();
    if (!q) return toast("Enter a search term.");
    const host = $("search-hits");
    host.innerHTML = "";
    // Client-side search across open project files via API file reads when no search endpoint.
    let hits = [];
    try {
      const data = await api("POST", "/api/check", { projectId: state.project.id, search: q });
      if (Array.isArray(data.hits)) hits = data.hits;
    } catch (e) {}
    if (!hits.length) {
      for (const f of (state.files || []).slice(0, 40)) {
        try {
          const src = f.content || "";
          const lines = src.split("\n");
          lines.forEach((line, i) => {
            if (line.toLowerCase().indexOf(q.toLowerCase()) >= 0) {
              hits.push({ path: f.path, line: i + 1, text: line.trim() });
            }
          });
        } catch (e) {}
      }
    }
    if (!hits.length) {
      host.innerHTML = "<p class='muted'>No hits.</p>";
      return;
    }
    hits.slice(0, 80).forEach((h) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "row";
      btn.innerHTML = "<div><strong></strong><small></small></div>";
      btn.querySelector("strong").textContent = (h.path || "") + ":" + (h.line || "?");
      btn.querySelector("small").textContent = h.text || h.message || "";
      btn.addEventListener("click", async () => {
        if (h.path) await openFile(h.path);
        if (h.line && state.cm) state.cm.setCursor({ line: Math.max(0, (h.line | 0) - 1), ch: 0 });
      });
      host.appendChild(btn);
    });
  }

  async function loadGithub() {
    try {
      const st = await api("GET", "/api/github/status");
      $("gh-status").textContent = st.login ? ("Signed in as @" + st.login) : (st.configured ? "Token saved" : "Not signed in");
    } catch (e) {
      $("gh-status").textContent = "GitHub unavailable";
    }
  }

  async function saveGithubToken() {
    const token = ($("gh-token").value || "").trim();
    if (!token) return toast("Paste a token first.");
    await api("POST", "/api/github/token", { token: token });
    $("gh-token").value = "";
    toast("Token saved.");
    loadGithub();
  }

  async function listRepos() {
    const data = await api("GET", "/api/github/repos");
    const host = $("gh-repos");
    host.innerHTML = "";
    (data.repos || []).slice(0, 30).forEach((r) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "row";
      btn.innerHTML = "<div><strong></strong><small></small></div>";
      btn.querySelector("strong").textContent = r.full_name || r.name;
      btn.querySelector("small").textContent = r.description || "Clone into Lark";
      btn.addEventListener("click", async () => {
        try {
          await api("POST", "/api/github/pull", { repo: r.full_name || r.name });
          toast("Cloned " + (r.full_name || r.name));
          await refreshProjects();
        } catch (e) { toast(e.message); }
      });
      host.appendChild(btn);
    });
  }

  async function checkUpdates(manual) {
    const data = await api("GET", "/api/update/check");
    $("update-msg").textContent = data.message || (data.available ? "Update available" : "Up to date");
    state.updateDownload = data.download || "";
    $("btn-install-update").hidden = !data.available;
    $("btn-restart-update").hidden = true;
    if (manual && !data.available) toast("You're up to date.");
  }

  async function installUpdate() {
    const data = await api("POST", "/api/update/install", { url: state.updateDownload || undefined });
    $("update-msg").textContent = data.message || "Update installed.";
    $("btn-restart-update").hidden = !data.canRestart;
    toast(data.message || "Update ready.");
  }

  async function restartUpdate() {
    await api("POST", "/api/update/restart", {});
    toast("Restarting…");
  }

  async function loadPairCard() {
    try {
      const info = await api("GET", "/api/mobile/info");
      if (info.local || (info.urls && info.urls.length)) {
        $("pair-card").hidden = false;
        $("pair-url").textContent = info.local || info.urls[0];
      }
    } catch (e) {
      $("pair-card").hidden = true;
    }
  }


  function nativeEngine() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LarkEngine;
    } catch (e) {
      return null;
    }
  }

  async function refreshNativeEngineUi() {
    const box = $("engine-native");
    const eng = nativeEngine();
    if (!box || !eng) return;
    box.hidden = false;
    try {
      const st = await eng.status();
      $("engine-native-status").textContent = st.installed
        ? ("On-device JRE ready (" + (st.abi || "?") + ")" + (st.running ? " · running" : ""))
        : ("On-device engine can download an Android JRE for " + (st.abi || "this phone") + " (~40 MB).");
      $("btn-engine-start").disabled = false;
    } catch (e) {
      $("engine-native-status").textContent = "Engine plugin error: " + e.message;
    }
  }

  async function installNativeEngine() {
    const eng = nativeEngine();
    if (!eng) return toast("On-device engine only works inside the Lark Mobile APK.");
    $("engine-progress").textContent = "Starting download…";
    try {
      if (eng.addListener) {
        eng.addListener("engineProgress", (ev) => {
          $("engine-progress").textContent = (ev.message || "") + (ev.percent != null ? " (" + ev.percent + "%)" : "");
        });
      }
      await eng.install();
      $("engine-progress").textContent = "Installed.";
      toast("On-device JDK installed.");
      await refreshNativeEngineUi();
    } catch (e) {
      $("engine-progress").textContent = e.message || String(e);
      toast(e.message || "Install failed");
    }
  }

  async function startNativeEngine() {
    const eng = nativeEngine();
    if (!eng) return toast("On-device engine only works inside the Lark Mobile APK.");
    $("engine-progress").textContent = "Starting local Lark…";
    try {
      const st = await eng.status();
      if (!st.installed) await eng.install();
      const res = await eng.start();
      const url = (res && res.url) || "http://127.0.0.1:43127/";
      $("api-base").value = url.replace(/\/$/, "");
      $("pair-input").value = "";
      saveConnection();
      $("engine-progress").textContent = "Local engine on " + url;
      if (await probeConnection()) {
        toast("On-device engine running.");
        await afterConnect();
      }
    } catch (e) {
      $("engine-progress").textContent = e.message || String(e);
      toast(e.message || "Could not start on-device engine");
    }
  }


  async function boot() {
    loadConnection();
    renderThemeGrid();
    refreshNativeEngineUi().catch(() => {});
    if ($("btn-engine-install")) $("btn-engine-install").addEventListener("click", () => installNativeEngine());
    if ($("btn-engine-start")) $("btn-engine-start").addEventListener("click", () => startNativeEngine());
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => setView(tab.dataset.tab));
    });
    $("btn-connect").addEventListener("click", async () => {
      saveConnection();
      if (await probeConnection()) {
        toast("Connected.");
        await afterConnect();
      }
    });
    $("btn-use-local").addEventListener("click", async () => {
      $("api-base").value = "";
      saveConnection();
      if (await probeConnection()) await afterConnect();
    });
    $("btn-copy-pair").addEventListener("click", async () => {
      const text = $("pair-url").textContent || "";
      try { await navigator.clipboard.writeText(text); toast("Copied."); }
      catch (e) { toast("Copy failed — select the link manually."); }
    });
    $("btn-new").addEventListener("click", () => createProject().catch((e) => toast(e.message)));
    $("btn-new-file").addEventListener("click", () => createFile().catch((e) => toast(e.message)));
    $("sheet-cancel").addEventListener("click", () => { $("sheet").hidden = true; });
    $("btn-save").addEventListener("click", () => saveFile().then(() => toast("Saved.")).catch((e) => toast(e.message)));
    $("btn-run-top").addEventListener("click", () => runProject().catch((e) => toast(e.message)));
    $("btn-run").addEventListener("click", () => runProject().catch((e) => toast(e.message)));
    $("btn-stop").addEventListener("click", () => stopJob().catch((e) => toast(e.message)));
    $("btn-debug").addEventListener("click", () => startDebug().catch((e) => toast(e.message)));
    $("btn-dbg-cont").addEventListener("click", () => debugCmd("cont").catch((e) => toast(e.message)));
    $("btn-dbg-step").addEventListener("click", () => debugCmd("step").catch((e) => toast(e.message)));
    $("btn-dbg-stop").addEventListener("click", () => debugCmd("stop").catch((e) => toast(e.message)));
    $("btn-check").addEventListener("click", () => checkCode().catch((e) => toast(e.message)));
    $("btn-format").addEventListener("click", () => beautify());
    $("btn-blocks").addEventListener("click", () => insertHomeworkBlock());
    $("btn-matrix").addEventListener("click", () => insertMatrixPrint());
    $("font-range").addEventListener("input", () => {
      const n = applyFont($("font-range").value);
      if (state.settings) api("PUT", "/api/settings", { fontSize: n }).catch(() => {});
    });
    $("line-numbers").addEventListener("change", () => {
      const on = $("line-numbers").checked;
      if (state.cm) state.cm.setOption("lineNumbers", on);
      if (state.settings) api("PUT", "/api/settings", { lineNumbers: on }).catch(() => {});
    });
    $("auto-save").addEventListener("change", () => {
      if (state.settings) {
        state.settings.autoSave = $("auto-save").checked;
        api("PUT", "/api/settings", { autoSave: state.settings.autoSave }).catch(() => {});
      }
    });
    $("btn-search").addEventListener("click", () => projectSearch().catch((e) => toast(e.message)));
    $("btn-gh-save").addEventListener("click", () => saveGithubToken().catch((e) => toast(e.message)));
    $("btn-gh-repos").addEventListener("click", () => listRepos().catch((e) => toast(e.message)));
    $("btn-check-update").addEventListener("click", () => checkUpdates(true).catch((e) => toast(e.message)));
    $("btn-install-update").addEventListener("click", () => installUpdate().catch((e) => toast(e.message)));
    $("btn-restart-update").addEventListener("click", () => restartUpdate().catch((e) => toast(e.message)));

    if (await probeConnection()) await afterConnect();
  }

  async function afterConnect() {
    try {
      state.settings = await api("GET", "/api/settings");
      applyTheme(state.settings.theme || "desk", false);
      applyFont(state.settings.fontSize || 15);
      $("line-numbers").checked = state.settings.lineNumbers !== false;
      $("auto-save").checked = state.settings.autoSave !== false;
    } catch (e) {}
    await refreshProjects();
    await loadPairCard();
    loadGithub().catch(() => {});
    if (state.settings && state.settings.lastProject) {
      const exists = state.projects.some((p) => p.id === state.settings.lastProject);
      if (exists) openProject(state.settings.lastProject).catch(() => {});
    }
  }

  boot().catch((err) => {
    $("connect-status").textContent = err.message;
  });
})();
