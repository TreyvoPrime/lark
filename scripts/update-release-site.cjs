/* Update the verified website snapshot only after the actual release files exist. */
const fs = require('node:fs'), path = require('node:path');
const version = process.argv[2], release = process.argv[3] || 'release';
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Supply a three-part release version');
const names = ['LarkDesktopSetup.exe','lark-executable-windows.zip','lark-desktop-windows.zip','lark-desktop-mac.zip','lark-desktop-linux.zip'];
const assets = names.map(name => { const file = path.join(release, name); const bytes = fs.statSync(file).size; if (bytes <= 0) throw new Error('Empty release asset: ' + name); return [name, bytes]; });
const tag = 'v' + version;
let file = 'docs/releases.js', text = fs.readFileSync(file, 'utf8');
const oldAssets = /  const currentAssets = \[[^\n]+\];/;
if (!oldAssets.test(text)) throw new Error('Cannot find verified asset snapshot');
text = text.replace(oldAssets, '  const currentAssets = ' + JSON.stringify(assets) + ';');
const begin = text.indexOf('  const fallback = {'), end = text.indexOf('  function validUrl', begin);
if (begin < 0 || end < 0) throw new Error('Cannot find release fallback');
const prior = text.slice(begin, end).match(/latest: \{ tag: 'v([^']+)'/);
if (!prior) throw new Error('Cannot find prior release version');
let block = text.slice(begin, end).replaceAll('v' + prior[1], tag).replaceAll("'" + prior[1] + "'", "'" + version + "'").replace(/checkedAt: '[^']+'/, "checkedAt: '" + new Date().toISOString() + "'");
if (!block.includes(tag)) throw new Error('Unexpected prior snapshot version');
text = text.slice(0, begin) + block + text.slice(end); fs.writeFileSync(file, text);
file = 'docs/index.html'; text = fs.readFileSync(file, 'utf8')
  .replace(/(releases\.js\?v=)[\d.]+/g, '$1' + version)
  .replace(/(site\.js\?v=)[\d.]+/g, '$1' + version)
  .replace(/(\/releases\/download\/)v[\d.]+\//g, '$1' + tag + '/')
  .replace(/(\/releases\/tag\/)v[\d.]+/g, '$1' + tag)
  .replace(/Published under release [\d.]+\./g, 'Published under release ' + version + '.')
  .replace(/(<span id="latest-version">)[\d.]+(<\/span>)/, '$1' + version + '$2')
  .replace(/These packages include Lark [\d.]+ and Java;/g, 'These packages include Lark ' + version + ' and Java;');
fs.writeFileSync(file, text);
file = 'docs/site.js'; text = fs.readFileSync(file, 'utf8').replace('Showing verified package details from October 31, 2026. Live release information is unavailable.', 'Showing a verified release snapshot. Live release information is unavailable.'); fs.writeFileSync(file, text);
file = 'test/site-releases.test.cjs'; text = fs.readFileSync(file, 'utf8').replaceAll("'" + prior[1] + "'", "'" + version + "'"); fs.writeFileSync(file, text);
console.log('Updated verified website snapshot for', tag);
