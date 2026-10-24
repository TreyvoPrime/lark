/* Soft shell locks for Edge/Chrome --app fallback. WebView2 already disables DevTools. */
(function () {
  function blockBrowserChrome(event) {
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    // Inspect / console / view-source — leave F12 alone (Go to Definition).
    if (mod && event.shiftKey && (key === "I" || key === "i" || key === "J" || key === "j" || key === "C" || key === "c")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (mod && (key === "u" || key === "U")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  window.addEventListener("keydown", blockBrowserChrome, true);

  fetch("/api/health", { headers: { "X-Lark": "1" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && data.shell) {
        document.documentElement.dataset.larkShell = "1";
      }
    })
    .catch(() => {});
})();
