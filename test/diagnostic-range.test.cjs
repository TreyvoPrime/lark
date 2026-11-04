const assert = require('node:assert/strict');
const { diagnosticRange } = require('../web/js/java.js');
assert.deepEqual(diagnosticRange('  missingName();', 4), { start: 2, end: 13 });
assert.deepEqual(diagnosticRange('  int x = ;', 11), { start: 10, end: 11 });
assert.deepEqual(diagnosticRange('  return value   ', 20), { start: 9, end: 14 });
assert.deepEqual(diagnosticRange('  missingName();', 0), { start: 2, end: 13 });
assert.equal(diagnosticRange('   ', 1), null);
console.log('Compiler diagnostic underline ranges passed.');
