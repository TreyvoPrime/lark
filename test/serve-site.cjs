/* Local static preview; matches the directory routes used by GitHub Pages. */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../docs');
http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.resolve(root, '.' + name);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!name.endsWith('/')) { res.writeHead(301, { Location: name + '/' }).end(); return; }
    file = path.join(file, 'index.html');
  }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.webm':'video/webm', '.mp4':'video/mp4', '.png':'image/png', '.svg':'image/svg+xml', '.xml':'application/xml', '.txt':'text/plain' };
    const headers = { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'Accept-Ranges':'bytes', 'Content-Length':content.length };
    // Match static hosting so native video can seek and replay in the preview.
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const start = range && (range[1] ? Number(range[1]) : Math.max(0, content.length - Number(range[2])));
      const end = range && (range[1] && range[2] ? Math.min(Number(range[2]), content.length - 1) : content.length - 1);
      if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= content.length) {
        res.writeHead(416, { 'Content-Range':'bytes */' + content.length }).end(); return;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${content.length}`;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers).end(req.method === 'HEAD' ? undefined : content.subarray(start, end + 1)); return;
    }
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : content);
  });
}).listen(8768, '127.0.0.1', () => console.log('Website preview: http://127.0.0.1:8768'));
