/* Early theme restore — keep out of index.html so CSP script-src 'self' holds. */
(function () {
  try {
    var savedTheme = localStorage.getItem("lark-theme");
    var aliases = {
      ink: "desk", paper: "daylight", tide: "moss", copper: "ember",
      chalk: "fog", kawaii: "blossom", pink: "blossom"
    };
    if (savedTheme) {
      document.documentElement.dataset.theme = aliases[savedTheme] || savedTheme;
    }
  } catch (e) { /* private mode */ }
})();
