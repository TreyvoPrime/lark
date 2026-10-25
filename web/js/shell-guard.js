/* Soften the browser chrome around Lark: no Inspect / View Source shortcuts. */
(function () {
  function isDevtoolsChord(event) {
    const key = (event.key || "").toLowerCase();
    const code = event.code || "";
    if (key === "f12" || code === "F12") return true;
    if (!(event.ctrlKey || event.metaKey)) return false;
    if (event.shiftKey && (key === "i" || key === "j" || key === "c" || code === "KeyI" || code === "KeyJ" || code === "KeyC")) {
      return true;
    }
    if (!event.shiftKey && (key === "u" || code === "KeyU")) return true;
    return false;
  }

  document.addEventListener("keydown", (event) => {
    if (isDevtoolsChord(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  document.addEventListener("contextmenu", (event) => {
    // Custom menus (editor copy/paste, file tree) handle their own preventDefault.
    // Block the browser default menu everywhere else so Inspect Element never appears.
    const custom = event.target.closest
      && event.target.closest(".CodeMirror, #scratch-editor, #console-out, #terminal-out, #files, textarea, input, [contenteditable='true']");
    if (!custom) {
      event.preventDefault();
    }
  }, true);
})();
