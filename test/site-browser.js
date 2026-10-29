/* playwright-cli -s=lark-site run-code --filename=test/site-browser.js (preview on 8768). */
async page => {
  const checks = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:8768/');
  for (const width of [375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({width, height:900});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at ' + width);
    check(await page.locator('.member').count() === 5, 'Exactly five team members at ' + width);
  }
  check(await page.locator('.member').nth(2).locator('h3').textContent() === 'Treyvon Pearson', 'Founder centered in desktop source order');
  check((await page.locator('.member').nth(1).locator('.role').textContent()).includes('Web Systems'), 'Emilia title preserved');
  for (const platform of ['windows','macos','linux']) {
    await page.locator('[data-platform=' + platform + ']').click();
    check(await page.locator('#package-list a.button').count() > 0, platform + ' download exists');
    const urls = await page.locator('#package-list a.button').evaluateAll(nodes => nodes.map(n => n.href));
    check(urls.every(url => url.includes('/releases/download/') && !url.includes('update.zip')), platform + ' has real install asset URLs');
    check((await page.locator('#package-list').textContent()).includes('3.9.7.36'), platform + ' displays inspected base app version');
  }
  await page.locator('#platform-windows').focus(); await page.keyboard.press('ArrowDown');
  check(await page.locator('#platform-macos').getAttribute('aria-selected') === 'true', 'Platform keyboard navigation');
  check(await page.locator('#scratch img').isVisible(), 'Scratch has a visible dedicated showcase');
  check(await page.locator('#flow img').isVisible(), 'Flow has a visible dedicated showcase');
  check(await page.locator('#preview-note').isVisible(), 'Flow marked unreleased without opening a tab');
  const screenshots = await page.locator('.product-shot img').evaluateAll(images=>images.map(img=>img.src));
  check(new Set(screenshots).size === screenshots.length, 'Product screenshots are not repeated');
  const video = page.locator('#typing-video');
  await page.locator('.ide-recording').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const v=document.getElementById('typing-video');return v.readyState>=2 && !v.paused && v.currentTime>0;});
  check(await video.getAttribute('data-src') === 'media/screenshots/code-typing.webm', 'Hero uses the real IDE recording');
  check(await video.evaluate(v=>v.muted && v.playsInline && !v.loop), 'Recording is silent, inline, and does not loop');
  check(await video.isVisible() && !await page.locator('#typing-poster').isVisible(), 'Playing recording replaces the authentic poster');
  await page.locator('#typing-pause').click();
  await page.waitForFunction(()=>document.getElementById('typing-video').paused);
  const paused=await video.evaluate(v=>v.currentTime);
  await page.waitForTimeout(180);
  check(Math.abs(await video.evaluate(v=>v.currentTime)-paused)<.03, 'Recording pause freezes media time');
  await page.locator('#typing-pause').click();
  await page.waitForFunction(time=>document.getElementById('typing-video').currentTime>time+.1,paused);
  check(await page.locator('#typing-pause').textContent()==='Pause','Recording resumes');
  // Seek forward so replay is distinguishable from ordinary playback.
  await video.evaluate(v=>{v.currentTime=Math.min(3,v.duration/2);});
  await page.locator('#typing-replay').click();
  check(await video.evaluate(v=>v.currentTime<1 && !v.paused), 'Replay restarts real media from the beginning');
  await page.locator('#about').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.getElementById('typing-video').paused);
  const offscreen=await video.evaluate(v=>v.currentTime);
  await page.waitForTimeout(180);
  check(Math.abs(await video.evaluate(v=>v.currentTime)-offscreen)<.03, 'Offscreen recording stops advancing');
  await page.locator('.ide-recording').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>!document.getElementById('typing-video').paused);
  check(await video.evaluate(v=>!v.paused), 'Recording resumes when its frame is visible');
  // Simulate the hidden-tab signal: headless browsers do not reliably change tab visibility.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  check(await video.evaluate(v=>v.paused), 'Simulated hidden-tab signal pauses recording');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.getElementById('typing-video').paused);
  await video.evaluate(v=>{v.currentTime=v.duration-.08;});
  await page.waitForFunction(()=>document.getElementById('typing-video').ended);
  check(await video.evaluate(v=>v.paused && v.ended), 'Recording stops naturally at the end');
  check(await page.locator('#typing-pause').isDisabled(), 'Ended recording leaves Replay as the available action');
  await page.locator('#typing-replay').click();
  await page.waitForFunction(()=>{const v=document.getElementById('typing-video');return !v.paused&&!v.ended&&v.currentTime<2;});
  check(await video.evaluate(v=>!v.ended), 'Replay works after the recording ends');
  await page.setViewportSize({width:375,height:812});
  await page.waitForFunction(() => document.querySelector('.platforms').getAttribute('aria-orientation') === 'horizontal');
  check(await page.locator('.platforms').getAttribute('aria-orientation') === 'horizontal', 'Mobile platform orientation matches layout');
  await page.locator('.menu-toggle').click();
  check(await page.locator('#navigation').isVisible(), 'Mobile menu opens');
  await page.keyboard.press('Escape');
  check(!await page.locator('#navigation').isVisible(), 'Escape closes mobile menu');
  await page.locator('.menu-toggle').click(); await page.locator('#navigation a[href="#downloads"]').click();
  check(!await page.locator('#navigation').isVisible() && page.url().includes('#downloads'), 'Mobile navigation follows anchor and closes');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.getElementById('typing-poster').hidden && document.getElementById('typing-video').hidden && !document.getElementById('typing-video').hasAttribute('src'));
  check(await page.locator('.hero-shot').evaluate(el => getComputedStyle(el).animationName) === 'none', 'Reduced motion removes hero animation');
  check(await page.locator('#typing-poster').isVisible() && !await video.isVisible(), 'Reduced motion shows the authentic static poster');
  check(await video.getAttribute('src')===null && await video.evaluate(v=>v.paused), 'Reduced motion removes the video source and stops playback');
  check(!await page.locator('.typing-controls').isVisible(), 'Reduced motion removes recording controls');
  await page.emulateMedia({reducedMotion:'no-preference'});
  // API failure must preserve usable, verified downloads.
  await page.route('https://api.github.com/**', route => route.abort());
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#release-status').textContent.includes('unavailable'));
  check(await page.locator('#package-list a.button').count() > 0, 'API failure keeps verified fallback downloads');
  await page.goto('http://127.0.0.1:8768/guide/');
  for (const width of [375,768,1024,1440,1920]) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Guide fits ' + width);
  }
  const guideAnchors = await page.locator('.guide-sidebar a').evaluateAll(nodes => nodes.map(a => a.hash));
  check(await page.evaluate(hashes => hashes.every(hash => document.getElementById(hash.slice(1))),guideAnchors), 'All guide topic links resolve');
  await page.goto('http://127.0.0.1:8768/');
  // Force lazy images to load before verifying the local assets.
  await page.locator('img').evaluateAll(images => images.forEach(img => img.loading='eager'));
  await page.waitForFunction(() => [...document.images].every(img => img.complete));
  check(await page.evaluate(() => [...document.images].every(img => img.naturalWidth>0)), 'All homepage images load');
  check(await page.locator('h1').count() === 1, 'Single semantic main heading');
  check((await page.locator('link[rel=canonical]').getAttribute('href')) === 'https://lark.rocks/', 'Canonical URL');
  check(await page.locator('script[type="application/ld+json"]').evaluate(el=>JSON.parse(el.textContent)['@type']) === 'SoftwareApplication','Valid software structured data');
  check(errors.length === 0, 'No browser JavaScript errors');
  await page.unrouteAll();
  // No JavaScript: menus and direct package links still work.
  const plain = await page.context().browser().newContext({javaScriptEnabled:false, viewport:{width:375,height:812}});
  const basic = await plain.newPage(); await basic.goto('http://127.0.0.1:8768/');
  check(await basic.locator('#navigation').isVisible(), 'Mobile navigation without JavaScript');
  check(await basic.locator('a[href$="lark-desktop-mac.zip"]').isVisible(), 'Direct macOS download without JavaScript');
  check(await basic.locator('a[href$="lark-desktop-linux.zip"]').isVisible(), 'Direct Linux download without JavaScript');
  check(await basic.locator('#typing-poster').isVisible(), 'Authentic hero poster remains visible without JavaScript');
  check(await basic.locator('#typing-video').getAttribute('src')===null && !await basic.locator('.typing-controls').isVisible(), 'No JavaScript leaves no video request or dead media controls');
  await plain.close();
  // Reduced motion from the first load must not request the recording at all.
  const stillContext = await page.context().browser().newContext({reducedMotion:'reduce',viewport:{width:1440,height:900}});
  const still = await stillContext.newPage(); let mediaRequests=0;
  await still.route('**/code-typing.webm',route=>{mediaRequests++;return route.abort();});
  await still.goto('http://127.0.0.1:8768/');await still.locator('.ide-recording').scrollIntoViewIfNeeded();
  check(await still.locator('#typing-video').getAttribute('src')===null && mediaRequests===0, 'Initial reduced motion avoids downloading the video');
  check(await still.locator('#typing-poster').isVisible(), 'Initial reduced motion preserves the poster');
  await stillContext.close();
  // Failed media must gracefully retain the real screenshot.
  const brokenContext = await page.context().browser().newContext({reducedMotion:'no-preference',viewport:{width:1440,height:900}});
  const broken = await brokenContext.newPage();
  await broken.route('**/code-typing.webm',route=>route.abort());
  await broken.goto('http://127.0.0.1:8768/');await broken.locator('.ide-recording').scrollIntoViewIfNeeded();
  await broken.waitForFunction(()=>document.getElementById('typing-video').error!==null);
  check(await broken.locator('#typing-poster').isVisible() && !await broken.locator('#typing-video').isVisible(), 'Video-load failure falls back to the authentic screenshot');
  check(!await broken.locator('.typing-controls').isVisible(), 'Video-load failure removes unusable controls');
  await brokenContext.close();
  // Independent browser contexts exercise OS detection without changing the real machine.
  for (const [os, expected] of [['macOS','macos'],['Linux','linux'],['Windows','windows']]) {
    const context=await page.context().browser().newContext();
    await context.addInitScript(value=>Object.defineProperty(navigator,'userAgentData',{value:{platform:value}}),os);
    const tab=await context.newPage();await tab.route('https://api.github.com/**',route=>route.abort());await tab.goto('http://127.0.0.1:8768/');
    check(await tab.locator('#platform-'+expected).getAttribute('aria-selected') === 'true', 'Detect '+os);
    await context.close();
  }
  await page.evaluate(result => window.__siteTestResults=result,checks);
}
