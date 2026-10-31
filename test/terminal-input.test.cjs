/* Exercise the real terminal submit handler with an isolated API and input double. */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../web/js/app.js'), 'utf8');
const start = source.indexOf('  async function sendTerminalCommand() {'), end = source.indexOf('\n  function clearMarks()', start);
assert(start >= 0 && end > start, 'terminal submit handler exists');
let input = { value: '' }, privateInput = { checked: false }, sent = [], release;
const state = { project: { id: 'project-a' }, terminal: { id: 'terminal-a' }, termHistory: [], termHistIndex: 0 };
let ensure = async () => {};
const context = vm.createContext({ state, $: id => id === 'terminal-input' ? input : id === 'terminal-sensitive' ? privateInput : null,
  ensureTerminal: () => ensure(), api: async (...args) => { sent.push(args); }, pollTerminal() {} });
vm.runInContext(source.slice(start, end) + '\nthis.submit = sendTerminalCommand;', context);
(async () => {
  input.value = 'git status'; await context.submit();
  assert.equal(state.termHistory[0], 'git status'); assert.equal(sent[0][2].sensitive, false);
  input.value = 'git remote add origin https://user:example-secret@example.invalid/repo'; await context.submit();
  assert.equal(state.termHistory.length, 1, 'credential URL is excluded from history'); assert.equal(sent[1][2].sensitive, true);
  privateInput.checked = true; input.value = 'example-secret'; await context.submit();
  assert.equal(state.termHistory.length, 1, 'private input is excluded from history'); assert.equal(sent[2][2].sensitive, true);
  privateInput.checked = false; input.value = 'git status'; ensure = () => new Promise(resolve => { release = resolve; });
  const pending = context.submit(); state.project = { id: 'project-b' }; release(); await pending;
  assert.equal(sent.length, 3, 'a pending command is not sent to a different project');
  console.log('Terminal history, sensitive input and project-switch checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
