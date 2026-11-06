const {spawn} = require('node:child_process');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const {chromium} = require(process.env.LARK_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'lark-ui-test-'));
  const port = await new Promise(resolve => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const server = spawn('java', ['-Duser.home=' + home, '-Dlark.ui=jar', '-jar', path.resolve('dist/lark.jar'), '--no-browser', '--port', String(port)], {cwd:home});
  let browser;
  try {
    await new Promise((resolve, reject) => { let t=setTimeout(() => reject(Error('Startup timeout')),15000); server.stdout.on('data', b => {if (b.toString().includes('http://127.0.0.1:')) {clearTimeout(t);resolve();}}); server.once('exit', () => reject(Error('Server exited'))); });
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true});
    const page=await browser.newPage({viewport:{width:1200,height:800}}), errors=[];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + port); await page.locator('#boot').waitFor({state:'hidden'});
    const seeded = await page.evaluate(async () => {
      const project = (await (await fetch('/api/projects')).json()).projects[0];
      const response = await fetch('/api/projects/' + encodeURIComponent(project.id) + '/mkdir', {
        method:'POST', headers:{'Content-Type':'application/json','X-Lark':'1'}, body:JSON.stringify({path:'PreviewFolder'})
      });
      return response.ok;
    });
    assert(seeded, 'A test folder was created');
    await page.reload(); await page.locator('#boot').waitFor({state:'hidden'});
    await page.locator('#share-open').click();
    const dialog = page.locator('.share-dialog');
    await dialog.getByRole('button', { name: 'Host Session', exact: true }).click();
    await dialog.getByLabel('Session name', { exact: true }).fill('UI test');
    await dialog.getByLabel('Your display name', { exact: true }).fill('Tester');
    await dialog.getByRole('button', { name: 'Host session', exact: true }).click();
    await dialog.getByLabel('Private invitation', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForFunction(() => window.LarkEditorShare?.editor());
    const projects = await page.evaluate(async () => (await (await fetch('/api/projects')).json()).projects);
    const projectId = projects[0].id;
    await page.locator('.tree-row[data-path="PreviewFolder"]').click({button:'right'});
    await page.getByRole('button', {name:'Folder icon…'}).click();
    assert.equal(await page.locator('.folder-icon-grid button').count(), 8, 'All folder icon options have previews');
    await page.locator('.folder-icon-grid button').filter({hasText:'Favorite'}).click();
    assert.equal(await page.locator('.tree-row[data-path="PreviewFolder"] .tree-icon').textContent(), '★', 'Folder icon applies immediately');
    assert.equal(await page.locator('.folder-icon-grid button').filter({hasText:'Favorite'}).getAttribute('aria-pressed'), 'true');
    await page.locator('#modal-ok').click();
    const storedIcons = await page.evaluate(id => JSON.parse(localStorage.getItem('lark-folder-icons:' + id)), projectId);
    assert.equal(storedIcons.PreviewFolder, '★', 'Folder icon selection is saved');
    const reveal = file => page.evaluate(async body => {
      const response = await fetch('/api/project/reveal', {method:'POST', headers:{'Content-Type':'application/json','X-Lark':'1'}, body:JSON.stringify(body)});
      return response.status;
    }, {project:projectId,file});
    assert.equal(await reveal('no-such-file.java'), 404, 'Missing files fail cleanly');
    assert.equal(await reveal('../outside'), 400, 'File reveal cannot escape the project');
    if (process.env.LARK_TEST_REVEAL === '1') {
      assert.equal(await reveal(''), 200, 'The operating system accepts the project folder');
      const firstFile = await page.evaluate(async id => {
        const response = await fetch('/api/projects/' + encodeURIComponent(id));
        return (await response.json()).project.files.find(file => !file.binary).path;
      }, projectId);
      assert.equal(await reveal(firstFile), 200, 'The operating system accepts the current file');
    }

    await page.evaluate(() => {
      const body = Array.from({length:60}, (_, i) => `int value${i} = ${i};`).join('\n');
      window.LarkEditorShare.editor().setValue(`class Diagram { void work() {\n${body}\n} }`);
      document.querySelector('[data-extra=flow]').click();
    });
    await page.locator('#lark-flow .flow-node').first().waitFor();
    const diagramFits = await page.evaluate(() => {
      const svg = document.querySelector('#lark-flow .flow-canvas > svg');
      const viewport = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('.flow-node')].every(node => {
        const r = node.getBoundingClientRect();
        return r.left >= viewport.left - 2 && r.right <= viewport.right + 2 && r.top >= viewport.top - 2 && r.bottom <= viewport.bottom + 2;
      });
    });
    assert(diagramFits, 'Opening a large diagram fits all nodes in the viewport');
    await page.locator('#lark-flow button[aria-label="Close Lark Flow"]').click();

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {origin:'http://127.0.0.1:' + port});
    await page.evaluate(() => document.querySelector('#java-assist').click());
    const actions = page.locator('.assist-block-actions').first();
    await actions.selectOption('copy');
    await page.waitForFunction(() => document.querySelector('.assist-block-actions')?.value === 'copy');
    assert((await page.evaluate(() => navigator.clipboard.readText())).length > 0, 'Copy performs the selected action');
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#java-assist').click());
    assert.equal(await page.locator('.assist-block-actions').first().inputValue(), 'copy', 'Assist retains its selected action');
    await page.keyboard.press('Escape');

    const pushStatus = await page.evaluate(async project => {
      async function post(path, payload) {
        const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json','X-Lark':'1'}, body:JSON.stringify(payload)});
        return response.json();
      }
      const start = await post('/api/github/push/start', {project, owner:'owner', repo:'demo', branch:'main'});
      let status;
      for (let i=0; i<50; i++) {
        status = await post('/api/github/push/status', {id:start.id});
        if (status.status !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return status;
    }, projectId);
    assert.equal(pushStatus.status, 'error', 'Unauthenticated push reports an error');
    assert.match(pushStatus.error, /connect to github/i);

    await page.locator('#close-console').click(); assert(await page.locator('#center').evaluate(e => e.classList.contains('console-collapsed')));
    await page.locator('#console-toggle').click(); assert(!(await page.locator('#center').evaluate(e => e.classList.contains('console-collapsed'))));
    await page.locator('#files-toggle').click(); assert(await page.locator('#shell').evaluate(e => e.classList.contains('files-collapsed')));
    await page.locator('#files-toggle').click(); assert(!(await page.locator('#shell').evaluate(e => e.classList.contains('files-collapsed'))));
    let splitter = await page.locator('[data-split=files]').boundingBox();
    await page.mouse.move(splitter.x + 2, splitter.y + 60);
    await page.mouse.down(); await page.mouse.move(10, splitter.y + 60, {steps:8}); await page.mouse.up();
    assert(await page.locator('#shell').evaluate(e => e.classList.contains('files-collapsed')), 'Dragging the file divider closes the panel');
    await page.locator('#files-toggle').click();
    splitter = await page.locator('[data-split=console]').boundingBox();
    await page.mouse.move(splitter.x + 100, splitter.y + 4);
    await page.mouse.down(); await page.mouse.move(splitter.x + 100, splitter.y + 200, {steps:8}); await page.mouse.up();
    assert(await page.locator('#center').evaluate(e => e.classList.contains('console-collapsed')), 'Dragging the output divider closes the panel');
    await page.locator('#console-toggle').click();
    if (await page.locator('#toolbar-more').isVisible()) await page.locator('#toolbar-more summary').click();
    await page.locator('#settings').click();
    await page.locator('#scale-files').fill('130');
    if (process.env.LARK_UI_SCREENSHOT) await page.screenshot({path:process.env.LARK_UI_SCREENSHOT});
    assert.equal(await page.locator('#scale-files-out').textContent(), '130%');
    assert.equal(await page.evaluate(() => localStorage.getItem('lark-panel-scale-files')), '130');
    await page.locator('#scale-panels-reset').click();
    assert.equal(await page.locator('#scale-files-out').textContent(), '100%');
    await page.keyboard.press('Escape');
    const long = '// ' + 'ABCDEFGH'.repeat(150) + ' END_OF_LONG_LINE';
    await page.evaluate(value => window.LarkEditorShare.editor().setValue(value), long);
    await page.evaluate(() => document.querySelector('#code-image').click());
    await page.locator('#modal select[name=scope]').selectOption('full');
    const downloadPromise = page.waitForEvent('download'); await page.locator('#modal-ok').click();
    const download = await downloadPromise; const svg = await fs.readFile(await download.path(), 'utf8');
    assert(svg.includes('END_OF_LONG_LINE'), 'Long line must be included');
    const width = Number(svg.match(/<svg[^>]* width="(\d+)"/)[1]); assert(width > 4000, 'Full image extends beyond viewport');
    await page.evaluate(() => window.LarkEditorShare.editor().setSelection({line:0,ch:3}, {line:0,ch:11}));
    await page.evaluate(() => document.querySelector('#code-image').click());
    await page.locator('#modal select[name=scope]').selectOption('selected');
    const selectedDownload = page.waitForEvent('download'); await page.locator('#modal-ok').click();
    const selectedSvg = await fs.readFile(await (await selectedDownload).path(), 'utf8');
    assert(selectedSvg.includes('ABCDEFGH') && !selectedSvg.includes('END_OF_LONG_LINE'), 'Selected export contains only selected code');
    await page.evaluate(() => {
      const editor = window.LarkEditorShare.editor();
      editor.setValue('FIRST_LINE\nSECOND_LINE');
      editor.setSelection({line:0,ch:0}, {line:1,ch:0});
    });
    await page.evaluate(() => document.querySelector('#code-image').click());
    await page.locator('#modal select[name=scope]').selectOption('selected');
    const lineDownload = page.waitForEvent('download'); await page.locator('#modal-ok').click();
    const lineSvg = await fs.readFile(await (await lineDownload).path(), 'utf8');
    assert(lineSvg.includes('FIRST_LINE') && !lineSvg.includes('SECOND_LINE'), 'A selection ending at the next line preserves the selected line');
    await page.evaluate(value => window.LarkEditorShare.editor().setValue(value), long);
    await page.evaluate(() => { const editor = window.LarkEditorShare.editor(); editor.scrollTo(400, 0); });
    await page.evaluate(() => document.querySelector('#code-image').click());
    await page.locator('#modal select[name=scope]').selectOption('visible');
    const visibleDownload = page.waitForEvent('download'); await page.locator('#modal-ok').click();
    const visibleSvg = await fs.readFile(await (await visibleDownload).path(), 'utf8');
    assert(visibleSvg.includes('clipPath') && Number(visibleSvg.match(/<svg[^>]* width="(\d+)"/)[1]) < width, 'Visible export is clipped to the editor viewport');
    await page.evaluate(() => document.querySelector('#share-open').click());
    page.once('dialog', prompt => prompt.accept());
    await dialog.getByRole('button', {name:'End Session', exact:true}).click();
    await dialog.getByRole('status').filter({hasText:'Disconnected'}).waitFor();
    await dialog.getByRole('button', {name:'Close', exact:true}).click();
    await page.evaluate(() => window.LarkEditorShare.editor().setValue('package app; public class Main { public static void main(String[] args) throws Exception { System.out.println("RUNNING"); Thread.sleep(20000); } }'));
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#console-out')?.textContent.includes('RUNNING'), null, {timeout:10000})
      .catch(async error => { throw new Error(error.message + '\nOutput: ' + await page.locator('#console-out').textContent() + '\nNotice: ' + await page.locator('#toasts').textContent()); });
    await page.locator('#close-console').click();
    assert((await page.locator('#run').textContent()).includes('Stop'), 'Closing Output leaves the running program active');
    await page.locator('#console-toggle').click();
    await page.locator('#run').click();
    await page.route('**/api/github/token', route => route.fulfill({json:{ok:true,login:'test-owner'}}));
    await page.route('**/api/github/repos', route => route.fulfill({json:{ok:true,repos:[]}}));
    let sent;
    await page.route('**/api/github/push/start', route => {
      sent = route.request().postDataJSON();
      return route.fulfill({json:{ok:true,id:'test-job'}});
    });
    await page.route('**/api/github/push/status', route => route.fulfill({json:{ok:true,status:'done',result:{url:'https://github.com/test-owner/demo/commit/test',files:1,branch:'trunk'}}}));
    await page.evaluate(() => document.querySelector('#github').click());
    await page.locator('#gh-token').fill('test-token'); await page.locator('#gh-save').click();
    await page.locator('#gh-new-repo').click();
    await page.locator('#modal input[name=repo]').fill('demo');
    await page.locator('#modal input[name=description]').fill('Example project');
    await page.locator('#modal select[name=visibility]').selectOption('public');
    await page.locator('#modal-ok').click();
    await page.locator('#gh-result a').waitFor();
    assert(sent.create && sent.repo === 'demo' && sent.description === 'Example project' && !sent.private, 'Publish sends the selected repository options');
    assert((await page.locator('#gh-target').textContent()).includes('trunk'), 'Publish remembers the returned default branch');
    assert.deepEqual(errors, []); console.log('Desktop panels, scale controls, and full-width, selected, and visible SVG export checks passed.');
  } finally { if(browser) await browser.close(); if (server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited; } await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:200}); }
})().catch(e => { console.error(e); process.exitCode=1; });
