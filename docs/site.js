/* Progressive enhancement: ordinary links remain usable without this script. */
(() => {
  'use strict';
  document.documentElement.classList.add('enhanced');
  const menu = document.querySelector('.menu-toggle'), nav = document.getElementById('navigation');
  if (menu && nav) {
    const close = () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); };
    menu.addEventListener('click', () => { const open = !nav.classList.contains('open'); nav.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)); });
    nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('open')) { close(); menu.focus(); } });
    document.addEventListener('click', event => { if (!event.target.closest('.header')) close(); });
    matchMedia('(min-width: 801px)').addEventListener('change', close);
  }
  function tabs(list, activate) {
    const buttons = [...list.querySelectorAll('[role=tab]')];
    function pick(button, focus = false) {
      buttons.forEach(b => { b.setAttribute('aria-selected', String(b === button)); b.tabIndex = b === button ? 0 : -1; });
      if (focus) button.focus(); activate(button);
    }
    buttons.forEach((button, i) => {
      button.addEventListener('click', () => pick(button));
      button.addEventListener('keydown', event => {
        let index;
        if (['ArrowRight', 'ArrowDown'].includes(event.key)) index = (i + 1) % buttons.length;
        if (['ArrowLeft', 'ArrowUp'].includes(event.key)) index = (i + buttons.length - 1) % buttons.length;
        if (event.key === 'Home') index = 0;
        if (event.key === 'End') index = buttons.length - 1;
        if (index !== undefined) { event.preventDefault(); pick(buttons[index], true); }
      });
    });
    return pick;
  }
  if (typeof IntersectionObserver === 'function' && document.getElementById('features')) {
    const links = [...document.querySelectorAll('#navigation a[href^="#"]')];
    const visible = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visible.set(entry.target.id, entry.isIntersecting));
      const active = links.find(a => visible.get(a.hash.slice(1)));
      links.forEach(a => { if (a === active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    }, { rootMargin: '-72px 0px -55% 0px' });
    links.forEach(a => { const target = document.querySelector(a.hash); if (target) observer.observe(target); });
  }
  const release = window.LarkReleases, packageList = document.getElementById('package-list');
  if (!release || !packageList) return;
  const names = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
  const ua = navigator.userAgent || '', platform = navigator.userAgentData?.platform || navigator.platform || '';
  const phone = /Android|iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1);
  let selected = !phone && /Mac/i.test(platform) ? 'macos' : !phone && /Linux/i.test(platform) ? 'linux' : 'windows';
  let data = release.fallback;
  const element = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
  const link = (text, href, cls) => { const el = element('a', text, cls); el.href = href; return el; };
  const size = bytes => (bytes / 1048576).toFixed(1) + ' MiB';
  function render() {
    const focusedHref = packageList.contains(document.activeElement) ? document.activeElement.closest('a')?.href : null;
    const packages = release.selectPackages(data, selected);
    packageList.replaceChildren();
    document.getElementById('download-panel').setAttribute('aria-labelledby', 'platform-' + selected);
    if (!packages.length) {
      const box = element('div', '', 'download-package');
      box.append(element('h3', 'No verified package available'), element('p', 'A full ' + names[selected] + ' package was not found in the published releases.'), link('Browse GitHub releases ↗', 'https://github.com/TreyvoPrime/lark/releases', 'text-link'));
      packageList.append(box);
    }
    packages.forEach((pkg, index) => {
      const box = element('article', '', index === 0 ? 'download-package' : 'alternative');
      const version = pkg.packageVersion ? 'Base app ' + pkg.packageVersion : 'Release ' + pkg.releaseTag + ' · app version: see notes';
      if (index === 0) {
        box.append(element('p', (pkg.recommended ? 'Recommended · ' : '') + names[selected] + ' · ' + pkg.architecture, 'eyebrow'), element('h3', 'Lark Desktop'), element('p', pkg.label + ' · ' + size(pkg.bytes)), element('p', version + ' · Published under ' + pkg.releaseTag, 'small muted'), element('p', pkg.requirements, 'small muted'));
        const actions = element('div', '', 'actions');
        actions.append(link('Download ' + (pkg.kind === 'setup' ? 'Windows installer' : names[selected] + ' ZIP') + ' ↓', pkg.url, 'button'), link('Release notes ↗', pkg.releaseUrl, 'text-link'));
        box.append(actions);
      } else {
        const label = element('div'); label.append(element('h3', pkg.label), element('p', version + ' · ' + pkg.architecture + ' · ' + size(pkg.bytes)));
        box.append(label, link('Download ZIP ↓', pkg.url, 'button secondary'));
      }
      packageList.append(box);
    });
    document.getElementById('latest-version').textContent = data.latest.version;
    document.getElementById('latest-notes').href = data.latest.url;
    document.getElementById('update-description').textContent = data.latest.updateOnly ? 'It contains updates for existing installations. Install a full package above, then update in Lark.' : 'Read the release notes for changes and installation instructions.';
    document.getElementById('release-status').textContent = data.stale ? 'Showing verified package details from October 31, 2026. Live release information is unavailable.' : 'Release availability checked with GitHub. Package sizes come from the published assets.';
    const hero = document.querySelector('#hero-download span'); if (hero) hero.textContent = phone ? 'Choose a download' : 'Download for ' + names[selected];
    if (focusedHref) {
      const next = [...packageList.querySelectorAll('a')].find(a => a.href === focusedHref);
      (next || document.getElementById('download-panel')).focus({ preventScroll:true });
    }
  }
  const platforms = document.querySelector('.platforms'), mobileTabs = matchMedia('(max-width: 580px)');
  const orientation = () => platforms.setAttribute('aria-orientation', mobileTabs.matches ? 'horizontal' : 'vertical');
  mobileTabs.addEventListener('change', orientation); orientation();
  const choose = tabs(platforms, button => { selected = button.dataset.platform; render(); });
  choose(document.getElementById('platform-' + selected));
  release.load().then(fresh => { data = fresh; render(); }).catch(() => render());
})();
