/* Lightweight Java member assistance; deliberately not a language server. */
(function(root) {
  const members = {
    Array: ['length', 'clone()'],
    System: ['out', 'err', 'in', 'currentTimeMillis()', 'nanoTime()', 'arraycopy()'],
    PrintStream: ['println()', 'print()', 'printf()', 'flush()'],
    String: ['length()', 'charAt()', 'substring()', 'equals()', 'equalsIgnoreCase()', 'trim()', 'toUpperCase()', 'toLowerCase()', 'contains()', 'split()', 'isEmpty()'],
    Scanner: ['nextLine()', 'nextInt()', 'nextDouble()', 'hasNext()', 'hasNextLine()', 'close()'],
    ArrayList: ['add()', 'get()', 'set()', 'remove()', 'size()', 'clear()', 'contains()', 'isEmpty()'],
    List: ['add()', 'get()', 'set()', 'remove()', 'size()', 'clear()', 'contains()', 'isEmpty()'],
    Math: ['abs()', 'max()', 'min()', 'sqrt()', 'pow()', 'random()', 'round()', 'PI', 'E']
  };
  // Preserve positions while excluding comments/literals from declaration scans.
  function codeOnly(source) {
    return source.replace(/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"""[\s\S]*?(?:"""|$)|"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)/g,
      value => value.replace(/[^\n]/g, ' '));
  }
  function visibleDeclarations(source) {
    const scopes = [new Map()], kinds = ["root"];
    let parameters = null;
    const tokens = codeOnly(source).matchAll(/([{}();])|\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?:\s*<[^;{}]+>)?(\s*\[\s*\])?\s+([A-Za-z_$][\w$]*)(\s*\[\s*\])?(?=\s*(?:[=;,:)]|$))/g);
    const excluded = new Set(['return', 'throw', 'new', 'case', 'break', 'continue', 'package', 'import']);
    for (const token of tokens) {
      if (token[1] === '(') { scopes.push(new Map()); kinds.push('('); }
      else if (token[1] === ')') { if (kinds.at(-1) === '(') { parameters = scopes.pop(); kinds.pop(); } }
      else if (token[1] === '{') { scopes.push(parameters || new Map()); kinds.push('{'); parameters = null; }
      else if (token[1] === '}') { if (scopes.length > 1) { scopes.pop(); kinds.pop(); } parameters = null; }
      else if (token[1] === ';') parameters = null;
      else if (!excluded.has(token[2])) scopes.at(-1).set(token[4], token[3] || token[5] ? 'Array' : token[2].split('.').at(-1));
    }
    return new Map(scopes.flatMap(scope => [...scope]));
  }
  let projectSymbols = () => [];
  function suggest(source, before) {
    const match = before.match(/([\w$]+(?:\.[\w$]+)*)\.([\w$]*)$/);
    if (!match) return null;
    let type = match[1], prefix = match[2];
    if (/^System\.(out|err)$/.test(type)) type = 'PrintStream';
    if (/^[\w$]+$/.test(type)) type = visibleDeclarations(source).get(type) || type;
    const projectMembers = projectSymbols().filter(symbol => symbol.owner === type && !symbol.mods?.includes('private') && ['method', 'field'].includes(symbol.kind))
      .map(symbol => symbol.name + (symbol.kind === 'method' ? '()' : ''));
    return [...new Set([...(members[type] || []), ...projectMembers])].filter(name => name.startsWith(prefix)).map(name => ({ text: name, displayText: name + '  ' + type, prefix }));
  }
  function hint(cm) {
    const cursor = cm.getCursor();
    if (/comment|string/.test(cm.getTokenTypeAt(cursor) || '')) return null;
    const list = suggest(cm.getValue().slice(0, cm.indexFromPos(cursor)), cm.getLine(cursor.line).slice(0, cursor.ch));
    if (list?.length) return { list, from: { line: cursor.line, ch: cursor.ch - list[0].prefix.length }, to: cursor };
    if (list) return null;
    const prefix = cm.getLine(cursor.line).slice(0, cursor.ch).match(/[\w$]+$/)?.[0] || '';
    if (!prefix) return null;
    const names = new Set([...(root.LarkJava?.keywords || []), ...(root.LarkJava?.typeWords || [])]);
    const source = cm.getValue();
    for (const symbol of projectSymbols()) if (symbol.name) names.add(symbol.name);
    // Completed blocks and comments cannot contribute local variable names.
    for (const name of visibleDeclarations(source.slice(0, cm.indexFromPos(cursor))).keys()) names.add(name);
    const parsed = root.LarkJava?.parseJava(source);
    (parsed?.symbols || []).forEach(symbol => names.add(symbol.name));
    (parsed?.imports || []).forEach(name => { const simple = name.split('.').at(-1); if (simple !== '*') names.add(simple); });
    const choices = [...names].filter(name => name.startsWith(prefix)).sort().slice(0, 40).map(text => ({ text, displayText: text }));
    return choices.length ? { list: choices, from: { line: cursor.line, ch: cursor.ch - prefix.length }, to: cursor } : null;
  }
  const api = { suggest, hint, visibleDeclarations, setProjectSymbols: provider => { projectSymbols = provider; } };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LarkTyping = api;
})(typeof window !== 'undefined' ? window : globalThis);
