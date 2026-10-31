const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../docs');
let links = 0, assets = 0;
for (const name of ['index.html', 'guide/index.html']) {
  const file = path.join(root, name), source = fs.readFileSync(file, 'utf8');
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, name + ': duplicate IDs');
  assert.equal([...source.matchAll(/<h1\b/g)].length, 1, 'one main heading');
  for (const match of source.matchAll(/\b(href|src)="([^"]+)"/g)) {
    const url = match[2];
    assert(!/^javascript:/.test(url) && url !== '#', 'no placeholder link');
    if (/^(https:|mailto:)/.test(url)) continue;
    const [pathWithQuery, hash] = url.split('#');
    const pathname = pathWithQuery.split('?')[0];
    let target = pathname ? path.resolve(path.dirname(file), pathname) : file;
    assert(target.startsWith(root), 'local link stays in site');
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    assert(fs.existsSync(target), 'missing linked file: ' + target);
    if (hash) assert(fs.readFileSync(target, 'utf8').includes('id="' + hash + '"'), 'missing anchor: ' + url);
    match[1] === 'src' ? assets++ : links++;
  }
  for (const match of source.matchAll(/<img\b[^>]*>/g)) {
    assert(/\balt=/.test(match[0]), 'image needs alt attribute');
    assert(/\bwidth="\d+"/.test(match[0]) && /\bheight="\d+"/.test(match[0]), 'image reserves its space');
  }
}
assert(fs.existsSync(path.join(root, 'media/social.png')), 'social sharing asset');
assert(!fs.readFileSync(path.join(root,'index.html'),'utf8').includes('latest/download/'), 'no unverified latest/download URLs');
console.log(`Site structure passed: ${links} local links and ${assets} assets; anchors, headings, image dimensions, and social image.`);
