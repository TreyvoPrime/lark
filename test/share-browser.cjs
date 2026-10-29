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
  return { process, url };
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
    await hd.getByRole('button', { name: 'Host read-only session', exact: true }).click();
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
    check(!(await vd.getByRole('button', { name: 'Shared Source', exact: true }).count()), 'Source unavailable until approval');
    await hd.getByRole('button', { name: 'Refresh', exact: true }).click();
    await hd.getByRole('button', { name: 'Participants', exact: true }).click();
    await hd.getByRole('button', { name: 'Approve as Viewer', exact: true }).click();
    await vd.getByRole('button', { name: 'Refresh', exact: true }).click();
    await vd.getByRole('button', { name: 'Shared Source', exact: true }).click();
    await viewer.waitForFunction(() => document.querySelector('.share-source')?.textContent.includes('class'));
    check((await vd.getByLabel('File', { exact: true }).locator('option').count()) > 0, 'Approved source list');
    check((await vd.locator('.share-source').textContent()).includes('class'), 'Real Java source received via pinned TLS bridge');
    const endpoint = async (url, values, headers = {}) => {
      const response = await fetch(url + '/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lark': '1', ...headers }, body: JSON.stringify(values) });
      return { status: response.status, data: await response.json() };
    };
    check((await endpoint(servers[1].url, { action: 'decide', device: 'fake', approve: true })).status === 403, 'Guest local bridge cannot administer host');
    check((await endpoint(servers[0].url, { action: 'status' }, { Origin: 'https://untrusted.example' })).status === 403, 'Cross-origin control rejected');
    const malformed = await fetch(servers[0].url + '/api/share', { method: 'POST', headers: { 'X-Lark': '1' }, body: 'x'.repeat(16 * 1024 + 1) });
    check(malformed.status === 413, 'Oversized local control rejected');
    await host.setViewportSize({ width: 375, height: 812 });
    check(await host.evaluate(() => { const r = document.querySelector('.share-dialog').getBoundingClientRect(); return r.width <= innerWidth && r.left >= 0; }), 'Compact dialog fits mobile width');
    await hd.getByRole('button', { name: 'Revoke access', exact: true }).click();
    const denied = await endpoint(servers[1].url, { action: 'files' });
    check(denied.status === 403, 'Revoked viewer cannot fetch files');
    await hd.getByRole('button', { name: 'Security', exact: true }).click();
    check((await hd.textContent()).includes('Viewer only'), 'Security panel accurately states read-only permission');
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
