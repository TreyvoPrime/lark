/* Rust/WebAssembly project-search engine. The editor owns the unsaved text. */
(function (root) {
  'use strict';
  function create(engine) {
    const encode = new TextEncoder();
    let cached = null;
    return function matches(files, query) {
      const q = encode.encode(query.toLowerCase());
      const original = files.map(file => file.content || '');
      const unchanged = cached && cached.length === original.length && cached.every((content, i) => content === original[i]);
      const contents = unchanged ? [] : original.map(content => encode.encode(content.toLowerCase()));
      const size = unchanged ? Math.max(q.length, 1) : 8 + q.length + contents.reduce((total, content) => total + 4 + content.length, 0);
      if (!Number.isSafeInteger(size) || size > 0xffffffff) return null;
      let input = 0, output = 0, outSize = 0;
      try {
        input = engine.alloc(size);
        if (!input) return null;
        let bytes = new Uint8Array(engine.memory.buffer, input, size);
        let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let offset = 0;
        function number(value) { view.setUint32(offset, value, true); offset += 4; }
        if (unchanged) {
          bytes.set(q);
          output = engine.search_index(input, q.length);
        } else {
          number(q.length); bytes.set(q, offset); offset += q.length;
          number(contents.length);
          for (const content of contents) { number(content.length); bytes.set(content, offset); offset += content.length; }
          if (size <= 5_000_000 && engine.build_index(input, size)) {
            cached = original;
            // Index construction can grow WebAssembly memory and detach the old view.
            bytes = new Uint8Array(engine.memory.buffer, input, size);
            output = engine.search_index(input + 4, q.length);
          } else {
            cached = null;
            output = engine.search_matches(input, size);
          }
        }
        if (!output) return null;
        view = new DataView(engine.memory.buffer);
        outSize = view.getUint32(output, true);
        if (outSize < 4 || (outSize - 4) % 8 || output + outSize > view.byteLength) return null;
        const hits = [];
        for (let pos = output + 4; pos < output + outSize; pos += 8) {
          const file = view.getUint32(pos, true), line = view.getUint32(pos + 4, true);
          if (file >= files.length) return null;
          hits.push([file, line]);
        }
        return hits;
      } catch (_) { cached = null; return null; }
      finally {
        if (input) engine.free(input, size);
        if (output && outSize) engine.free(output, outSize);
      }
    };
  }
  const api = { create, matches: () => null };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && typeof root.fetch === 'function' && typeof WebAssembly === 'object') {
    root.fetch('js/lark-search.wasm').then(r => {
      if (!r.ok) throw new Error('Search engine unavailable');
      return r.arrayBuffer();
    }).then(bytes => WebAssembly.instantiate(bytes)).then(result => { api.matches = create(result.instance.exports); }).catch(() => {});
  }
  if (root) root.LarkSearch = api;
})(typeof window !== 'undefined' ? window : null);
