const assert = require('node:assert/strict');
const {suggest} = require('../web/js/typing.js');
assert(suggest('', 'System.o').some(x => x.text === 'out'));
assert(suggest('', 'System.out.pr').some(x => x.text === 'println()'));
assert(suggest('String name = "hello";', 'name.len').some(x => x.text === 'length()'));
assert(suggest('Scanner input;', 'input.next').some(x => x.text === 'nextInt()'));
assert.deepEqual(suggest('', 'unknown.'), []);
assert.equal(suggest('', 'nothing'), null);
console.log('Typing member suggestion checks passed.');
const {visibleDeclarations} = require('../web/js/typing.js');
assert(suggest('String item; { Scanner item; }', 'item.len').some(x=>x.text==='length()'));
assert(suggest('String item; { Scanner item;', 'item.next').some(x=>x.text==='nextInt()'));
assert.deepEqual(suggest('{ String gone; }', 'gone.'), []);
for (const source of ['// String fake;', '/* String fake; */', 'String text = "String fake;";', 'String text = """String fake;""";']) {
  assert.deepEqual(suggest(source, 'fake.'), [], 'comments and literals cannot declare variables');
}
assert(suggest('java.util.Scanner input;', 'input.next').some(x=>x.text==='nextInt()'));
assert(suggest('String[] names;', 'names.len').some(x=>x.text==='length'));
assert(suggest('String names[];', 'names.len').some(x=>x.text==='length'));
assert(suggest('List<String> names;', 'names.si').some(x=>x.text==='size()'));
assert(!visibleDeclarations('return value; throw error;').has('value'));
assert.equal(require('node:fs').readFileSync(require('node:path').join(__dirname,'../web/js/typing.js'),'utf8'),require('node:fs').readFileSync(require('node:path').join(__dirname,'../web-mobile/js/typing.js'),'utf8'));
console.log('Typing scope checks passed: shadowing, closed blocks, comments, literals, qualified types and arrays.');
