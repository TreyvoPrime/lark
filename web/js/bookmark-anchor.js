(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LarkBookmarkAnchor = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  let engine, activeIndex;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  let ready;
  if (typeof module === 'object' && module.exports) {
    const fs = require('node:fs'), path = require('node:path');
    engine = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(path.join(__dirname, 'lark-bookmarks.wasm')))).exports;
    ready = Promise.resolve();
  } else {
    ready = fetch('js/lark-bookmarks.wasm').then(response => {
      if (!response.ok) throw new Error('Bookmark engine unavailable');
      return response.arrayBuffer();
    }).then(bytes => WebAssembly.instantiate(bytes)).then(result => { engine = result.instance.exports; });
  }
  function pack(values) {
    const chunks = values.map(value => typeof value === 'number' ? value : encoder.encode(value));
    const length = chunks.reduce((n, value) => n + 4 + (typeof value === 'number' ? 0 : value.length), 0);
    const bytes = new Uint8Array(length), view = new DataView(bytes.buffer); let offset = 0;
    for (const value of chunks) {
      view.setUint32(offset, typeof value === 'number' ? value : value.length, true); offset += 4;
      if (typeof value !== 'number') { bytes.set(value, offset); offset += value.length; }
    }
    return bytes;
  }
  function invoke(name, bytes, returnsBytes) {
    if (!engine) throw new Error('Bookmark engine is not ready');
    const size = Math.max(1, bytes.length), input = engine.alloc(size); let output = 0, outputSize = 0;
    try {
      new Uint8Array(engine.memory.buffer, input, bytes.length).set(bytes);
      const result = engine[name](input, bytes.length);
      if (!returnsBytes) return result;
      output = result;
      if (!output) throw new Error('Bookmark engine rejected input');
      outputSize = new DataView(engine.memory.buffer).getUint32(output, true);
      return new Uint8Array(engine.memory.buffer, output + 4, outputSize - 4).slice();
    } finally { engine.free(input, size); if (output && outputSize) engine.free(output, outputSize); }
  }
  function normalize(line) { return decoder.decode(invoke('normalize_line', encoder.encode(String(line || '')), true)); }
  function capture(lines, line) {
    if (!Array.isArray(lines) || !Number.isInteger(line) || line < 0 || line >= lines.length) throw new RangeError('Bookmark line is outside the document');
    return { line, text: normalize(lines[line]), before: line > 0 ? normalize(lines[line - 1]) : null, after: line + 1 < lines.length ? normalize(lines[line + 1]) : null };
  }
  function createIndex(lines) {
    const index = { lines };
    if (!invoke('build_index', pack([lines.length, ...lines.map(line => String(line || ''))]), false)) throw new Error('Could not index bookmarks');
    activeIndex = index; return index;
  }
  function resolve(lines, anchor, index) {
    if (!Array.isArray(lines) || !anchor || typeof anchor.text !== 'string') return { status: 'unresolved' };
    if (!index || activeIndex !== index) index = createIndex(lines);
    const flags = (anchor.before !== null ? 1 : 0) | (anchor.after !== null ? 2 : 0);
    const result = invoke('resolve_anchor', pack([anchor.text, flags, anchor.before || '', anchor.after || '']), true);
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength), status = view.getUint32(0, true);
    if (status === 0) return { status: 'unresolved' };
    if (status === 1) return { status: 'resolved', line: view.getUint32(4, true) };
    const candidates = []; for (let i = 4; i < result.length; i += 4) candidates.push(view.getUint32(i, true));
    return { status: 'ambiguous', candidates };
  }
  return { capture, createIndex, resolve, ready };
});
