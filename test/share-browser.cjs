/* Optional end-to-end test. Requires Playwright and Chromium; no npm runtime dependency.
 * LARK_PLAYWRIGHT_PATH=/path/to/playwright JAVA_HOME=/path/to/jdk node test/share-browser.cjs
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.LARK_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
let checks = 0;
const check = (condition, message) => { assert(condition, message); checks++; };
async function start(home) {
  // Lark's existing launcher reports the requested port, so use a concrete free port.
  const port = await new Promise((resolve, reject) => {
    const probe = require('node:net').createServer(); probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  const process = spawn(java, ['-Duser.home=' + home, '-Dlark.ui=jar', '-jar', path.join(root, 'dist/lark.jar'), '--no-browser', '--port', String(port)], { cwd: home, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { process.kill(); reject(new Error('IDE startup timed out')); }, 15000);
    process.once('error', error => { clearTimeout(timer); reject(error); });
    process.once('exit', code => { clearTimeout(timer); reject(new Error('IDE exited during startup: ' + code + '\n' + output)); });
    process.stdout.on('data', bytes => { output += bytes.toString(); const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    process.stderr.on('data', bytes => { output += bytes.toString(); });
  });
  return { process, url, home };
}
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'lark-share-browser-'));
  let browser;
  const servers = [], contexts = [], pageErrors = [];
  try {
    for (const name of ['host', 'viewer']) { const home = path.join(temp, name); await fs.mkdir(home); servers.push(await start(home)); }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
    }
    const host = await contexts[0].newPage(), viewer = await contexts[1].newPage();
    for (const [i, page] of [host, viewer].entries()) {
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(servers[i].url);
      await page.locator('#boot').waitFor({ state: 'hidden' });
      await page.locator('#share-open').click();
      await page.locator('.share-dialog[open]').waitFor();
    }
    const hd = host.locator('.share-dialog'), vd = viewer.locator('.share-dialog');
    await hd.getByRole('button', { name: 'Host Session', exact: true }).click();
    await hd.getByLabel('Session name', { exact: true }).fill('Source review');
    await hd.getByLabel('Your display name', { exact: true }).fill('Host');
    await hd.getByLabel('Listen on this interface').selectOption('127.0.0.1');
    await hd.getByRole('button', { name: 'Host session', exact: true }).click();
    const invite = hd.getByLabel('Private invitation', { exact: true });
    await invite.waitFor();
    const invitation = await invite.inputValue();
    await hd.getByRole('button', { name: 'Security', exact: true }).click();
    await hd.getByRole('button', { name: 'Invitation', exact: true }).click();
    check((await hd.getByLabel('Private invitation', { exact: true }).inputValue()) === invitation, 'Host can reopen invitation controls');
    check(invitation.length > 100, 'Real private invitation generated');
    await vd.getByRole('button', { name: 'Join Session', exact: true }).click();
    await vd.getByLabel('Private invitation from the host').fill(invitation);
    check((await vd.locator('.share-fingerprint').textContent()).includes('SHA-256:'), 'Joiner can inspect host identity before connecting');
    await vd.getByLabel('Your display name', { exact: true }).fill('Viewer');
    await vd.getByRole('checkbox').check();
    await vd.getByRole('button', { name: 'Request access', exact: true }).click();
    await vd.getByRole('status').filter({ hasText: 'Waiting for Approval' }).waitFor();
    check(!(await vd.getByRole('button', { name: 'Shared Project', exact: true }).count()), 'Source unavailable until approval');
    await hd.getByRole('button', { name: 'Refresh', exact: true }).click();
    await hd.getByRole('button', { name: 'Participants', exact: true }).click();
    await hd.getByRole('button', { name: 'Approve as Editor', exact: true }).click();
    await vd.getByRole('button', { name: 'Refresh', exact: true }).click();
    await vd.getByRole('button', { name: 'Shared Project', exact: true }).click();
    await hd.getByRole('button', { name: 'Close', exact: true }).click();
    for (const page of [host, viewer]) await page.waitForFunction(() => window.LarkEditorShare?.editor()?.getValue().includes('class') && !window.LarkEditorShare.editor().getOption('readOnly'));
    const insert = (page, text) => page.evaluate(text => window.LarkEditorShare.editor().replaceRange(text, { line: 0, ch: 0 }), text);
    const value = page => page.evaluate(() => window.LarkEditorShare.editor().getValue());
    await Promise.all([insert(host, '// HOST\n'), insert(viewer, '// PEER😀\n')]);
    for (const page of [host, viewer]) await page.waitForFunction(() => { const text = window.LarkEditorShare.editor().getValue(); return text.includes('// HOST') && text.includes('// PEER'); });
    check(await value(host) === await value(viewer), 'Concurrent main-editor changes converge');
    await viewer.evaluate(() => CodeMirror.commands.undo(window.LarkEditorShare.editor()));
    await host.waitForFunction(() => { const text = window.LarkEditorShare.editor().getValue(); return text.includes('// HOST') && !text.includes('// PEER'); });
    check((await value(viewer)).includes('// HOST'), 'Local undo preserves other participant edits');
    await viewer.evaluate(() => CodeMirror.commands.redo(window.LarkEditorShare.editor()));
    await host.waitForFunction(() => window.LarkEditorShare.editor().getValue().includes('// PEER'));
    check(true, 'Collaborative redo');
    await viewer.route('**/api/share', route => route.abort());
    await insert(viewer, '// OFFLINE\n');
    await insert(host, '// WHILE-OFFLINE\n');
    await viewer.waitForTimeout(900);
    check(await viewer.evaluate(() => window.LarkShareEditing.pending()), 'Disconnected edits remain queued');
    await viewer.unroute('**/api/share');
    for (const page of [host, viewer]) await page.waitForFunction(() => { const text = window.LarkEditorShare.editor().getValue(); return text.includes('// OFFLINE') && text.includes('// WHILE-OFFLINE') && !window.LarkShareEditing.pending(); });
    check(await value(host) === await value(viewer), 'Offline operations reconcile without overwriting concurrent host changes');
    await host.waitForFunction(() => document.querySelectorAll('#share-avatars .share-avatar').length === 2);
    check(await host.locator('#share-explorer').isVisible(), 'Explorer participants integrated');
    await viewer.evaluate(() => window.LarkEditorShare.editor().setCursor({ line: 2, ch: 3 }));
    await host.waitForFunction(() => document.querySelectorAll('.share-cursor').length > 0);
    check(true, 'Live cursor rendered');
    const endpoint = async (url, values, headers = {}) => {
      const response = await fetch(url + '/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lark': '1', ...headers }, body: JSON.stringify(values) });
      return { status: response.status, data: await response.json() };
    };
    check((await endpoint(servers[1].url, { action: 'decide', device: 'fake', approve: true })).status === 403, 'Guest local bridge cannot administer host');
    check((await endpoint(servers[0].url, { action: 'status' }, { Origin: 'https://untrusted.example' })).status === 403, 'Cross-origin control rejected');
    const malformed = await fetch(servers[0].url + '/api/share', { method: 'POST', headers: { 'X-Lark': '1' }, body: 'x'.repeat(16 * 1024 + 1) });
    check(malformed.status === 413, 'Oversized local control rejected');
    const hostStatus = await endpoint(servers[0].url, { action: 'status' });
    const project = hostStatus.data.project;
    const peerDevice = hostStatus.data.session.participants.find(p => p.name === 'Viewer');
    const originalPath = await host.evaluate(() => window.LarkEditorShare.current().path);
    const alternate = await viewer.evaluate(path => [...window.LarkShareEditing.debug().session.paths].find(p => p !== path), originalPath);
    await viewer.evaluate(path => window.LarkEditorShare.open(path), alternate);
    await viewer.waitForFunction(() => !window.LarkEditorShare.editor().getOption('readOnly'));
    await insert(viewer, '// SECOND-FILE\n');
    await host.evaluate(id => window.LarkShareEditing.follow(id), peerDevice.id);
    try {
      await host.waitForFunction(path => window.LarkEditorShare.current().path === path && window.LarkEditorShare.editor().getValue().includes('// SECOND-FILE'), alternate);
    } catch (error) {
      for (const page of [host, viewer]) console.error(await page.evaluate(() => ({ path: window.LarkEditorShare.current().path, prefix: window.LarkEditorShare.editor().getValue().slice(0, 100), documents: [...window.LarkShareEditing.debug().documents].map(([path, entry]) => ({ path, pending: entry.pending.length, revision: entry.revision, role: entry.role })), error: document.querySelector('.share-error').textContent })));
      console.error((await endpoint(servers[0].url, { action: 'status' })).data.session.participants);
      throw error;
    }
    check(true, 'Follow navigates to a different synchronized file');
    await host.evaluate(() => window.LarkShareEditing.follow(null));
    check(await host.getByRole('button', { name: 'Stop following', exact: true }).isHidden(), 'Follow can be stopped');
    for (const page of [host, viewer]) await page.evaluate(path => window.LarkEditorShare.open(path), originalPath);
    for (const page of [host, viewer]) await page.waitForFunction(() => window.LarkEditorShare.editor().getValue().includes('// OFFLINE'));
    check(await value(host) === await value(viewer), 'File switching preserves synchronized documents');
    const current = await host.evaluate(() => window.LarkEditorShare.current().path);
    const staleSave = await fetch(servers[0].url + '/api/projects/' + project + '/file', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Lark': '1' }, body: JSON.stringify({ path: current, content: 'stale' }) });
    check(staleSave.status === 409, 'Legacy full-file save cannot overwrite CRDT');
    const run = await fetch(servers[0].url + '/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lark': '1' }, body: JSON.stringify({ project }) });
    check(run.status === 409, 'Host must review collaborator-modified code before execution');
    check(await fs.readFile(path.join(servers[0].home, '.lark', 'projects', project, current), 'utf8') === await value(host), 'Host disk equals converged source');
    await insert(host, '// SCROLL-FIXTURE\n' + '// filler\n'.repeat(180));
    for (const page of [host, viewer]) await page.waitForFunction(() => window.LarkEditorShare.editor().getValue().includes('// SCROLL-FIXTURE') && !window.LarkShareEditing.pending());
    const scrollAway = page => page.evaluate(() => {
      const cm = window.LarkEditorShare.editor(); cm.setCursor({ line: 0, ch: 0 }); cm.scrollTo(0, 1200);
      return cm.getScrollInfo().top;
    });
    const scrolled = await Promise.all([scrollAway(host), scrollAway(viewer)]);
    check(scrolled.every(top => top > 1000), 'Long shared files have a scrollable viewport');
    await host.waitForTimeout(1400);
    for (const [i, page] of [host, viewer].entries()) {
      const top = await page.evaluate(() => window.LarkEditorShare.editor().getScrollInfo().top);
      check(Math.abs(top - scrolled[i]) < 2, 'Idle Share polling preserves independently scrolled host/guest viewports');
    }
    await insert(viewer, '// SCROLL-REMOTE\n');
    await host.waitForFunction(() => window.LarkEditorShare.editor().getValue().includes('// SCROLL-REMOTE'));
    check(Math.abs(await host.evaluate(() => window.LarkEditorShare.editor().getScrollInfo().top) - scrolled[0]) < 2, 'Remote editing preserves the host viewport with its caret offscreen');
    const device = hostStatus.data.session.participants.find(p => p.name === 'Viewer');
    await endpoint(servers[0].url, { action: 'decide', device: device.id, approve: true, role: 'viewer' });
    await viewer.waitForFunction(() => window.LarkEditorShare.editor().getOption('readOnly') === true);
    const viewerTop = await scrollAway(viewer); await viewer.waitForTimeout(1200);
    check(Math.abs(await viewer.evaluate(() => window.LarkEditorShare.editor().getScrollInfo().top) - viewerTop) < 2, 'Read-only Share viewers can scroll freely');
    const forged = await endpoint(servers[1].url, { action: 'sync', writer: 'a'.repeat(32), path: current, since: 0, operation: { seq: 999, actor: 'forged', after: '', text: 'forged', remove: [] } });
    check(forged.status === 403, 'Viewer writes denied by Java backend');
    await host.locator('#share-open').click();
    await hd.getByRole('button', { name: 'Participants', exact: true }).click();
    await host.setViewportSize({ width: 375, height: 812 });
    check(await host.evaluate(() => { const r = document.querySelector('.share-dialog').getBoundingClientRect(); return r.width <= innerWidth && r.left >= 0; }), 'Compact dialog fits mobile width');
    await hd.getByRole('button', { name: 'Revoke access', exact: true }).click();
    const denied = await endpoint(servers[1].url, { action: 'files' });
    check(denied.status === 403, 'Revoked viewer cannot fetch files');
    await hd.getByRole('button', { name: 'Security', exact: true }).click();
    await hd.getByRole('heading', { name: 'Connection security', exact: true }).waitFor();
    check((await hd.textContent()).includes('always enabled'), 'Mandatory security displayed');
    host.once('dialog', dialog => dialog.accept());
    await hd.getByRole('button', { name: 'End Session', exact: true }).click();
    await hd.getByRole('status').filter({ hasText: 'Disconnected' }).waitFor();
    check(pageErrors.length === 0, 'No browser script errors: ' + pageErrors.join('; '));
    const joinAgain = await endpoint(servers[1].url, { action: 'status' });
    check(joinAgain.data.connection === 'Reconnecting' || joinAgain.data.connection === 'Connection Lost', 'Host shutdown visible to guest');
    await endpoint(servers[1].url, { action: 'leave' });
    console.log('Share browser: ' + checks + ' checks passed (two isolated packaged IDE instances).');
  } finally {
    if (browser) await browser.close();
    for (const server of servers) { server.process.kill(); await new Promise(resolve => { if (server.process.exitCode != null) resolve(); else server.process.once('exit', resolve); }); }
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
