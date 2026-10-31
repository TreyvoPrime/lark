const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'web/css/app.css'), 'utf8');
const client = fs.readFileSync(path.join(root, 'web/js/app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/lark/Settings.java'), 'utf8');
const themes = {
  'arctic-white': ['#FFFFFF','#F5F7FA','#3282E6','#172438','#E2E7EF'],
  pearl: ['#FCFCFD','#F3F4F7','#7162B5','#292B36','#E0E1E8'],
  'cloud-blue': ['#F7FAFF','#EDF4FF','#3D85D8','#1F344F','#D8E5F3'],
  sakura: ['#FFFAFC','#FFF0F5','#C65D88','#48313C','#EEDBE4'],
  'glacier-mint': ['#F7FCFA','#EAF7F1','#218A70','#20392F','#D3E9DF'],
  silverstone: ['#F7F8FA','#EBEEF2','#5A6B85','#252F3E','#D7DCE4'],
  'lark-snowfall': null, 'lark-mint': null, 'lark-lavender': null, 'lark-paper': null
};
function luminance(hex) {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y) + .05) / (Math.min(x,y) + .05); }
for (const [id, expected] of Object.entries(themes)) {
  const blocks = [...css.matchAll(new RegExp('\\[data-theme="' + id + '"\\]\\s*\\{([^}]+)\\}', 'g'))];
  assert.equal(blocks.length, 1, `${id} has exactly one palette`);
  const vars = Object.fromEntries([...blocks[0][1].matchAll(/(--[\w-]+):\s*(#[\da-fA-F]{6})/g)].map(m => [m[1], m[2].toUpperCase()]));
  assert(client.includes('"' + id + '"') && server.includes('"' + id + '"'), `${id} is selectable and persists`);
  if (expected) ['--bg','--bg-elev','--accent','--text','--line'].forEach((key, i) => assert.equal(vars[key], expected[i], `${id} ${key}`));
  for (const key of ['--text','--syn-keyword','--syn-string','--syn-comment','--syn-number','--syn-type','--syn-annotation','--syn-def','--syn-atom','--syn-operator','--syn-variable']) {
    assert(vars[key], `${id} provides ${key}`);
    assert(contrast(vars[key], vars['--bg']) >= 4.5, `${id} ${key} is readable`);
  }
  assert(contrast(vars['--accent'], vars['--accent-ink']) >= 4.5, `${id} accent button text is readable`);
}
console.log('Ten light theme palettes, registration and text contrast passed.');
