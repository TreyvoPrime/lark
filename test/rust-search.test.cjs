const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { create } = require('../web/js/lark-search.js');
let matches;
test.before(async () => {
  const wasm = fs.readFileSync(require('node:path').join(__dirname, '../web/js/lark-search.wasm'));
  matches = create((await WebAssembly.instantiate(wasm)).instance.exports);
});
test('finds every line across files including unsaved text and Unicode', () => {
  const files = [{ content: 'Alpha\nUnsaved ÉDIT\nalpha' }, { content: 'édit again\nelse' }];
  assert.deepEqual(matches(files, 'édit'), [[0, 1], [1, 0]]);
  files[1].content = 'no matches';
  assert.deepEqual(matches(files, 'ÉDIT'), [[0, 1]]);
  assert.deepEqual(matches(files, 'missing'), []);
});
test('preserves line boundaries and handles empty files', () => {
  assert.deepEqual(matches([{ content: '\nfirst\n' }, { content: '' }], 'FIRST'), [[0, 1]]);
  assert.deepEqual(matches([], 'x'), []);
});
test('matches the previous JavaScript search across varied editor content', () => {
  const files = [{ content: 'é\nİstanbul\nHELLO 🌱\nfoo' }, { content: 'hello\r\nÉcole\n  Foo  ' }];
  for (const query of ['é', 'i', 'hello', '🌱', 'FOO', 'missing']) {
    const expected = [];
    files.forEach((file, i) => file.content.split('\n').forEach((line, n) => {
      if (line.toLowerCase().includes(query.toLowerCase())) expected.push([i, n]);
    }));
    assert.deepEqual(matches(files, query), expected);
  }
});
