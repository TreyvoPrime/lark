/* CodeMirror 5 overview: existing mode tokenizer, bounded animation-frame work. */
(function () {
  "use strict";
  const defaults = { enabled: false, width: 96, side: "right", syntax: true, markers: true };
  class Minimap {
    constructor(editor, options) {
      this.editor = editor;
      this.options = Object.assign({}, defaults, options);
      this.diagnostics = [];
      this.listeners = [];
      this.node = document.createElement("div");
      this.node.className = "editor-minimap";
      this.node.tabIndex = 0;
      this.node.setAttribute("role", "scrollbar");
      this.node.setAttribute("aria-label", "Code minimap");
      this.node.setAttribute("aria-orientation", "vertical");
      this.node.title = "Code overview · click or drag to scroll · arrows and Page Up/Down";
      this.canvas = document.createElement("canvas");
      this.marks = document.createElement("canvas");
      this.marks.className = "minimap-markers";
      this.viewport = document.createElement("div");
      this.viewport.className = "minimap-viewport";
      this.node.append(this.canvas, this.marks, this.viewport);
      this.host = editor.getWrapperElement().parentElement;
      this.host.classList.add("minimap-host");
      this.host.append(this.node);
      const on = (name, fn) => { editor.on(name, fn); this.listeners.push([name, fn]); };
      on("changes", () => this.schedule(180));
      on("swapDoc", () => { this.diagnostics = []; this.clearCanvas(); this.schedule(0); });
      on("scroll", () => this.updateViewport());
      on("refresh", () => this.schedule(80));
      on("optionChange", () => this.schedule(80));
      on("keyHandled", () => this.scheduleMarkers());
      this.input = () => this.scheduleMarkers();
      editor.getWrapperElement().addEventListener("input", this.input);
      editor.getWrapperElement().addEventListener("keydown", this.input);
      this.resize = new ResizeObserver(() => this.schedule(80));
      this.resize.observe(editor.getWrapperElement());
      this.theme = new MutationObserver(() => this.schedule(80));
      this.theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
      this.theme.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
      this.node.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        const box = this.node.getBoundingClientRect();
        const view = this.viewport.getBoundingClientRect();
        this.drag = { id: event.pointerId, top: box.top, height: this.mapHeight,
          offset: event.target === this.viewport ? event.clientY - view.top : view.height / 2 };
        this.node.setPointerCapture(event.pointerId);
        this.move(event);
      });
      this.node.addEventListener("pointermove", event => { if (this.drag && event.pointerId === this.drag.id) this.move(event); });
      const end = () => { this.drag = null; };
      this.node.addEventListener("pointerup", end);
      this.node.addEventListener("pointercancel", end);
      this.node.addEventListener("lostpointercapture", end);
      this.node.addEventListener("keydown", event => {
        const info = editor.getScrollInfo();
        const amounts = { ArrowUp: -editor.defaultTextHeight(), ArrowDown: editor.defaultTextHeight(), PageUp: -info.clientHeight, PageDown: info.clientHeight, Home: -info.height, End: info.height };
        if (!(event.key in amounts)) return;
        event.preventDefault(); event.stopPropagation();
        editor.scrollTo(null, info.top + amounts[event.key]);
      });
      this.configure(options);
    }
    configure(options) {
      Object.assign(this.options, options);
      this.options.width = Math.max(48, Math.min(160, Number(this.options.width) || 96));
      const wrap = this.editor.getWrapperElement();
      wrap.classList.toggle("has-minimap", !!this.options.enabled);
      wrap.classList.toggle("minimap-left", this.options.side === "left");
      wrap.style.setProperty("--minimap-width", this.options.width + "px");
      this.node.hidden = !this.options.enabled;
      this.node.style.width = this.options.width + "px";
      this.node.classList.toggle("minimap-left", this.options.side === "left");
      this.drag = null;
      this.editor.refresh();
      this.schedule(0);
    }
    clearCanvas() {
      for (const canvas of [this.canvas, this.marks]) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    }
    cancel() {
      clearTimeout(this.timer); clearTimeout(this.markerTimer); cancelAnimationFrame(this.frame); cancelAnimationFrame(this.markerFrame);
      this.revision = (this.revision || 0) + 1;
    }
    schedule(delay) {
      this.cancel();
      if (!this.options.enabled || this.disposed) return;
      this.timer = setTimeout(() => this.render(), delay);
    }
    colors() {
      const style = getComputedStyle(this.editor.getWrapperElement());
      const read = name => style.getPropertyValue(name).trim();
      return { plain: style.color, keyword: read("--syn-keyword"), atom: read("--syn-atom"), number: read("--syn-number"), string: read("--syn-string"), comment: read("--syn-comment"), def: read("--syn-def"), type: read("--syn-type"), variable: style.color, error: read("--red"), warning: read("--warn"), search: read("--accent") };
    }
    render() {
      const ed = this.editor, height = this.node.clientHeight, width = this.options.width;
      if (!height || !this.node.isConnected) return;
      const start = performance.now(), revision = this.revision, doc = ed.getDoc();
      const count = ed.lineCount(), ratio = Math.min(devicePixelRatio || 1, 2);
      this.mapHeight = Math.min(height, Math.max(12, count * 3));
      this.lineScale = this.mapHeight / count;
      // Draw offscreen and swap once complete, avoiding blank flashes during typing.
      const buffer = document.createElement("canvas");
      buffer.width = Math.ceil(width * ratio); buffer.height = Math.ceil(height * ratio);
      const ctx = buffer.getContext("2d"); ctx.scale(ratio, ratio); ctx.globalAlpha = .65;
      const palette = this.colors(), mode = CodeMirror.getMode(ed.options, ed.getOption("mode"));
      const state = CodeMirror.startState(mode), tabSize = ed.getOption("tabSize");
      let line = 0, cpu = 0, maxSlice = 0;
      const chunk = () => {
        if (this.disposed || revision !== this.revision || doc !== ed.getDoc() || !this.node.clientHeight) return;
        const slice = performance.now();
        do {
          const text = ed.getLine(line), y = line * this.lineScale;
          let col = 0;
          const draw = (str, type) => {
            ctx.fillStyle = this.options.syntax ? palette[(type || "plain").split(" ")[0]] || palette.plain : palette.plain;
            for (const ch of str) {
              if (ch === "\t") col += tabSize - col % tabSize;
              else { if (ch !== " " && col * 1.25 < width - 8) ctx.fillRect(3 + col * 1.25, y, 1, Math.max(.5, Math.min(2, this.lineScale * .75))); col++; }
            }
          };
          // Pathological long lines use a plain sample; never tokenize megabyte lines.
          if (text.length > 4000 || !this.options.syntax) draw(text.slice(0, 400), "plain");
          else {
            const stream = new CodeMirror.StringStream(text, tabSize);
            if (!text && mode.blankLine) mode.blankLine(state);
            while (!stream.eol()) {
              stream.start = stream.pos;
              const type = mode.token(stream, state);
              if (stream.pos <= stream.start) stream.pos++;
              draw(stream.current(), type);
            }
          }
          line++;
        } while (line < count && performance.now() - slice < 4);
        const cost = performance.now() - slice; cpu += cost; maxSlice = Math.max(maxSlice, cost);
        if (line < count) this.frame = requestAnimationFrame(chunk);
        else {
          this.canvas.width = buffer.width; this.canvas.height = buffer.height;
          this.canvas.style.width = width + "px"; this.canvas.style.height = height + "px";
          this.canvas.getContext("2d").drawImage(buffer, 0, 0);
          this.stats = { lines: count, cpuMs: cpu, maxSliceMs: maxSlice, elapsedMs: performance.now() - start };
          this.updateViewport(); this.drawMarkers();
        }
      };
      this.frame = requestAnimationFrame(chunk);
    }
    updateViewport() {
      if (!this.options.enabled || !this.mapHeight) return;
      const ed = this.editor, info = ed.getScrollInfo();
      const first = ed.lineAtHeight(info.top, "local");
      const last = ed.lineAtHeight(info.top + info.clientHeight, "local") + 1;
      const top = first * this.lineScale;
      this.viewport.style.top = top + "px";
      this.viewport.style.height = Math.max(6, Math.min(this.mapHeight - top, (last - first) * this.lineScale)) + "px";
      this.node.setAttribute("aria-valuemin", "1");
      this.node.setAttribute("aria-valuemax", String(ed.lineCount()));
      this.node.setAttribute("aria-valuenow", String(first + 1));
      this.node.setAttribute("aria-valuetext", "Line " + (first + 1) + " of " + ed.lineCount());
    }
    move(event) {
      const line = Math.max(0, Math.min(this.editor.lastLine(), Math.floor((event.clientY - this.drag.top - this.drag.offset) / this.lineScale)));
      this.editor.scrollTo(null, this.editor.heightAtLine(line, "local"));
    }
    setDiagnostics(problems) { this.diagnostics = problems || []; this.scheduleMarkers(); }
    scheduleMarkers() { clearTimeout(this.markerTimer); this.markerTimer = setTimeout(() => this.drawMarkers(), 120); }
    drawMarkers() {
      cancelAnimationFrame(this.markerFrame);
      if (!this.options.enabled || !this.mapHeight || this.disposed || !this.node.clientHeight) return;
      const canvas = this.marks, width = this.options.width, height = this.node.clientHeight;
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d"), colors = this.colors();
      const draw = (line, color, x) => { ctx.fillStyle = color; ctx.fillRect(x, Math.min(height - 2, line * this.lineScale), 4, 2); };
      if (this.options.markers) this.diagnostics.forEach(p => { if (p.line > 0) draw(p.line - 1, p.severity === "error" ? colors.error : colors.warning, width - 5); });
      const ed = this.editor, query = ed.state.search && ed.state.search.query;
      if (!query || !ed.getSearchCursor) return;
      const cursor = ed.getSearchCursor(query, { line: 0, ch: 0 }, { caseFold: typeof query === "string" && query === query.toLowerCase(), multiline: true }), doc = ed.getDoc(), revision = this.revision;
      const step = () => {
        if (this.disposed || revision !== this.revision || doc !== ed.getDoc() || !this.node.clientHeight) return;
        const start = performance.now();
        let found;
        do { found = cursor.findNext(); if (found) draw(cursor.from().line, colors.search, 0); } while (found && performance.now() - start < 4);
        if (found) this.markerFrame = requestAnimationFrame(step);
      };
      this.markerFrame = requestAnimationFrame(step);
    }
    dispose() {
      this.disposed = true; this.cancel(); clearTimeout(this.markerTimer);
      this.resize.disconnect(); this.theme.disconnect();
      this.listeners.forEach(([name, fn]) => this.editor.off(name, fn));
      const wrap = this.editor.getWrapperElement();
      wrap.removeEventListener("input", this.input); wrap.removeEventListener("keydown", this.input);
      wrap.classList.remove("has-minimap", "minimap-left");
      this.node.remove(); this.editor.refresh();
    }
  }
  window.LarkMinimap = Minimap;
})();
