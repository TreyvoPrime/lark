(function () {
  "use strict";
  const selector = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="password"], input[type="tel"]';
  function configure(field) {
    field.setAttribute("autocomplete", field.type === "password" ? "new-password" : "off");
    field.setAttribute("autocapitalize", "off");
    field.setAttribute("autocorrect", "off");
    if (!field.hasAttribute("spellcheck")) field.setAttribute("spellcheck", "false");
  }
  function configureTree(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(selector)) configure(node);
    node.querySelectorAll(selector).forEach(configure);
  }
  document.querySelectorAll(selector).forEach(configure);
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(configureTree));
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
