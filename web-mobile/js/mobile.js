(function () {
  const THEMES = [
    ["desk", "Desk"],
    ["daylight", "Daylight"],
    ["moss", "Moss"],
    ["cedar", "Cedar"],
    ["inkwell", "Inkwell"],
    ["porcelain", "Porcelain"],
    ["hearth", "Hearth"],
    ["canopy", "Canopy"],
    ["obsidian", "Obsidian"],
    ["glacier", "Glacier"]
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

  function matrixPrintBlock(varName) {
    const name = String(varName || "matrix").replace(/[^\w$]/g, "") || "matrix";
    return (
      "int[][] " + name + " = {\n" +
      "    {1, 2, 3},\n" +
      "    {4, 5, 6},\n" +
      "    {7, 8, 9}\n" +
      "};\n" +
      "for (int i = 0; i < " + name + ".length; i++) {\n" +
      "    for (int j = 0; j < " + name + "[i].length; j++) {\n" +
      "        System.out.print(" + name + "[i][j] + \" \");\n" +
      "    }\n" +
      "    System.out.println();\n" +
      "}"
    );
  }

  function insertAtCursor(code) {
    const cm = ensureEditor();
    if (!cm || !code) return;
    if (!state.path) return toast("Open a file first.");
    const cur = cm.getCursor();
    const lineText = cm.getLine(cur.line) || "";
    const indent = (lineText.match(/^\s*/) || [""])[0];
    const indented = code.split("\n").map((line, i) => (i === 0 ? line : indent + line)).join("\n");
    cm.replaceRange(indented, cur);
    cm.focus();
    toast("Inserted matrix print loops.");
  }

  function insertMatrixPrint() {
    if (!state.path) {
      toast("Open a Java file in Edit first.");
      setView("edit");
      return;
    }
    const raw = window.prompt("Matrix variable name", "matrix");
    if (raw == null) return;
    insertAtCursor(matrixPrintBlock(raw));
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
    state.cm = CodeMirror($("editor-host"), {
      mode: "text/x-java",
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 4,
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
    document.documentElement.dataset.theme = theme || "desk";
    $("theme-select").value = theme || "desk";
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
    const data = await api("GET", "/api/projects/" + encodeURIComponent(id));
    state.project = data.project || data;
    state.files = data.files || [];
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
      if (!confirm("Save changes to " + state.path + "?")) {
        /* keep going without save */
      } else {
        await saveFile();
      }
    }
    const file = state.files.find((f) => f.path === path);
    if (!file) throw new Error("File not found.");
    const cm = ensureEditor();
    state.path = path;
    state.dirty = false;
    cm.setValue(file.content || "");
    $("edit-path").textContent = path;
    $("edit-status").textContent = "Saved";
    $("edit-status").className = "ok";
    renderFiles();
    $("btn-save").hidden = state.view !== "edit";
  }

  async function saveFile() {
    if (!state.project || !state.path || !state.cm) return;
    const content = state.cm.getValue();
    await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", {
      path: state.path,
      content: content
    });
    const file = state.files.find((f) => f.path === state.path);
    if (file) file.content = content;
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
    const stub = path.endsWith(".java")
      ? "public class " + (path.split("/").pop() || "Main").replace(/\\.java$/, "") + " {\n    public static void main(String[] args) {\n        System.out.println(\"Hello from Lark Mobile\");\n    }\n}\n"
      : "";
    await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", {
      path: path,
      content: stub
    });
    const data = await api("GET", "/api/projects/" + encodeURIComponent(state.project.id));
    state.files = data.files || [];
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
    $("btn-matrix").addEventListener("click", () => insertMatrixPrint());
    $("btn-matrix-more").addEventListener("click", () => insertMatrixPrint());
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
      applyTheme(state.settings.theme || "desk");
      applyFont(Math.max(14, state.settings.fontSize || 16));
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

  boot();
})();
