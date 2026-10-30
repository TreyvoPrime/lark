/* Lightweight Java member assistance; deliberately not a language server. */
(function(root) {
  const members = {
    System: ['out', 'err', 'in', 'currentTimeMillis()', 'nanoTime()', 'arraycopy()'],
    PrintStream: ['println()', 'print()', 'printf()', 'flush()'],
    String: ['length()', 'charAt()', 'substring()', 'equals()', 'equalsIgnoreCase()', 'trim()', 'toUpperCase()', 'toLowerCase()', 'contains()', 'split()', 'isEmpty()'],
    Scanner: ['nextLine()', 'nextInt()', 'nextDouble()', 'hasNext()', 'hasNextLine()', 'close()'],
    ArrayList: ['add()', 'get()', 'set()', 'remove()', 'size()', 'clear()', 'contains()', 'isEmpty()'],
    List: ['add()', 'get()', 'set()', 'remove()', 'size()', 'clear()', 'contains()', 'isEmpty()'],
    Math: ['abs()', 'max()', 'min()', 'sqrt()', 'pow()', 'random()', 'round()', 'PI', 'E']
  };
  function suggest(source, before) {
    const match = before.match(/([\w$]+(?:\.[\w$]+)*)\.([\w$]*)$/);
    if (!match) return null;
    let type = match[1], prefix = match[2];
    if (/^System\.(out|err)$/.test(type)) type = 'PrintStream';
    if (!members[type] && /^[\w$]+$/.test(type)) {
      const escaped = type.replace(/\$/g, '\\$');
      const declaration = new RegExp('\\b(String|Scanner|ArrayList|List)(?:\\s*<[^>]+>)?\\s+' + escaped + '\\b', 'g');
      const matches = [...source.matchAll(declaration)];
      if (matches.length) type = matches.at(-1)[1];
    }
    return (members[type] || []).filter(name => name.startsWith(prefix)).map(name => ({ text: name, displayText: name + '  ' + type, prefix }));
  }
  function hint(cm) {
    const cursor = cm.getCursor();
    if (/comment|string/.test(cm.getTokenTypeAt(cursor) || '')) return null;
    const list = suggest(cm.getValue().slice(0, cm.indexFromPos(cursor)), cm.getLine(cursor.line).slice(0, cursor.ch));
    if (!list?.length) return null;
    return { list, from: { line: cursor.line, ch: cursor.ch - list[0].prefix.length }, to: cursor };
  }
  const api = { suggest, hint };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LarkTyping = api;
})(typeof window !== 'undefined' ? window : globalThis);
