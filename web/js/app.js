(function () {
  const THEME_NAMES = {
    desk: "Desk",
    slate: "Slate",
    studio: "Studio",
    daylight: "Daylight",
    moss: "Moss",
    ember: "Ember",
    fog: "Fog",
    blossom: "Blossom",
    candy: "Candy",
    midnight: "Midnight",
    citrus: "Citrus",
    harbor: "Harbor",
    graphite: "Graphite & Teal",
    navy: "Midnight Blue",
    terminal: "Terminal Green",
    parchment: "Paper & Ink",
    ultraviolet: "Ultraviolet",
    forest: "Forest",
    monochrome: "Monochrome",
    amber: "Amber Terminal",
    lagoon: "Lagoon",
    rosewood: "Rosewood",
    nova: "Nova",
    atelier: "Atelier",
    obsidian: "Obsidian",
    glacier: "Glacier",
    cedar: "Cedar",
    inkwell: "Inkwell",
    porcelain: "Porcelain",
    hearth: "Hearth",
    canopy: "Canopy",
    ink: "Desk",
    paper: "Daylight",
    tide: "Moss",
    copper: "Ember",
    chalk: "Fog",
    kawaii: "Blossom",
    pink: "Blossom"
  };
  const THEME_CANON = {
    ink: "desk",
    paper: "daylight",
    tide: "moss",
    copper: "ember",
    chalk: "fog",
    kawaii: "blossom",
    pink: "blossom"
  };
  const THEME_IDS = [
    "desk", "slate", "studio", "daylight", "moss", "ember", "fog",
    "blossom", "candy", "midnight", "citrus", "harbor",
    "graphite", "navy", "terminal", "parchment", "ultraviolet", "forest", "monochrome", "amber",
    "lagoon", "rosewood", "nova", "atelier", "obsidian", "glacier",
    "cedar", "inkwell", "porcelain", "hearth", "canopy"
  ];
  const FONT_STACKS = {
    jetbrains: '"JetBrains Mono", "Cascadia Mono", "Liberation Mono", ui-monospace, monospace',
    cascadia: '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", ui-monospace, monospace',
    fira: '"Fira Code", "JetBrains Mono", ui-monospace, monospace',
    consolas: 'Consolas, Menlo, Monaco, "Courier New", monospace',
    system: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  };
  const state = {
    settings: null,
    projects: [],
    project: null,
    files: [],
    dirs: [],
    open: [],
    active: null,
    activeB: null,
    selected: null,
    collapsed: new Set(),
    problems: [],
    localProblems: [],
    job: null,
    poll: null,
    dirty: new Set(),
    timers: new Map(),
    terminal: null,
    termPoll: null,
    termHistory: [],
    termHistIndex: -1,
    consoleTab: "output",
    recent: [],
    breakpoints: new Map(),
    debug: null,
    debugPoll: null,
    debugLineMark: null,
    split: false,
    runConfigs: [],
    testJob: null,
    testPoll: null,
    discoveredTests: [],
    paletteItems: [],
    compileProblems: [],
    checkTimer: null,
    checkSeq: 0,
    braceMarks: [],
    searchHits: [],
    searchIndex: 0,
    dragPath: null,
    dragTab: null
  };
  const docs = new Map();
  const parsedCache = new Map();
  const lineMarks = [];
  let cm = null;
  let cmB = null;
  let focusedEditor = "a";
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
    if (!THEME_NAMES[theme] || !THEME_IDS.includes(theme)) theme = "desk";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("lark-theme", theme); } catch (e) {}
    $("theme").textContent = themeName(theme);
    if (save && state.settings) {
      api("PUT", "/api/settings", { theme: theme }).catch((err) => toast(err.message));
    }
  }

  function editorFontPx(fontSize, zoom) {
    const base = Math.min(24, Math.max(11, Math.round(Number(fontSize) || 14)));
    const scale = Math.min(150, Math.max(80, Math.round((Number(zoom) || 100) / 5) * 5));
    return Math.min(28, Math.max(11, Math.round(base * (scale / 100))));
  }

  /** Drop CodeMirror measurement caches so the caret matches glyphs after font changes. */
  function refreshEditorMetrics(editor, px) {
    if (!editor) return;
    const wrap = editor.getWrapperElement();
    if (wrap) wrap.style.fontSize = px + "px";
    try {
      if (editor.display) {
        editor.display.cachedCharWidth = null;
        editor.display.cachedTextHeight = null;
        editor.display.maxLineChanged = true;
      }
    } catch (e) {}
    editor.refresh();
  }

  function refreshAllEditors() {
    const px = editorFontPx(
      state.settings && state.settings.fontSize,
      state.settings && state.settings.zoom
    );
    refreshEditorMetrics(cm, px);
    refreshEditorMetrics(cmB, px);
    requestAnimationFrame(() => {
      refreshEditorMetrics(cm, px);
      refreshEditorMetrics(cmB, px);
    });
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
    // Editor scale only — never CSS zoom on #workspace (that shifted trays and misaligned the caret).
    const px = editorFontPx(fontSize, zoom);
    document.documentElement.style.setProperty("--editor-font-size", px + "px");
    document.documentElement.style.removeProperty("zoom");
    document.body.style.removeProperty("zoom");
    const workspace = $("workspace");
    if (workspace) {
      workspace.style.removeProperty("zoom");
      workspace.style.removeProperty("transform");
    }
    const fontSlider = $("setting-font");
    const zoomSlider = $("setting-zoom");
    if (fontSlider) fontSlider.value = String(fontSize);
    if (zoomSlider) zoomSlider.value = String(zoom);
    if ($("setting-font-out")) $("setting-font-out").textContent = String(fontSize);
    if ($("setting-zoom-out")) $("setting-zoom-out").textContent = zoom + "%";
    refreshAllEditors();
    if (save) {
      api("PUT", "/api/settings", { fontSize: fontSize, zoom: zoom }).catch((err) => toast(err.message));
    }
    const settingsPop = $("menu-settings");
    if (settingsPop && !settingsPop.hidden && $("settings")) placePopover(settingsPop, $("settings"));
  }

  function applyEditorPrefs(opts, save) {
    if (!state.settings) state.settings = {};
    const next = Object.assign({}, state.settings, opts || {});
    let family = next.fontFamily || "jetbrains";
    if (!FONT_STACKS[family]) family = "jetbrains";
    let indentSize = Number(next.indentSize);
    if (indentSize !== 2 && indentSize !== 4 && indentSize !== 8) indentSize = 4;
    let delay = Number(next.autoSaveDelayMs);
    if (delay !== 300 && delay !== 800 && delay !== 1500) delay = 800;
    const ligatures = next.ligatures !== false;
    const indentWithTabs = !!next.indentWithTabs;
    const lineWrapping = !!next.lineWrapping;
    const lineNumbers = next.lineNumbers !== false;
    const autoSave = next.autoSave !== false;
    const formatOnSave = !!next.formatOnSave;

    state.settings.fontFamily = family;
    state.settings.ligatures = ligatures;
    state.settings.indentSize = indentSize;
    state.settings.indentWithTabs = indentWithTabs;
    state.settings.lineWrapping = lineWrapping;
    state.settings.lineNumbers = lineNumbers;
    state.settings.autoSave = autoSave;
    state.settings.autoSaveDelayMs = delay;
    state.settings.formatOnSave = formatOnSave;

    document.documentElement.dataset.font = family;
    document.documentElement.style.setProperty("--mono", FONT_STACKS[family]);
    document.documentElement.style.setProperty("--font", FONT_STACKS[family]);
    document.body.classList.toggle("no-ligatures", !ligatures);

    if ($("setting-font-family")) $("setting-font-family").value = family;
    if ($("setting-ligatures")) $("setting-ligatures").checked = ligatures;
    if ($("setting-indent-size")) $("setting-indent-size").value = String(indentSize);
    if ($("setting-indent-tabs")) $("setting-indent-tabs").checked = indentWithTabs;
    if ($("setting-line-wrap")) $("setting-line-wrap").checked = lineWrapping;
    if ($("setting-line-numbers")) $("setting-line-numbers").checked = lineNumbers;
    if ($("setting-autosave")) $("setting-autosave").checked = autoSave;
    if ($("setting-autosave-delay")) $("setting-autosave-delay").value = String(delay);
    if ($("setting-autosave-delay")) $("setting-autosave-delay").disabled = !autoSave;
    if ($("setting-format-save")) $("setting-format-save").checked = formatOnSave;

    if (cm) {
      const spaces = indentWithTabs ? "\t" : " ".repeat(indentSize);
      cm.setOption("indentUnit", indentSize);
      cm.setOption("tabSize", indentSize);
      cm.setOption("indentWithTabs", indentWithTabs);
      cm.setOption("lineWrapping", lineWrapping);
      cm.setOption("lineNumbers", lineNumbers);
      cm.setOption("extraKeys", Object.assign({}, cm.getOption("extraKeys"), {
        Tab: function (editor) {
          if (editor.somethingSelected()) editor.indentSelection("add");
          else editor.replaceSelection(spaces, "end");
        }
      }));
    }
    if (cmB) {
      cmB.setOption("indentUnit", indentSize);
      cmB.setOption("tabSize", indentSize);
      cmB.setOption("indentWithTabs", indentWithTabs);
      cmB.setOption("lineWrapping", lineWrapping);
      cmB.setOption("lineNumbers", lineNumbers);
      cmB.setOption("extraKeys", editorExtraKeys());
    }
    refreshAllEditors();

    if (save) {
      api("PUT", "/api/settings", {
        fontFamily: family,
        ligatures: ligatures,
        indentSize: indentSize,
        indentWithTabs: indentWithTabs,
        lineWrapping: lineWrapping,
        lineNumbers: lineNumbers,
        autoSave: autoSave,
        autoSaveDelayMs: delay,
        formatOnSave: formatOnSave
      }).catch((err) => toast(err.message));
    }
  }

  function bumpZoom(delta) {
    const current = state.settings && state.settings.zoom ? state.settings.zoom : 100;
    applyDisplay({ zoom: current + delta }, true);
  }

  function bumpFont(delta) {
    const current = state.settings && state.settings.fontSize ? state.settings.fontSize : 14;
    applyDisplay({ fontSize: current + delta }, true);
  }

  function resetDisplaySize() {
    applyDisplay({ fontSize: 14, zoom: 100 }, true);
    document.documentElement.style.setProperty("--files-w", "260px");
    document.documentElement.style.setProperty("--console-h", "188px");
    savePanels();
    refreshAllEditors();
    toast("Font, scale, and panels reset.");
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
      lineNumbers: !(state.settings && state.settings.lineNumbers === false),
      gutters: ["CodeMirror-linenumbers", "breakpoints"],
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      lineWrapping: !!(state.settings && state.settings.lineWrapping),
      matchBrackets: true,
      // Do not auto-pair /* */ — that fights IntelliJ-style /** Javadoc expansion.
      autoCloseBrackets: { pairs: "()[]{}''\"\"", explode: "[]{}" },
      styleActiveLine: true,
      hintOptions: { completeSingle: false, closeOnUnfocus: true },
      extraKeys: editorExtraKeys()
    });
    wireEditor(cm, "a");
    cm.on("inputRead", (editor, change) => {
      if (suppress || !state.active || !change || !change.text) return;
      const typed = change.text.join("");
      // Show options while typing — never auto-insert the first match.
      if (!typed || !/[A-Za-z0-9_.$]/.test(typed)) return;
      if (editor.state.completionActive) return;
      CodeMirror.showHint(editor, completeHintSuggest, {
        completeSingle: false,
        closeOnUnfocus: true
      });
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
      scheduleCompileCheck();
      if (state.settings && state.settings.autoSave === false) setSaveStatus("Unsaved");
      else setSaveStatus("Saving…");
    });
    cm.on("cursorActivity", () => {
      const cursor = cm.getCursor();
      $("status-cursor").textContent = "Ln " + (cursor.line + 1) + ", Col " + (cursor.ch + 1);
      updateSignatureHelp();
      updateBraceGuide(cm);
    });
  }

  function editorExtraKeys() {
    return {
      "Tab": function (editor) {
        if (editor.somethingSelected()) editor.indentSelection("add");
        else {
          const n = (state.settings && state.settings.indentSize) || 4;
          const spaces = (state.settings && state.settings.indentWithTabs) ? "\t" : " ".repeat(n);
          editor.replaceSelection(spaces, "end");
        }
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
      "Shift-Alt-F": () => beautifyActiveFile(),
      "Ctrl-Alt-L": () => beautifyActiveFile(),
      "Cmd-Alt-L": () => beautifyActiveFile(),
      "Ctrl-Space": (editor) => CodeMirror.showHint(editor, completeHintFull, {
        completeSingle: false,
        closeOnUnfocus: true
      }),
      "Cmd-Space": (editor) => CodeMirror.showHint(editor, completeHintFull, {
        completeSingle: false,
        closeOnUnfocus: true
      }),
      "F12": () => goToDefinition().catch((e) => toast(e.message)),
      "Shift-F12": () => findUsagesAtCursor().catch((e) => toast(e.message)),
      "F2": () => renameSymbol().catch((e) => toast(e.message)),
      "F5": () => startDebug().catch((e) => toast(e.message)),
      "Ctrl-D": () => renameInFileMulti(),
      "Cmd-D": () => renameInFileMulti(),
      "Ctrl-M": () => jumpMatchingBrace(),
      "Cmd-M": () => jumpMatchingBrace(),
      "Shift-Ctrl-F": () => openProjectSearch(),
      "Shift-Cmd-F": () => openProjectSearch(),
      "Ctrl-Alt-M": () => extractMethodAtSelection().catch((e) => toast(e.message)),
      "Cmd-Alt-M": () => extractMethodAtSelection().catch((e) => toast(e.message)),
      "Ctrl-Alt-V": () => introduceVarAtSelection().catch((e) => toast(e.message)),
      "Cmd-Alt-V": () => introduceVarAtSelection().catch((e) => toast(e.message))
    };
  }

  function wireEditor(editor, which) {
    if (!editor || editor._larkWired) return;
    editor._larkWired = true;
    editor.on("gutterClick", (ed, line, gutter) => {
      if (gutter !== "breakpoints" && gutter !== "CodeMirror-linenumbers") return;
      const path = which === "b" ? state.activeB : state.active;
      toggleBreakpoint(path, line + 1, ed);
    });
    editor.on("focus", () => { focusedEditor = which; });
  }

  function activeCm() {
    return focusedEditor === "b" && cmB ? cmB : cm;
  }

  function activePath() {
    return focusedEditor === "b" && state.activeB ? state.activeB : state.active;
  }

  function pushRecent(path) {
    if (!path) return;
    state.recent = [path].concat(state.recent.filter((p) => p !== path)).slice(0, 24);
    try { localStorage.setItem("lark-recent-files", JSON.stringify(state.recent)); } catch (e) {}
  }

  function loadRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem("lark-recent-files") || "[]");
      state.recent = Array.isArray(raw) ? raw.filter((p) => typeof p === "string") : [];
    } catch (e) { state.recent = []; }
  }

  function bpSet(path) {
    if (!path) return new Set();
    if (!state.breakpoints.has(path)) state.breakpoints.set(path, new Set());
    return state.breakpoints.get(path);
  }

  function toggleBreakpoint(path, line, editor) {
    if (!path || !line) return;
    const set = bpSet(path);
    if (set.has(line)) set.delete(line);
    else set.add(line);
    paintBreakpoints(path, editor || cm);
  }

  function paintBreakpoints(path, editor) {
    if (!editor || !path) return;
    const info = editor.lineCount();
    for (let i = 0; i < info; i++) editor.setGutterMarker(i, "breakpoints", null);
    const set = state.breakpoints.get(path);
    if (!set) return;
    set.forEach((line) => {
      const el = document.createElement("div");
      el.className = "cm-breakpoint";
      el.textContent = "●";
      editor.setGutterMarker(line - 1, "breakpoints", el);
    });
  }

  function collectBreakpoints() {
    const out = [];
    state.breakpoints.forEach((set, file) => {
      set.forEach((line) => out.push({ file: file, line: line }));
    });
    return out;
  }

  function javadocTriggerLine(line) {
    const trimmed = (line || "").trim();
    // Bare opener, or the broken form autoCloseBrackets sometimes leaves behind.
    return trimmed === "/**" || trimmed === "/***" || trimmed === "/**/" || trimmed === "/***/";
  }

  function signatureUnderJavadoc(editor, lineNo) {
    const following = [];
    for (let i = lineNo + 1; i < Math.min(editor.lineCount(), lineNo + 12); i++) {
      const text = (editor.getLine(i) || "").trim();
      if (!text) continue;
      if (text.startsWith("@") || text.startsWith("//") || text.startsWith("*") || text.startsWith("/**")) continue;
      following.push(text);
      if (text.includes("{") || text.includes(";")) break;
    }
    return following.join(" ");
  }

  function enclosingTypeName(editor, lineNo) {
    for (let i = lineNo; i >= 0 && i > lineNo - 80; i--) {
      const text = editor.getLine(i) || "";
      const m = text.match(/\b(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/);
      if (m) return m[1];
    }
    return "";
  }

  function buildJavadocStub(editor, lineNo, indent) {
    const signature = signatureUnderJavadoc(editor, lineNo);
    const typeName = enclosingTypeName(editor, lineNo);
    if (window.LarkJava && typeof window.LarkJava.generateJavadoc === "function") {
      return window.LarkJava.generateJavadoc(signature, indent, typeName).text;
    }
    // Fallback if java.js is old
    const lines = [indent + "/**", indent + " * "];
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
    // Place cursor at end of the summary line so the student can tweak wording.
    const summaryLine = lineNo + 1;
    const summaryText = editor.getLine(summaryLine) || (indent + " * ");
    editor.setCursor({ line: summaryLine, ch: summaryText.length });
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

  function collectNameHints(prefix) {
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
    const lower = (prefix || "").toLowerCase();
    const list = [];
    names.forEach((kind, name) => {
      if (prefix && !name.startsWith(prefix) && !name.toLowerCase().startsWith(lower)) return;
      // Suggestion-only: insert the name, never a whole block while typing.
      list.push({ text: name, displayText: name + "  " + kind });
    });
    list.sort((a, b) => a.displayText.localeCompare(b.displayText));
    return list;
  }

  function completeHintSuggest(editor) {
    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);
    let prefix = token.string || "";
    let from = token.start;
    if (!/^[\w$]+$/.test(prefix)) {
      prefix = "";
      from = cursor.ch;
    }
    if (!prefix) return null;
    const list = collectNameHints(prefix).slice(0, 40);
    if (!list.length) return null;
    return {
      list: list,
      from: CodeMirror.Pos(cursor.line, from),
      to: CodeMirror.Pos(cursor.line, cursor.ch)
    };
  }

  function completeHintFull(editor) {
    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);
    let prefix = token.string || "";
    let from = token.start;
    if (!/^[\w$]+$/.test(prefix)) {
      prefix = "";
      from = cursor.ch;
    }
    const lower = prefix.toLowerCase();
    const list = [];
    (window.LarkJava.matchingSnippets(prefix) || []).forEach((snip) => {
      list.push({
        text: snip.text,
        displayText: snip.trigger + "  → " + snip.label,
        className: "cm-hint-snip"
      });
    });
    collectNameHints(prefix).forEach((item) => list.push(item));
    list.sort((a, b) => {
      const aSnip = (a.displayText || "").indexOf("→") >= 0 ? 0 : 1;
      const bSnip = (b.displayText || "").indexOf("→") >= 0 ? 0 : 1;
      if (aSnip !== bSnip) return aSnip - bSnip;
      return a.displayText.localeCompare(b.displayText);
    });
    if (!list.length) return null;
    return {
      list: list.slice(0, 80),
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
    if (!state.settings || state.settings.autoSave === false) {
      setSaveStatus("Unsaved");
      return;
    }
    const delay = Number(state.settings.autoSaveDelayMs) || 800;
    state.timers.set(path, setTimeout(() => {
      state.timers.delete(path);
      saveFile(path, true);
    }, delay));
  }

  async function saveFile(path, fromAutosave) {
    const doc = docs.get(path);
    let content = doc ? doc.getValue() : (fileByPath(path) || {}).content;
    if (content == null || !state.project) return;
    if (state.settings && state.settings.formatOnSave && String(path).endsWith(".java")) {
      const pretty = window.LarkJava.beautifyJava(content, {
        indentSize: (state.settings && state.settings.indentSize) || 4,
        indentWithTabs: !!(state.settings && state.settings.indentWithTabs)
      });
      if (pretty !== content) {
        content = pretty;
        if (doc) {
          const cur = (cm && state.active === path) ? cm.getCursor() : (cmB && state.activeB === path ? cmB.getCursor() : null);
          suppress = true;
          doc.setValue(pretty);
          suppress = false;
          if (cur && cm && state.active === path) cm.setCursor(cur);
          if (cur && cmB && state.activeB === path) cmB.setCursor(cur);
        }
      }
    }
    try {
      await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", {
        path: path,
        content: content
      });
      const file = fileByPath(path);
      if (file) file.content = content;
      state.dirty.delete(path);
      renderTabs();
      renderTabsB();
      if (state.dirty.size) setSaveStatus("Saving…");
      else setSaveStatus(fromAutosave ? "Autosaved" : "Saved");
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

  function beautifyActiveFile() {
    if (!cm || !state.active) {
      toast("Open a file first.");
      return false;
    }
    if (!state.active.endsWith(".java")) {
      toast("Beautify works on Java files.");
      return false;
    }
    const before = cm.getValue();
    const cursor = cm.getCursor();
    const pretty = window.LarkJava.beautifyJava(before, {
      indentSize: (state.settings && state.settings.indentSize) || 4,
      indentWithTabs: !!(state.settings && state.settings.indentWithTabs)
    });
    const normalize = (s) => String(s).replace(/\s+$/g, "");
    if (normalize(pretty) === normalize(before)) {
      toast("Already tidy.");
      return false;
    }
    suppress = true;
    cm.setValue(pretty);
    suppress = false;
    const maxLine = Math.max(0, cm.lineCount() - 1);
    cm.setCursor({
      line: Math.min(cursor.line, maxLine),
      ch: cursor.ch
    });
    cm.focus();
    const file = fileByPath(state.active);
    if (file) file.content = pretty;
    state.dirty.add(state.active);
    renderTabs();
    renderStructure();
    refreshLocalProblems();
    renderProblems();
    markErrors();
    scheduleSave(state.active);
    setSaveStatus(state.settings && state.settings.autoSave === false ? "Unsaved" : "Saving…");
    toast("Beautified indentation.");
    return true;
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
    if ($("tray-project")) {
      $("tray-project").textContent = state.project ? state.project.name : "Project";
    }
    box.ondragover = (event) => {
      if (!state.dragPath) return;
      if (event.target.closest && event.target.closest(".tree-row")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      box.classList.add("drop-root");
    };
    box.ondragleave = (event) => {
      if (event.target === box) box.classList.remove("drop-root");
    };
    box.ondrop = (event) => {
      box.classList.remove("drop-root");
      if (event.target.closest && event.target.closest(".tree-row")) return;
      event.preventDefault();
      const from = event.dataTransfer.getData("text/lark-path") || state.dragPath;
      if (from) dropMoveToDir(from, "").catch((err) => toast(err.message));
    };
    const root = buildTree();
    if (!root.children.length) {
      const p = document.createElement("p");
      p.className = "muted pad";
      p.textContent = "This project is empty.";
      box.appendChild(p);
      return;
    }
    root.children.forEach((node, i) => {
      const el = renderNode(node, 0);
      el.style.animationDelay = Math.min(i, 12) * 18 + "ms";
      box.appendChild(el);
    });
  }

  function fileIcon(node) {
    const icon = document.createElement("span");
    icon.className = "tree-icon";
    if (node.dir) {
      icon.classList.add("folder");
      icon.textContent = state.collapsed.has(node.path) ? "▸" : "▾";
      return icon;
    }
    if (node.path.endsWith(".java")) {
      icon.textContent = "J";
      return icon;
    }
    icon.classList.add("txt");
    icon.textContent = node.path.endsWith(".txt") ? "T" : "·";
    return icon;
  }

  function renderNode(node, depth) {
    const wrap = document.createElement("div");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row" + (node.path === state.active ? " active" : "") + (node.path === state.selected ? " selected" : "") + (node.path.endsWith(".java") ? " java" : "") + (node.dir ? " folder" : " file");
    row.style.paddingLeft = (10 + depth * 16) + "px";
    row.dataset.path = node.path;
    row.dataset.dir = node.dir ? "1" : "0";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = node.name;
    row.append(fileIcon(node), name);
    row.title = (node.path || node.name) + (node.dir ? " — drop files here" : " — drag to move");
    row.draggable = true;
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/lark-path", node.path);
      event.dataTransfer.setData("text/plain", node.path);
      event.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
      state.dragPath = node.path;
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      state.dragPath = null;
      document.querySelectorAll(".tree-row.drop-target").forEach((el) => el.classList.remove("drop-target"));
    });
    row.addEventListener("dragover", (event) => {
      const from = state.dragPath || event.dataTransfer.getData("text/lark-path");
      if (!from || from === node.path) return;
      // Drop onto folders, or onto a file's parent (highlight the file row as sibling target).
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drop-target");
      const from = event.dataTransfer.getData("text/lark-path") || state.dragPath;
      if (!from) return;
      const destDir = node.dir ? node.path : parentDir(node.path);
      dropMoveToDir(from, destDir).catch((err) => toast(err.message));
    });
    row.addEventListener("click", () => {
      if (node.dir) {
        const already = state.selected === node.path;
        state.selected = node.path;
        if (state.collapsed.has(node.path)) state.collapsed.delete(node.path);
        else if (already) state.collapsed.add(node.path);
        renderTree();
      } else {
        state.selected = node.path;
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

  async function dropMoveToDir(from, destDir) {
    if (!from || !state.project) return;
    const base = from.slice(from.lastIndexOf("/") + 1);
    const dest = destDir ? (destDir.replace(/\/+$/, "") + "/" + base) : base;
    if (dest === from) return;
    if (dest === from + "/" + base || dest.startsWith(from + "/")) {
      return toast("Can't move a folder into itself.");
    }
    await movePath(from, dest);
    toast("Moved to " + (destDir || "(project root)"));
  }

  function renderTabs() {
    const box = $("tabs");
    box.replaceChildren();
    state.open.forEach((path, index) => {
      const tab = document.createElement("div");
      tab.className = "tab" + (path === state.active ? " on" : "");
      tab.draggable = true;
      tab.dataset.path = path;
      tab.dataset.index = String(index);
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
      close.draggable = false;
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(path);
      });
      close.addEventListener("mousedown", (event) => event.stopPropagation());
      tab.addEventListener("auxclick", (event) => {
        if (event.button === 1) closeTab(path);
      });
      tab.addEventListener("dragstart", (event) => {
        if (event.target && event.target.closest && event.target.closest(".close")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/lark-tab", path);
        event.dataTransfer.effectAllowed = "move";
        tab.classList.add("dragging");
        state.dragTab = path;
      });
      tab.addEventListener("dragend", () => {
        tab.classList.remove("dragging");
        state.dragTab = null;
        box.querySelectorAll(".tab.drop-before, .tab.drop-after").forEach((el) => {
          el.classList.remove("drop-before", "drop-after");
        });
      });
      tab.addEventListener("dragover", (event) => {
        const from = state.dragTab || event.dataTransfer.getData("text/lark-tab");
        if (!from || from === path) return;
        event.preventDefault();
        const rect = tab.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        tab.classList.toggle("drop-before", before);
        tab.classList.toggle("drop-after", !before);
      });
      tab.addEventListener("dragleave", () => tab.classList.remove("drop-before", "drop-after"));
      tab.addEventListener("drop", (event) => {
        event.preventDefault();
        const from = event.dataTransfer.getData("text/lark-tab") || state.dragTab;
        tab.classList.remove("drop-before", "drop-after");
        if (!from || from === path) return;
        const rect = tab.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        reorderTab(from, path, before);
      });
      tab.append(label, close);
      box.appendChild(tab);
    });
  }

  function reorderTab(fromPath, toPath, before) {
    const from = state.open.indexOf(fromPath);
    let to = state.open.indexOf(toPath);
    if (from < 0 || to < 0 || from === to) return;
    const next = state.open.slice();
    next.splice(from, 1);
    to = next.indexOf(toPath);
    if (to < 0) return;
    next.splice(before ? to : to + 1, 0, fromPath);
    state.open = next;
    renderTabs();
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
    if ($("editors-row")) $("editors-row").hidden = true;
    $("editor").hidden = true;
    renderStructure();
    $("status-path").textContent = state.project ? state.project.name : "Lark";
  }

  function showWelcome() {
    const welcome = $("welcome");
    if (!welcome) return;
    $("empty").hidden = true;
    if ($("editors-row")) $("editors-row").hidden = true;
    $("editor").hidden = true;
    welcome.hidden = false;
    state.active = null;
    renderTabs();
    renderWelcomeRecent();
    $("status-path").textContent = "Welcome";
    document.title = "Lark";
  }

  function hideWelcome() {
    const welcome = $("welcome");
    if (welcome) welcome.hidden = true;
    if ($("editors-row")) $("editors-row").hidden = false;
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

  function openPath(path, opts) {
    const file = fileByPath(path);
    if (!file) return;
    hideWelcome();
    ensureEditor();
    const intoB = opts && opts.side === "b" && state.split;
    if (!state.open.includes(path)) state.open.push(path);
    if (intoB) state.activeB = path;
    else {
      state.active = path;
      state.selected = path;
      focusedEditor = "a";
    }
    pushRecent(path);
    let doc = docs.get(path);
    if (!doc) {
      doc = CodeMirror.Doc(file.content || "", modeFor(path));
      docs.set(path, doc);
    }
    const target = intoB ? ensureSplitEditor() : cm;
    const other = intoB ? cm : cmB;
    // A CodeMirror Doc can only be shown in one editor — link a sibling for the split.
    let viewDoc = doc;
    if (other && other.getDoc && other.getDoc() === doc) {
      viewDoc = doc.linkedDoc({ sharedHist: true });
    }
    suppress = true;
    target.swapDoc(viewDoc);
    suppress = false;
    $("empty").hidden = true;
    if ($("editors-row")) $("editors-row").hidden = false;
    $("editor").hidden = false;
    target.setOption("mode", modeFor(path));
    target.refresh();
    paintBreakpoints(path, target);
    renderTabs();
    renderTabsB();
    renderTree();
    renderStructure();
    const cursor = target.getCursor();
    $("status-cursor").textContent = "Ln " + (cursor.line + 1) + ", Col " + (cursor.ch + 1);
    const crumbs = path.split("/").join(" / ");
    const pkg = path.endsWith(".java") ? parsedFile(file).pkg : "";
    $("status-path").textContent = (pkg ? "package " + pkg + "  ·  " : "") + crumbs;
    document.title = "Lark — " + (state.project ? state.project.name : path);
    refreshLocalProblems();
    markErrors();
    updateSignatureHelp();
  }

  function ensureSplitEditor() {
    if (cmB) return cmB;
    const host = $("editor-b");
    if (!host) return cm;
    cmB = CodeMirror(host, {
      value: "",
      mode: "text/x-java",
      theme: "lark",
      lineNumbers: !(state.settings && state.settings.lineNumbers === false),
      gutters: ["CodeMirror-linenumbers", "breakpoints"],
      indentUnit: (state.settings && state.settings.indentSize) || 4,
      tabSize: (state.settings && state.settings.indentSize) || 4,
      indentWithTabs: !!(state.settings && state.settings.indentWithTabs),
      lineWrapping: !!(state.settings && state.settings.lineWrapping),
      matchBrackets: true,
      autoCloseBrackets: { pairs: "()[]{}''\"\"", explode: "[]{}" },
      styleActiveLine: true,
      extraKeys: editorExtraKeys()
    });
    wireEditor(cmB, "b");
    cmB.on("change", (editor) => {
      if (suppress || !state.activeB) return;
      const path = state.activeB;
      const file = fileByPath(path);
      if (file) file.content = editor.getValue();
      state.dirty.add(path);
      renderTabs();
      renderTabsB();
      scheduleSave(path);
    });
    cmB.on("cursorActivity", () => {
      const cursor = cmB.getCursor();
      $("status-cursor").textContent = "Ln " + (cursor.line + 1) + ", Col " + (cursor.ch + 1);
    });
    return cmB;
  }


  function clearBraceGuide() {
    (state.braceMarks || []).forEach((m) => { try { m.clear(); } catch (e) {} });
    state.braceMarks = [];
  }

  function updateBraceGuide(editor) {
    clearBraceGuide();
    if (!editor) return;
    const cur = editor.getCursor();
    const token = editor.getTokenAt(cur);
    const ch = editor.getLine(cur.line)[cur.ch] || editor.getLine(cur.line)[cur.ch - 1];
    let match = null;
    try {
      if (ch === "{" || ch === "}" || ch === "(" || ch === ")" || ch === "[" || ch === "]") {
        match = editor.findMatchingBracket(cur.ch && editor.getLine(cur.line)[cur.ch] ? cur : { line: cur.line, ch: Math.max(0, cur.ch - 1) });
      } else {
        match = editor.findMatchingBracket(cur);
      }
    } catch (e) { match = null; }
    if (match && match.match) {
      state.braceMarks.push(editor.markText(match.from, { line: match.from.line, ch: match.from.ch + 1 }, { className: "cm-brace-pair" }));
      state.braceMarks.push(editor.markText(match.to, { line: match.to.line, ch: match.to.ch + 1 }, { className: "cm-brace-pair" }));
      if (match.from.line !== match.to.line) {
        const start = Math.min(match.from.line, match.to.line);
        const end = Math.max(match.from.line, match.to.line);
        for (let line = start; line <= end; line++) {
          editor.addLineClass(line, "background", "cm-brace-block");
          state.braceMarks.push({ clear: () => editor.removeLineClass(line, "background", "cm-brace-block") });
        }
      }
    }
    // Enclosing block guide from source offset
    const text = editor.getValue();
    const offset = editor.indexFromPos(cur);
    const range = window.LarkJava.enclosingBraceRange(text, offset);
    if (range) {
      const from = editor.posFromIndex(range.from);
      const to = editor.posFromIndex(range.to);
      if (!match || match.from.line !== from.line) {
        state.braceMarks.push(editor.markText(from, { line: from.line, ch: from.ch + 1 }, { className: "cm-brace-pair" }));
        state.braceMarks.push(editor.markText(to, { line: to.line, ch: to.ch + 1 }, { className: "cm-brace-pair" }));
      }
    }
  }

  function jumpMatchingBrace() {
    const editor = activeCm();
    if (!editor) return;
    const cur = editor.getCursor();
    const match = editor.findMatchingBracket(cur) || editor.findMatchingBracket({ line: cur.line, ch: Math.max(0, cur.ch - 1) });
    if (!match || !match.match) return toast("No matching brace here.");
    editor.setCursor(match.to);
    editor.scrollIntoView(match.to, 60);
    updateBraceGuide(editor);
  }

  function scheduleCompileCheck() {
    if (state.checkTimer) clearTimeout(state.checkTimer);
    state.checkTimer = setTimeout(() => {
      state.checkTimer = null;
      runCompileCheck().catch(() => {});
    }, 1100);
  }

  async function runCompileCheck() {
    if (!state.project) return;
    await flushSaves();
    const seq = ++state.checkSeq;
    try {
      const data = await api("POST", "/api/check", { project: state.project.id });
      if (seq !== state.checkSeq) return;
      state.compileProblems = data.problems || [];
      renderProblems();
      markErrors();
      const errCount = state.compileProblems.filter((p) => p.severity === "error").length;
      if ($("status-check")) {
        $("status-check").textContent = data.clean ? "Compiles" : (errCount ? errCount + " error" + (errCount === 1 ? "" : "s") : "Warnings");
        $("status-check").dataset.state = data.clean ? "ok" : (errCount ? "err" : "warn");
      }
    } catch (err) {
      if ($("status-check")) {
        $("status-check").textContent = "";
        delete $("status-check").dataset.state;
      }
    }
  }

  function openProjectSearch() {
    if (!$("modal").hidden) return;
    closePopovers();
    const box = $("search-panel");
    if (!box) return openPalette("open");
    box.hidden = false;
    $("search-input").value = "";
    $("search-results").replaceChildren();
    $("search-input").focus();
    state.searchHits = [];
    state.searchIndex = 0;
  }

  function closeProjectSearch() {
    if ($("search-panel")) $("search-panel").hidden = true;
  }

  function runProjectSearch(query) {
    const q = (query || "").trim();
    const list = $("search-results");
    if (!list) return;
    list.replaceChildren();
    state.searchHits = [];
    if (!q) {
      list.appendChild(note("Type to search the project."));
      return;
    }
    const lower = q.toLowerCase();
    state.files.forEach((file) => {
      if (!file.path.endsWith(".java") && !file.path.endsWith(".txt")) return;
      const lines = (file.content || "").split("\n");
      lines.forEach((line, i) => {
        if (!line.toLowerCase().includes(lower)) return;
        state.searchHits.push({ file: file.path, line: i + 1, text: line.trim() });
      });
    });
    if (!state.searchHits.length) {
      list.appendChild(note("No matches."));
      return;
    }
    state.searchHits.slice(0, 80).forEach((hit, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-hit" + (index === state.searchIndex ? " active" : "");
      btn.innerHTML = "<strong></strong><span></span>";
      btn.querySelector("strong").textContent = hit.file + ":" + hit.line;
      btn.querySelector("span").textContent = hit.text.slice(0, 120);
      btn.addEventListener("click", () => {
        closeProjectSearch();
        jumpTo(hit.file, hit.line, 1);
      });
      list.appendChild(btn);
    });
  }

  async function introduceVarAtSelection() {
    const editor = activeCm();
    const path = activePath();
    if (!editor || !path || !path.endsWith(".java")) return toast("Select an expression in a Java file.");
    if (!editor.somethingSelected()) return toast("Select the expression first.");
    const selected = editor.getSelection();
    const values = await formDialog({
      title: "Introduce variable",
      ok: "Introduce",
      fields: [
        { name: "name", label: "Name", value: "value" },
        { name: "type", label: "Type (blank = guess)", value: "" }
      ]
    });
    if (!values) return;
    const plan = window.LarkJava.introduceVariable(editor.getValue(), selected, values.name.trim(), values.type.trim());
    if (!plan) return toast("Couldn't introduce a variable from that selection.");
    const from = editor.getCursor("from");
    suppress = true;
    editor.replaceSelection(plan.replacement);
    editor.replaceRange(plan.declaration + "\n" + (editor.getLine(from.line).match(/^\s*/) || [""])[0], { line: from.line, ch: 0 });
    suppress = false;
    let next = editor.getValue();
    if (plan.importHints && plan.importHints.length) {
      const withImp = window.LarkJava.ensureImports(next, plan.importHints);
      if (withImp) {
        suppress = true;
        editor.setValue(withImp);
        suppress = false;
        next = withImp;
      }
    }
    const file = fileByPath(path);
    if (file) file.content = next;
    state.dirty.add(path);
    afterEdit();
    toast("Introduced " + values.name.trim() + ".");
  }

  async function extractMethodAtSelection() {
    const editor = activeCm();
    const path = activePath();
    if (!editor || !path || !path.endsWith(".java")) return toast("Select statements in a Java file.");
    if (!editor.somethingSelected()) return toast("Select the code to extract first.");
    const selected = editor.getSelection();
    const values = await formDialog({
      title: "Extract method",
      ok: "Extract",
      fields: [{ name: "name", label: "Method name", value: "extracted" }]
    });
    if (!values) return;
    const indent = " ".repeat((state.settings && state.settings.indentSize) || 4);
    const plan = window.LarkJava.extractMethod(editor.getValue(), selected, values.name.trim(), indent);
    if (!plan) return toast("Couldn't extract that selection.");
    suppress = true;
    editor.replaceSelection(plan.call);
    const end = editor.lastLine();
    editor.replaceRange(plan.method, { line: end, ch: editor.getLine(end).length });
    suppress = false;
    const file = fileByPath(path);
    if (file) file.content = editor.getValue();
    state.dirty.add(path);
    afterEdit();
    toast(plan.note || ("Extracted " + values.name.trim() + "()."));
  }


  function updateSplitButton() {
    const btn = $("split-editor");
    if (!btn) return;
    btn.textContent = state.split ? "Unsplit" : "Split";
    btn.title = state.split
      ? "Close split editor (Ctrl+\\)"
      : "Split editor (Ctrl+\\)";
    btn.setAttribute("aria-pressed", state.split ? "true" : "false");
  }

  function resetSplitWidths() {
    const colA = $("editor-col-a");
    const colB = $("editor-col-b");
    if (colA) {
      colA.style.flex = "1 1 50%";
      colA.style.width = "";
      colA.style.maxWidth = "";
    }
    if (colB) {
      colB.style.flex = "1 1 50%";
      colB.style.width = "";
      colB.style.maxWidth = "";
    }
  }

  /** keepSide: "a" keeps the left file as primary; "b" promotes the right file. */
  function setSplit(on, keepSide) {
    const want = !!on;
    if (!want && state.split) {
      const promote = keepSide === "b" ? state.activeB : null;
      state.split = false;
      state.activeB = null;
      focusedEditor = "a";
      document.body.classList.remove("split-on", "dragging-split");
      const colB = $("editor-col-b");
      const bar = $("editor-split-bar");
      if (colB) colB.hidden = true;
      if (bar) bar.hidden = true;
      resetSplitWidths();
      updateSplitButton();
      renderTabsB();
      if (promote && fileByPath(promote)) openPath(promote);
      else if (cm) cm.refresh();
      return;
    }
    state.split = want;
    document.body.classList.toggle("split-on", state.split);
    const colB = $("editor-col-b");
    const bar = $("editor-split-bar");
    if (colB) colB.hidden = !state.split;
    if (bar) bar.hidden = !state.split;
    if (state.split) {
      resetSplitWidths();
      ensureSplitEditor();
      if (!state.activeB && state.active) openPath(state.active, { side: "b" });
      if (cmB) cmB.refresh();
    } else {
      state.activeB = null;
      focusedEditor = "a";
      resetSplitWidths();
    }
    updateSplitButton();
    renderTabsB();
    if (cm) cm.refresh();
  }

  function toggleSplit() {
    if (state.split) setSplit(false, "a");
    else setSplit(true);
  }

  function closeSplit() {
    setSplit(false, "a");
  }

  function renderTabsB() {
    const box = $("tabs-b");
    if (!box) return;
    box.replaceChildren();
    if (!state.split) return;
    const path = state.activeB;
    if (!path) {
      const hint = document.createElement("span");
      hint.className = "muted pad";
      hint.textContent = "Open a file here";
      box.appendChild(hint);
      return;
    }
    const tab = document.createElement("div");
    tab.className = "tab on";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-name";
    btn.textContent = path.split("/").pop();
    btn.title = path;
    btn.addEventListener("click", () => openPath(path, { side: "b" }));
    tab.appendChild(btn);
    box.appendChild(tab);
  }

  function bindEditorSplitBar() {
    const bar = $("editor-split-bar");
    const row = $("editors-row");
    const colA = $("editor-col-a");
    const colB = $("editor-col-b");
    if (!bar || !row || !colA || !colB || bar._larkBound) return;
    bar._larkBound = true;
    const CLOSE_PX = 72;
    bar.addEventListener("pointerdown", (event) => {
      if (!state.split) return;
      event.preventDefault();
      bar.setPointerCapture(event.pointerId);
      document.body.classList.add("dragging", "dragging-split");
      const rowRect = () => row.getBoundingClientRect();
      const move = (ev) => {
        if (!bar.hasPointerCapture(ev.pointerId)) return;
        const rect = rowRect();
        const x = Math.min(rect.right - 4, Math.max(rect.left + 4, ev.clientX));
        let left = x - rect.left;
        const total = rect.width;
        // Leave room for the bar itself.
        left = Math.min(total - 6, Math.max(0, left));
        const right = Math.max(0, total - left - 6);
        colA.style.flex = "0 0 auto";
        colB.style.flex = "0 0 auto";
        colA.style.width = left + "px";
        colB.style.width = right + "px";
        if (cm) cm.refresh();
        if (cmB) cmB.refresh();
      };
      const up = (ev) => {
        try { bar.releasePointerCapture(ev.pointerId); } catch (e) {}
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", up);
        document.body.classList.remove("dragging", "dragging-split");
        const rect = rowRect();
        const aW = colA.getBoundingClientRect().width;
        const bW = colB.getBoundingClientRect().width;
        // Drag divider all the way left → close left, keep right as the editor.
        if (aW < CLOSE_PX) {
          setSplit(false, "b");
          toast("Closed left pane.");
          return;
        }
        // Drag divider all the way right → close right split.
        if (bW < CLOSE_PX) {
          setSplit(false, "a");
          toast("Closed split.");
          return;
        }
        // Keep a stable 50/50-ish flex from the dragged sizes.
        const total = Math.max(1, aW + bW);
        colA.style.flex = "1 1 " + Math.round((aW / total) * 100) + "%";
        colB.style.flex = "1 1 " + Math.round((bW / total) * 100) + "%";
        colA.style.width = "";
        colB.style.width = "";
        if (cm) cm.refresh();
        if (cmB) cmB.refresh();
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
      move(event);
    });
    bar.addEventListener("dblclick", () => {
      if (!state.split) return;
      resetSplitWidths();
      if (cm) cm.refresh();
      if (cmB) cmB.refresh();
    });
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
    state.runConfigs = data.project.runConfigs || [];
    state.discoveredTests = [];
    state.dirty.clear();
    setSplit(false, "a");
    renderRunConfigMenu();
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
    const dir = (selectedDir() || "src").replace(/\/+$/, "") || "src";
    const values = await formDialog({
      title: "New class",
      ok: "Create",
      note: "Creates in folder: " + dir + "/",
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
    // Always place the new class inside the selected explorer folder.
    const path = dir + "/" + name + ".java";
    if (fileByPath(path)) return toast("There's already a file at " + path + ".");
    const content = classTemplate(values.kind, name, pkg);
    await writeNewFile(path, content);
    toast("Created " + path);
  }

  function currentJavaParsed() {
    if (!state.active || !state.active.endsWith(".java")) return null;
    const file = fileByPath(state.active);
    return file ? parsedFile(file) : null;
  }

  function afterEdit() {
    const file = fileByPath(state.active);
    if (file) file.content = cm.getValue();
    state.dirty.add(state.active);
    scheduleSave(state.active);
    renderStructure();
    refreshLocalProblems();
    renderProblems();
    markErrors();
    scheduleCompileCheck();
  }

  function insertAtCursor(code) {
    if (!cm || !code) return;
    const cur = cm.getCursor();
    const lineText = cm.getLine(cur.line) || "";
    const indent = (lineText.match(/^\s*/) || [""])[0];
    let indented = code.split("\n").map((line, i) => (i === 0 ? line : indent + line)).join("\n");
    if (!indented.endsWith("\n")) indented += "\n";
    suppress = true;
    cm.replaceRange(indented, cur);
    suppress = false;
    afterEdit();
    cm.focus();
  }

  async function insertHomeworkBlock(kind) {
    if (!window.LarkJava || !window.LarkJava.generateHomeworkBlock) return null;
    const snip = (window.LarkJava.snippets || []).find((s) => s.id === kind);
    const label = snip ? snip.label : kind;
    let options = {};
    if (kind === "arrfill") {
      const values = await formDialog({
        title: "Fill + print array",
        ok: "Insert",
        note: "Reads ints from Scanner into an array, then prints them.",
        fields: [
          { name: "name", label: "Array variable name", value: "nums" },
          { name: "size", label: "Length", value: "10" }
        ]
      });
      if (!values) return null;
      options = { name: values.name, size: values.size };
    } else if (kind === "arrstats" || kind === "arrcopy" || kind === "arrrev") {
      const values = await formDialog({
        title: label,
        ok: "Insert",
        note: "Uses an existing int[] (or rename to match yours).",
        fields: [{ name: "name", label: "Array variable name", value: "nums" }]
      });
      if (!values) return null;
      options = { name: values.name };
    } else if (kind === "linsearch") {
      const values = await formDialog({
        title: "Linear search",
        ok: "Insert",
        note: "Scans the array for a target value and reports the index.",
        fields: [
          { name: "name", label: "Array variable name", value: "nums" },
          { name: "target", label: "Target variable name", value: "target" }
        ]
      });
      if (!values) return null;
      options = { name: values.name, target: values.target };
    } else if (kind === "countocc") {
      const values = await formDialog({
        title: "Count occurrences",
        ok: "Insert",
        note: "Tally how many times a value appears in an array or a char in a String.",
        fields: [
          {
            name: "mode",
            label: "Count in",
            type: "select",
            value: "array of ints",
            options: ["array of ints", "characters in a String"]
          },
          { name: "name", label: "Array or String name", value: "nums" }
        ]
      });
      if (!values) return null;
      options = {
        mode: String(values.mode || "").indexOf("String") >= 0 ? "string" : "array",
        name: values.name
      };
    } else if (kind === "sentinel") {
      const values = await formDialog({
        title: "Read until sentinel",
        ok: "Insert",
        note: "Keeps reading from Scanner until a stop value.",
        fields: [{
          name: "mode",
          label: "Sentinel style",
          type: "select",
          value: "integers until -1",
          options: ["integers until -1", "words until quit"]
        }]
      });
      if (!values) return null;
      options = {
        mode: String(values.mode || "").indexOf("quit") >= 0 ? "string" : "int"
      };
    } else if (kind === "fileio") {
      const values = await formDialog({
        title: "File read / write",
        ok: "Insert",
        note: "try-with-resources using Scanner and/or PrintWriter.",
        fields: [{
          name: "mode",
          label: "What to insert",
          type: "select",
          value: "read and write",
          options: ["read and write", "read only", "write only"]
        }]
      });
      if (!values) return null;
      const m = String(values.mode || "");
      options = {
        mode: m.indexOf("read only") >= 0 ? "read" : m.indexOf("write only") >= 0 ? "write" : "both"
      };
    } else if (kind === "matfill") {
      const values = await formDialog({
        title: "2D array fill",
        ok: "Insert",
        note: "Nested loops that fill matrix[i][j] from Scanner. Pair with matrix print.",
        fields: [
          { name: "name", label: "Matrix variable name", value: "matrix" },
          { name: "rows", label: "Rows", value: "3" },
          { name: "cols", label: "Columns", value: "3" }
        ]
      });
      if (!values) return null;
      options = { name: values.name, rows: values.rows, cols: values.cols };
    } else if (kind === "menu" || kind === "splitloop") {
      // no options
    } else {
      return null;
    }
    const code = window.LarkJava.generateHomeworkBlock(kind, options);
    if (!code) return null;
    insertAtCursor(code);
    return label;
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
    afterEdit();
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
    if (act === "beautify") {
      beautifyActiveFile();
      return;
    }
    if (act === "goto") { await goToDefinition(); return; }
    if (act === "usages") { await findUsagesAtCursor(); return; }
    if (act === "rename") { await renameSymbol(); return; }
    if (act === "rename-file") { renameInFileMulti(); return; }
    if (act === "extract") { await extractMethodAtSelection(); return; }
    if (act === "introduce") { await introduceVarAtSelection(); return; }
    if (act === "brace") { jumpMatchingBrace(); return; }
    if (act === "search") { openProjectSearch(); return; }
    if (act === "check") { await runCompileCheck(); toast("Compile check finished."); return; }
    const parsed = currentJavaParsed();
    if (!parsed && act !== "explain" && act !== "snippet") return toast("Open a Java class first.");
    if (act === "explain") {
      await formDialog({
        title: "Java helpers",
        ok: "Got it",
        note:
          window.LarkJava.explain("private") + "\n\n" +
          window.LarkJava.explain("public") + "\n\n" +
          window.LarkJava.explain("static") + "\n\n" +
          window.LarkJava.explain("this") + "\n\n" +
          window.LarkJava.explain("override") + "\n\n" +
          window.LarkJava.explain("final") + "\n\n" +
          window.LarkJava.explain("extends") + "\n\n" +
          window.LarkJava.explain("implements") + "\n\n" +
          window.LarkJava.explain("super") + "\n\n" +
          "Tip: press Ctrl+Space and type main, fori, matrix, arrfill, menu, sentinel… to autofill building blocks.",
        fields: []
      });
      return;
    }
    if (act === "snippet") {
      if (!cm) return toast("Open a file first.");
      const snips = window.LarkJava.snippets || [];
      const values = await formDialog({
        title: "Insert building block",
        ok: "Insert",
        note: "These also appear when you press Ctrl+Space and type the short name (main, fori, matrix, arrfill…).",
        fields: [{
          name: "which",
          label: "Snippet",
          type: "select",
          value: "main",
          options: snips.map((s) => s.id + " — " + s.label)
        }]
      });
      if (!values) return;
      const id = String(values.which || "").split(" — ")[0];
      const snip = snips.find((s) => s.id === id);
      if (!snip) return;
      insertAtCursor(snip.text);
      toast("Inserted " + snip.label + ".");
      return;
    }
    if (act === "main") {
      insertBeforeClassClose(window.LarkJava.generateMain());
      toast("Inserted main method.");
      return;
    }
    if (act === "matrix") {
      if (!cm) return toast("Open a file first.");
      const values = await formDialog({
        title: "Insert matrix print loops",
        ok: "Insert",
        note: "Adds a sample int[][] and nested for-loops that print each row. Rename the variable if you already have a matrix.",
        fields: [
          { name: "name", label: "Matrix variable name", value: "matrix" },
          {
            name: "mode",
            label: "What to insert",
            type: "select",
            value: "sample + nested print loops",
            options: [
              "sample + nested print loops",
              "nested print loops only"
            ]
          }
        ]
      });
      if (!values) return;
      const includeSample = String(values.mode || "").indexOf("only") < 0;
      const code = window.LarkJava.generateMatrixPrint(values.name || "matrix", includeSample);
      insertAtCursor(code);
      toast("Inserted matrix print loops.");
      return;
    }
    const homeworkIds = window.LarkJava.homeworkBlockIds || [];
    if (act === "homework" || homeworkIds.indexOf(act) >= 0) {
      if (!cm) return toast("Open a file first.");
      let kind = act === "homework" ? "" : act;
      if (!kind) {
        const pick = await formDialog({
          title: "Insert homework block",
          ok: "Next",
          note: "Common multi-line patterns for arrays, search, menus, and files. Also available via Ctrl+Space (arrfill, menu, sentinel…).",
          fields: [{
            name: "which",
            label: "Pattern",
            type: "select",
            value: "arrfill — fill + print 1D array (Scanner)",
            options: (window.LarkJava.snippets || [])
              .filter((s) => homeworkIds.indexOf(s.id) >= 0)
              .map((s) => s.id + " — " + s.label)
          }]
        });
        if (!pick) return;
        kind = String(pick.which || "").split(" — ")[0];
      }
      const inserted = await insertHomeworkBlock(kind);
      if (inserted) toast("Inserted " + inserted + ".");
      return;
    }
    if (act === "fori" || act === "foreach" || act === "try" || act === "scanner") {
      const map = { fori: "fori", foreach: "foreach", try: "try", scanner: "scanner" };
      const snip = (window.LarkJava.snippets || []).find((s) => s.id === map[act]);
      if (!snip) return;
      insertAtCursor(snip.text);
      toast("Inserted " + snip.label + ".");
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
      const editor = activeCm() || cm;
      if (!editor) return;
      const token = editor.getTokenAt(editor.getCursor()).string.replace(/[^\w]/g, "");
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
      const next = window.LarkJava.ensureImports(editor.getValue(), [pick]);
      if (!next) return toast(pick + " is already imported.");
      const cursor = editor.getCursor();
      suppress = true;
      editor.setValue(next);
      editor.setCursor(cursor);
      suppress = false;
      const path = activePath() || state.active;
      const file = fileByPath(path);
      if (file) file.content = next;
      state.dirty.add(path);
      afterEdit();
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
      return;
    }
    if (act === "tostring") {
      const chosen = await pickFields("Generate toString", summary.fields);
      if (!chosen) return;
      const type = summary.types.find((t) => t.kind === "class") || summary.types[0];
      if (!type) return toast("No class found in this file.");
      insertBeforeClassClose(window.LarkJava.generateToString(type.name, chosen));
      toast("Inserted toString.");
      return;
    }
    if (act === "equals") {
      const chosen = await pickFields("Generate equals / hashCode", summary.fields);
      if (!chosen) return;
      const type = summary.types.find((t) => t.kind === "class") || summary.types[0];
      if (!type) return toast("No class found in this file.");
      insertBeforeClassClose(window.LarkJava.generateEqualsHashCode(type.name, chosen));
      const editor = activeCm() || cm;
      if (editor) {
        const withImp = window.LarkJava.ensureImports(editor.getValue(), ["java.util.Objects"]);
        if (withImp) {
          const cursor = editor.getCursor();
          suppress = true;
          editor.setValue(withImp);
          editor.setCursor(cursor);
          suppress = false;
          const path = activePath() || state.active;
          const file = fileByPath(path);
          if (file) file.content = withImp;
          state.dirty.add(path);
          afterEdit();
        }
      }
      toast("Inserted equals and hashCode.");
      return;
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
    await movePath(path, to);
  }

  async function movePath(from, to) {
    if (!state.project || !from || !to || from === to) return;
    await flushSaves();
    await api("POST", "/api/projects/" + encodeURIComponent(state.project.id) + "/move", { from: from, to: to });
    const file = fileByPath(from);
    const wasDir = state.dirs.includes(from);
    if (file) {
      let content = file.content || "";
      content = fixPackage(from, to, content);
      file.path = to;
      file.content = content;
      const doc = docs.get(from);
      if (doc) {
        docs.delete(from);
        if (content !== doc.getValue()) {
          suppress = true;
          const cursor = doc.getCursor();
          doc.setValue(content);
          doc.setCursor(cursor);
          suppress = false;
        }
        docs.set(to, doc);
        await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", { path: to, content: content });
      }
    }
    state.dirs = state.dirs
      .map((dir) => dir === from ? to : dir.startsWith(from + "/") ? to + dir.slice(from.length) : dir)
      .filter((dir, i, arr) => arr.indexOf(dir) === i);
    if (wasDir && !state.dirs.includes(to)) state.dirs.push(to);
    const parent = parentDir(to);
    if (parent) {
      const parts = parent.split("/");
      let acc = "";
      parts.forEach((part) => {
        acc = acc ? acc + "/" + part : part;
        if (!state.dirs.includes(acc)) state.dirs.push(acc);
      });
    }
    state.files.forEach((item) => {
      if (item.path.startsWith(from + "/")) item.path = to + item.path.slice(from.length);
    });
    state.open = state.open.map((item) => item === from ? to : item.startsWith(from + "/") ? to + item.slice(from.length) : item);
    if (state.active === from) state.active = to;
    if (state.activeB === from) state.activeB = to;
    state.selected = to;
    state.collapsed.delete(from);
    if (fileByPath(to) && (state.active === to || state.open.includes(to))) openPath(to);
    else {
      renderTree();
      renderTabs();
      renderTabsB();
    }
    renderMains();
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

  /** Stop focus/overflow from scrolling the file tray off the left edge. */
  function pinLayoutScroll() {
    ["shell", "workspace", "center", "files", "console"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (el.scrollLeft) el.scrollLeft = 0;
    });
    if (document.documentElement.scrollLeft) document.documentElement.scrollLeft = 0;
    if (document.body.scrollLeft) document.body.scrollLeft = 0;
  }

  function fitConsoleForReply(show) {
    const style = document.documentElement.style;
    const current = clampPanel(
      getComputedStyle(document.documentElement).getPropertyValue("--console-h"),
      72, 640, 188
    );
    if (show) {
      if (state._consoleHBeforeReply == null) state._consoleHBeforeReply = current;
      // One compact reply row needs ~48px on top of output; keep trays in place.
      const needed = Math.max(current, Math.min(280, state._consoleHBeforeReply + 56));
      const centerH = $("center") ? $("center").getBoundingClientRect().height : 0;
      const max = centerH > 0 ? Math.max(140, centerH - 96) : needed;
      style.setProperty("--console-h", Math.min(needed, max) + "px");
    } else if (state._consoleHBeforeReply != null) {
      style.setProperty("--console-h", state._consoleHBeforeReply + "px");
      delete state._consoleHBeforeReply;
    }
    pinLayoutScroll();
  }

  function focusConsoleInput() {
    const input = $("console-input");
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch (e) {
      input.focus();
    }
    pinLayoutScroll();
  }

  function setRunning(running, acceptsInput) {
    $("run").textContent = running ? "Stop" : "Run";
    const reply = $("console-reply");
    if (!reply) return;
    const show = !!(running && acceptsInput);
    const wasHidden = reply.hidden;
    reply.hidden = !show;
    fitConsoleForReply(show);
    if (!show) {
      delete reply.dataset.armed;
      pinLayoutScroll();
      return;
    }
    // Only steal focus the first time the reply box appears — never while naming a class.
    // preventScroll: focusing used to scroll #workspace and shove the file tray off-screen.
    if (wasHidden || !reply.dataset.armed) {
      reply.dataset.armed = "1";
      if (!isDialogTyping()) {
        setTimeout(() => {
          if (isDialogTyping()) return;
          if (reply.hidden) return;
          focusConsoleInput();
        }, 120);
      }
    } else {
      pinLayoutScroll();
    }
  }

  async function sendConsoleInput() {
    if (!state.job || state.job.done) return toast("Run a program first.");
    const input = $("console-input");
    const text = input.value;
    input.value = "";
    try {
      await api("POST", "/api/run/" + state.job.id + "/input", { text: text });
      focusConsoleInput();
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

  function runtimeHintFor(line) {
    const lower = line.toLowerCase();
    if (lower.includes("nullpointerexception")) {
      return { plain: "Something was null when the program tried to use it.", hint: "Create or assign the object before calling a method on it." };
    }
    if (lower.includes("arrayindexoutofboundsexception")) {
      return { plain: "An array index does not exist.", hint: "Valid indexes are 0 through length - 1." };
    }
    if (lower.includes("stringindexoutofboundsexception")) {
      return { plain: "A String index was out of range.", hint: "Check length() before charAt / substring." };
    }
    if (lower.includes("inputmismatchexception")) {
      return { plain: "Scanner expected a different kind of input.", hint: "Match nextInt/nextLine to what you type in the reply box." };
    }
    if (lower.includes("nosuchelementexception")) {
      return { plain: "The program tried to read more input than was available.", hint: "Type the answer in the Output reply box, then Enter." };
    }
    if (lower.includes("arithmeticexception")) {
      return { plain: "A math error happened (often ÷ by zero).", hint: "Check the divisor before dividing." };
    }
    if (lower.includes("numberformatexception")) {
      return { plain: "Text could not be turned into a number.", hint: "Trim the string and confirm it only contains digits." };
    }
    if (lower.includes("classcastexception")) {
      return { plain: "An object was cast to the wrong type.", hint: "Check instanceof before casting." };
    }
    if (lower.includes("stackoverflowerror")) {
      return { plain: "Too many nested calls — often endless recursion.", hint: "Add a base case that stops calling itself." };
    }
    return null;
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
    // Plain-English tips under common runtime crashes.
    const tips = [];
    text.split(/\r?\n/).forEach((line) => {
      const tip = runtimeHintFor(line);
      if (tip && !tips.some((t) => t.plain === tip.plain)) tips.push(tip);
    });
    tips.forEach((tip) => {
      const box = document.createElement("div");
      box.className = "runtime-hint";
      const strong = document.createElement("strong");
      strong.textContent = tip.plain;
      const span = document.createElement("span");
      span.textContent = tip.hint;
      box.append(strong, span);
      pre.appendChild(box);
    });
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
      where.className = "problem-where";
      where.textContent = problem.file + ":" + problem.line;
      const body = document.createElement("span");
      body.className = "problem-body";
      const plain = document.createElement("span");
      plain.className = "problem-plain";
      plain.textContent = problem.plain || problem.message;
      body.appendChild(plain);
      if (problem.hint) {
        const hint = document.createElement("span");
        hint.className = "problem-hint";
        hint.textContent = "Fix: " + problem.hint;
        body.appendChild(hint);
      }
      if (problem.plain && problem.message && problem.plain !== problem.message) {
        const raw = document.createElement("span");
        raw.className = "problem-raw";
        raw.textContent = problem.message;
        body.appendChild(raw);
      }
      const fixable = problem.code && ["unused-import", "missing-override", "string-eq", "empty-control", "missing-accessors", "missing-getter"].includes(problem.code);
      if (fixable) {
        const fix = document.createElement("button");
        fix.type = "button";
        fix.className = "problem-fix primary";
        fix.textContent = "Quick fix";
        fix.addEventListener("click", (ev) => {
          ev.stopPropagation();
          applyProblemFix(problem).catch((err) => toast(err.message));
        });
        body.appendChild(fix);
      }
      btn.append(where, body);
      btn.addEventListener("click", () => {
        showConsoleTab("problems");
        jumpTo(problem.file, problem.line, problem.column || 1);
      });
      box.appendChild(btn);
    });
  }

  async function applyProblemFix(problem) {
    const path = resolveProblemFile(problem.file);
    const file = fileByPath(path);
    if (!file) return toast("File not found.");
    if (problem.code === "missing-accessors" || problem.code === "missing-getter") {
      openPath(path);
      await runAssist("fix");
      return;
    }
    const next = window.LarkJava.applyQuickFix(file.content || "", problem);
    if (next == null) return toast("No automatic fix for that.");
    file.content = next;
    parsedCache.delete(path);
    const doc = docs.get(path);
    if (doc) {
      suppress = true;
      doc.setValue(next);
      suppress = false;
    }
    state.dirty.add(path);
    await saveFile(path);
    refreshLocalProblems();
    renderProblems();
    markErrors();
    renderStructure();
    toast("Quick fix applied.");
  }

  function showConsoleTab(which) {
    state.consoleTab = which || "output";
    const output = state.consoleTab === "output";
    const problems = state.consoleTab === "problems";
    const debug = state.consoleTab === "debug";
    const tests = state.consoleTab === "tests";
    const term = state.consoleTab === "terminal";
    if ($("tab-output")) $("tab-output").classList.toggle("on", output);
    if ($("tab-problems")) $("tab-problems").classList.toggle("on", problems);
    if ($("tab-debug")) $("tab-debug").classList.toggle("on", debug);
    if ($("tab-tests")) $("tab-tests").classList.toggle("on", tests);
    if ($("tab-terminal")) $("tab-terminal").classList.toggle("on", term);
    if ($("console-out")) $("console-out").hidden = !output;
    if ($("problems")) $("problems").hidden = !problems;
    if ($("debug-pane")) $("debug-pane").hidden = !debug;
    if ($("tests-pane")) $("tests-pane").hidden = !tests;
    if ($("terminal-pane")) $("terminal-pane").hidden = !term;
    if ($("debug-bar")) $("debug-bar").hidden = !(debug || (state.debug && !state.debug.done));
    if (term) ensureTerminal().catch((err) => toast(err.message));
    else stopTerminalPoll();
    if (tests) refreshTests().catch((err) => toast(err.message));
  }

  function stopTerminalPoll() {
    if (state.termPoll) {
      clearTimeout(state.termPoll);
      state.termPoll = null;
    }
  }

  function renderTerminal(text) {
    const pre = $("terminal-out");
    if (!pre) return;
    const stick = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 48;
    pre.textContent = text || "";
    if (stick) pre.scrollTop = pre.scrollHeight;
  }

  async function ensureTerminal(forceRestart) {
    if (!state.project) {
      renderTerminal("Open a project first — the Terminal runs in that folder.\n");
      return;
    }
    if (forceRestart && state.terminal) {
      stopTerminalPoll();
      try {
        await api("POST", "/api/terminal/" + encodeURIComponent(state.terminal.id) + "/stop", {});
      } catch (_) { /* ok */ }
      state.terminal = null;
    }
    if (!state.terminal) {
      const data = await api("POST", "/api/terminal", { project: state.project.id });
      state.terminal = data;
      renderTerminal(data.output || "");
      if ($("terminal-prompt")) $("terminal-prompt").textContent = "›";
    }
    pollTerminal();
    if ($("terminal-input")) $("terminal-input").focus();
  }

  async function pollTerminal() {
    stopTerminalPoll();
    if (state.consoleTab !== "terminal" || !state.terminal) return;
    try {
      const data = await api("GET", "/api/terminal/" + encodeURIComponent(state.terminal.id));
      state.terminal = data;
      renderTerminal(data.output || "");
      if (!data.alive) {
        renderTerminal((data.output || "") + "\n— shell stopped — click Restart —\n");
        return;
      }
    } catch (err) {
      renderTerminal((($("terminal-out") && $("terminal-out").textContent) || "") + "\n" + err.message + "\n");
      state.terminal = null;
      return;
    }
    state.termPoll = setTimeout(() => pollTerminal(), 250);
  }

  async function sendTerminalCommand() {
    const input = $("terminal-input");
    if (!input) return;
    const text = input.value;
    input.value = "";
    if (!text.trim()) return;
    state.termHistory.push(text);
    if (state.termHistory.length > 80) state.termHistory.shift();
    state.termHistIndex = state.termHistory.length;
    await ensureTerminal(false);
    if (!state.terminal) return;
    await api("POST", "/api/terminal/" + encodeURIComponent(state.terminal.id) + "/input", { text: text });
    pollTerminal();
  }

  function clearMarks() {
    lineMarks.forEach((mark) => mark.doc.removeLineClass(mark.line, "background", mark.cls));
    lineMarks.length = 0;
  }

  function markErrors() {
    clearMarks();
    if (!cm && !cmB) return;
    allProblems().forEach((problem) => {
      const resolved = resolveProblemFile(problem.file);
      const doc = docs.get(resolved);
      if (!doc) return;
      const line = problem.line - 1;
      if (line < 0 || line >= doc.lineCount()) return;
      const cls = problem.severity === "warning" ? "cm-warning-line" : "cm-problem-line";
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
    placePopover(pop, button);
  }

  function placePopover(pop, button) {
    if (!pop || !button) return;
    const pad = 8;
    const rect = button.getBoundingClientRect();
    // Measure after show; clamp so font/zoom controls never leave the viewport.
    const width = Math.min(pop.offsetWidth || 280, window.innerWidth - pad * 2);
    const height = Math.min(pop.offsetHeight || 320, window.innerHeight - pad * 2);
    pop.style.maxWidth = (window.innerWidth - pad * 2) + "px";
    pop.style.maxHeight = (window.innerHeight - pad * 2) + "px";
    let top = rect.bottom + 6;
    let left = rect.left;
    if (top + height > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - height - 6);
    }
    if (top < pad) top = pad;
    if (left + width > window.innerWidth - pad) left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    pop.style.top = top + "px";
    pop.style.left = left + "px";
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
      plain: item.plain || item.message,
      hint: item.hint || "",
      code: item.code || ""
    }));
  }

  function allProblems() {
    const compile = state.problems || [];
    const live = state.compileProblems || [];
    const local = state.localProblems || [];
    // Prefer run diagnostics over live check for same file:line
    const seen = new Set();
    const out = [];
    compile.concat(live).concat(local).forEach((p) => {
      const key = (p.file || "") + ":" + p.line + ":" + (p.message || p.plain || "");
      if (seen.has(key)) return;
      seen.add(key);
      out.push(p);
    });
    return out;
  }

  function openPalette(mode) {
    if (!$("modal").hidden) return;
    closePopovers();
    paletteIndex = 0;
    state.paletteMode = mode || "open";
    $("palette").hidden = false;
    $("palette-input").value = "";
    const ph = $("palette-input");
    if (ph) {
      ph.placeholder = state.paletteMode === "usages"
        ? "Usages…"
        : "Open a file or class…";
    }
    renderPalette("");
    $("palette-input").focus();
  }

  function paletteEntries(query) {
    if (state.paletteMode === "usages" && state.paletteItems && state.paletteItems.length) {
      const q = (query || "").trim().toLowerCase();
      return state.paletteItems.filter((item) => {
        const hay = ((item.label || "") + " " + (item.meta || "")).toLowerCase();
        return !q || hay.includes(q);
      }).slice(0, 60);
    }
    const q = (query || "").trim();
    const items = [];
    const recentSet = new Set(state.recent);
    state.recent.forEach((path) => {
      if (!fileByPath(path)) return;
      const score = window.LarkJava.fuzzyScore(q, path) + 50;
      if (!q || score > 0) items.push({ kind: "recent", label: path, path: path, score: score, meta: "Recent" });
    });
    state.files.forEach((file) => {
      if (recentSet.has(file.path) && q) return;
      const score = window.LarkJava.fuzzyScore(q, file.path);
      if (!q || score > 0) items.push({ kind: "file", label: file.path, path: file.path, score: score || 1, meta: "File" });
    });
    const index = window.LarkJava.buildIndex(state.files);
    const seen = new Set();
    index.forEach((def) => {
      if (!(def.kind === "class" || def.kind === "interface" || def.kind === "enum" || def.kind === "record" || def.kind === "type" || def.kind === "method")) return;
      const key = def.kind + ":" + def.file + ":" + def.name + ":" + def.line;
      if (seen.has(key)) return;
      seen.add(key);
      const label = (def.qualified || def.name) + (def.kind === "method" ? (def.detail || "()") : "");
      const score = Math.max(window.LarkJava.fuzzyScore(q, def.name), window.LarkJava.fuzzyScore(q, label));
      if (!q || score > 0) {
        items.push({
          kind: def.kind,
          label: label,
          path: def.file,
          line: def.line,
          score: score + (def.kind === "method" ? 0 : 20),
          meta: def.file
        });
      }
    });
    items.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return items.slice(0, 50);
  }

  function renderPalette(query) {
    const items = paletteEntries(query);
    state.paletteItemsView = items;
    const list = $("palette-list");
    list.replaceChildren();
    if (!items.length) {
      list.appendChild(note(state.paletteMode === "usages" ? "No usages." : "No matching file or class."));
      return;
    }
    items.forEach((item, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "palette-item" + (index === paletteIndex ? " active" : "");
      const kind = document.createElement("span");
      kind.className = "palette-kind";
      kind.textContent = item.kind || "file";
      const label = document.createElement("span");
      label.textContent = item.label;
      const meta = document.createElement("span");
      meta.className = "palette-meta";
      meta.textContent = item.meta || "";
      btn.append(kind, label, meta);
      btn.addEventListener("click", () => pickPaletteItem(item));
      list.appendChild(btn);
    });
  }

  function pickPaletteItem(item) {
    $("palette").hidden = true;
    if (!item) return;
    if (item.path) {
      openPath(item.path);
      if (item.line) jumpTo(item.path, item.line, item.column || 1);
    }
  }

  function paletteFiles() {
    return (state.paletteItemsView || paletteEntries($("palette-input").value)).map((item) => item.path);
  }

  function currentPaletteItems() {
    return state.paletteItemsView || paletteEntries($("palette-input").value);
  }

  async function newProject() {
    let options = ["empty", "library", "factorial", "quiz", "sorting", "recursion", "calculator", "grades"];
    try {
      const catalog = await api("GET", "/api/templates");
      if (catalog.templates && catalog.templates.length) {
        options = catalog.templates.map((t) => t.id + " — " + t.name);
      }
    } catch (_) {}
    const values = await formDialog({
      title: "New project",
      ok: "Create",
      note: "Pick a preset to start with working Java you can Run immediately.",
      fields: [
        { name: "name", label: "Name", value: "" },
        { name: "template", label: "Preset", type: "select", value: options[0], options: options }
      ]
    });
    if (!values || !values.name.trim()) return;
    const template = String(values.template || "empty").split(" — ")[0].trim();
    const data = await api("POST", "/api/projects", { name: values.name.trim(), template: template });
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

  function clampPanel(value, min, max, fallback) {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n < min || n > max) return fallback;
    return Math.round(n);
  }

  function savePanels() {
    if (document.getElementById("shell") && document.getElementById("shell").classList.contains("files-collapsed")) {
      // Keep the last expanded width; collapse is a class, not a stored 0 width.
      const consoleH = clampPanel(
        getComputedStyle(document.documentElement).getPropertyValue("--console-h"),
        72, 640, 188
      );
      let filesW = 260;
      try {
        const prev = JSON.parse(localStorage.getItem("lark-panels") || "null");
        filesW = clampPanel(prev && prev.files, 160, 420, 260);
      } catch (e) {}
      localStorage.setItem("lark-panels", JSON.stringify({ files: filesW + "px", console: consoleH + "px" }));
      return;
    }
    const filesW = clampPanel(
      getComputedStyle(document.documentElement).getPropertyValue("--files-w"),
      160, 420, 260
    );
    const consoleH = clampPanel(
      getComputedStyle(document.documentElement).getPropertyValue("--console-h"),
      72, 640, 188
    );
    localStorage.setItem("lark-panels", JSON.stringify({
      files: filesW + "px",
      console: consoleH + "px"
    }));
  }

  function restorePanels() {
    const style = document.documentElement.style;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("lark-panels") || "null"); } catch (e) { saved = null; }
    const filesW = clampPanel(saved && saved.files, 160, 420, 260);
    const consoleH = clampPanel(saved && saved.console, 72, 640, 188);
    style.setProperty("--files-w", filesW + "px");
    style.setProperty("--console-h", consoleH + "px");
    // Rewrite sanitized values so a prior zoomed session cannot keep poisoning widths.
    localStorage.setItem("lark-panels", JSON.stringify({ files: filesW + "px", console: consoleH + "px" }));
  }

  function bindSplitters() {
    const style = document.documentElement.style;
    restorePanels();
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
          files: clampPanel($("files").getBoundingClientRect().width, 160, 420, 260),
          console: clampPanel($("console").getBoundingClientRect().height, 72, 640, 188),
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
          refreshAllEditors();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });
    }
    drag(document.querySelector("[data-split=files]"), "col", (ev, start) => {
      const next = clampPanel(start.files + ev.clientX - start.x, 160, 420, 260);
      style.setProperty("--files-w", next + "px");
    });
    const consoleSplit = document.querySelector("[data-split=console]");
    drag(consoleSplit, "row", (ev, start) => {
      const max = Math.max(140, start.center - 96);
      const next = Math.min(max, clampPanel(start.console - (ev.clientY - start.y), 72, 640, 188));
      style.setProperty("--console-h", next + "px");
    });
    if (consoleSplit) {
      consoleSplit.addEventListener("dblclick", () => {
        style.setProperty("--console-h", "188px");
        savePanels();
        refreshAllEditors();
      });
    }
  }

  function isTyping(target) {
    if (!target) return false;
    if (target.closest && target.closest(".CodeMirror")) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }


  function wordUnderCursor() {
    const editor = activeCm();
    const path = activePath();
    if (!editor || !path) return null;
    const file = fileByPath(path);
    if (!file) return null;
    const cur = editor.getCursor();
    return Object.assign({ path: path }, window.LarkJava.wordAt(file.content || "", cur.line + 1, cur.ch + 1));
  }

  async function goToDefinition() {
    const at = wordUnderCursor();
    if (!at || !at.word) return toast("Place the cursor on a name.");
    if (window.LarkJava.keywords.includes(at.word)) return toast("That is a Java keyword.");
    const defs = window.LarkJava.findDefinitions(state.files, at.word, at.path);
    if (!defs.length) return toast("No definition for `" + at.word + "`.");
    const def = defs[0];
    jumpTo(def.file, def.line, 1);
    toast(def.kind + " " + def.name);
  }

  async function findUsagesAtCursor() {
    const at = wordUnderCursor();
    if (!at || !at.word) return toast("Place the cursor on a name.");
    const hits = window.LarkJava.findUsages(state.files, at.word);
    if (!hits.length) return toast("No usages of `" + at.word + "`.");
    state.paletteMode = "usages";
    state.paletteItems = hits.map((h) => ({
      kind: "usage",
      label: h.file + ":" + h.line,
      path: h.file,
      line: h.line,
      column: h.column,
      meta: h.text,
      score: 1
    }));
    openPalette("usages");
    toast(hits.length + " usage" + (hits.length === 1 ? "" : "s") + " of `" + at.word + "`");
  }

  async function renameSymbol() {
    const at = wordUnderCursor();
    if (!at || !at.word) return toast("Place the cursor on a name.");
    if (window.LarkJava.keywords.includes(at.word)) return toast("Can't rename a keyword.");
    const values = await formDialog({
      title: "Rename `" + at.word + "`",
      ok: "Rename in project",
      note: "Replaces whole-word matches in .java files (skips string/comment text when possible).",
      fields: [{ name: "name", label: "New name", value: at.word }]
    });
    if (!values) return;
    const next = (values.name || "").trim();
    if (!next || next === at.word) return;
    if (!/^[A-Za-z_][\w$]*$/.test(next)) return toast("That isn't a valid Java identifier.");
    await flushSaves();
    const changes = window.LarkJava.renameAcross(state.files, at.word, next);
    if (!changes.length) return toast("Nothing to rename.");
    for (const change of changes) {
      const file = fileByPath(change.path);
      if (file) file.content = change.content;
      parsedCache.delete(change.path);
      const doc = docs.get(change.path);
      if (doc) {
        suppress = true;
        doc.setValue(change.content);
        suppress = false;
      }
      await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id) + "/file", {
        path: change.path,
        content: change.content
      });
      state.dirty.delete(change.path);
    }
    renderTabs();
    renderStructure();
    refreshLocalProblems();
    renderProblems();
    markErrors();
    toast("Renamed `" + at.word + "` → `" + next + "` in " + changes.length + " file" + (changes.length === 1 ? "" : "s") + ".");
  }

  function renameInFileMulti() {
    const editor = activeCm();
    const path = activePath();
    if (!editor || !path) return toast("Open a file first.");
    const at = wordUnderCursor();
    if (!at || !at.word) return toast("Place the cursor on a name.");
    const content = editor.getValue();
    const hits = window.LarkJava.findUsages([{ path: path, content: content }], at.word);
    if (!hits.length) return toast("No matches in this file.");
    const sels = hits.map((h) => ({
      anchor: { line: h.line - 1, ch: h.column - 1 },
      head: { line: h.line - 1, ch: h.column - 1 + at.word.length }
    }));
    editor.setSelections(sels, 0);
    editor.focus();
    toast(sels.length + " selections — type to rename in file.");
  }

  async function startDebug() {
    if (!state.project) return toast("Open a project first.");
    await flushSaves();
    const mainClass = $("main-class").value;
    if (!mainClass) return toast("Pick a main class.");
    showConsoleTab("debug");
    if ($("debug-bar")) $("debug-bar").hidden = false;
    if ($("dbg-status")) $("dbg-status").textContent = "Starting…";
    try {
      const data = await api("POST", "/api/debug", {
        project: state.project.id,
        mainClass: mainClass,
        args: $("args").value,
        breakpoints: collectBreakpoints()
      });
      state.debug = data;
      renderDebug(data);
      pollDebug(data.id);
    } catch (err) {
      toast(err.message);
      if ($("dbg-status")) $("dbg-status").textContent = "Failed";
    }
  }

  function findJavaBySimpleName(simple) {
    if (!simple) return null;
    return state.files.find((f) => f.path.endsWith("/" + simple + ".java") || f.path === simple + ".java") || null;
  }

  function jumpDebugLocation(className, line) {
    const cls = className || "";
    const simple = cls.includes(".") ? cls.slice(cls.lastIndexOf(".") + 1) : cls;
    const file = findJavaBySimpleName(simple);
    if (!file) return toast("Couldn't find source for " + (simple || "that frame") + ".");
    jumpTo(file.path, line || 1, 1);
  }

  function parseDebugStack(output) {
    const frames = [];
    const text = output || "";
    const re = /\[(\d+)\]\s+([\w.$]+)\s+\(([^:)]+):(\d+)\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      frames.push({
        depth: m[1],
        method: m[2],
        file: m[3].replace(/\.java$/, ""),
        line: Number(m[4])
      });
      if (frames.length >= 24) break;
    }
    return frames;
  }

  function renderDebug(session) {
    const pre = $("debug-out");
    if (pre) {
      const stick = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 48;
      pre.textContent = (session && session.output) || "";
      if (stick) pre.scrollTop = pre.scrollHeight;
      pre.onclick = (event) => {
        const lineEl = event.target;
        if (!lineEl || lineEl !== pre) {
          // Allow selecting text; jump when user double-clicks a stack-looking line.
        }
      };
      pre.ondblclick = () => {
        const sel = (window.getSelection() || "").toString().trim();
        const hit = sel.match(/([\w.$]+)\s*\(([^:)]+):(\d+)\)/) || sel.match(/([\w.$]+):(\d+)/);
        if (!hit) return;
        if (hit.length === 4) jumpDebugLocation(hit[2].replace(/\.java$/, ""), Number(hit[3]));
        else jumpDebugLocation(hit[1], Number(hit[2]));
      };
    }
    const locals = $("debug-locals");
    if (locals) {
      locals.replaceChildren();
      const list = (session && session.locals) || [];
      if (!list.length) {
        locals.appendChild(note("Locals appear when paused — click Locals."));
      } else {
        list.forEach((line) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "debug-local";
          btn.textContent = line;
          btn.title = "Jump to paused line";
          btn.addEventListener("click", () => {
            if (session && session.currentLine) {
              jumpDebugLocation(session.currentClass, session.currentLine);
            }
          });
          locals.appendChild(btn);
        });
      }
    }
    const stack = $("debug-stack");
    if (stack) {
      stack.replaceChildren();
      const frames = parseDebugStack((session && session.output) || "");
      if (session && session.currentClass && session.currentLine) {
        frames.unshift({
          depth: "0",
          method: session.currentClass,
          file: (session.currentClass || "").split(".").pop(),
          line: session.currentLine,
          current: true
        });
      }
      const seen = new Set();
      const unique = frames.filter((f) => {
        const key = f.file + ":" + f.line + ":" + f.method;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!unique.length) {
        stack.appendChild(note("Stack frames appear when paused."));
      } else {
        unique.forEach((frame) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "debug-frame" + (frame.current ? " active" : "");
          btn.innerHTML = "<div></div><div class=\"frame-meta\"></div>";
          btn.firstChild.textContent = frame.method;
          btn.lastChild.textContent = frame.file + ".java:" + frame.line;
          btn.addEventListener("click", () => jumpDebugLocation(frame.file, frame.line));
          stack.appendChild(btn);
        });
      }
    }
    if ($("dbg-status")) {
      const phase = (session && session.phase) || "idle";
      const where = session && session.currentLine
        ? (" · " + (session.currentClass || "") + ":" + session.currentLine)
        : "";
      $("dbg-status").textContent = (phase === "paused" ? "Paused here" : phase) + where;
      $("dbg-status").dataset.phase = phase;
    }
    if ($("debug-bar")) {
      $("debug-bar").classList.toggle("paused", !!(session && session.phase === "paused"));
    }
    if (state.debugLineMark && state.debugLineMark.doc) {
      state.debugLineMark.doc.removeLineClass(state.debugLineMark.line, "background", "cm-debug-line");
      state.debugLineMark = null;
    }
    if (session && session.currentLine && session.phase === "paused") {
      const cls = session.currentClass || "";
      const simple = cls.includes(".") ? cls.slice(cls.lastIndexOf(".") + 1) : cls;
      const file = findJavaBySimpleName(simple);
      if (file) {
        jumpTo(file.path, session.currentLine, 1);
        const doc = docs.get(file.path);
        if (doc) {
          const line = session.currentLine - 1;
          doc.addLineClass(line, "background", "cm-debug-line");
          state.debugLineMark = { doc: doc, line: line };
        }
      }
    }
  }

  async function pollDebug(id) {
    if (state.debugPoll) clearTimeout(state.debugPoll);
    try {
      const data = await api("GET", "/api/debug/" + encodeURIComponent(id));
      state.debug = data;
      renderDebug(data);
      if (data.done) {
        if ($("dbg-status")) $("dbg-status").textContent = "Done";
        return;
      }
      state.debugPoll = setTimeout(() => pollDebug(id), 250);
    } catch (err) {
      toast(err.message);
    }
  }

  async function debugCommand(cmd) {
    if (!state.debug || !state.debug.id) return toast("Start the debugger first.");
    try {
      const data = await api("POST", "/api/debug/" + encodeURIComponent(state.debug.id) + "/command", { command: cmd });
      state.debug = data;
      renderDebug(data);
    } catch (err) {
      toast(err.message);
    }
  }

  async function stopDebug() {
    if (!state.debug || !state.debug.id) return;
    try {
      await api("POST", "/api/debug/" + encodeURIComponent(state.debug.id) + "/stop", {});
    } catch (_) {}
    if (state.debugPoll) clearTimeout(state.debugPoll);
    state.debug.done = true;
    state.debug.phase = "done";
    renderDebug(state.debug);
    if ($("dbg-status")) $("dbg-status").textContent = "Stopped";
  }

  async function refreshTests() {
    if (!state.project) {
      if ($("tests-list")) $("tests-list").replaceChildren(note("Open a project first."));
      return;
    }
    const data = await api("GET", "/api/tests/discover?project=" + encodeURIComponent(state.project.id));
    state.discoveredTests = data.tests || [];
    renderTestsList();
  }

  function renderTestsList() {
    const box = $("tests-list");
    if (!box) return;
    box.replaceChildren();
    if (!state.discoveredTests.length) {
      box.appendChild(note("No @Test methods found. Add JUnit 5 tests (downloaded automatically on first run)."));
      return;
    }
    state.discoveredTests.forEach((t) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "test-row";
      row.innerHTML = "";
      const label = document.createElement("span");
      label.textContent = t.className + "#" + t.method;
      const meta = document.createElement("span");
      meta.className = "test-meta";
      meta.textContent = t.file || "";
      row.append(label, meta);
      row.addEventListener("click", () => runTests(t.className, t.method).catch((e) => toast(e.message)));
      box.appendChild(row);
    });
  }

  async function runTests(className, method) {
    if (!state.project) return toast("Open a project first.");
    await flushSaves();
    showConsoleTab("tests");
    if ($("tests-out")) $("tests-out").textContent = "Starting tests…\n";
    const data = await api("POST", "/api/tests", {
      project: state.project.id,
      className: className || "",
      method: method || ""
    });
    state.testJob = data;
    pollTests(data.id);
  }

  async function pollTests(id) {
    if (state.testPoll) clearTimeout(state.testPoll);
    try {
      const data = await api("GET", "/api/tests/" + encodeURIComponent(id));
      state.testJob = data;
      if ($("tests-out")) $("tests-out").textContent = data.output || "";
      if (!data.done) state.testPoll = setTimeout(() => pollTests(id), 300);
    } catch (err) {
      toast(err.message);
    }
  }

  function renderRunConfigMenu() {
    const box = $("run-config-list");
    if (!box) return;
    box.replaceChildren();
    const configs = state.runConfigs || [];
    if (!configs.length) {
      box.appendChild(note("No saved configs yet."));
      return;
    }
    configs.forEach((cfg, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = cfg.name + " — " + (cfg.mainClass || "(main)") + (cfg.args ? " · " + cfg.args : "");
      btn.addEventListener("click", () => {
        closePopovers();
        applyRunConfig(cfg);
      });
      box.appendChild(btn);
    });
  }

  function applyRunConfig(cfg) {
    if (!cfg) return;
    if (cfg.mainClass && $("main-class")) {
      const select = $("main-class");
      if (![...select.options].some((o) => o.value === cfg.mainClass)) {
        const opt = document.createElement("option");
        opt.value = cfg.mainClass;
        opt.textContent = cfg.mainClass;
        select.appendChild(opt);
      }
      select.value = cfg.mainClass;
      if (state.project) {
        state.project.mainClass = cfg.mainClass;
        api("PUT", "/api/projects/" + encodeURIComponent(state.project.id), { mainClass: cfg.mainClass }).catch(() => {});
      }
    }
    if ($("args")) $("args").value = cfg.args || "";
    toast("Config: " + (cfg.name || "Run"));
  }

  async function saveRunConfig() {
    if (!state.project) return;
    const values = await formDialog({
      title: "Save run configuration",
      ok: "Save",
      fields: [
        { name: "name", label: "Name", value: ($("main-class").value || "Run").split(".").pop() },
        { name: "mainClass", label: "Main class", value: $("main-class").value || "" },
        { name: "args", label: "Arguments", value: $("args").value || "" }
      ]
    });
    if (!values) return;
    const cfg = {
      name: (values.name || "Run").trim(),
      mainClass: (values.mainClass || "").trim(),
      args: values.args || ""
    };
    state.runConfigs = (state.runConfigs || []).filter((c) => c.name !== cfg.name).concat([cfg]).slice(0, 20);
    await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id), { runConfigs: state.runConfigs });
    renderRunConfigMenu();
    toast("Saved config `" + cfg.name + "`.");
  }

  async function manageRunConfigs() {
    if (!state.project) return;
    const configs = state.runConfigs || [];
    if (!configs.length) return toast("No configs to manage.");
    const values = await formDialog({
      title: "Delete a run configuration",
      ok: "Delete",
      fields: [{
        name: "which",
        label: "Config",
        type: "select",
        value: configs[0].name,
        options: configs.map((c) => c.name)
      }]
    });
    if (!values) return;
    state.runConfigs = configs.filter((c) => c.name !== values.which);
    await api("PUT", "/api/projects/" + encodeURIComponent(state.project.id), { runConfigs: state.runConfigs });
    renderRunConfigMenu();
    toast("Deleted `" + values.which + "`.");
  }


  function bind() {
    $("run").addEventListener("click", () => {
      if ($("run").textContent === "Stop" && state.job && !state.job.done) {
        api("POST", "/api/run/" + state.job.id + "/stop", {}).catch((err) => toast(err.message));
        return;
      }
      run().catch((err) => toast(err.message));
    });
    if ($("debug")) $("debug").addEventListener("click", () => startDebug().catch((err) => toast(err.message)));
    if ($("split-editor")) $("split-editor").addEventListener("click", () => toggleSplit());
    if ($("close-split")) $("close-split").addEventListener("click", () => closeSplit());
    bindEditorSplitBar();
    updateSplitButton();
    // Never boot into a leftover split layout.
    setSplit(false, "a");
    if ($("run-config")) $("run-config").addEventListener("click", (event) => {
      renderRunConfigMenu();
      togglePopover(event.currentTarget);
    });
    if ($("beautify")) $("beautify").addEventListener("click", () => beautifyActiveFile());
    if ($("project-search")) $("project-search").addEventListener("click", () => openProjectSearch());
    if ($("search-close")) $("search-close").addEventListener("click", () => closeProjectSearch());
    if ($("search-input")) {
      $("search-input").addEventListener("input", () => runProjectSearch($("search-input").value));
      $("search-input").addEventListener("keydown", (event) => {
        const hits = state.searchHits || [];
        if (event.key === "Escape") {
          event.preventDefault();
          closeProjectSearch();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          state.searchIndex = Math.min(hits.length - 1, (state.searchIndex || 0) + 1);
          runProjectSearch($("search-input").value);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          state.searchIndex = Math.max(0, (state.searchIndex || 0) - 1);
          runProjectSearch($("search-input").value);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const hit = hits[state.searchIndex || 0];
          if (hit) {
            closeProjectSearch();
            jumpTo(hit.file, hit.line, 1);
          }
        }
      });
    }
    if ($("search-panel")) {
      $("search-panel").addEventListener("click", (event) => {
        if (event.target === $("search-panel")) closeProjectSearch();
      });
    }
    if ($("brand-home")) {
      $("brand-home").addEventListener("click", () => {
        closePopovers();
        try { localStorage.removeItem("lark-skip-welcome"); } catch (e) {}
        showWelcome();
      });
    }
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
    if ($("setting-display-reset")) $("setting-display-reset").addEventListener("click", () => resetDisplaySize());
    if ($("setting-font-down")) $("setting-font-down").addEventListener("click", () => bumpFont(-1));
    if ($("setting-font-up")) $("setting-font-up").addEventListener("click", () => bumpFont(1));
    window.addEventListener("resize", () => {
      const open = document.querySelector(".popover:not([hidden])");
      if (!open) return;
      const btn = document.querySelector('[data-pop="' + open.id + '"]');
      if (btn) placePopover(open, btn);
    });
    const bindPref = (id, read) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("change", () => {
        try {
          applyEditorPrefs(read(el), true);
        } catch (err) {
          toast(err.message);
        }
      });
    };
    bindPref("setting-font-family", (el) => ({ fontFamily: el.value }));
    bindPref("setting-ligatures", (el) => ({ ligatures: el.checked }));
    bindPref("setting-indent-size", (el) => ({ indentSize: Number(el.value) }));
    bindPref("setting-indent-tabs", (el) => ({ indentWithTabs: el.checked }));
    bindPref("setting-line-wrap", (el) => ({ lineWrapping: el.checked }));
    bindPref("setting-line-numbers", (el) => ({ lineNumbers: el.checked }));
    bindPref("setting-autosave", (el) => ({ autoSave: el.checked }));
    bindPref("setting-autosave-delay", (el) => ({ autoSaveDelayMs: Number(el.value) }));
    bindPref("setting-format-save", (el) => ({ formatOnSave: el.checked }));
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
    if ($("update-later")) $("update-later").addEventListener("click", () => hideUpdateBanner());
    if ($("update-skip")) $("update-skip").addEventListener("click", () => skipUpdate().catch((err) => toast(err.message)));
    if ($("update-now")) $("update-now").addEventListener("click", () => installUpdate().catch((err) => toast(err.message)));
    if ($("update-restart")) $("update-restart").addEventListener("click", () => restartAfterUpdate().catch((err) => toast(err.message)));
    if ($("update-modal-later")) $("update-modal-later").addEventListener("click", () => {
      hideUpdateBanner();
      toast("You'll be prompted again next time you open Lark Desktop.");
    });
    if ($("update-modal-now")) $("update-modal-now").addEventListener("click", () => installUpdate().catch((err) => toast(err.message)));
    if ($("update-modal-restart")) $("update-modal-restart").addEventListener("click", () => restartAfterUpdate().catch((err) => toast(err.message)));
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
    if ($("menu-run-config")) {
      $("menu-run-config").addEventListener("click", (event) => {
        const act = event.target.dataset.runCfg;
        if (!act) return;
        closePopovers();
        if (act === "save") saveRunConfig().catch((e) => toast(e.message));
        else if (act === "manage") manageRunConfigs().catch((e) => toast(e.message));
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
    if ($("tab-debug")) $("tab-debug").addEventListener("click", () => showConsoleTab("debug"));
    if ($("tab-tests")) $("tab-tests").addEventListener("click", () => showConsoleTab("tests"));
    if ($("tab-terminal")) $("tab-terminal").addEventListener("click", () => showConsoleTab("terminal"));
    if ($("dbg-continue")) $("dbg-continue").addEventListener("click", () => debugCommand("cont").catch((e) => toast(e.message)));
    if ($("dbg-step")) $("dbg-step").addEventListener("click", () => debugCommand("step").catch((e) => toast(e.message)));
    if ($("dbg-next")) $("dbg-next").addEventListener("click", () => debugCommand("next").catch((e) => toast(e.message)));
    if ($("dbg-step-out")) $("dbg-step-out").addEventListener("click", () => debugCommand("step up").catch((e) => toast(e.message)));
    if ($("dbg-locals")) $("dbg-locals").addEventListener("click", () => debugCommand("locals").catch((e) => toast(e.message)));
    if ($("dbg-stop")) $("dbg-stop").addEventListener("click", () => stopDebug().catch((e) => toast(e.message)));
    if ($("tests-refresh")) $("tests-refresh").addEventListener("click", () => refreshTests().catch((e) => toast(e.message)));
    if ($("tests-run-all")) $("tests-run-all").addEventListener("click", () => runTests("", "").catch((e) => toast(e.message)));
    $("clear-console").addEventListener("click", () => {
      if (state.consoleTab === "terminal") {
        ensureTerminal(true).catch((err) => toast(err.message));
        return;
      }
      if (state.consoleTab === "debug") {
        if ($("debug-out")) $("debug-out").textContent = "";
        if ($("debug-locals")) $("debug-locals").textContent = "";
        return;
      }
      if (state.consoleTab === "tests") {
        if ($("tests-out")) $("tests-out").textContent = "";
        return;
      }
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
    if ($("terminal-send")) {
      $("terminal-send").addEventListener("click", () => {
        sendTerminalCommand().catch((err) => toast(err.message));
      });
    }
    if ($("terminal-restart")) {
      $("terminal-restart").addEventListener("click", () => {
        ensureTerminal(true).catch((err) => toast(err.message));
      });
    }
    if ($("terminal-input")) {
      $("terminal-input").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          sendTerminalCommand().catch((err) => toast(err.message));
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!state.termHistory.length) return;
          state.termHistIndex = Math.max(0, state.termHistIndex - 1);
          $("terminal-input").value = state.termHistory[state.termHistIndex] || "";
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          state.termHistIndex = Math.min(state.termHistory.length, state.termHistIndex + 1);
          $("terminal-input").value = state.termHistIndex >= state.termHistory.length
            ? ""
            : (state.termHistory[state.termHistIndex] || "");
        }
      });
    }
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
      const items = currentPaletteItems();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        paletteIndex = Math.min(items.length - 1, paletteIndex + 1);
        renderPalette($("palette-input").value);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        paletteIndex = Math.max(0, paletteIndex - 1);
        renderPalette($("palette-input").value);
      } else if (event.key === "Enter") {
        event.preventDefault();
        pickPaletteItem(items[paletteIndex]);
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
        if ($("search-panel") && !$("search-panel").hidden) { closeProjectSearch(); return; }
        if (!$("palette").hidden) { $("palette").hidden = true; return; }
        if (!$("modal").hidden) { closeModal(null); return; }
        if (!$("drawer").hidden) { closeDrawer(); return; }
        closePopovers();
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "f") {
        event.preventDefault();
        openProjectSearch();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && key === "m") {
        if (!$("modal").hidden || isDialogTyping()) return;
        event.preventDefault();
        extractMethodAtSelection().catch((err) => toast(err.message));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && key === "v") {
        if (!$("modal").hidden || isDialogTyping()) return;
        event.preventDefault();
        introduceVarAtSelection().catch((err) => toast(err.message));
        return;
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
      // Shift+Alt+F (VS Code) or Ctrl+Alt+L (IntelliJ) — beautify
      if ((event.altKey && event.shiftKey && key === "f")
          || ((event.ctrlKey || event.metaKey) && event.altKey && key === "l")) {
        if (!$("modal").hidden || isDialogTyping()) return;
        event.preventDefault();
        beautifyActiveFile();
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
        if (event.shiftKey) resetDisplaySize();
        else applyDisplay({ zoom: 100 }, true);
        return;
      }
      if (isTyping(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && key === "p") {
        event.preventDefault();
        openPalette("open");
      } else if ((event.ctrlKey || event.metaKey) && (key === "\\" || event.code === "Backslash")) {
        event.preventDefault();
        toggleSplit();
        return;
      } else if ((event.ctrlKey || event.metaKey) && key === "b") {
        event.preventDefault();
        toggleFiles();
      } else if (event.key === "F12" && !event.shiftKey) {
        event.preventDefault();
        goToDefinition().catch((err) => toast(err.message));
      } else if (event.key === "F12" && event.shiftKey) {
        event.preventDefault();
        findUsagesAtCursor().catch((err) => toast(err.message));
      } else if (event.key === "F2") {
        event.preventDefault();
        renameSymbol().catch((err) => toast(err.message));
      } else if (event.key === "F5") {
        event.preventDefault();
        startDebug().catch((err) => toast(err.message));
      } else if (event.key === "F8" && state.debug && !state.debug.done) {
        event.preventDefault();
        debugCommand("cont").catch((err) => toast(err.message));
      } else if (event.key === "F7" && state.debug && !state.debug.done) {
        event.preventDefault();
        debugCommand("step").catch((err) => toast(err.message));
      }
    });
    window.addEventListener("resize", () => {
      const consoleH = clampPanel(
        getComputedStyle(document.documentElement).getPropertyValue("--console-h"),
        72, 640, 188
      );
      const center = $("center") ? $("center").getBoundingClientRect().height : 0;
      if (center > 0) {
        const max = Math.max(140, center - 96);
        if (consoleH > max) {
          document.documentElement.style.setProperty("--console-h", max + "px");
          savePanels();
        }
      }
      const filesW = clampPanel(
        getComputedStyle(document.documentElement).getPropertyValue("--files-w"),
        160, 420, 260
      );
      if (!$("shell").classList.contains("files-collapsed")) {
        document.documentElement.style.setProperty("--files-w", filesW + "px");
      }
      refreshAllEditors();
    });
    bindSplitters();
    ["shell", "workspace", "center"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("scroll", () => {
        if (el.scrollLeft !== 0) el.scrollLeft = 0;
      }, { passive: true });
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => refreshAllEditors()).catch(() => {});
    }
  }

  function isDesktopEdition(info) {
    const edition = (info && info.edition) || (state.settings && state.settings.edition) || "";
    return edition === "desktop" || !!(info && (info.prompt || info.required));
  }

  function hideUpdateBanner() {
    const banner = $("update-banner");
    if (banner) banner.hidden = true;
    const modal = $("update-modal");
    if (modal) modal.hidden = true;
  }

  function showUpdateBanner(info) {
    state.updateInfo = info;
    const desktop = isDesktopEdition(info);
    const title = desktop
      ? ("Lark Desktop " + (info.latest || "") + " is ready")
      : ("Lark " + (info.latest || "") + " is ready");
    const notes = info.notes || info.message || ("You have " + (info.current || "") + ".");

    if (desktop && $("update-modal")) {
      $("update-modal-title").textContent = title;
      $("update-modal-notes").textContent = notes;
      const nowBtn = $("update-modal-now");
      const restartBtn = $("update-modal-restart");
      if (nowBtn) nowBtn.hidden = false;
      if (restartBtn) restartBtn.hidden = true;
      $("update-modal").hidden = false;
      if ($("update-banner")) $("update-banner").hidden = true;
      return;
    }

    const banner = $("update-banner");
    if (!banner) return;
    $("update-title").textContent = title;
    $("update-notes").textContent = notes;
    const skip = $("update-skip");
    if (skip) skip.hidden = !!desktop;
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
    if (isDesktopEdition(info)) {
      // Desktop: Later only hides for this session; next launch prompts again.
      hideUpdateBanner();
      toast("You'll be prompted again next time you open Lark Desktop.");
      return;
    }
    await api("POST", "/api/update/skip", { version: info.latest });
    hideUpdateBanner();
    toast("Skipped Lark " + info.latest + ".");
  }

  async function installUpdate() {
    const info = state.updateInfo || {};
    const desktop = isDesktopEdition(info);
    toast("Downloading update…");
    const result = await api("POST", "/api/update/install", { download: info.download || "" });
    toast(result.message || "Update ready. Restart Lark.");
    if (result.canRestart) {
      if (desktop && $("update-modal")) {
        $("update-modal").hidden = false;
        $("update-modal-title").textContent = "Update installed";
        $("update-modal-notes").textContent = result.message || "Restart Lark Desktop to finish.";
        if ($("update-modal-now")) $("update-modal-now").hidden = true;
        if ($("update-modal-later")) $("update-modal-later").hidden = true;
        if ($("update-modal-restart")) $("update-modal-restart").hidden = false;
        return;
      }
      if ($("update-banner")) $("update-banner").hidden = false;
      if ($("update-restart")) $("update-restart").hidden = false;
      if ($("update-now")) $("update-now").hidden = true;
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
      let larkVer = "";
      try {
        const health = await api("GET", "/api/health");
        larkVer = health.version || "";
      } catch (_) { /* optional */ }
      state.settings = await api("GET", "/api/settings");
      const edition = state.settings.edition || "portable";
      document.body.classList.toggle("edition-desktop", edition === "desktop");
      applyTheme(state.settings.theme, false);
      applyDisplay({
        fontSize: state.settings.fontSize || 14,
        zoom: state.settings.zoom || 100
      }, false);
      loadRecent();
      applyEditorPrefs({
        fontFamily: state.settings.fontFamily || "jetbrains",
        ligatures: state.settings.ligatures !== false,
        indentSize: state.settings.indentSize || 4,
        indentWithTabs: !!state.settings.indentWithTabs,
        lineWrapping: !!state.settings.lineWrapping,
        lineNumbers: state.settings.lineNumbers !== false,
        autoSave: state.settings.autoSave !== false,
        autoSaveDelayMs: state.settings.autoSaveDelayMs || 800,
        formatOnSave: !!state.settings.formatOnSave
      }, false);
      if ($("setting-update-feed")) $("setting-update-feed").value = state.settings.updateFeed || "";
      showGithub();
      const version = (state.settings.javaVersion || "").split(".")[0];
      const bits = [];
      if (larkVer) bits.push((edition === "desktop" ? "Lark Desktop " : "Lark ") + larkVer);
      if (version) bits.push("Java " + version);
      $("status-java").textContent = bits.join(" · ");
      if ($("status-path") && larkVer) {
        $("status-path").textContent = (edition === "desktop" ? "Lark Desktop " : "Lark ") + larkVer;
      }
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
