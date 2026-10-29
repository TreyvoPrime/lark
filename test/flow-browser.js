/* Run using playwright-cli run-code with this file's contents against the isolated live demo. */
async page => {
  const results=[];
  const assert=(v,label)=>{if(!v)throw new Error(label);results.push(label);};
  const root=page.locator('#lark-flow');
  if(!await root.count()) {await page.getByRole('button',{name:'Extras',exact:true}).click();await page.getByRole('button',{name:'Lark Flow…',exact:true}).click();}
  await root.locator('.flow-node').first().waitFor();
  await root.getByRole('combobox',{name:'Flow method'}).selectOption({label:'library.Book.lend()'});
  await root.getByRole('button',{name:'Fit',exact:true}).click();
  assert(await root.locator('.flow-node.decision').count()>0,'AST produces a real decision');
  await root.locator('.flow-node.decision').first().click();
  assert(await page.evaluate(()=>document.querySelector('#editor .CodeMirror').CodeMirror.getSelection().length)>0,'Node selects exact source');
  const transform=()=>root.locator('.flow-canvas>svg:not(.flow-map)>g').getAttribute('transform');
  const initial=await transform();await root.getByRole('button',{name:'Zoom in',exact:true}).click();assert(await transform()!==initial,'Zoom in');
  const larger=await transform();await root.getByRole('button',{name:'Zoom out',exact:true}).click();assert(await transform()!==larger,'Zoom out');
  await root.getByRole('button',{name:'Reset zoom',exact:true}).click();assert((await transform()).includes('scale(1)'),'Reset zoom');
  await root.getByRole('button',{name:'Fit',exact:true}).click();
  await root.getByRole('button',{name:'Trace path',exact:true}).click();
  assert(await root.locator('.dimmed').count()>0,'Trace dims unselected routes');
  await root.locator('.flow-edge[role=button]').filter({hasText:'True'}).first().press('Enter');
  assert(await root.locator('.flow-edge.traced').count()>0,'Branch selection extends static trace');
  await root.getByRole('button',{name:'Reset path',exact:true}).click();
  assert((await root.locator('.flow-status').textContent()).includes('Static trace'),'Reset trace');
  await root.getByRole('button',{name:'Trace path',exact:true}).click();
  await root.getByRole('button',{name:'Structure',exact:true}).click();assert(await root.locator('.flow-structure').isVisible(),'Program structure opens');
  await root.getByRole('button',{name:'Structure',exact:true}).click();assert(!await root.locator('.flow-structure').isVisible(),'Program structure closes');
  await root.locator('.flow-breadcrumb').getByRole('button',{name:'Project',exact:true}).click();
  assert(await root.locator('.flow-node').count()>10,'Project relationships');
  await root.getByRole('button',{name:'Fit',exact:true}).click();
  await root.locator('.flow-node').filter({hasText:'library.Book.lend()'}).dblclick();
  assert((await root.getByRole('combobox',{name:'Flow method'}).inputValue()).includes('Book.lend'),'Double-click drills into a method');
  await root.locator('.flow-breadcrumb').getByRole('button',{name:'library.Book',exact:true}).click();assert(await root.locator('.flow-node').count()===7,'Class view contains class methods');
  await root.getByRole('combobox',{name:'Flow method'}).selectOption({label:'library.Book.lend()'});
  await root.getByRole('button',{name:'Fit',exact:true}).click();
  const first=await root.locator('.flow-node').first().getAttribute('transform');
  const box=await root.locator('.flow-node').first().boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+15,{steps:4});await page.mouse.up();
  assert(await root.locator('.flow-node').first().getAttribute('transform')!==first,'Manual node dragging');
  await root.getByRole('button',{name:'Auto layout',exact:true}).click();assert(await root.locator('.flow-node').first().getAttribute('transform')===first,'Auto layout restores positions');
  const beforeMap=await transform();await root.locator('.flow-map').click({position:{x:25,y:25}});assert(await transform()!==beforeMap,'Minimap navigation');
  await root.getByRole('button',{name:'Fit',exact:true}).click();
  for(const type of ['SVG','PNG']) {
    const download=page.waitForEvent('download');await root.getByRole('button',{name:type,exact:true}).click();const file=await download;
    assert((await file.failure())===null,'Export '+type);
  }
  // Edit only the isolated sample project, then restore it even if a check fails.
  await root.locator('.flow-node.decision').first().click();
  const original=await page.evaluate(()=>document.querySelector('#editor .CodeMirror').CodeMirror.getValue());
  try {
    const count=await root.locator('.flow-node').count();
    await page.evaluate(()=>document.querySelector('#editor .CodeMirror').CodeMirror.setValue('class Broken { void x( {'));
    await page.waitForFunction(()=>document.querySelector('.flow-status')?.textContent.includes('out of date'));
    assert(await root.locator('.flow-node').count()===count,'Invalid edits retain previous graph');
    await page.evaluate(text=>document.querySelector('#editor .CodeMirror').CodeMirror.setValue(text),original);
    await root.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.flow-status')?.textContent.match(/Analyzing|out of date/));
    assert(await root.locator('.flow-node').count()>0,'Live refresh recovers after syntax repair');
  } finally {await page.evaluate(text=>document.querySelector('#editor .CodeMirror').CodeMirror.setValue(text),original);}
  await root.getByRole('button',{name:'Refresh',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.flow-status')?.textContent.includes('Analyzing'));
  await root.getByRole('button',{name:'Follow editor',exact:true}).click();assert(await root.getByRole('button',{name:'Follow editor',exact:true}).getAttribute('aria-pressed')==='false','Follow toggle off');
  await page.evaluate(()=>{const cm=document.querySelector('#editor .CodeMirror').CodeMirror;cm.setCursor(cm.posFromIndex(cm.getValue().indexOf('return title;')));cm.focus();});
  await page.keyboard.press('Control+Shift+L');
  assert((await root.getByRole('combobox',{name:'Flow method'}).inputValue()).includes('Book.title()'),'Current-method command works with follow disabled');
  await root.getByRole('button',{name:'Follow editor',exact:true}).click();
  await page.evaluate(()=>{const cm=document.querySelector('#editor .CodeMirror').CodeMirror;const offset=cm.getValue().indexOf('onLoan = true');cm.setCursor(cm.posFromIndex(offset));});
  assert(await root.locator('.flow-node.selected').count()===1,'Editor cursor selects diagram statement');
  await root.getByRole('button',{name:'Fit',exact:true}).click();
  const chosen=await root.getByRole('combobox',{name:'Flow method'}).inputValue();
  await root.getByRole('button',{name:'Close Lark Flow',exact:true}).click();assert(await root.count()===0,'Close removes workspace and listeners');
  await page.getByRole('button',{name:'Extras',exact:true}).click();await page.getByRole('button',{name:'Lark Flow…',exact:true}).click();
  await root.locator('.flow-node').first().waitFor();assert(await root.getByRole('combobox',{name:'Flow method'}).inputValue()===chosen,'Selected method restored');
  await page.evaluate(r=>window.__flowBrowserResults=r,results);
}
