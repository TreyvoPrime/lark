const assert = require('node:assert/strict');
const {suggest} = require('../web/js/typing.js');
assert(suggest('', 'System.o').some(x => x.text === 'out'));
assert(suggest('', 'System.out.pr').some(x => x.text === 'println()'));
assert(suggest('String name = "hello";', 'name.len').some(x => x.text === 'length()'));
assert(suggest('Scanner input;', 'input.next').some(x => x.text === 'nextInt()'));
assert.deepEqual(suggest('', 'unknown.'), []);
assert.equal(suggest('', 'nothing'), null);
console.log('Typing member suggestion checks passed.');
