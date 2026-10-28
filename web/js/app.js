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
    prism: "Prism",
    volt: "Volt",
    flare: "Flare",
    reef: "Reef",
    magma: "Magma",
    aurora: "Aurora",
    solar: "Solar",
    lilac: "Lilac",
    ocean: "Ocean",
    espresso: "Espresso",
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
    "cedar", "inkwell", "porcelain", "hearth", "canopy",
    "prism", "volt", "flare", "reef", "magma",
    "aurora", "solar", "lilac", "ocean", "espresso"
  ];
  /** Preview chip colors for the theme overlay tiles. */
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
    inkwell: { bg: "#1a1e24", accent: "#6b8cae" },
    porcelain: { bg: "#f3f1ec", accent: "#5a7d9a" },
    hearth: { bg: "#231c18", accent: "#c07048" },
    canopy: { bg: "#171d19", accent: "#5f8f6a" },
    prism: { bg: "#0c0d12", accent: "#ff4fd8" },
    volt: { bg: "#0a0f1c", accent: "#ffe566" },
    flare: { bg: "#1a0e0a", accent: "#ff6b2d" },
    reef: { bg: "#04181c", accent: "#2ee6c5" },
    magma: { bg: "#140808", accent: "#ff3b3b" },
    aurora: { bg: "#101c1d", accent: "#72e6bd" },
    solar: { bg: "#fff7df", accent: "#c76b00" },
    lilac: { bg: "#201a2b", accent: "#c7a0ff" },
    ocean: { bg: "#071b2a", accent: "#4fc3f7" },
    espresso: { bg: "#211814", accent: "#e0a36c" }
  };
  const BOOT_ID = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : ("boot-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  const BOOT_STARTED_AT = Date.now();
  const INSTANCE_COOKIE = "lark_instance";
  const FONT_STACKS = {
    jetbrains: '"JetBrains Mono", "Cascadia Mono", "Liberation Mono", ui-monospace, monospace',
    fira: '"Fira Code", "JetBrains Mono", ui-monospace, monospace',
    source: '"Source Code Pro", "JetBrains Mono", ui-monospace, monospace',
    plex: '"IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace',
    roboto: '"Roboto Mono", "JetBrains Mono", ui-monospace, monospace',
    space: '"Space Mono", "Courier New", monospace',
    inconsolata: 'Inconsolata, "Courier New", monospace',
    ubuntu: '"Ubuntu Mono", "Courier New", monospace',
    cousine: 'Cousine, "Courier New", monospace',
    sharetech: '"Share Tech Mono", "Courier New", monospace',
    vt323: 'VT323, "Courier New", monospace',
    cascadia: '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", ui-monospace, monospace',
    aptos: '"Aptos Mono", "Cascadia Mono", "JetBrains Mono", ui-monospace, monospace',
    lucida: '"Lucida Console", "Courier New", monospace',
    consolas: 'Consolas, Menlo, Monaco, "Courier New", monospace',
    system: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  };
  /** Themes where each syntax token family is clearly a different color. */
  const DISTINCT_THEME_IDS = [
    "prism", "volt", "flare", "reef", "magma",
    "candy", "terminal", "ultraviolet", "nova", "citrus"
  ];
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
    markProblems: [],
    localProblems: [],
    job: null,
    poll: null,
    scratchJob: null,
    scratchPoll: null,
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
  let cmScratch = null;
  let focusedEditor = "a";
  let suppress = false;
  let paletteIndex = 0;
  let modalResolve = null;
  const SCRATCH_KEY = "lark-scratch-source"; // prior single-pad key (migrated once)
  const SCRATCH_DECK_KEY = "lark-scratch-deck-v1";
  const SCRATCH_POS_KEY = "lark-scratch-pos";
  const SCRATCH_MAX = 12;
  const SCRATCH_STARTER =
    "// Scratch — no class or main needed.\n"
    + "// Imports stay at the top; everything else runs inside main.\n\n"
    + "int n = 5;\n"
    + "System.out.println(\"n squared = \" + (n * n));\n";
  let spaceHeld = false;
  let scratchDrag = null;
  let scratchResize = null;
  let scratchDeck = null;
  let scratchSwitching = false;
  let assignSketch = "";

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
    return THEME_NAMES[theme] || "Slate";
  }

  function currentThemeId() {
    const raw = document.documentElement.dataset.theme || "slate";
    return THEME_CANON[raw] || raw;
  }

  function applyTheme(theme, save) {
    theme = THEME_CANON[theme] || theme;
    if (!THEME_NAMES[theme] || !THEME_IDS.includes(theme)) theme = "slate";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("lark-theme", theme); } catch (e) {}
    if ($("theme")) {
      $("theme").textContent = "Themes";
      $("theme").title = "Themes · " + themeName(theme);
    }
    if (save && state.settings) {
      api("PUT", "/api/settings", { theme: theme }).catch((err) => toast(err.message));
    }
    syncThemeOverlaySelection();
  }

  function themeOverlayOpen() {
    const panel = $("theme-overlay");
    return !!(panel && !panel.hidden);
  }

  function themeFilterMode() {
    const on = document.querySelector(".theme-filter-btn.on");
    return (on && on.dataset.themeFilter) || "all";
  }

  function themesForFilter(mode) {
    if (mode === "distinct") {
      return THEME_IDS.filter((id) => DISTINCT_THEME_IDS.includes(id));
    }
    return THEME_IDS.slice();
  }

  function makeThemeTile(id) {
    const sw = THEME_SWATCHES[id] || { bg: "#333", accent: "#6897bb" };
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-tile";
    btn.dataset.themeChoice = id;
    if (DISTINCT_THEME_IDS.includes(id)) btn.classList.add("theme-tile-distinct");
    btn.innerHTML =
      '<span class="theme-tile-preview" style="--tile-bg:' + sw.bg + ";--tile-accent:" + sw.accent + '"></span>'
      + '<span class="theme-tile-name">' + themeName(id) + "</span>"
      + '<span class="theme-tile-meta">Click to preview</span>';
    btn.addEventListener("click", () => {
      applyTheme(id, true);
    });
    return btn;
  }

  function renderThemeGrid() {
    const grid = $("theme-grid");
    if (!grid) return;
    const mode = themeFilterMode();
    grid.innerHTML = "";
    grid.dataset.ready = "1";
    grid.dataset.filter = mode;
    const ids = themesForFilter(mode);
    if (mode === "distinct") {
      const note = document.createElement("p");
      note.className = "theme-filter-note path-note";
      note.textContent = "Distinct themes give keywords, strings, numbers, and types clearly different colors.";
      grid.appendChild(note);
    }
    ids.forEach((id) => grid.appendChild(makeThemeTile(id)));
    syncThemeOverlaySelection();
  }

  function syncThemeOverlaySelection() {
    const grid = $("theme-grid");
    if (!grid) return;
    const active = currentThemeId();
    grid.querySelectorAll(".theme-tile").forEach((tile) => {
      const on = tile.dataset.themeChoice === active;
      tile.classList.toggle("active", on);
      const meta = tile.querySelector(".theme-tile-meta");
      if (meta) meta.textContent = on ? "Active" : "Click to preview";
    });
  }

  function openThemeOverlay() {
    const panel = $("theme-overlay");
    if (!panel) return;
    closePopovers();
    closeProjectOverlay();
    renderThemeGrid();
    panel.hidden = false;
  }

  function bindThemeFilters() {
    document.querySelectorAll(".theme-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".theme-filter-btn").forEach((b) => {
          b.classList.remove("on");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("on");
        btn.setAttribute("aria-selected", "true");
        renderThemeGrid();
      });
    });
  }

  function closeThemeOverlay() {
    const panel = $("theme-overlay");
    if (panel) panel.hidden = true;
  }

  function cycleTheme(delta) {
    const list = themesForFilter(themeFilterMode());
    const active = currentThemeId();
    let idx = list.indexOf(active);
    if (idx < 0) idx = 0;
    const next = list[(idx + delta + list.length) % list.length];
    applyTheme(next, true);
  }

  /** Time-of-day theme suggestion (once per local day, dismissible). */
  function themeSuggestionForHour(hour) {
    if (hour >= 5 && hour < 11) {
      return { id: "daylight", title: "Morning light", body: "Switch to Daylight for a clearer desk?" };
    }
    if (hour >= 11 && hour < 17) {
      return { id: "desk", title: "Midday focus", body: "Desk is a calm production theme for afternoon work." };
    }
    if (hour >= 17 && hour < 21) {
      return { id: "hearth", title: "Evening warm-up", body: "Try Hearth for a warmer late-day desk?" };
    }
    return { id: "slate", title: "Night mode", body: "Slate keeps things quiet for late coding." };
  }

  function maybeShowThemeNudge() {
    const banner = $("theme-nudge");
    if (!banner) return;
    let dismissed = "";
    try { dismissed = localStorage.getItem("lark-theme-nudge-day") || ""; } catch (e) {}
    const today = new Date();
    const dayKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0")
      + "-" + String(today.getDate()).padStart(2, "0");
    if (dismissed === dayKey) return;
    const suggestion = themeSuggestionForHour(today.getHours());
    const current = (state.settings && state.settings.theme) || document.documentElement.dataset.theme || "desk";
    if (current === suggestion.id) return;
    $("theme-nudge-title").textContent = suggestion.title;
    $("theme-nudge-body").textContent = suggestion.body;
    banner.dataset.themeId = suggestion.id;
    banner.hidden = false;
  }

  function dismissThemeNudge(apply) {
    const banner = $("theme-nudge");
    if (!banner) return;
    const today = new Date();
    const dayKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0")
      + "-" + String(today.getDate()).padStart(2, "0");
    try { localStorage.setItem("lark-theme-nudge-day", dayKey); } catch (e) {}
    if (apply && banner.dataset.themeId) {
      applyTheme(banner.dataset.themeId, true);
      toast("Theme → " + themeName(banner.dataset.themeId));
    }
    banner.hidden = true;
  }

  function scratchOpen() {
    const pad = $("scratch-pad");
    return !!(pad && !pad.hidden);
  }

  function scratchId() {
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function defaultScratchDeck() {
    const id = scratchId();
    return {
      active: id,
      order: [id],
      items: {
        [id]: { id: id, name: "bench", source: SCRATCH_STARTER, updatedAt: Date.now() }
      }
    };
  }

  function loadScratchDeck() {
    if (scratchDeck) return scratchDeck;
    try {
      const raw = localStorage.getItem(SCRATCH_DECK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.items && Array.isArray(parsed.order) && parsed.order.length) {
          scratchDeck = parsed;
          if (!scratchDeck.items[scratchDeck.active]) scratchDeck.active = scratchDeck.order[0];
          return scratchDeck;
        }
      }
    } catch (e) {}
    // Migrate the old single-pad buffer once.
    let prior = null;
    try {
      prior = localStorage.getItem(SCRATCH_KEY);
    } catch (e) {}
    const deck = defaultScratchDeck();
    if (prior != null && prior !== "") {
      const id = deck.active;
      deck.items[id].source = prior;
      deck.items[id].name = "bench";
    }
    scratchDeck = deck;
    persistScratchDeck();
    return scratchDeck;
  }

  function persistScratchDeck() {
    if (!scratchDeck) return;
    try {
      localStorage.setItem(SCRATCH_DECK_KEY, JSON.stringify(scratchDeck));
    } catch (e) {}
  }

  function activeScratchItem() {
    const deck = loadScratchDeck();
    return deck.items[deck.active] || deck.items[deck.order[0]];
  }

  function syncEditorIntoActiveScratch() {
    if (!cmScratch || !scratchDeck || scratchSwitching) return;
    const item = scratchDeck.items[scratchDeck.active];
    if (!item) return;
    item.source = cmScratch.getValue();
    item.updatedAt = Date.now();
    persistScratchDeck();
  }

  function setScratchHeading() {
    const el = $("scratch-heading");
    const item = activeScratchItem();
    if (el) el.textContent = item ? ("Scratch · " + item.name) : "Scratch";
  }

  function renderScratchDeck() {
    const nav = $("scratch-deck");
    if (!nav) return;
    const deck = loadScratchDeck();
    nav.replaceChildren();
    deck.order.forEach((id) => {
      const item = deck.items[id];
      if (!item) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scratch-deck-item" + (id === deck.active ? " active" : "");
      btn.textContent = item.name;
      btn.title = item.name;
      btn.dataset.scratchId = id;
      btn.addEventListener("click", () => selectScratch(id));
      btn.addEventListener("dblclick", () => renameScratch().catch((err) => toast(err.message)));
      nav.appendChild(btn);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "scratch-deck-item scratch-deck-add";
    add.textContent = "+";
    add.title = "New scratch";
    add.addEventListener("click", () => newScratch().catch((err) => toast(err.message)));
    nav.appendChild(add);
    setScratchHeading();
  }

  function selectScratch(id) {
    const deck = loadScratchDeck();
    if (!deck.items[id] || id === deck.active) return;
    syncEditorIntoActiveScratch();
    deck.active = id;
    persistScratchDeck();
    const editor = ensureScratchEditor();
    if (editor) {
      scratchSwitching = true;
      editor.setValue(deck.items[id].source || "");
      scratchSwitching = false;
      editor.focus();
    }
    renderScratchDeck();
    closeScratchMenu();
  }

  async function newScratch() {
    const deck = loadScratchDeck();
    if (deck.order.length >= SCRATCH_MAX) {
      toast("Deck is full (" + SCRATCH_MAX + "). Delete one to make room.");
      return;
    }
    const values = await formDialog({
      title: "New scratch",
      ok: "Create",
      note: "A parallel pad — experiments don’t overwrite each other.",
      fields: [{ name: "name", label: "Name", value: "spike" }]
    });
    if (!values) return;
    const name = sanitizeScratchName(values.name);
    syncEditorIntoActiveScratch();
    const id = scratchId();
    deck.items[id] = { id: id, name: name, source: SCRATCH_STARTER, updatedAt: Date.now() };
    deck.order.push(id);
    deck.active = id;
    persistScratchDeck();
    const editor = ensureScratchEditor();
    if (editor) {
      scratchSwitching = true;
      editor.setValue(SCRATCH_STARTER);
      scratchSwitching = false;
      editor.focus();
    }
    renderScratchDeck();
    closeScratchMenu();
    toast("Scratch “" + name + "” ready.");
  }

  function sanitizeScratchName(raw) {
    let name = String(raw || "").trim().replace(/\s+/g, " ");
    if (!name) name = "scratch";
    if (name.length > 24) name = name.slice(0, 24);
    return name;
  }

  async function renameScratch() {
    const item = activeScratchItem();
    if (!item) return;
    const values = await formDialog({
      title: "Rename scratch",
      ok: "Rename",
      fields: [{ name: "name", label: "Name", value: item.name }]
    });
    if (!values) return;
    item.name = sanitizeScratchName(values.name);
    item.updatedAt = Date.now();
    persistScratchDeck();
    renderScratchDeck();
    closeScratchMenu();
  }

  async function duplicateScratch() {
    const deck = loadScratchDeck();
    if (deck.order.length >= SCRATCH_MAX) {
      toast("Deck is full (" + SCRATCH_MAX + "). Delete one to make room.");
      return;
    }
    syncEditorIntoActiveScratch();
    const src = activeScratchItem();
    if (!src) return;
    const id = scratchId();
    const name = sanitizeScratchName(src.name + " copy");
    deck.items[id] = { id: id, name: name, source: src.source || "", updatedAt: Date.now() };
    const idx = deck.order.indexOf(src.id);
    deck.order.splice(idx < 0 ? deck.order.length : idx + 1, 0, id);
    deck.active = id;
    persistScratchDeck();
    const editor = ensureScratchEditor();
    if (editor) {
      scratchSwitching = true;
      editor.setValue(deck.items[id].source);
      scratchSwitching = false;
      editor.focus();
    }
    renderScratchDeck();
    closeScratchMenu();
    toast("Duplicated as “" + name + "”.");
  }

  async function deleteScratch() {
    const deck = loadScratchDeck();
    if (deck.order.length <= 1) {
      toast("Keep at least one scratch on the deck.");
      return;
    }
    const item = activeScratchItem();
    if (!item) return;
    const yes = await formDialog({
      title: "Delete “" + item.name + "”?",
      ok: "Delete",
      note: "This removes that scratch from the deck. It can’t be undone."
    });
    if (!yes) return;
    const gone = item.id;
    delete deck.items[gone];
    deck.order = deck.order.filter((id) => id !== gone);
    deck.active = deck.order[0];
    persistScratchDeck();
    const editor = ensureScratchEditor();
    if (editor) {
      scratchSwitching = true;
      editor.setValue(deck.items[deck.active].source || "");
      scratchSwitching = false;
    }
    renderScratchDeck();
    closeScratchMenu();
    toast("Scratch deleted.");
  }

  function classNameFromScratchName(name) {
    const parts = String(name || "Scratch").replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
    let out = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
    if (!out) out = "ScratchPad";
    if (!/^[A-Za-z]/.test(out)) out = "Scratch" + out;
    return out.slice(0, 48);
  }

  /** Wrap snippet as a named class for promote (full class+main left alone). */
  function wrapScratchAsClass(raw, className) {
    const text = (raw || "").replace(/\r\n/g, "\n");
    if (!text.trim()) throw new Error("This scratch is empty.");
    const hasMain = /\b(?:public\s+)?static\s+void\s+main\s*\(\s*String\s*/.test(text);
    const classMatch = text.match(/\bpublic\s+class\s+(\w+)/) || text.match(/\bclass\s+(\w+)/);
    if (hasMain && classMatch) {
      return { source: text, mainClass: classMatch[1] };
    }
    const imports = [];
    const rest = [];
    text.split("\n").forEach((line) => {
      if (/^\s*import\s+[\w.*]+\s*;\s*$/.test(line)) imports.push(line.trim());
      else if (/^\s*package\s+/.test(line)) { /* default package */ }
      else rest.push(line);
    });
    const body = rest.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    let source = imports.length ? imports.join("\n") + "\n\n" : "";
    const cls = className || "ScratchPad";
    if (hasMain && !classMatch) {
      source += "public class " + cls + " {\n";
      body.split("\n").forEach((l) => { source += (l ? "  " + l : "") + "\n"; });
      source += "}\n";
      return { source: source, mainClass: cls };
    }
    source += "public class " + cls + " {\n";
    source += "  public static void main(String[] args) {\n";
    if (body) body.split("\n").forEach((l) => { source += "    " + l + "\n"; });
    else source += "    // Write some Java here\n";
    source += "  }\n}\n";
    return { source: source, mainClass: cls };
  }

  async function promoteScratch() {
    if (!state.project) {
      toast("Open a project first, then promote.");
      return;
    }
    syncEditorIntoActiveScratch();
    const item = activeScratchItem();
    if (!item) return;
    const className = classNameFromScratchName(item.name);
    let wrapped;
    try {
      wrapped = wrapScratchAsClass(item.source, className);
    } catch (err) {
      toast(err.message || "This scratch is empty.");
      return;
    }
    const dir = selectedDir() || "src";
    const values = await formDialog({
      title: "Promote to project",
      ok: "Create file",
      note: "Writes a real .java from this scratch. The pad stays on your deck.",
      fields: [{
        name: "path",
        label: "Path",
        value: (dir ? dir + "/" : "") + wrapped.mainClass + ".java"
      }]
    });
    if (!values) return;
    const path = values.path.trim().replace(/^\/+/, "");
    if (!path.endsWith(".java")) {
      toast("Promote path should end in .java.");
      return;
    }
    if (fileByPath(path)) return toast("There's already a file at " + path + ".");
    let content = wrapped.source;
    const pkg = packageFor(parentDir(path));
    if (pkg && !/^\s*package\s+/.test(content)) {
      content = "package " + pkg + ";\n\n" + content;
    }
    await writeNewFile(path, content);
    closeScratchMenu();
    toast("Promoted to " + path + ".");
  }

  function closeScratchMenu() {
    const menu = $("scratch-menu");
    if (menu) menu.hidden = true;
    if ($("scratch-more")) $("scratch-more").setAttribute("aria-expanded", "false");
  }

  function toggleScratchMenu() {
    const menu = $("scratch-menu");
    if (!menu) return;
    const open = menu.hidden;
    menu.hidden = !open;
    if ($("scratch-more")) $("scratch-more").setAttribute("aria-expanded", open ? "true" : "false");
  }

  function ensureScratchEditor() {
    if (cmScratch) return cmScratch;
    const host = $("scratch-editor");
    if (!host || typeof CodeMirror === "undefined") return null;
    const item = activeScratchItem();
    const saved = (item && item.source != null && item.source !== "") ? item.source : SCRATCH_STARTER;
    cmScratch = CodeMirror(host, {
      value: saved,
      mode: "text/x-java",
      theme: "lark",
      lineNumbers: !(state.settings && state.settings.lineNumbers === false),
      gutters: ["CodeMirror-linenumbers"],
      indentUnit: (state.settings && state.settings.indentSize) || 4,
      tabSize: (state.settings && state.settings.indentSize) || 4,
      indentWithTabs: !!(state.settings && state.settings.indentWithTabs),
      lineWrapping: true,
      matchBrackets: true,
      autoCloseBrackets: { pairs: "()[]{}''\"\"", explode: "" },
      styleActiveLine: true,
      extraKeys: {
        "Enter": enterBetweenBrackets,
        "Ctrl-Enter": () => { runScratch().catch((err) => toast(err.message)); },
        "Cmd-Enter": () => { runScratch().catch((err) => toast(err.message)); },
        "Esc": () => { closeScratchMenu(); closeScratch(); }
      }
    });
    cmScratch.on("change", () => {
      if (scratchSwitching) return;
      syncEditorIntoActiveScratch();
    });
    return cmScratch;
  }

  function restoreScratchPos() {
    const pad = $("scratch-pad");
    if (!pad) return;
    try {
      const raw = localStorage.getItem(SCRATCH_POS_KEY);
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (typeof pos.left === "number" && typeof pos.top === "number") {
        pad.style.left = Math.max(0, pos.left) + "px";
        pad.style.top = Math.max(0, pos.top) + "px";
        pad.style.right = "auto";
        pad.style.bottom = "auto";
      }
      if (typeof pos.width === "number") pad.style.width = pos.width + "px";
      if (typeof pos.height === "number") pad.style.height = pos.height + "px";
    } catch (e) {}
  }

  function saveScratchPos() {
    const pad = $("scratch-pad");
    if (!pad || pad.hidden) return;
    const rect = pad.getBoundingClientRect();
    try {
      localStorage.setItem(SCRATCH_POS_KEY, JSON.stringify({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }));
    } catch (e) {}
  }

  function bindScratchDrag() {
    const pad = $("scratch-pad");
    const handle = $("scratch-drag") || (pad && pad.querySelector(".scratch-head"));
    if (!pad || !handle || handle._larkDrag) return;
    handle._larkDrag = true;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest("button, select, input, a")) return;
      const rect = pad.getBoundingClientRect();
      scratchDrag = {
        id: event.pointerId,
        ox: event.clientX - rect.left,
        oy: event.clientY - rect.top,
        w: rect.width,
        h: rect.height
      };
      pad.classList.add("dragging");
      pad.style.left = rect.left + "px";
      pad.style.top = rect.top + "px";
      pad.style.right = "auto";
      pad.style.bottom = "auto";
      try { handle.setPointerCapture(event.pointerId); } catch (e) {}
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!scratchDrag || scratchDrag.id !== event.pointerId) return;
      const maxX = Math.max(0, window.innerWidth - scratchDrag.w);
      const maxY = Math.max(0, window.innerHeight - scratchDrag.h);
      const left = Math.min(maxX, Math.max(0, event.clientX - scratchDrag.ox));
      const top = Math.min(maxY, Math.max(0, event.clientY - scratchDrag.oy));
      pad.style.left = left + "px";
      pad.style.top = top + "px";
    });
    const endDrag = (event) => {
      if (!scratchDrag || (event && scratchDrag.id !== event.pointerId)) return;
      scratchDrag = null;
      pad.classList.remove("dragging");
      saveScratchPos();
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  function bindScratchResize() {
    const pad = $("scratch-pad");
    const handle = $("scratch-resize");
    if (!pad || !handle || handle._larkResize) return;
    handle._larkResize = true;
    const minW = 280;
    const minH = 220;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button != null && event.button !== 0) return;
      const rect = pad.getBoundingClientRect();
      scratchResize = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        w: rect.width,
        h: rect.height,
        left: rect.left,
        top: rect.top
      };
      pad.classList.add("resizing");
      pad.style.left = rect.left + "px";
      pad.style.top = rect.top + "px";
      pad.style.right = "auto";
      pad.style.bottom = "auto";
      pad.style.width = rect.width + "px";
      pad.style.height = rect.height + "px";
      try { handle.setPointerCapture(event.pointerId); } catch (e) {}
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!scratchResize || scratchResize.id !== event.pointerId) return;
      const maxW = Math.max(minW, window.innerWidth - scratchResize.left - 8);
      const maxH = Math.max(minH, window.innerHeight - scratchResize.top - 8);
      const w = Math.min(maxW, Math.max(minW, scratchResize.w + (event.clientX - scratchResize.startX)));
      const h = Math.min(maxH, Math.max(minH, scratchResize.h + (event.clientY - scratchResize.startY)));
      pad.style.width = w + "px";
      pad.style.height = h + "px";
      if (cmScratch) cmScratch.refresh();
    });
    const endResize = (event) => {
      if (!scratchResize || (event && scratchResize.id !== event.pointerId)) return;
      scratchResize = null;
      pad.classList.remove("resizing");
      saveScratchPos();
      if (cmScratch) setTimeout(() => cmScratch.refresh(), 20);
    };
    handle.addEventListener("pointerup", endResize);
    handle.addEventListener("pointercancel", endResize);
  }

  function openScratch() {
    const pad = $("scratch-pad");
    if (!pad) return;
    loadScratchDeck();
    pad.hidden = false;
    document.body.classList.add("scratch-open");
    restoreScratchPos();
    bindScratchDrag();
    bindScratchResize();
    renderScratchDeck();
    const editor = ensureScratchEditor();
    if (editor) {
      applyEditorPrefs(state.settings || {}, false);
      if (cmScratch) {
        cmScratch.setOption("lineNumbers", !(state.settings && state.settings.lineNumbers === false));
        const item = activeScratchItem();
        if (item && cmScratch.getValue() !== (item.source || "")) {
          scratchSwitching = true;
          cmScratch.setValue(item.source || "");
          scratchSwitching = false;
        }
        setTimeout(() => { cmScratch.refresh(); cmScratch.focus(); }, 40);
      }
    }
  }

  function closeScratch() {
    syncEditorIntoActiveScratch();
    closeScratchMenu();
    stopScratch().catch(() => {});
    const pad = $("scratch-pad");
    if (pad) pad.hidden = true;
    document.body.classList.remove("scratch-open");
  }

  function toggleScratch() {
    if (scratchOpen()) closeScratch();
    else openScratch();
  }

  function copyScratchAll() {
    const editor = ensureScratchEditor();
    if (!editor) return;
    const text = editor.getValue();
    const item = activeScratchItem();
    const label = item ? item.name : "Scratch";
    const done = () => toast(text.trim() ? ("“" + label + "” copied.") : "Scratch is empty.");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        editor.execCommand("selectAll");
        document.execCommand("copy");
        done();
      });
    } else {
      editor.execCommand("selectAll");
      document.execCommand("copy");
      done();
    }
  }

  function clearScratch() {
    const editor = ensureScratchEditor();
    if (!editor) return;
    editor.setValue("");
    syncEditorIntoActiveScratch();
    editor.focus();
    closeScratchMenu();
    toast("Cleared “" + (activeScratchItem() && activeScratchItem().name) + "”.");
  }

  async function scratchMenuAction(act) {
    if (act === "new") return newScratch();
    if (act === "rename") return renameScratch();
    if (act === "duplicate") return duplicateScratch();
    if (act === "promote") return promoteScratch();
    if (act === "clear") return clearScratch();
    if (act === "delete") return deleteScratch();
  }

  function closeExtras() {
    const panel = $("extras-panel");
    if (panel) panel.hidden = true;
    if ($("extras-uml")) $("extras-uml").hidden = true;
    if ($("extras-assign")) $("extras-assign").hidden = true;
  }

  function syncActiveIntoFiles() {
    if (!cm || !state.active) return;
    const file = fileByPath(state.active);
    if (file) file.content = cm.getValue();
  }

  function copyText(text, okMsg) {
    const done = () => toast(okMsg || "Copied.");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      });
    } else {
      toast("Clipboard unavailable.");
    }
  }

  function refreshUml() {
    const canvas = $("uml-canvas");
    if (!canvas || !window.LarkExtras) return;
    syncActiveIntoFiles();
    const result = window.LarkExtras.buildUml(state.files || []);
    canvas._plantuml = result.plantuml || "";
    canvas._svg = result.svg || "";
    if (result.empty) {
      canvas.innerHTML = "<p class=\"uml-empty\">No classes found yet. Open a project with <code>.java</code> files, then Refresh.</p>";
      return;
    }
    canvas.innerHTML = result.svg;
  }

  function openExtras(kind) {
    const panel = $("extras-panel");
    if (!panel) return;
    panel.hidden = false;
    if ($("extras-uml")) $("extras-uml").hidden = kind !== "uml";
    if ($("extras-assign")) $("extras-assign").hidden = kind !== "assign";
    if ($("extras-title")) {
      $("extras-title").textContent = kind === "uml" ? "UML class diagram" : "Assignment helper";
    }
    if (kind === "uml") refreshUml();
    if (kind === "assign" && $("assign-input")) {
      setTimeout(() => $("assign-input").focus(), 40);
    }
  }

  function runAssignAnalyze() {
    const out = $("assign-out");
    if (!out || !window.LarkExtras) return;
    const text = ($("assign-input") && $("assign-input").value) || "";
    const result = window.LarkExtras.analyzeAssignment(text);
    if (result.error) {
      assignSketch = "";
      out.innerHTML = "<p class=\"muted\">" + result.error + "</p>";
      return;
    }
    assignSketch = result.sketch || "";
    out.innerHTML = (result.summaryHtml || "")
      + "<h4>Starter sketch</h4><pre>" + String(assignSketch)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</pre>";
  }

  function bindExtras() {
    if ($("menu-extras")) {
      $("menu-extras").addEventListener("click", (event) => {
        const btn = event.target.closest("[data-extra]");
        const kind = btn && btn.dataset.extra;
        if (!kind) return;
        closePopovers();
        openExtras(kind);
      });
    }
    if ($("extras-close")) $("extras-close").addEventListener("click", () => closeExtras());
    if ($("extras-panel")) {
      $("extras-panel").addEventListener("click", (event) => {
        if (event.target === $("extras-panel")) closeExtras();
      });
    }
    if ($("uml-refresh")) $("uml-refresh").addEventListener("click", () => refreshUml());
    if ($("uml-copy")) {
      $("uml-copy").addEventListener("click", () => {
        const canvas = $("uml-canvas");
        const text = (canvas && canvas._plantuml) || "";
        if (!text) return toast("Nothing to copy — generate a diagram first.");
        copyText(text, "PlantUML copied.");
      });
    }
    if ($("uml-svg")) {
      $("uml-svg").addEventListener("click", () => {
        const canvas = $("uml-canvas");
        const text = (canvas && canvas._svg) || "";
        if (!text) return toast("Nothing to copy — generate a diagram first.");
        copyText(text, "SVG copied.");
      });
    }
    if ($("assign-analyze")) $("assign-analyze").addEventListener("click", () => runAssignAnalyze());
    if ($("assign-copy")) {
      $("assign-copy").addEventListener("click", () => {
        if (!assignSketch) return toast("Summarize the assignment first.");
        copyText(assignSketch, "Class sketch copied.");
      });
    }
    if ($("assign-insert")) {
      $("assign-insert").addEventListener("click", () => {
        if (!assignSketch) return toast("Summarize the assignment first.");
        if (!state.project || !state.active) {
          toast("Open a project file first, then insert.");
          return;
        }
        insertAtCursor(assignSketch);
        closeExtras();
        toast("Sketch inserted.");
      });
    }
  }

  /**
   * Turn pad text into a runnable compilation unit.
   * Statements → wrapped in ScratchPad.main; imports kept at top.
   * Full classes with main are left alone so advanced scratch still works.
   */
  function wrapScratchSource(raw) {
    const text = (raw || "").replace(/\r\n/g, "\n");
    if (!text.trim()) throw new Error("Scratch pad is empty.");
    const hasMain = /\b(?:public\s+)?static\s+void\s+main\s*\(\s*String\s*/.test(text);
    const classMatch = text.match(/\bpublic\s+class\s+(\w+)/) || text.match(/\bclass\s+(\w+)/);
    if (hasMain && classMatch) {
      return { source: text, mainClass: classMatch[1] };
    }
    const imports = [];
    const rest = [];
    text.split("\n").forEach((line) => {
      if (/^\s*import\s+[\w.*]+\s*;\s*$/.test(line)) imports.push(line.trim());
      else if (/^\s*package\s+/.test(line)) { /* default package */ }
      else rest.push(line);
    });
    const body = rest.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    let source = imports.length ? imports.join("\n") + "\n\n" : "";
    if (hasMain && !classMatch) {
      source += "public class ScratchPad {\n";
      body.split("\n").forEach((l) => { source += (l ? "  " + l : "") + "\n"; });
      source += "}\n";
      return { source: source, mainClass: "ScratchPad" };
    }
    source += "public class ScratchPad {\n";
    source += "  public static void main(String[] args) {\n";
    if (body) body.split("\n").forEach((l) => { source += "    " + l + "\n"; });
    else source += "    // Write some Java here\n";
    source += "  }\n}\n";
    return { source: source, mainClass: "ScratchPad" };
  }

  function renderScratchOut(text) {
    const pre = $("scratch-out");
    if (!pre) return;
    const stick = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
    if (!text) {
      pre.textContent = "Run this scratch — output stays here.";
      return;
    }
    pre.textContent = text;
    if (stick) pre.scrollTop = pre.scrollHeight;
  }

  function setScratchRunning(running, acceptsInput) {
    const btn = $("scratch-run");
    if (btn) btn.textContent = running ? "Stop" : "Run";
    const reply = $("scratch-reply");
    if (!reply) return;
    const show = !!(running && acceptsInput);
    reply.hidden = !show;
    if (show) {
      const input = $("scratch-input");
      if (input) setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 40);
    }
  }

  async function sendScratchInput() {
    if (!state.scratchJob || state.scratchJob.done) return toast("Run this scratch first.");
    const input = $("scratch-input");
    if (!input) return;
    const text = input.value;
    input.value = "";
    try {
      await api("POST", "/api/run/" + state.scratchJob.id + "/input", { text: text });
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    } catch (err) {
      toast(err.message);
    }
  }

  async function pollScratch(id) {
    try {
      const job = await api("GET", "/api/run/" + id);
      state.scratchJob = job;
      renderScratchOut(job.output || "");
      if (job.done) {
        setScratchRunning(false, false);
        state.scratchPoll = null;
        return;
      }
      setScratchRunning(true, job.acceptsInput !== false && job.phase === "run");
      state.scratchPoll = setTimeout(() => pollScratch(id), 200);
    } catch (err) {
      setScratchRunning(false, false);
      state.scratchPoll = null;
      toast(err.message);
    }
  }

  async function stopScratch() {
    if (state.scratchPoll) {
      clearTimeout(state.scratchPoll);
      state.scratchPoll = null;
    }
    if (state.scratchJob && !state.scratchJob.done) {
      try {
        await api("POST", "/api/run/" + state.scratchJob.id + "/stop", {});
      } catch (err) {
        /* best-effort */
      }
    }
    setScratchRunning(false, false);
  }

  async function runScratch() {
    const editor = ensureScratchEditor();
    if (!editor) return;
    if (state.scratchJob && !state.scratchJob.done) {
      await stopScratch();
      return;
    }
    let wrapped;
    try {
      wrapped = wrapScratchSource(editor.getValue());
    } catch (err) {
      toast(err.message || "Scratch pad is empty.");
      return;
    }
    if (state.scratchPoll) {
      clearTimeout(state.scratchPoll);
      state.scratchPoll = null;
    }
    setScratchRunning(true, false);
    renderScratchOut("— Scratch —\n");
    try {
      const data = await api("POST", "/api/scratch/run", {
        source: wrapped.source,
        mainClass: wrapped.mainClass,
        args: ($("args") && $("args").value) || "",
        stdin: ""
      });
      state.scratchJob = { id: data.id, done: false };
      pollScratch(data.id);
    } catch (err) {
      setScratchRunning(false, false);
      toast(err.message);
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
    const trayOutlines = next.trayOutlines !== false;
    const autoSave = next.autoSave !== false;
    const formatOnSave = !!next.formatOnSave;

    state.settings.fontFamily = family;
    state.settings.ligatures = ligatures;
    state.settings.indentSize = indentSize;
    state.settings.indentWithTabs = indentWithTabs;
    state.settings.lineWrapping = lineWrapping;
    state.settings.lineNumbers = lineNumbers;
    state.settings.trayOutlines = trayOutlines;
    state.settings.autoSave = autoSave;
    state.settings.autoSaveDelayMs = delay;
    state.settings.formatOnSave = formatOnSave;
    state.settings.minimapEnabled = !!next.minimapEnabled;
    state.settings.minimapWidth = [64, 96, 128].includes(Number(next.minimapWidth)) ? Number(next.minimapWidth) : 96;
    state.settings.minimapSide = next.minimapSide === "left" ? "left" : "right";
    state.settings.minimapSyntax = next.minimapSyntax !== false;
    state.settings.minimapMarkers = next.minimapMarkers !== false;
    $("setting-minimap").checked = state.settings.minimapEnabled;
    $("setting-minimap-width").value = state.settings.minimapWidth;
    $("setting-minimap-side").value = state.settings.minimapSide;
    $("setting-minimap-syntax").checked = state.settings.minimapSyntax;
    $("setting-minimap-markers").checked = state.settings.minimapMarkers;
    for (const ed of [cm, cmB]) if (ed && ed._larkMinimap) ed._larkMinimap.configure(minimapOptions());

    document.documentElement.dataset.font = family;
    document.documentElement.style.setProperty("--mono", FONT_STACKS[family]);
    document.documentElement.style.setProperty("--font", FONT_STACKS[family]);
    document.body.classList.toggle("no-ligatures", !ligatures);
    document.body.classList.toggle("tray-outlines", trayOutlines);

    if ($("setting-font-family")) $("setting-font-family").value = family;
    if ($("setting-ligatures")) $("setting-ligatures").checked = ligatures;
    if ($("setting-indent-size")) $("setting-indent-size").value = String(indentSize);
    if ($("setting-indent-tabs")) $("setting-indent-tabs").checked = indentWithTabs;
    if ($("setting-line-wrap")) $("setting-line-wrap").checked = lineWrapping;
    if ($("setting-line-numbers")) $("setting-line-numbers").checked = lineNumbers;
    if ($("setting-tray-outlines")) $("setting-tray-outlines").checked = trayOutlines;
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
    if (cmScratch) {
      cmScratch.setOption("indentUnit", indentSize);
      cmScratch.setOption("tabSize", indentSize);
      cmScratch.setOption("indentWithTabs", indentWithTabs);
      cmScratch.setOption("lineNumbers", lineNumbers);
    }
    refreshAllEditors();
    if (cmScratch) cmScratch.refresh();

    if (save) {
      api("PUT", "/api/settings", {
        fontFamily: family,
        ligatures: ligatures,
        indentSize: indentSize,
        indentWithTabs: indentWithTabs,
        lineWrapping: lineWrapping,
        lineNumbers: lineNumbers,
        minimapEnabled: state.settings.minimapEnabled,
        minimapWidth: state.settings.minimapWidth,
        minimapSide: state.settings.minimapSide,
        minimapSyntax: state.settings.minimapSyntax,
        minimapMarkers: state.settings.minimapMarkers,
        trayOutlines: trayOutlines,
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
    document.documentElement.style.setProperty("--outline-h", "180px");
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
    // text/x-java is remapped to the Lua tokenizer (lark-java) when Fengari loads.
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
      autoCloseBrackets: { pairs: "()[]{}''\"\"", explode: "" },
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
      const wasDirty = state.dirty.has(path);
      state.dirty.add(path);
      if (!wasDirty) renderTabs();
      clearMarks();
      scheduleSave(path);
      scheduleEditorAnalysis();
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

  function enterBetweenBrackets(editor) {
    if (editor.getOption("readOnly") || editor.getOption("disableInput")) return CodeMirror.Pass;
    const selections = editor.listSelections();
    const primary = editor.getCursor();
    const primaryIndex = Math.max(0, selections.findIndex(({ head }) =>
      head.line === primary.line && head.ch === primary.ch));
    const pairs = { "{": "}", "[": "]", "(": ")" };
    const increment = editor.getOption("indentWithTabs")
      ? "\t" : " ".repeat(editor.getOption("indentUnit"));
    const newline = editor.lineSeparator() || "\n";
    const edits = selections.map(selection => {
      if (!selection.empty()) return null;
      const cursor = selection.head;
      const line = editor.getLine(cursor.line);
      const left = line.slice(0, cursor.ch).match(/([{\[(])[ \t]*$/);
      const right = line.slice(cursor.ch).match(/^[ \t]*([}\])])/);
      if (!left || !right || pairs[left[1]] !== right[1]) return null;
      const type = editor.getTokenTypeAt(CodeMirror.Pos(cursor.line, left.index + 1)) || "";
      if (/\b(string|comment)\b/.test(type)) return null;
      const base = line.match(/^[ \t]*/)[0];
      const inner = base + increment;
      return {
        from: CodeMirror.Pos(cursor.line, left.index + 1),
        to: CodeMirror.Pos(cursor.line, cursor.ch + right[0].length - 1),
        text: newline + inner + newline + base,
        inner
      };
    });
    if (edits.some(edit => !edit)) return CodeMirror.Pass;
    editor.operation(() => {
      editor.setSelections(edits.map(edit => ({ anchor: edit.from, head: edit.to })), primaryIndex);
      editor.replaceSelections(edits.map(edit => edit.text), "end", "+input");
      editor.setSelections(editor.listSelections().map((selection, index) => {
        const position = CodeMirror.Pos(selection.head.line - 1, edits[index].inner.length);
        return { anchor: position, head: position };
      }), primaryIndex);
      editor.scrollIntoView(null, 40);
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
        return enterBetweenBrackets(editor);
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
    wireAssistDrop(editor);
    editor._larkMinimap = new window.LarkMinimap(editor, minimapOptions());
  }

  function minimapOptions() {
    const s = state.settings || {};
    return { enabled: !!s.minimapEnabled, width: s.minimapWidth || 96, side: s.minimapSide || "right", syntax: s.minimapSyntax !== false, markers: s.minimapMarkers !== false };
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
      const source = fileByPath(file);
      const pkg = source && file.endsWith(".java") ? parsedFile(source).pkg : "";
      // jdb needs the qualified class name; a source path loses its package.
      const target = pkg ? pkg + "." + file.split("/").pop().replace(/\.java$/, "") : file;
      set.forEach((line) => out.push({ file: target, line: line }));
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
    scheduleRecovery();
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
    const label = $("project-pick-label");
    if (label) {
      label.textContent = state.project
        ? state.project.name
        : (state.projects.length ? "Choose project" : "No project");
    }
    const btn = $("project");
    if (btn && state.project) btn.title = "Switch project — " + state.project.name;
    if (projectOverlayOpen()) renderProjectGrid();
  }

  function projectOverlayOpen() {
    const panel = $("project-overlay");
    return !!(panel && !panel.hidden);
  }

  function projectFolderSvg() {
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.18 1.26 5.84 1 5.45 1H1.75Z"/></svg>';
  }

  function makeProjectTile(project) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "project-tile";
    btn.dataset.projectId = project.id;
    const active = state.project && state.project.id === project.id;
    if (active) btn.classList.add("active");
    const preview = document.createElement("span");
    preview.className = "project-tile-preview";
    const snippet = (project.preview || "").trim();
    if (snippet) {
      preview.classList.add("code");
      preview.textContent = snippet;
    } else {
      preview.classList.add("empty");
      preview.innerHTML = projectFolderSvg();
    }
    const name = document.createElement("span");
    name.className = "project-tile-name";
    name.textContent = project.name;
    const meta = document.createElement("span");
    meta.className = "project-tile-meta";
    meta.textContent = active ? "Open now" : "Click to open";
    btn.append(preview, name, meta);
    btn.addEventListener("click", async () => {
      try {
        if (!state.project || state.project.id !== project.id) {
          await openProject(project.id);
        }
        closeProjectOverlay();
      } catch (err) {
        toast(err.message);
      }
    });
    return btn;
  }

  function renderProjectGrid() {
    const grid = $("project-grid");
    if (!grid) return;
    grid.replaceChildren();
    if (!state.projects.length) {
      const empty = document.createElement("p");
      empty.className = "project-grid-empty path-note";
      empty.textContent = "No projects yet. Create one with New, or open a folder.";
      grid.appendChild(empty);
      return;
    }
    const sorted = state.projects.slice().sort((a, b) => {
      const aOn = state.project && state.project.id === a.id;
      const bOn = state.project && state.project.id === b.id;
      if (aOn !== bOn) return aOn ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    sorted.forEach((project) => grid.appendChild(makeProjectTile(project)));
  }

  function openProjectOverlay() {
    const panel = $("project-overlay");
    if (!panel) return;
    closePopovers();
    closeThemeOverlay();
    renderProjectGrid();
    panel.hidden = false;
    const btn = $("project");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }

  function closeProjectOverlay() {
    const panel = $("project-overlay");
    if (panel) panel.hidden = true;
    const btn = $("project");
    if (btn) btn.setAttribute("aria-expanded", "false");
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

  function folderIconSvg(open) {
    // 16×16 folder glyphs — closed vs open.
    if (open) {
      return '<svg class="tree-svg" viewBox="0 0 16 16" aria-hidden="true">'
        + '<path fill="currentColor" d="M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H13a1 1 0 0 1 1 1v.5H.75a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 1 .73.93l-1.5 6.5a1.75 1.75 0 0 1-1.7 1.32H2.75A1.75 1.75 0 0 1 1 11.25V2.75c0-.48.198-.93.513-1.237Z"/>'
        + "</svg>";
    }
    return '<svg class="tree-svg" viewBox="0 0 16 16" aria-hidden="true">'
      + '<path fill="currentColor" d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.18 1.26 5.84 1 5.45 1H1.75Z"/>'
      + "</svg>";
  }

  /**
   * Classic Java logo (coffee cup + steam) — Oracle brand colors
   * #5382A1 blue / #E76F00 orange, same mark used as the Java file icon.
   */
  function javaIconSvg() {
    return '<svg class="tree-svg java-logo" viewBox="0 0 32 32" aria-hidden="true">'
      + '<path fill="#5382a1" d="M12.7 23.56s-1.07.622.761.833a16 16 0 0 0 5.8-.246 10 10 0 0 0 1.539.753c-5.481 2.349-12.405-.136-8.1-1.339m-.674-3.067s-1.2.888.633 1.078a22.6 22.6 0 0 0 7.481-.359 3.3 3.3 0 0 0 1.152.7c-6.627 1.938-14.009.153-9.266-1.421"/>'
      + '<path fill="#e76f00" d="M17.673 15.294a2.05 2.05 0 0 1-.355 2.954s3.429-1.77 1.854-3.987c-1.471-2.067-2.6-3.095 3.508-6.636 0 0-9.586 2.394-5.007 7.669"/>'
      + '<path fill="#5382a1" d="M24.922 25.827s.792.652-.872 1.157c-3.164.958-13.168 1.248-15.948.038-1-.435.874-1.038 1.464-1.164a3.8 3.8 0 0 1 .966-.108c-1.111-.783-7.181 1.537-3.083 2.2 11.176 1.812 20.372-.816 17.473-2.124m-11.711-8.508s-5.089 1.209-1.8 1.648a38 38 0 0 0 6.731-.072 53 53 0 0 0 4.221-.555 9 9 0 0 0-1.28.685c-5.17 1.358-15.153.726-12.283-.665a9.6 9.6 0 0 1 4.407-1.042m9.133 5.104c5.253-2.73 2.824-5.353 1.129-5a4 4 0 0 0-.6.161.96.96 0 0 1 .449-.346c3.354-1.179 5.933 3.478-1.083 5.322a.5.5 0 0 0 .106-.138"/>'
      + '<path fill="#e76f00" d="M19.172 1.906s2.909 2.91-2.759 7.386c-4.546 3.59-1.037 5.637 0 7.975-2.653-2.394-4.6-4.5-3.294-6.463 1.917-2.879 7.229-4.275 6.056-8.9"/>'
      + '<path fill="#5382a1" d="M13.727 29.818c5.042.323 12.786-.179 12.969-2.565 0 0-.353.9-4.167 1.623a41.5 41.5 0 0 1-12.76.2s.645.533 3.959.746"/>'
      + "</svg>";
  }

  /** Document glyph for .md / .txt and other plain text. */
  function textFileIconSvg() {
    return '<svg class="tree-svg" viewBox="0 0 16 16" aria-hidden="true">'
      + '<path fill="currentColor" d="M3.75 1.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V5.31c0-.33-.13-.65-.37-.88L10.07 1.87a1.25 1.25 0 0 0-.88-.37H3.75zm5.5 1.1 2.65 2.65H10a.75.75 0 0 1-.75-.75V2.6z"/>'
      + '<path fill="var(--bg-elev, #fff)" d="M5.25 8.1h5.5a.6.6 0 0 1 0 1.2h-5.5a.6.6 0 0 1 0-1.2zm0 2.35h4.1a.6.6 0 0 1 0 1.2h-4.1a.6.6 0 0 1 0-1.2z"/>'
      + "</svg>";
  }

  function fileIcon(node) {
    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.setAttribute("aria-hidden", "true");
    if (node.dir) {
      const open = !state.collapsed.has(node.path);
      icon.classList.add("folder");
      icon.classList.toggle("open", open);
      const custom = customFolderIcons()[node.path];
      if (custom) {
        icon.classList.add("folder-custom");
        icon.textContent = custom;
      } else {
        icon.innerHTML = folderIconSvg(open);
      }
      return icon;
    }
    const lower = (node.path || "").toLowerCase();
    if (lower.endsWith(".java")) {
      icon.classList.add("java");
      icon.innerHTML = javaIconSvg();
      return icon;
    }
    if (lower.endsWith(".md") || lower.endsWith(".txt")) {
      icon.classList.add("txt");
      icon.innerHTML = textFileIconSvg();
      return icon;
    }
    icon.classList.add("txt");
    icon.innerHTML = textFileIconSvg();
    return icon;
  }

  function renderNode(node, depth) {
    const wrap = document.createElement("div");
    const line = document.createElement("div");
    line.className = "tree-line" + (node.dir ? " folder" : " file");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row" + (node.path === state.active ? " active" : "") + (node.path === state.selected ? " selected" : "") + (node.path.endsWith(".java") ? " java" : "") + (node.dir ? " folder" : " file");
    // Nesting indent lives on .tree-kids (guide gutter) — keep row chrome padding constant.
    row.style.paddingLeft = "10px";
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
      line.classList.add("dragging");
      state.dragPath = node.path;
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      line.classList.remove("dragging");
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
    line.appendChild(row);
    if (node.dir) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "tree-add";
      add.title = "New class or file in " + (node.path || node.name);
      add.setAttribute("aria-label", "Add to " + node.name);
      add.textContent = "+";
      add.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.selected = node.path;
        openFolderAddMenu(add, node.path);
      });
      line.appendChild(add);
    }
    wrap.appendChild(line);
    if (node.dir && !state.collapsed.has(node.path) && node.children && node.children.length) {
      const kids = document.createElement("div");
      kids.className = "tree-kids";
      node.children.forEach((child) => kids.appendChild(renderNode(child, depth + 1)));
      wrap.appendChild(kids);
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
    for (const ed of [cm, cmB]) if (ed && ed._larkMinimap) ed._larkMinimap.cancel();
    renderStructure();
    $("status-path").textContent = state.project ? state.project.name : "Lark";
  }

  function showWelcome() {
    const welcome = $("welcome");
    if (!welcome) return;
    $("empty").hidden = true;
    if ($("editors-row")) $("editors-row").hidden = true;
    $("editor").hidden = true;
    for (const ed of [cm, cmB]) if (ed && ed._larkMinimap) ed._larkMinimap.cancel();
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
      btn.className = "welcome-recent-row";
      const copy = document.createElement("span");
      copy.className = "welcome-recent-copy";
      const name = document.createElement("strong");
      name.textContent = project.name;
      const meta = document.createElement("span");
      meta.textContent = project.mainClass ? "Main: " + project.mainClass : "Java project";
      copy.append(name, meta);
      const arrow = document.createElement("span");
      arrow.className = "welcome-recent-arrow";
      arrow.textContent = "→";
      btn.append(copy, arrow);
      btn.addEventListener("click", () => openProject(project.id).catch((err) => toast(err.message)));
      box.appendChild(btn);
    });
  }

  function folderIconStorageKey() {
    return "lark-folder-icons:" + (state.project && state.project.id ? state.project.id : "none");
  }

  function customFolderIcons() {
    try { return JSON.parse(localStorage.getItem(folderIconStorageKey()) || "{}"); }
    catch (e) { return {}; }
  }

  async function chooseFolderIcon(path) {
    const icons = customFolderIcons();
    const values = await formDialog({
      title: "Folder icon",
      ok: "Apply icon",
      note: "Give important folders a recognizable icon. This preference stays with this project on your device.",
      fields: [{
        name: "icon", label: "Icon", type: "select", value: icons[path] || "",
        options: [
          ["", "Default folder"], ["★", "Favorite"], ["☕", "Java package"],
          ["◆", "Source"], ["✓", "Tests"], ["◈", "Resources"],
          ["≡", "Documentation"], ["⚙", "Configuration"]
        ]
      }]
    });
    if (!values) return;
    if (values.icon) icons[path] = values.icon;
    else delete icons[path];
    try { localStorage.setItem(folderIconStorageKey(), JSON.stringify(icons)); } catch (e) {}
    renderTree();
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
      autoCloseBrackets: { pairs: "()[]{}''\"\"", explode: "" },
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

  let editorAnalysisTimer;
  function scheduleEditorAnalysis() {
    clearTimeout(editorAnalysisTimer);
    const project = state.project;
    const path = state.active;
    editorAnalysisTimer = setTimeout(() => {
      if (state.project !== project || state.active !== path) return;
      renderStructure();
      refreshLocalProblems();
      renderProblems();
      markErrors();
    }, 250);
  }

  function scheduleCompileCheck() {
    ++state.checkSeq;
    if (state.checkTimer) clearTimeout(state.checkTimer);
    state.checkTimer = setTimeout(() => {
      state.checkTimer = null;
      runCompileCheck().catch(() => {});
    }, 1100);
  }

  async function runCompileCheck() {
    if (!state.project) return;
    const project = state.project.id;
    const seq = ++state.checkSeq;
    await flushSaves();
    if (seq !== state.checkSeq || !state.project || state.project.id !== project) return;
    try {
      const data = await api("POST", "/api/check", { project });
      if (seq !== state.checkSeq || !state.project || state.project.id !== project) return;
      state.compileProblems = data.problems || [];
      state.markProblems = state.compileProblems;
      // A newer compile supersedes errors from the last Run.
      state.problems = (state.problems || []).filter((p) => p.severity !== "error" && p.severity !== "warning");
      renderProblems();
      markErrors();
      const errCount = state.compileProblems.filter((p) => p.severity === "error").length;
      if ($("status-check")) {
        $("status-check").textContent = data.clean ? "Compiles" : (errCount ? errCount + " error" + (errCount === 1 ? "" : "s") : "Warnings");
        $("status-check").dataset.state = data.clean ? "ok" : (errCount ? "err" : "warn");
      }
    } catch (err) {
      if (seq !== state.checkSeq || !state.project || state.project.id !== project) return;
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
    const methodName = values.name.trim();
    if (!/^[A-Za-z_][\w$]*$/.test(methodName) || (window.LarkJava.keywords || []).includes(methodName)) {
      return toast("Pick a valid Java method name.");
    }
    const indent = " ".repeat((state.settings && state.settings.indentSize) || 4);
    const plan = window.LarkJava.extractMethod(editor.getValue(), selected, methodName, indent);
    if (!plan) return toast("Couldn't extract that selection. Select complete statements inside a method.");
    // Replace selection with the call first, then insert the new method before the class's closing brace
    // (appending at EOF used to land outside the class — the classic "couldn't find position" failure).
    suppress = true;
    editor.replaceSelection(plan.call);
    const text = editor.getValue();
    const closeAt = window.LarkJava.classCloseIndex(text);
    if (closeAt < 0) {
      suppress = false;
      return toast("Couldn't find the class closing brace to insert the new method.");
    }
    const before = text.slice(0, closeAt);
    const insert = (before.endsWith("\n") ? "" : "\n") + plan.method + (plan.method.endsWith("\n") ? "" : "\n");
    editor.replaceRange(insert, editor.posFromIndex(closeAt), editor.posFromIndex(closeAt));
    suppress = false;
    const file = fileByPath(path);
    if (file) file.content = editor.getValue();
    state.dirty.add(path);
    afterEdit();
    toast(plan.note || ("Extracted " + methodName + "()."));
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
    let ratio = 50;
    try { ratio = Math.max(10, Math.min(90, Number(localStorage.getItem("lark-split-ratio")) || 50)); } catch (e) {}
    applySplitRatio(ratio);
  }

  function applySplitRatio(ratio) {
    const colA = $("editor-col-a");
    const colB = $("editor-col-b");
    if (colA) {
      colA.style.flex = "1 1 " + ratio + "%";
      colA.style.width = "";
      colA.style.maxWidth = "";
    }
    if (colB) {
      colB.style.flex = "1 1 " + (100 - ratio) + "%";
      colB.style.width = "";
      colB.style.maxWidth = "";
    }
    const bar = $("editor-split-bar");
    if (bar) bar.setAttribute("aria-valuenow", String(Math.round(ratio)));
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
      if (cmB && cmB._larkMinimap) cmB._larkMinimap.cancel();
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
    bar.tabIndex = 0;
    bar.setAttribute("role", "separator");
    bar.setAttribute("aria-label", "Resize editors");
    bar.setAttribute("aria-orientation", "vertical");
    bar.setAttribute("aria-valuemin", "10");
    bar.setAttribute("aria-valuemax", "90");
    bar.addEventListener("keydown", event => {
      if (!state.split || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const total = colA.clientWidth + colB.clientWidth;
      const step = (event.shiftKey ? 10 : 2) * (event.key === "ArrowLeft" ? -1 : 1);
      const ratio = Math.max(10, Math.min(90, colA.clientWidth / total * 100 + step));
      applySplitRatio(ratio);
      try { localStorage.setItem("lark-split-ratio", String(ratio)); } catch (e) {}
      refreshAllEditors();
    });
    const CLOSE_PX = 72;
    bar.addEventListener("pointerdown", (event) => {
      if (!state.split) return;
      event.preventDefault();
      bar.setPointerCapture(event.pointerId);
      document.body.classList.add("dragging", "dragging-split");
      const pointerId = event.pointerId;
      const rowRect = () => row.getBoundingClientRect();
      let raf = 0;
      let latest = null;
      const apply = () => {
        raf = 0;
        if (!latest) return;
        const rect = rowRect();
        const x = Math.min(rect.right - 4, Math.max(rect.left + 4, latest.clientX));
        let left = Math.min(rect.width - 6, Math.max(0, x - rect.left));
        const right = Math.max(0, rect.width - left - 6);
        colA.style.flex = "0 0 auto";
        colB.style.flex = "0 0 auto";
        colA.style.width = left + "px";
        colB.style.width = right + "px";
      };
      const move = (ev) => {
        if (ev.pointerId !== pointerId) return;
        latest = ev;
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const up = (ev) => {
        if (ev && ev.pointerId !== pointerId) return;
        if (raf) cancelAnimationFrame(raf);
        if (latest) apply();
        try { bar.releasePointerCapture(pointerId); } catch (e) {}
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", up);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        document.body.classList.remove("dragging", "dragging-split");
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
        // Keep the chosen proportion through window resizing and reopening a split.
        const total = Math.max(1, aW + bW);
        const ratio = aW / total * 100;
        applySplitRatio(ratio);
        try { localStorage.setItem("lark-split-ratio", String(ratio)); } catch (e) {}
        refreshAllEditors();
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
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
    state.markProblems = [];
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

  /**
   * Assist Blocks — drag titles into the editor.
   * The placement controller renders ghost code without modifying the document.
   * Both statement and member snippets follow the pointer at structural line boundaries.
   */
  const ASSIST_BLOCK_GROUPS = [
    {
      label: "Inside a method",
      ids: ["sout", "scanner", "fori", "foreach", "while", "ife", "try", "switch", "arr", "list", "map"]
    },
    {
      label: "Arrays & homework",
      ids: ["matrix", "arrfill", "arrstats", "linsearch", "countocc", "matfill", "arrcopy", "arrrev", "splitloop"]
    },
    {
      label: "Menus & files",
      ids: ["menu", "sentinel", "fileio"]
    },
    {
      label: "Class members",
      ids: ["main"]
    }
  ];

  const ASSIST_MEMBER_IDS = { main: true };
  const ASSIST_IMPORTS = {
    scanner: ["java.util.Scanner"],
    tryr: ["java.util.Scanner"],
    list: ["java.util.List", "java.util.ArrayList"],
    map: ["java.util.Map", "java.util.HashMap"],
    foreach: ["java.util.List", "java.util.ArrayList"],
    while: ["java.util.Scanner"],
    dowhile: ["java.util.Scanner"],
    menu: ["java.util.Scanner"],
    sentinel: ["java.util.Scanner"],
    arrfill: ["java.util.Scanner"],
    matfill: ["java.util.Scanner"],
    fileio: []
  };

  let assistDragPayload = null;
  let assistDidDrag = false;

  function assistSnippetById(id) {
    const snips = (window.LarkJava && window.LarkJava.snippets) || [];
    return snips.find((s) => s.id === id) || null;
  }

  function assistBlockMeta(id) {
    const snip = assistSnippetById(id);
    if (!snip || !snip.text) return null;
    const member = !!ASSIST_MEMBER_IDS[id];
    return {
      id: snip.id,
      label: snip.label,
      code: snip.text,
      place: member ? "member" : "body",
      where: member ? "Drag to a class member boundary" : "Drag to a statement boundary inside a method",
      imports: ASSIST_IMPORTS[id] || []
    };
  }


  const assistPlacement = window.LarkAssist.controller(() => assistDragPayload, (editor, prepared, meta) => {
    if (window.LarkAssist.commit(editor, prepared, meta)) {
      assistDragPayload = null;
      afterEdit();
      closePopovers();
    }
  }, () => { assistDragPayload = null; document.body.classList.remove("assist-dragging"); });

  function clearAssistDropPreview() { assistPlacement.clear(); }

  function resolveAssistTarget(editor, pointerPos, place) {
    return { line: pointerPos.line, ch: 0, place };
  }

  function insertAssistBlock(editor, target, meta, replace) {
    const prepared = window.LarkAssist.plan(editor, target, meta);
    if (prepared.error) { toast(prepared.error); return false; }
    const changed = window.LarkAssist.commit(editor, prepared, meta, replace);
    if (changed) afterEdit();
    return changed;
  }

  function insertCodeAt(editor, pos, code) {
    if (!editor || !code) return false;
    const target = { line: (pos && pos.line) || 0, ch: 0 };
    return insertAssistBlock(editor, target, { code: code, imports: [] });
  }

  function insertAtCursor(code) {
    const editor = activeCm() || cm;
    if (!editor || !code) return;
    const cur = editor.getCursor();
    insertCodeAt(editor, cur, code);
  }

  function wireAssistDrop(editor) {
    if (!editor || editor._larkAssistDrop) return;
    editor._larkAssistDrop = true;
    assistPlacement.wire(editor);
  }

  function renderAssistBlocks() {
    const host = $("assist-blocks");
    if (!host) return;
    host.replaceChildren();
    if (!window.LarkJava || !window.LarkJava.snippets) {
      const empty = document.createElement("p");
      empty.className = "path-note";
      empty.style.gridColumn = "1 / -1";
      empty.textContent = "Open a Java file to load Assist blocks.";
      host.appendChild(empty);
      return;
    }
    ASSIST_BLOCK_GROUPS.forEach((group) => {
      const label = document.createElement("div");
      label.className = "assist-block-group-label";
      label.textContent = group.label;
      host.appendChild(label);
      group.ids.forEach((id) => {
        const meta = assistBlockMeta(id);
        if (!meta) return;
        const card = document.createElement("div");
        card.className = "assist-block";
        card.draggable = true;
        card.dataset.assistBlock = meta.id;
        card.title = meta.where + " — drag to place";
        const title = document.createElement("button");
        title.type = "button";
        title.title = "Insert at current line, or drag to place";
        title.className = "assist-block-title";
        title.textContent = meta.label;
        const where = document.createElement("span");
        where.className = "assist-block-where";
        where.textContent = meta.place === "member" ? "Class member" : "Statement block";
        const actions = document.createElement("select");
        actions.className = "assist-block-actions";
        actions.setAttribute("aria-label", "Actions for " + meta.label);
        [["", "Actions…"], ["copy", "Copy"], ["replace", "Replace selection"]].forEach(([value, label]) => {
          const option = document.createElement("option"); option.value = value; option.textContent = label; actions.append(option);
        });
        const editor = activeCm();
        const locked = !editor || editor.getOption("readOnly") || editor.getOption("disableInput");
        title.disabled = !!locked;
        card.draggable = !locked;
        actions.options[2].disabled = !!locked || !editor.somethingSelected() || editor.listSelections().length !== 1;
        actions.addEventListener("change", async () => {
          const action = actions.value; actions.value = "";
          if (action === "copy") {
            try { await navigator.clipboard.writeText(meta.code); } catch (err) { toast("Clipboard unavailable: " + err.message); }
          } else if (action === "replace") {
            const ed = activeCm();
            if (!ed || !ed.somethingSelected()) return;
            if (insertAssistBlock(ed, ed.getCursor("from"), meta, true)) closePopovers();
          }
        });
        card.append(title, actions, where);

        card.addEventListener("dragstart", (event) => {
          assistDidDrag = true;
          assistDragPayload = meta;
          document.body.classList.add("assist-dragging");
          card.classList.add("is-dragging");
          try {
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("text/lark-assist", JSON.stringify(meta));
            event.dataTransfer.setData("text/plain", meta.code);
          } catch (e) { /* ignore */ }
        });
        card.addEventListener("dragend", () => {
          card.classList.remove("is-dragging");
          clearAssistDropPreview();
          assistDragPayload = null;
          setTimeout(() => { assistDidDrag = false; }, 0);
        });
        title.addEventListener("click", () => {
          if (assistDidDrag) return;
          const editor = activeCm() || cm;
          if (!editor) return;
          const target = resolveAssistTarget(editor, editor.getCursor(), meta.place);
          clearAssistDropPreview();
          if (!target) return toast("Open a Java class first.");
          if (insertAssistBlock(editor, target, meta)) {
            closePopovers();
            toast("Inserted " + meta.label + ".");
          }
        });
        host.appendChild(card);
      });
    });
  }

  function setAssistTab(name) {
    const menu = $("menu-assist");
    if (!menu) return;
    menu.querySelectorAll(".assist-tab").forEach((tab) => {
      const on = tab.dataset.assistTab === name;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    menu.querySelectorAll(".assist-pane").forEach((pane) => {
      const on = pane.dataset.assistPane === name;
      pane.classList.toggle("is-active", on);
      pane.hidden = !on;
    });
    if (name === "blocks") renderAssistBlocks();
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
    const editor = activeCm() || cm;
    if (!editor || !code) return false;
    const text = editor.getValue();
    // Prefer LarkJava's brace walk that ignores strings/comments — raw `{`/`}`
    // counting used to insert in the wrong place (or look like the fix "couldn't find" its spot).
    let insertPos = -1;
    if (window.LarkJava && typeof window.LarkJava.classCloseIndex === "function") {
      insertPos = window.LarkJava.classCloseIndex(text);
    }
    if (insertPos < 0) {
      let depth = 0;
      let opened = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "{") {
          depth++;
          opened = true;
        } else if (c === "}") {
          depth--;
          if (opened && depth === 0) {
            insertPos = i;
            break;
          }
        }
      }
    }
    if (insertPos < 0) {
      toast("Couldn't find where to insert inside the class. Check for a missing `}`.");
      return false;
    }
    const before = text.slice(0, insertPos);
    const line = editor.posFromIndex(insertPos).line;
    const insert = (before.endsWith("\n") ? "" : "\n") + "\n" + code + (code.endsWith("\n") ? "" : "\n");
    suppress = true;
    editor.replaceRange(insert, editor.posFromIndex(insertPos), editor.posFromIndex(insertPos));
    suppress = false;
    editor.setCursor({ line: line + 2, ch: 0 });
    afterEdit();
    return true;
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
        title: "Assist",
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
      if (!insertBeforeClassClose(code)) return;
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
    const dir = (selectedDir() || "src").replace(/\/+$/, "") || "src";
    const values = await formDialog({
      title: "New file",
      ok: "Create",
      note: "Creates under: " + dir + "/",
      fields: [{ name: "path", label: "Path", value: dir + "/" }]
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
      ["New Class", () => { state.selected = node.dir ? node.path : parentDir(node.path); createClass(); }],
      ["New File", () => { state.selected = node.dir ? node.path : parentDir(node.path); createFile(); }],
      ...(node.dir ? [["Folder icon…", () => chooseFolderIcon(node.path)]] : []),
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

  function openFolderAddMenu(anchor, folderPath) {
    closePopovers();
    const menu = $("context");
    menu.replaceChildren();
    const head = document.createElement("p");
    head.className = "path-note";
    head.style.margin = "4px 8px 6px";
    head.textContent = "New in " + (folderPath || "folder");
    menu.appendChild(head);
    [
      ["New Class", () => { state.selected = folderPath; createClass(); }],
      ["New File", () => { state.selected = folderPath; createFile(); }]
    ].forEach(([label, action]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        menu.hidden = true;
        Promise.resolve(action()).catch((err) => toast(err.message));
      });
      menu.appendChild(btn);
    });
    menu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const width = 168;
    let left = rect.right - 8;
    let top = rect.bottom + 4;
    if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width + 8);
    if (top + 120 > window.innerHeight - 8) top = Math.max(8, rect.top - 120);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.minWidth = width + "px";
  }

  /** Explorer header: one + control → Class / File / Folder. */
  function openTrayNewMenu(anchor) {
    closePopovers();
    const btn = anchor || $("tray-new");
    if (btn) btn.setAttribute("aria-expanded", "true");
    const menu = $("context");
    menu.replaceChildren();
    const head = document.createElement("p");
    head.className = "path-note";
    head.style.margin = "4px 8px 6px";
    head.textContent = "New";
    menu.appendChild(head);
    [
      ["Class", () => createClass()],
      ["File", () => createFile()],
      ["Folder", () => createFolder()]
    ].forEach(([label, action]) => {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = label;
      item.addEventListener("click", () => {
        menu.hidden = true;
        if (btn) btn.setAttribute("aria-expanded", "false");
        Promise.resolve(action()).catch((err) => toast(err.message));
      });
      menu.appendChild(item);
    });
    menu.hidden = false;
    const rect = (btn || { getBoundingClientRect: () => ({ left: 8, right: 36, bottom: 48, top: 20 }) }).getBoundingClientRect();
    const width = 160;
    let left = rect.right - width;
    let top = rect.bottom + 6;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    if (top + 140 > window.innerHeight - 8) top = Math.max(8, rect.top - 140);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.minWidth = width + "px";
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
          el.value = Array.isArray(option) ? option[0] : option;
          el.textContent = Array.isArray(option) ? option[1] : option;
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
      if (job.done) {
        const hasErr = state.problems.some((problem) => problem.severity === "error");
        // Successful compile+run means any prior live-check reds are stale.
        if (!hasErr) state.compileProblems = [];
      }
      // Only a finished Run sets the editor marks. While a program is still
      // running, each poll would otherwise repaint its old errors over newer
      // live-check results at stale line numbers.
      if (job.done) {
        state.markProblems = state.problems;
        markErrors();
      }
      renderProblems();
      renderTabs();
      if (job.done) {
        setRunning(false, false);
        const hasErr = state.problems.some((problem) => problem.severity === "error");
        if (hasErr) {
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
      const fixable = window.LarkJava.isQuickFixable
        ? window.LarkJava.isQuickFixable(problem)
        : (problem.code && ["missing-override", "string-eq", "empty-control", "missing-accessors", "missing-getter", "add-import", "add-semicolon", "missing-return", "add-throws", "make-static", "add-cast"].includes(problem.code));
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

  function projectTypesForImports() {
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
    return projectTypes;
  }

  function syncFileContentFromEditor(path) {
    const file = fileByPath(path);
    if (!file) return null;
    const doc = docs.get(path);
    if (doc) file.content = doc.getValue();
    else if (cm && state.active === path) file.content = cm.getValue();
    else if (cmB && state.activeB === path) file.content = cmB.getValue();
    return file;
  }

  async function applyProblemFix(problem) {
    const path = resolveProblemFile(problem.file);
    let file = fileByPath(path);
    if (!file) return toast("File not found for that problem.");
    openPath(path);
    file = syncFileContentFromEditor(path) || file;
    const code = window.LarkJava.inferQuickFixCode
      ? window.LarkJava.inferQuickFixCode(problem)
      : (problem.code || "");

    if (code === "missing-accessors" || code === "missing-getter") {
      const parsed = parsedFile(file);
      const missing = (parsed.accessors || []).filter((info) => {
        const mods = info.field.mods || [];
        if (mods.indexOf("private") < 0) return false;
        if (problem.field && info.field.name !== problem.field) return false;
        if (code === "missing-getter") return !info.hasGetter;
        return !info.hasGetter || !info.hasSetter;
      });
      if (!missing.length) return toast("Couldn't find the field to generate accessors for.");
      const fields = missing.map((info) => info.field);
      const wantGet = true;
      const wantSet = code !== "missing-getter";
      const gen = window.LarkJava.generateGetterSetter(fields, wantGet, wantSet);
      if (!insertBeforeClassClose(gen)) return;
      await saveFile(path);
      refreshLocalProblems();
      renderProblems();
      markErrors();
      renderStructure();
      toast("Added missing " + (wantSet ? "getters/setters" : "getter") + ".");
      return;
    }

    const result = window.LarkJava.applyQuickFix(file.content || "", problem, projectTypesForImports());
    if (!result || result.source == null) {
      return toast("Couldn't apply that quick fix — the code may have moved. Try again after saving.");
    }
    // Accessor sentinel from applyQuickFix (should have been handled above).
    if (result.note === "accessors") {
      return toast("Open Assist → Quick fix to add accessors.");
    }
    const next = result.source;
    if (next === (file.content || "")) {
      return toast("That quick fix didn't change anything.");
    }
    file.content = next;
    parsedCache.delete(path);
    const doc = docs.get(path);
    if (doc) {
      suppress = true;
      doc.setValue(next);
      suppress = false;
    } else if (cm && state.active === path) {
      suppress = true;
      cm.setValue(next);
      suppress = false;
    }
    state.dirty.add(path);
    await saveFile(path);
    refreshLocalProblems();
    renderProblems();
    markErrors();
    renderStructure();
    toast(result.note || "Quick fix applied.");
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
    lineMarks.forEach((mark) => {
      if (mark.text) mark.text.clear();
      // Line handles follow edits; removing by stale line numbers left old reds behind.
      else mark.doc.removeLineClass(mark.handle, "background", mark.cls);
    });
    lineMarks.length = 0;
  }

  function markErrors() {
    clearMarks();
    if (!cm && !cmB) return;
    // Red editor marks come ONLY from javac ERROR diagnostics of the most recent
    // compile (Run or live check, whichever finished last). Warnings and local
    // Assist heuristics stay in the Problems list. The minimap includes compiler warnings.
    const paint = state.markProblems || [];
    for (const [ed, path] of [[cm, state.active], [cmB, state.activeB]]) {
      if (ed && ed._larkMinimap) ed._larkMinimap.setDiagnostics(paint.filter(p => resolveProblemFile(p.file) === path));
    }
    const byLine = new Map();
    paint.forEach((problem) => {
      if (!problem || problem.severity !== "error") return;
      const resolved = resolveProblemFile(problem.file);
      const doc = docs.get(resolved);
      if (!doc) return;
      const line = Number(problem.line) - 1;
      if (!Number.isFinite(line) || line < 0 || line >= doc.lineCount()) return;
      const key = resolved + ":" + line;
      if (!byLine.has(key)) byLine.set(key, { doc: doc, line: line, column: Number(problem.column) || 0 });
    });
    byLine.forEach((hit) => {
      const cls = "cm-problem-line";
      const handle = hit.doc.addLineClass(hit.line, "background", cls);
      lineMarks.push({ doc: hit.doc, handle: handle, cls: cls });
      const text = hit.doc.getLine(hit.line) || "";
      const ch = Math.min(Math.max(0, hit.column - 1), text.length);
      if (hit.column > 0 && ch < text.length) {
        let end = ch + 1;
        while (end < text.length && /[\w$]/.test(text[end]) && /[\w$]/.test(text[ch])) end++;
        const mark = hit.doc.markText({ line: hit.line, ch: ch }, { line: hit.line, ch: end }, { className: "cm-problem-mark" });
        lineMarks.push({ doc: hit.doc, text: mark });
      }
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
    assistDragPayload = null;
    document.body.classList.remove("assist-dragging");
    document.querySelectorAll(".popover").forEach((el) => { el.hidden = true; });
    document.querySelectorAll("[data-pop]").forEach(el => el.setAttribute("aria-expanded", "false"));
    $("context").hidden = true;
    if ($("tray-new")) $("tray-new").setAttribute("aria-expanded", "false");
    clearAssistDropPreview();
  }

  function togglePopover(button) {
    const pop = $(button.dataset.pop);
    const willOpen = pop.hidden;
    closePopovers();
    if (!willOpen) return;
    if (pop.id === "menu-assist") {
      setAssistTab("blocks");
      renderAssistBlocks();
    }
    pop.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", pop.id);
    placePopover(pop, button);
  }

  function placePopover(pop, button) {
    if (!pop || !button) return;
    const pad = 8;
    const rect = button.getBoundingClientRect();
    // Hybrid panels keep a tighter height so they scroll instead of filling the screen.
    const viewMaxH = window.innerHeight - pad * 2;
    const viewMaxW = window.innerWidth - pad * 2;
    const panelCap = pop.classList.contains("menu-panel")
      ? (pop.classList.contains("menu-panel-assist") ? 680
        : pop.classList.contains("menu-panel-sm") ? 420 : 560)
      : viewMaxH;
    pop.style.maxWidth = viewMaxW + "px";
    pop.style.maxHeight = Math.min(panelCap, viewMaxH) + "px";
    // Measure after show; clamp so controls never leave the viewport.
    const width = Math.min(pop.offsetWidth || 280, viewMaxW);
    const height = Math.min(pop.offsetHeight || 320, Math.min(panelCap, viewMaxH));
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
    const file = syncFileContentFromEditor(state.active) || fileByPath(state.active);
    if (!file) {
      state.localProblems = [];
      return;
    }
    const warnings = parsedFile(file).warnings || [];
    // Keep fix metadata (importName, field, methodName, …) — stripping it made Quick fix fail.
    state.localProblems = warnings.map((item) => Object.assign({}, item, {
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
      const login = state.settings.githubLogin ? ("@" + state.settings.githubLogin) : "Connected";
      $("gh-status").textContent = login;
      $("gh-status").title = state.settings.githubLogin ? ("@" + state.settings.githubLogin) : "";
    }
    renderGithubTarget();
  }

  function renderGithubTarget() {
    const target = $("gh-target");
    if (!target) return;
    if (!githubTarget) {
      target.textContent = "Select a repository to push your current project.";
      return;
    }
    const full = githubTarget.owner + "/" + githubTarget.repo;
    target.textContent = "Pushing to " + full + " (" + (githubTarget.branch || "main") + ").";
    target.title = full;
  }

  function ghSvg(kind) {
    if (kind === "repo") {
      return '<svg class="repo-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v.5c0 .276.224.5.5.5h9.5v-2Zm0-3h-9.5a.5.5 0 0 1-.5-.5V4a1 1 0 0 1 1-1h8.5Z"/></svg>';
    }
    if (kind === "lock") {
      return '<svg class="repo-lock" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 7V5a4 4 0 1 1 8 0v2h1.25c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-10.5C1.56 15 1 14.44 1 13.75v-5.5C1 7.56 1.56 7 2.25 7Zm1.5-2a2.5 2.5 0 0 1 5 0v2h-5Z"/></svg>';
    }
    return "";
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
    const button = $("gh-oauth") || $("gh-signin");
    if (button.disabled) return;
    button.disabled = true;
    const popup = window.open("", "lark-github", "width=540,height=760");
    $("gh-wait").textContent = "GitHub is opening. Authorize Lark there and choose repository access.";
    try {
      const before = await api("GET", "/api/github/status");
      const data = await api("POST", "/api/github/login");
      if (popup) popup.location.href = data.url;
      else {
        const link = document.createElement("a");
        link.href = data.url; link.target = "_blank"; link.rel = "noopener";
        link.textContent = "Open GitHub sign-in";
        $("gh-wait").replaceChildren("The browser blocked the sign-in window. ", link);
      }
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
    } finally {
      button.disabled = false;
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
      empty.textContent = githubRepos.length
        ? "No repository matches that filter."
        : "No repositories yet. Authorize with All repositories, then sign in again.";
      box.appendChild(empty);
      return;
    }
    rows.forEach((repo) => {
      const row = document.createElement("div");
      const selected = githubTarget && githubTarget.owner === repo.owner && githubTarget.repo === repo.name;
      row.className = "repo" + (selected ? " on" : "");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", selected ? "true" : "false");
      row.title = repo.fullName + (repo.private ? " (private)" : "");
      row.insertAdjacentHTML("beforeend", ghSvg("repo"));
      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("div");
      name.className = "name";
      const label = document.createElement("span");
      label.textContent = repo.fullName;
      name.appendChild(label);
      if (repo.private) name.insertAdjacentHTML("beforeend", ghSvg("lock"));
      const detail = document.createElement("div");
      detail.className = "detail";
      if (repo.private) {
        detail.insertAdjacentHTML("beforeend", ghSvg("lock"));
        detail.appendChild(document.createTextNode("Private"));
      } else {
        detail.appendChild(document.createTextNode("Public"));
      }
      detail.appendChild(document.createTextNode(" · " + (repo.defaultBranch || "main")));
      meta.append(name, detail);
      const clone = document.createElement("button");
      clone.type = "button";
      clone.className = "clone";
      clone.textContent = "Clone";
      clone.title = "Clone " + repo.fullName;
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
    if (!Number.isFinite(n)) return fallback;
    // True clamp — never snap back to the default when dragging past an edge.
    return Math.round(Math.min(max, Math.max(min, n)));
  }

  function filesPanelMax() {
    const workspace = $("workspace");
    const width = workspace ? workspace.getBoundingClientRect().width : window.innerWidth;
    return Math.max(280, Math.min(720, Math.floor(width * 0.55)));
  }

  function consolePanelMax(centerH) {
    const h = Number.isFinite(centerH) ? centerH : ($("center") ? $("center").getBoundingClientRect().height : 480);
    return Math.max(160, Math.floor(h - 80));
  }

  function outlinePanelMax(filesH) {
    const h = Number.isFinite(filesH) ? filesH : ($("files") ? $("files").getBoundingClientRect().height : 420);
    // Leave room for the Explorer header + a usable file tree.
    return Math.max(88, Math.floor(h - 140));
  }

  function savePanels() {
    const outlineH = clampPanel(
      getComputedStyle(document.documentElement).getPropertyValue("--outline-h"),
      88, outlinePanelMax(), 180
    );
    if (document.getElementById("shell") && document.getElementById("shell").classList.contains("files-collapsed")) {
      // Keep the last expanded width; collapse is a class, not a stored 0 width.
      const consoleH = clampPanel(
        getComputedStyle(document.documentElement).getPropertyValue("--console-h"),
        72, consolePanelMax(), 188
      );
      let filesW = 260;
      try {
        const prev = JSON.parse(localStorage.getItem("lark-panels") || "null");
        filesW = clampPanel(prev && prev.files, 160, filesPanelMax(), 260);
      } catch (e) {}
      localStorage.setItem("lark-panels", JSON.stringify({
        files: filesW + "px",
        console: consoleH + "px",
        outline: outlineH + "px"
      }));
      return;
    }
    const filesW = clampPanel(
      getComputedStyle(document.documentElement).getPropertyValue("--files-w"),
      160, filesPanelMax(), 260
    );
    const consoleH = clampPanel(
      getComputedStyle(document.documentElement).getPropertyValue("--console-h"),
      72, consolePanelMax(), 188
    );
    localStorage.setItem("lark-panels", JSON.stringify({
      files: filesW + "px",
      console: consoleH + "px",
      outline: outlineH + "px"
    }));
  }

  function restorePanels() {
    const style = document.documentElement.style;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("lark-panels") || "null"); } catch (e) { saved = null; }
    const filesW = clampPanel(saved && saved.files, 160, filesPanelMax(), 260);
    const consoleH = clampPanel(saved && saved.console, 72, consolePanelMax(), 188);
    const outlineH = clampPanel(saved && saved.outline, 88, outlinePanelMax(), 180);
    style.setProperty("--files-w", filesW + "px");
    style.setProperty("--console-h", consoleH + "px");
    style.setProperty("--outline-h", outlineH + "px");
    // Rewrite sanitized values so a prior zoomed session cannot keep poisoning widths.
    localStorage.setItem("lark-panels", JSON.stringify({
      files: filesW + "px",
      console: consoleH + "px",
      outline: outlineH + "px"
    }));
  }

  function bindSplitters() {
    const style = document.documentElement.style;
    restorePanels();

    function drag(handle, kind, onMove) {
      if (!handle) return;
      handle.tabIndex = 0;
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", kind === "col" ? "vertical" : "horizontal");
      handle.setAttribute("aria-label", "Resize " + (handle.dataset.split || "panel"));
      handle.addEventListener("keydown", event => {
        const keys = kind === "col" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const amount = (event.shiftKey ? 40 : 10) * (event.key === keys[0] ? -1 : 1);
        const files = $("files").getBoundingClientRect();
        const start = { x: 0, y: 0, files: files.width, filesH: files.height, console: $("console").getBoundingClientRect().height,
          outline: $("structure").getBoundingClientRect().height, center: $("center").getBoundingClientRect().height };
        onMove({ clientX: amount, clientY: amount }, start);
        savePanels(); refreshAllEditors();
      });
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add(kind === "row" ? "dragging" : "dragging-col");
        handle.classList.add("on");
        const filesBox = $("files") ? $("files").getBoundingClientRect() : { width: 260, height: 420 };
        const start = {
          x: event.clientX,
          y: event.clientY,
          files: clampPanel(filesBox.width, 160, filesPanelMax(), 260),
          filesH: filesBox.height,
          console: clampPanel($("console").getBoundingClientRect().height, 72, consolePanelMax(), 188),
          outline: clampPanel(
            ($("structure") ? $("structure").getBoundingClientRect().height : 180),
            88, outlinePanelMax(filesBox.height), 180
          ),
          center: $("center").getBoundingClientRect().height,
          pointerId: event.pointerId
        };
        let raf = 0;
        let latest = null;
        const apply = () => {
          raf = 0;
          if (!latest) return;
          onMove(latest, start);
        };
        const move = (ev) => {
          if (ev.pointerId !== start.pointerId) return;
          latest = ev;
          if (!raf) raf = requestAnimationFrame(apply);
        };
        const up = (ev) => {
          if (ev && ev.pointerId !== start.pointerId) return;
          if (raf) cancelAnimationFrame(raf);
          if (latest) onMove(latest, start);
          try { handle.releasePointerCapture(start.pointerId); } catch (e) {}
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          document.body.classList.remove("dragging", "dragging-col");
          handle.classList.remove("on");
          savePanels();
          refreshAllEditors();
        };
        // Capture on the handle, plus window listeners so the drag never stalls.
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    }

    const filesSplit = document.querySelector("[data-split=files]");
    drag(filesSplit, "col", (ev, start) => {
      const next = clampPanel(start.files + (ev.clientX - start.x), 160, filesPanelMax(), 260);
      style.setProperty("--files-w", next + "px");
    });
    if (filesSplit) {
      filesSplit.addEventListener("dblclick", () => {
        style.setProperty("--files-w", "260px");
        savePanels();
        refreshAllEditors();
      });
    }

    const consoleSplit = document.querySelector("[data-split=console]");
    drag(consoleSplit, "row", (ev, start) => {
      const max = consolePanelMax(start.center);
      const next = clampPanel(start.console - (ev.clientY - start.y), 72, max, 188);
      style.setProperty("--console-h", next + "px");
    });
    if (consoleSplit) {
      consoleSplit.addEventListener("dblclick", () => {
        style.setProperty("--console-h", "188px");
        savePanels();
        refreshAllEditors();
      });
    }

    const outlineSplit = document.querySelector("[data-split=outline]");
    drag(outlineSplit, "row", (ev, start) => {
      const max = outlinePanelMax(start.filesH);
      // Drag up → taller Outline; drag down → shorter.
      const next = clampPanel(start.outline - (ev.clientY - start.y), 88, max, 180);
      style.setProperty("--outline-h", next + "px");
    });
    if (outlineSplit) {
      outlineSplit.addEventListener("dblclick", () => {
        style.setProperty("--outline-h", "180px");
        savePanels();
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
    await flushSaves();
    const references = window.LarkJava.findUsages(state.files, at.word);
    if (!references.length) return toast("No references found for `" + at.word + "`.");
    const files = Array.from(new Set(references.map((hit) => hit.file)));
    const preview = references.slice(0, 6).map((hit) => hit.file + ":" + hit.line).join(" · ")
      + (references.length > 6 ? " · +" + (references.length - 6) + " more" : "");
    const values = await formDialog({
      title: "Rename `" + at.word + "`",
      ok: "Rename in project",
      note: "Preview: " + references.length + " reference" + (references.length === 1 ? "" : "s")
        + " in " + files.length + " file" + (files.length === 1 ? "" : "s") + ".\n" + preview,
      fields: [{ name: "name", label: "New name", value: at.word }]
    });
    if (!values) return;
    const next = (values.name || "").trim();
    if (!next || next === at.word) return;
    if (!/^[A-Za-z_][\w$]*$/.test(next)) return toast("That isn't a valid Java identifier.");
    if ((window.LarkJava.keywords || []).includes(next)) return toast("Can't rename to a Java keyword.");
    const changes = window.LarkJava.renameAcross(state.files, at.word, next);
    if (!changes.length) return toast("Nothing matched `" + at.word + "` outside strings/comments.");
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
    const name = String(simple).split("$")[0];
    return state.files.find((f) => f.path.endsWith("/" + name + ".java") || f.path === name + ".java") || null;
  }

  /** Resolve a jdb class / file token to a project .java path (package-aware). */
  function findJavaForDebug(classOrFile) {
    let raw = String(classOrFile || "").trim();
    if (!raw) return null;
    raw = raw.replace(/\.java$/i, "");
    // Strip method suffix if present: pkg.Cls.method
    if (raw.includes("(")) raw = raw.slice(0, raw.indexOf("("));
    // Outer class for Outer$Inner
    const noInner = raw.split("$")[0];
    // FQN → path
    if (noInner.includes(".")) {
      const rel = noInner.replace(/\./g, "/") + ".java";
      const byPkg = state.files.find((f) =>
        f.path === rel || f.path.endsWith("/" + rel) || f.path.replace(/\\/g, "/").endsWith(rel));
      if (byPkg) return byPkg;
    }
    const simple = noInner.includes(".") ? noInner.slice(noInner.lastIndexOf(".") + 1) : noInner;
    const byName = findJavaBySimpleName(simple);
    if (byName) return byName;
    // Last resort: parse symbols for a matching type name.
    for (let i = 0; i < state.files.length; i++) {
      const file = state.files[i];
      if (!file.path.endsWith(".java")) continue;
      try {
        const parsed = parsedFile(file);
        if ((parsed.symbols || []).some((s) =>
          s.name === simple && (s.kind === "class" || s.kind === "interface" || s.kind === "enum" || s.kind === "record"))) {
          return file;
        }
      } catch (e) { /* skip */ }
    }
    return null;
  }

  function jumpDebugLocation(className, line) {
    const file = findJavaForDebug(className);
    if (!file) {
      return toast("Couldn't find source for " + (className || "that frame") + ". Open the matching .java file in this project.");
    }
    jumpTo(file.path, line || 1, 1);
  }

  function parseDebugStack(output) {
    const frames = [];
    const text = output || "";
    // jdb: [1] pkg.Cls.method (Cls.java:12)
    const re = /\[(\d+)\]\s+([\w.$]+)\s+\(([^:)]+):(\d+)\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      frames.push({
        depth: m[1],
        method: m[2],
        file: m[3].replace(/\.java$/i, ""),
        fqn: m[2].includes(".") ? m[2].replace(/\.[^.]+$/, "") : m[3].replace(/\.java$/i, ""),
        line: Number(m[4])
      });
      if (frames.length >= 24) break;
    }
    // Breakpoint hit: "thread=main", pkg.Cls.method(), line=12 bci=0
    const br = /,\s*([\w.$]+)\.\w+\(\),\s*line=(\d+)/g;
    while ((m = br.exec(text)) !== null) {
      frames.push({
        depth: "0",
        method: m[1],
        file: m[1].includes(".") ? m[1].slice(m[1].lastIndexOf(".") + 1) : m[1],
        fqn: m[1],
        line: Number(m[2])
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
          btn.addEventListener("click", () => jumpDebugLocation(frame.fqn || frame.file, frame.line));
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
      const empty = document.createElement("p");
      empty.className = "path-note";
      empty.textContent = "No saved configs yet.";
      box.appendChild(empty);
      return;
    }
    configs.forEach((cfg) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const main = cfg.mainClass || "(main)";
      const args = cfg.args ? " · " + cfg.args : "";
      btn.title = (cfg.name || "Run") + " — " + main + args;
      btn.style.flexDirection = "column";
      btn.style.alignItems = "flex-start";
      btn.style.gap = "2px";
      const name = document.createElement("strong");
      name.textContent = cfg.name || "Run";
      const meta = document.createElement("span");
      meta.className = "path-note";
      meta.textContent = main + args;
      btn.appendChild(name);
      btn.appendChild(meta);
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


  function setupToolbarOverflow() {
    const details = $("toolbar-more");
    const overflow = $("toolbar-overflow");
    const breakpoint = window.matchMedia("(max-width: 1280px)");
    const actions = ["project-menu", "github", "java-assist", "extras", "beautify",
      "run-config", "split-editor", "scratch", "theme", "settings", "help"].map(id => {
      const button = $(id);
      const placeholder = document.createComment("toolbar:" + id);
      button.before(placeholder);
      return { button, placeholder };
    });
    function update() {
      const focused = document.activeElement;
      details.open = false;
      closePopovers();
      actions.forEach(({ button, placeholder }) => {
        if (breakpoint.matches) overflow.append(button);
        else placeholder.after(button);
      });
      details.hidden = !breakpoint.matches;
      if (actions.some(({ button }) => button === focused)) {
        (breakpoint.matches ? details.querySelector("summary") : focused).focus();
      }
    }
    document.addEventListener("pointerdown", event => {
      if (!details.contains(event.target) && !event.target.closest(".popover")) details.open = false;
    });
    details.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closePopovers();
      details.open = false;
      details.querySelector("summary").focus();
    });
    overflow.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (button && !button.disabled && !button.hasAttribute("data-pop")) details.open = false;
    });
    breakpoint.addEventListener("change", update);
    update();
  }

  async function exportCodeImage() {
    const editor = activeCm();
    if (!editor || !activePath()) return toast("Open a file first.");
    await document.fonts.ready;
    const wrap = editor.getWrapperElement();
    const style = getComputedStyle(wrap);
    const probe = document.createElement("span");
    wrap.append(probe);
    const colors = new Map();
    const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;"}[c]));
    const lineHeight = Math.ceil(editor.defaultTextHeight());
    const fontSize = parseFloat(style.fontSize);
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = style.font;
    const lineCount = editor.lineCount();
    const path = activePath();
    const fileName = path.split(/[\\/]/).pop();
    const outerPadding = 24;
    const headerHeight = 42;
    const lineNumberFontSize = Math.max(10, Math.round(fontSize * 0.92));
    const digitWidth = measure.measureText("0").width;
    const gutterWidth = Math.ceil(Math.max(44, String(lineCount).length * digitWidth + 30));
    const codeStart = outerPadding + gutterWidth + 16;
    let width = 0;
    const rows = [];
    try {
      for (let line = 0; line < lineCount; line++) {
        let column = 0;
        let plain = "";
        const spans = editor.getLineTokens(line, true).map(token => {
          const text = token.string.replace(/\t|[^\t]/g, ch => {
            if (ch !== "\t") { column++; return ch; }
            const count = editor.getOption("tabSize") - column % editor.getOption("tabSize");
            column += count; return " ".repeat(count);
          });
          plain += text;
          const type = token.type || "";
          if (!colors.has(type)) {
            probe.className = type.split(/\s+/).filter(Boolean).map(t => "cm-" + t).join(" ");
            colors.set(type, getComputedStyle(probe).color);
          }
          return '<tspan fill="' + escape(colors.get(type)) + '">' + escape(text) + '</tspan>';
        }).join("");
        width = Math.max(width, measure.measureText(plain).width);
        const baseline = outerPadding + headerHeight + fontSize + line * lineHeight;
        rows.push('<text class="line-number" x="' + (outerPadding + gutterWidth - 10) + '" y="' + baseline + '">' + (line + 1) + '</text>');
        rows.push('<text x="' + codeStart + '" y="' + baseline + '">' + spans + '</text>');
      }
    } finally { probe.remove(); }
    const imageWidth = Math.ceil(Math.max(width + codeStart + outerPadding, 420));
    const imageHeight = Math.ceil(outerPadding * 2 + headerHeight + lineCount * lineHeight);
    const background = style.backgroundColor;
    const foreground = style.color;
    const divider = getComputedStyle(wrap.querySelector(".CodeMirror-gutters") || wrap).borderRightColor;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + imageWidth + '" height="' + imageHeight + '" viewBox="0 0 ' + imageWidth + ' ' + imageHeight + '">' +
      '<rect width="100%" height="100%" fill="' + escape(background) + '"/>' +
      '<rect x="' + outerPadding + '" y="' + outerPadding + '" width="' + (imageWidth - outerPadding * 2) + '" height="' + (imageHeight - outerPadding * 2) + '" rx="6" fill="' + escape(background) + '" stroke="' + escape(divider) + '"/>' +
      '<path d="M ' + outerPadding + ' ' + (outerPadding + headerHeight) + ' H ' + (imageWidth - outerPadding) + ' M ' + (outerPadding + gutterWidth) + ' ' + (outerPadding + headerHeight) + ' V ' + (imageHeight - outerPadding) + '" stroke="' + escape(divider) + '"/>' +
      '<circle cx="' + (outerPadding + 16) + '" cy="' + (outerPadding + headerHeight / 2) + '" r="5" fill="' + escape(foreground) + '" opacity=".55"/>' +
      '<text x="' + (outerPadding + 30) + '" y="' + (outerPadding + 27) + '" fill="' + escape(foreground) + '" font-family="' + escape(style.fontFamily) + '" font-size="' + Math.max(12, fontSize * .9) + '">' + escape(fileName) + '</text>' +
      '<g xml:space="preserve" font-family="' + escape(style.fontFamily) + '" font-size="' + fontSize + '">' + rows.join("") + '</g>' +
      '<style>.line-number{fill:' + escape(foreground) + ';font-size:' + lineNumberFontSize + 'px;opacity:.58;text-anchor:end}</style></svg>';
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName + ".svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Full-file code image exported as SVG.");
  }

  function setupToolbarResize() {
    const top = $("top");
    const handle = $("top-resize");
    if (!top || !handle) return;
    let saved = 0;
    try { saved = Number(localStorage.getItem("lark-toolbar-height") || 0); } catch (e) {}
    if (saved >= 44 && saved <= 132) top.style.minHeight = saved + "px";
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = top.getBoundingClientRect().height;
      handle.setPointerCapture(event.pointerId);
      const move = (nextEvent) => {
        const height = Math.min(132, Math.max(44, Math.round(startHeight + nextEvent.clientY - startY)));
        top.style.minHeight = height + "px";
      };
      const done = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", done);
        handle.removeEventListener("pointercancel", done);
        try { localStorage.setItem("lark-toolbar-height", String(Math.round(top.getBoundingClientRect().height))); } catch (e) {}
        refreshAllEditors();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", done);
      handle.addEventListener("pointercancel", done);
    });
    handle.addEventListener("dblclick", () => {
      top.style.removeProperty("min-height");
      try { localStorage.removeItem("lark-toolbar-height"); } catch (e) {}
    });
  }

  function bind() {
    $("code-image").addEventListener("click", () => exportCodeImage().catch(err => toast(err.message)));
    setupToolbarOverflow();
    setupToolbarResize();
    $("run").addEventListener("click", () => {
      if ($("run").textContent === "Stop" && state.job && !state.job.done) {
        api("POST", "/api/run/" + state.job.id + "/stop", {}).catch((err) => toast(err.message));
        return;
      }
      // Scratch has its own Run / output pane — keep the main console for project runs.
      run().catch((err) => toast(err.message));
    });
    if ($("scratch")) $("scratch").addEventListener("click", () => toggleScratch());
    if ($("scratch-run")) $("scratch-run").addEventListener("click", () => runScratch().catch((err) => toast(err.message)));
    if ($("scratch-copy")) $("scratch-copy").addEventListener("click", () => copyScratchAll());
    if ($("scratch-close")) $("scratch-close").addEventListener("click", () => closeScratch());
    if ($("scratch-out-clear")) {
      $("scratch-out-clear").addEventListener("click", () => renderScratchOut(""));
    }
    if ($("scratch-send")) {
      $("scratch-send").addEventListener("click", () => sendScratchInput().catch((err) => toast(err.message)));
    }
    if ($("scratch-input")) {
      $("scratch-input").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          sendScratchInput().catch((err) => toast(err.message));
        }
      });
    }
    if ($("scratch-more")) {
      $("scratch-more").addEventListener("click", (event) => {
        event.stopPropagation();
        toggleScratchMenu();
      });
    }
    if ($("scratch-menu")) {
      $("scratch-menu").addEventListener("click", (event) => {
        const act = event.target && event.target.dataset && event.target.dataset.scratchAct;
        if (!act) return;
        scratchMenuAction(act).catch((err) => toast(err.message));
      });
    }
    document.addEventListener("click", (event) => {
      const menu = $("scratch-menu");
      if (!menu || menu.hidden) return;
      if (event.target.closest("#scratch-menu, #scratch-more")) return;
      closeScratchMenu();
    });
    if ($("theme-nudge-apply")) {
      $("theme-nudge-apply").addEventListener("click", () => dismissThemeNudge(true));
    }
    if ($("theme-nudge-dismiss")) {
      $("theme-nudge-dismiss").addEventListener("click", () => dismissThemeNudge(false));
    }
    bindScratchDrag();
    bindScratchResize();
    bindExtras();
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
    if ($("tray-new")) {
      $("tray-new").addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = $("context") && !$("context").hidden
          && $("tray-new").getAttribute("aria-expanded") === "true";
        if (open) {
          closePopovers();
          $("tray-new").setAttribute("aria-expanded", "false");
        } else {
          openTrayNewMenu($("tray-new"));
        }
      });
    }
    if ($("empty-new")) {
      $("empty-new").addEventListener("click", () => createClass().catch((err) => toast(err.message)));
    }
    $("files-toggle").addEventListener("click", toggleFiles);
    if ($("project")) {
      $("project").addEventListener("click", () => {
        if (projectOverlayOpen()) closeProjectOverlay();
        else openProjectOverlay();
      });
    }
    if ($("project-overlay-close")) {
      $("project-overlay-close").addEventListener("click", () => closeProjectOverlay());
    }
    if ($("project-overlay-new")) {
      $("project-overlay-new").addEventListener("click", () => {
        closeProjectOverlay();
        newProject().catch((err) => toast(err.message));
      });
    }
    if ($("project-overlay")) {
      $("project-overlay").addEventListener("click", (event) => {
        if (event.target === $("project-overlay")) closeProjectOverlay();
      });
    }
    $("main-class").addEventListener("change", () => {
      if (!state.project) return;
      state.project.mainClass = $("main-class").value;
      api("PUT", "/api/projects/" + encodeURIComponent(state.project.id), { mainClass: state.project.mainClass })
        .catch((err) => toast(err.message));
    });
    $("project-menu").addEventListener("click", (event) => togglePopover(event.currentTarget));
    if ($("java-assist")) $("java-assist").addEventListener("click", (event) => togglePopover(event.currentTarget));
    if ($("extras")) $("extras").addEventListener("click", (event) => togglePopover(event.currentTarget));
    if ($("theme")) {
      $("theme").addEventListener("click", () => {
        if (themeOverlayOpen()) closeThemeOverlay();
        else openThemeOverlay();
      });
    }
    if ($("theme-overlay-close")) {
      $("theme-overlay-close").addEventListener("click", () => closeThemeOverlay());
    }
    if ($("theme-prev")) $("theme-prev").addEventListener("click", () => cycleTheme(-1));
    if ($("theme-next")) $("theme-next").addEventListener("click", () => cycleTheme(1));
    if ($("theme-overlay")) {
      $("theme-overlay").addEventListener("click", (event) => {
        if (event.target === $("theme-overlay")) closeThemeOverlay();
      });
    }
    bindThemeFilters();
    bindEditorContextMenu();
    window.addEventListener("beforeunload", () => {
      const payload = recoveryPayload();
      if (!payload || !payload.files.length) return;
      try {
        fetch("/api/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Lark": "1" },
          body: JSON.stringify(payload),
          keepalive: true
        });
      } catch (e) { /* ignore */ }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushRecovery(false).catch(() => {});
    });
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
    bindPref("setting-minimap", el => ({ minimapEnabled: el.checked }));
    bindPref("setting-minimap-width", el => ({ minimapWidth: Number(el.value) }));
    bindPref("setting-minimap-side", el => ({ minimapSide: el.value }));
    bindPref("setting-minimap-syntax", el => ({ minimapSyntax: el.checked }));
    bindPref("setting-minimap-markers", el => ({ minimapMarkers: el.checked }));
    bindPref("setting-tray-outlines", (el) => ({ trayOutlines: el.checked }));
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
      const ed = (state.settings && state.settings.edition) || "";
      toast("You'll be prompted again next time you open " + productName(ed) + ".");
    });
    if ($("update-modal-now")) $("update-modal-now").addEventListener("click", () => installUpdate().catch((err) => toast(err.message)));
    if ($("update-modal-restart")) $("update-modal-restart").addEventListener("click", () => restartAfterUpdate().catch((err) => toast(err.message)));
    $("menu-project").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-act]");
      const act = btn && btn.dataset.act;
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
        const tab = event.target.closest("[data-assist-tab]");
        if (tab) {
          setAssistTab(tab.dataset.assistTab);
          placePopover($("menu-assist"), $("java-assist"));
          return;
        }
        if (event.target.closest(".assist-block")) return;
        const btn = event.target.closest("[data-assist]");
        const act = btn && btn.dataset.assist;
        if (!act) return;
        closePopovers();
        runAssist(act).catch((err) => toast(err.message));
      });
    }
    if ($("menu-run-config")) {
      $("menu-run-config").addEventListener("click", (event) => {
        const btn = event.target.closest("[data-run-cfg]");
        const act = btn && btn.dataset.runCfg;
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
    // Theme tiles are bound inside renderThemeGrid (overlay stays open on apply).
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
      state.compileProblems = [];
      state.markProblems = [];
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
      if (assistDragPayload) return;
      if (event.target.closest(".popover") || event.target.closest("[data-pop]") || event.target.closest("#context")) return;
      closePopovers();
    });
    document.addEventListener("keydown", event => {
      const pop = document.querySelector(".popover:not([hidden])");
      if (!pop) return;
      const trigger = document.querySelector('[data-pop="' + pop.id + '"]');
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        closePopovers(); if (trigger) trigger.focus(); return;
      }
      if (!pop.contains(event.target) && event.target !== trigger) return;
      if (event.target.matches("input, select, textarea")) return;
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(pop.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")).filter(el => el.getClientRects().length);
      if (!items.length) return;
      event.preventDefault(); event.stopPropagation();
      const index = items.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }, true);
    window.addEventListener("keyup", (event) => {
      if (event.code === "Space" || event.key === " ") spaceHeld = false;
    });
    window.addEventListener("blur", () => { spaceHeld = false; });
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        assistDragPayload = null;
        clearAssistDropPreview();
        if (projectOverlayOpen()) { closeProjectOverlay(); return; }
        if (themeOverlayOpen()) { closeThemeOverlay(); return; }
        if ($("extras-panel") && !$("extras-panel").hidden) { closeExtras(); return; }
        if (scratchOpen()) { closeScratch(); return; }
        if ($("search-panel") && !$("search-panel").hidden) { closeProjectSearch(); return; }
        if (!$("palette").hidden) { $("palette").hidden = true; return; }
        if (!$("modal").hidden) { closeModal(null); return; }
        if (!$("drawer").hidden) { closeDrawer(); return; }
        if ($("theme-nudge") && !$("theme-nudge").hidden) { dismissThemeNudge(false); return; }
        closePopovers();
      }
      if (themeOverlayOpen() && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          cycleTheme(-1);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          cycleTheme(1);
          return;
        }
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
        if (scratchOpen()) runScratch().catch((err) => toast(err.message));
        else run().catch((err) => toast(err.message));
        return;
      }
      if (event.code === "Space" || event.key === " ") spaceHeld = true;
      if (spaceHeld && (event.key === "." || event.code === "Period")
          && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!$("modal").hidden) return;
        event.preventDefault();
        toggleScratch();
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
      const outlineH = clampPanel(
        getComputedStyle(document.documentElement).getPropertyValue("--outline-h"),
        88, outlinePanelMax(), 180
      );
      document.documentElement.style.setProperty("--outline-h", outlineH + "px");
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

  function productName(edition) {
    if (edition === "desktop") return "Lark Desktop";
    if (edition === "mobile") return "Lark Mobile";
    if (edition === "executable") return "Lark Executable";
    return "Lark";
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
    const edition = (info && info.edition) || (state.settings && state.settings.edition) || "";
    const latest = info.latest || "";
    const title = latest
      ? ("Lark " + latest + " is ready")
      : (productName(edition) + " update is ready");
    const notes = info.notes || info.message
      || ("You're on " + (info.current || "an older build") + ". Updating keeps things smooth and safe.");

    if (desktop && $("update-modal")) {
      $("update-modal-title").textContent = title;
      $("update-modal-notes").textContent = notes;
      const eyebrow = $("update-modal-eyebrow");
      if (eyebrow) eyebrow.textContent = "A newer Lark is available";
      const nowBtn = $("update-modal-now");
      const laterBtn = $("update-modal-later");
      const restartBtn = $("update-modal-restart");
      if (nowBtn) {
        nowBtn.hidden = false;
        nowBtn.disabled = false;
        nowBtn.textContent = "Update now";
      }
      if (laterBtn) laterBtn.hidden = false;
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
      const ed = (info && info.edition) || (state.settings && state.settings.edition) || "";
      toast("No worries — we'll ask again next time you open " + productName(ed) + ".");
      return;
    }
    await api("POST", "/api/update/skip", { version: info.latest });
    hideUpdateBanner();
    toast("Okay — skipped Lark " + info.latest + " for now.");
  }

  async function installUpdate() {
    const info = state.updateInfo || {};
    const desktop = isDesktopEdition(info);
    const ed = (info && info.edition) || (state.settings && state.settings.edition) || "";
    const nowBtn = $("update-modal-now");
    const bannerNow = $("update-now");
    if (nowBtn) {
      nowBtn.disabled = true;
      nowBtn.textContent = "Downloading…";
    }
    if (bannerNow) bannerNow.disabled = true;
    if (desktop && $("update-modal")) {
      $("update-modal").hidden = false;
      $("update-modal-title").textContent = "Downloading update…";
      $("update-modal-notes").textContent = "Fetching " + productName(ed) + ". Keep this window open.";
    }
    toast("Downloading the update…");
    try {
      const result = await api("POST", "/api/update/install", { download: info.download || "" });
      toast(result.message || "Almost there — restart Lark to finish.");
      if (result.canRestart) {
        if (desktop && $("update-modal")) {
          $("update-modal").hidden = false;
          $("update-modal-title").textContent = "You're ready to restart";
          $("update-modal-notes").textContent = result.message
            || ("Restart " + productName(ed) + " and you'll be on the new version.");
          if (nowBtn) {
            nowBtn.hidden = true;
            nowBtn.disabled = false;
            nowBtn.textContent = "Update now";
          }
          if ($("update-modal-later")) $("update-modal-later").hidden = true;
          if ($("update-modal-restart")) $("update-modal-restart").hidden = false;
          return;
        }
        if ($("update-banner")) $("update-banner").hidden = false;
        if ($("update-restart")) $("update-restart").hidden = false;
        if (bannerNow) {
          bannerNow.hidden = true;
          bannerNow.disabled = false;
        }
        $("update-title").textContent = "Ready to restart";
        $("update-notes").textContent = result.message || "Restart Lark to finish the update.";
      } else {
        hideUpdateBanner();
      }
    } catch (err) {
      if (nowBtn) {
        nowBtn.disabled = false;
        nowBtn.textContent = "Update now";
        nowBtn.hidden = false;
      }
      if (bannerNow) bannerNow.disabled = false;
      if (desktop && $("update-modal")) {
        $("update-modal-title").textContent = "Couldn't finish the update";
        $("update-modal-notes").textContent = err.message || "Something went wrong. Try again in a moment.";
      }
      throw err;
    }
  }

  function compareVersionsUi(a, b) {
    const parts = (v) => {
      const clean = String(v || "").replace(/^v/i, "").trim();
      const bits = clean.split(/[^0-9]+/).filter(Boolean).map((n) => Number(n) || 0);
      while (bits.length < 4) bits.push(0);
      return bits.slice(0, 4);
    };
    const left = parts(a);
    const right = parts(b);
    for (let i = 0; i < 4; i++) {
      if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
    }
    return 0;
  }

  let instanceWatchTimers = [];
  let tabMarkedOutdated = false;

  function writeInstanceClaim(version, force) {
    if (tabMarkedOutdated && !force) return;
    try {
      const existing = readInstanceClaim();
      // Never clobber a newer Lark's claim — that keeps old tabs from fighting updates.
      if (existing && existing.bootId !== BOOT_ID) {
        const peerNewer = compareVersionsUi(existing.version, version) > 0
          || Number(existing.t || 0) > BOOT_STARTED_AT;
        if (peerNewer && !force) return;
      }
      const payload = encodeURIComponent(JSON.stringify({
        bootId: BOOT_ID,
        version: version || "",
        t: Date.now()
      }));
      // Host cookie (no port) so a new Lark on another port can supersede this tab.
      document.cookie = INSTANCE_COOKIE + "=" + payload + "; path=/; max-age=604800; SameSite=Lax";
    } catch (e) { /* ignore */ }
  }

  function clearInstanceClaimIfOurs() {
    try {
      const claim = readInstanceClaim();
      if (claim && claim.bootId === BOOT_ID) {
        document.cookie = INSTANCE_COOKIE + "=; path=/; max-age=0; SameSite=Lax";
      }
    } catch (e) { /* ignore */ }
  }

  function readInstanceClaim() {
    try {
      const match = document.cookie.match(/(?:^|; )lark_instance=([^;]*)/);
      if (!match) return null;
      return JSON.parse(decodeURIComponent(match[1]));
    } catch (e) {
      return null;
    }
  }

  function showOutdatedBanner() {
    const banner = $("outdated-banner");
    if (banner) banner.hidden = false;
  }

  function stopInstanceWatch() {
    tabMarkedOutdated = true;
    instanceWatchTimers.forEach((id) => clearInterval(id));
    instanceWatchTimers = [];
    clearInstanceClaimIfOurs();
    try { localStorage.removeItem("lark-close-after-update"); } catch (e) {}
  }

  /** Browsers block window.close() unless they opened the window — fall back to a dead page. */
  function retireOutdatedPage() {
    const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">"
      + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
      + "<title>Lark — closed</title>"
      + "<style>"
      + "html,body{margin:0;height:100%;background:#1e2227;color:#c5ced8;"
      + "font:15px/1.45 \"Segoe UI\",system-ui,sans-serif;display:grid;place-items:center}"
      + "main{text-align:center;padding:28px;max-width:28rem}"
      + "p{margin:0 0 10px;color:#8b96a3} strong{color:#c5ced8;font-size:16px}"
      + "button{margin-top:14px;height:34px;padding:0 14px;border-radius:4px;border:0;"
      + "background:#3aa8b5;color:#0f1418;font:inherit;font-weight:600;cursor:pointer}"
      + "kbd{font:12px ui-monospace,monospace;background:#2a2e33;padding:2px 6px;border-radius:3px}"
      + "</style></head><body><main>"
      + "<strong>This Lark window is done.</strong>"
      + "<p>A newer Lark is already running. You can close this window.</p>"
      + "<button type=\"button\" id=\"bye\">Close window</button>"
      + "<p style=\"margin-top:16px;font-size:12px\">If nothing happens, press <kbd>Ctrl</kbd>+<kbd>W</kbd>"
      + " (Mac: <kbd>⌘</kbd>+<kbd>W</kbd>).</p>"
      + "</main><script>"
      + "document.getElementById('bye').onclick=function(){"
      + "try{window.open('','_self');}catch(e){}"
      + "try{window.close();}catch(e){}"
      + "};"
      + "try{window.open('','_self');window.close();}catch(e){}"
      + "</script></body></html>";
    try {
      document.open();
      document.write(html);
      document.close();
    } catch (e) {
      try { location.replace("about:blank"); } catch (e2) { /* ignore */ }
    }
  }

  function tryCloseOutdatedTab() {
    stopInstanceWatch();
    document.title = "Lark (outdated) — safe to close";
    showOutdatedBanner();
    const btn = $("outdated-close");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Closing…";
    }
    // Chromium --app windows sometimes accept close after reclaiming the browsing context.
    try { window.open("", "_self"); } catch (e) { /* ignore */ }
    try { window.close(); } catch (e) { /* browser may block */ }
    setTimeout(() => {
      try { window.close(); } catch (e) { /* ignore */ }
      // Still here? Replace the page so the old IDE cannot keep running.
      retireOutdatedPage();
    }, 180);
  }

  function bringWindowForward() {
    try { window.focus(); } catch (e) { /* ignore */ }
    try {
      if (typeof window.top !== "undefined" && window.top) window.top.focus();
    } catch (e) { /* ignore */ }
    try {
      const base = document.title.replace(/^\u25CF\s*/, "");
      document.title = "\u25CF " + base;
      setTimeout(() => {
        if (document.title.indexOf("\u25CF ") === 0) {
          document.title = base;
        }
      }, 1200);
    } catch (e) { /* ignore */ }
  }

  let lastFocusSeq = 0;
  function watchFocusRequests() {
    const tick = async () => {
      if (tabMarkedOutdated) return;
      try {
        const data = await api("GET", "/api/focus");
        const seq = Number(data && data.focus) || 0;
        if (lastFocusSeq && seq > lastFocusSeq) bringWindowForward();
        lastFocusSeq = seq || lastFocusSeq;
      } catch (e) { /* server may be restarting */ }
    };
    tick();
    instanceWatchTimers.push(setInterval(tick, 900));
  }

  function claimAndWatchInstance(version) {
    writeInstanceClaim(version);
    try {
      localStorage.setItem("lark-instance", JSON.stringify({
        bootId: BOOT_ID,
        version: version || "",
        t: BOOT_STARTED_AT
      }));
    } catch (e) { /* ignore */ }
    const check = () => {
      if (tabMarkedOutdated) return;
      const claim = readInstanceClaim();
      if (!claim || claim.bootId === BOOT_ID) return;
      const newer = compareVersionsUi(claim.version, version) > 0;
      const peerAfterUs = Number(claim.t || 0) > BOOT_STARTED_AT;
      let pendingRestart = false;
      try { pendingRestart = localStorage.getItem("lark-close-after-update") === "1"; } catch (e) {}
      if (newer || (pendingRestart && peerAfterUs)) {
        try { localStorage.removeItem("lark-close-after-update"); } catch (e) {}
        tryCloseOutdatedTab();
      }
    };
    instanceWatchTimers.push(setInterval(check, 700));
    window.addEventListener("storage", (event) => {
      if (event.key === "lark-instance" || event.key === "lark-close-after-update") check();
    });
    // Re-assert only while we are still the live tab — never overwrite a newer claim.
    instanceWatchTimers.push(setInterval(() => writeInstanceClaim(version), 12000));
    watchFocusRequests();
  }

  async function restartAfterUpdate() {
    toast("Restarting Lark — hang tight…");
    try { localStorage.setItem("lark-close-after-update", "1"); } catch (e) {}
    try { await flushRecovery(true); } catch (e) { /* best-effort */ }
    await api("POST", "/api/update/restart", {});
    // New process reclaims the same port; retire this previous-version tab shortly after.
    setTimeout(() => tryCloseOutdatedTab(), 1600);
    setTimeout(() => tryCloseOutdatedTab(), 3500);
  }

  function recoveryPayload() {
    if (!state.project) return null;
    const unique = new Map();
    const put = (path, content) => {
      if (!path) return;
      unique.set(path, { path: path, content: content == null ? "" : String(content) });
    };
    state.dirty.forEach((path) => {
      if (state.active === path && cm) put(path, cm.getValue());
      else if (state.activeB === path && cmB) put(path, cmB.getValue());
      else put(path, docs.get(path));
    });
    if (state.active && cm && state.dirty.has(state.active)) put(state.active, cm.getValue());
    if (state.activeB && cmB && state.dirty.has(state.activeB)) put(state.activeB, cmB.getValue());
    return {
      projectId: state.project.id,
      active: state.active || "",
      activeB: state.activeB || "",
      open: state.open.slice(),
      files: [...unique.values()]
    };
  }

  let recoveryTimer = null;
  async function flushRecovery(force) {
    const payload = recoveryPayload();
    if (!payload) return;
    if (!force && !payload.files.length && !state.dirty.size) return;
    try {
      await api("PUT", "/api/recovery", payload);
    } catch (e) {
      if (force) throw e;
    }
  }

  function scheduleRecovery() {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => {
      flushRecovery(false).catch(() => {});
    }, 900);
  }

  async function maybeRestoreRecovery() {
    let snap;
    try {
      snap = await api("GET", "/api/recovery");
    } catch (e) {
      return false;
    }
    if (!snap || !snap.present || !snap.projectId) return false;
    const known = (id) => state.projects.some((p) => p.id === id);
    if (!known(snap.projectId)) {
      await api("DELETE", "/api/recovery").catch(() => {});
      return false;
    }
    toast("Restoring what you were working on…");
    try {
      const applied = await api("POST", "/api/recovery/apply", { projectId: snap.projectId });
      await openProject(snap.projectId);
      const openPaths = (snap.open && snap.open.length) ? snap.open : (applied.paths || []);
      for (const path of openPaths) {
        try { await openFile(path); } catch (e) { /* skip missing */ }
      }
      if (snap.active) {
        try { await openFile(snap.active); } catch (e) { /* skip */ }
      }
      await api("DELETE", "/api/recovery").catch(() => {});
      toast("Welcome back — your editors are restored.");
      return true;
    } catch (err) {
      toast(err.message || "Couldn't restore the last session.");
      return false;
    }
  }

  function bindEditorContextMenu() {
    const menu = $("editor-context");
    if (!menu) return;
    const hide = () => { menu.hidden = true; };
    const showAt = (x, y) => {
      menu.hidden = false;
      const pad = 8;
      const w = menu.offsetWidth || 140;
      const h = menu.offsetHeight || 80;
      menu.style.left = Math.min(window.innerWidth - w - pad, Math.max(pad, x)) + "px";
      menu.style.top = Math.min(window.innerHeight - h - pad, Math.max(pad, y)) + "px";
    };
    document.addEventListener("contextmenu", (event) => {
      const inEditor = event.target.closest && event.target.closest(".CodeMirror, #scratch-editor, #console-out, #terminal-out, textarea, input");
      event.preventDefault();
      if (!inEditor) {
        hide();
        return;
      }
      showAt(event.clientX, event.clientY);
    });
    document.addEventListener("click", hide);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hide();
    });
    if ($("ctx-copy")) {
      $("ctx-copy").addEventListener("click", async () => {
        hide();
        try {
          const text = window.getSelection ? String(window.getSelection()) : "";
          if (text) await navigator.clipboard.writeText(text);
          else if (cm) {
            const sel = cm.getSelection();
            if (sel) await navigator.clipboard.writeText(sel);
          }
          toast(text || (cm && cm.getSelection()) ? "Copied." : "Nothing selected.");
        } catch (e) {
          toast("Couldn't copy.");
        }
      });
    }
    if ($("ctx-paste")) {
      $("ctx-paste").addEventListener("click", async () => {
        hide();
        try {
          const text = await navigator.clipboard.readText();
          if (cmScratch && document.activeElement && document.activeElement.closest("#scratch-pad")) {
            cmScratch.replaceSelection(text);
          } else if (cm) {
            cm.replaceSelection(text);
          }
        } catch (e) {
          toast("Couldn't paste — allow clipboard access, or use Ctrl+V.");
        }
      });
    }
  }

  async function boot() {
    try {
      ensureEditor();
      bind();
      if ($("outdated-close")) {
        $("outdated-close").addEventListener("click", () => tryCloseOutdatedTab());
      }
      let larkVer = "";
      try {
        const health = await api("GET", "/api/health");
        larkVer = health.version || "";
      } catch (_) { /* optional */ }
      claimAndWatchInstance(larkVer);
      state.settings = await api("GET", "/api/settings");
      const edition = state.settings.edition || "portable";
      document.body.classList.toggle("edition-desktop", edition === "desktop");
      document.body.classList.toggle("edition-executable", edition === "executable");
      document.body.classList.toggle("edition-mobile", edition === "mobile");
      applyTheme(state.settings.theme || "slate", false);
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
        trayOutlines: state.settings.trayOutlines !== false,
        autoSave: state.settings.autoSave !== false,
        autoSaveDelayMs: state.settings.autoSaveDelayMs || 800,
        formatOnSave: !!state.settings.formatOnSave
      }, false);
      if ($("setting-update-feed")) $("setting-update-feed").value = state.settings.updateFeed || "";
      showGithub();
      const version = (state.settings.javaVersion || "").split(".")[0];
      const bits = [];
      if (larkVer) bits.push(productName(edition) + " " + larkVer);
      if (version) bits.push("Java " + version);
      $("status-java").textContent = bits.join(" · ");
      if ($("status-path") && larkVer) {
        $("status-path").textContent = productName(edition) + " " + larkVer;
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
      const restored = await maybeRestoreRecovery();
      if (!restored) {
        if (id) {
          try { localStorage.setItem("lark-skip-welcome", "1"); } catch (e) {}
          await openProject(id);
        } else if (state.projects.length && known(state.settings.lastProject) && skipWelcome) {
          await openProject(state.settings.lastProject);
        } else {
          showWelcome();
        }
      }
      if (cm && state.active) {
        cm.refresh();
        cm.focus();
      }
      checkUpdates(false).catch(() => {});
      setTimeout(() => maybeShowThemeNudge(), 1600);
    } catch (err) {
      $("boot").textContent = err.message || "Lark couldn't open.";
    }
  }

  boot();
})();
