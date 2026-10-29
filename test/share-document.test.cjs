const assert = require('node:assert/strict');
const Document = require('../web/js/share-document.js');
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
for (let trial = 0; trial < 100; trial++) {
  const a = new Document('class Main {}\n'), b = new Document('class Main {}\n'), c = new Document('class Main {}\n');
  const ops = [];
  // Concurrent insert/delete histories at the same and different gaps.
  ops.push(...a.edit(6, trial % 3, 'Alpha😀', 'alice'));
  ops.push(...b.edit(6, 2, 'Beta', 'bob'));
  ops.push(...c.edit(0, 0, '// note\n', 'carol'));
  const permutations = [ops, [...ops].reverse(), [...ops.slice(2), ...ops.slice(0, 2)]];
  const results = [];
  for (const order of permutations) {
    const d = new Document('class Main {}\n'), pending = [...order];
    while (pending.length) {
      const index = pending.findIndex(op => d.nodes.has(op.after) && op.remove.every(id => d.nodes.has(id)));
      assert(index >= 0); d.apply(pending.splice(index, 1)[0]);
    }
    results.push(d.text());
    ops.forEach(op => d.apply(op)); eq(d.text(), results.at(-1));
  }
  eq(results[0], results[1]); eq(results[1], results[2]);
  const d = new Document('ab'); const anchor = d.anchor(1); d.edit(0, 0, 'x', 'writer'); eq(d.index(anchor), 2);
}
const large = new Document('a'.repeat(100_000));
eq(large.text().length, 100_000); // Iterative traversal: no recursion overflow.
console.log(`Share document: ${checks} convergence, idempotence, Unicode and anchor checks passed.`);
