/* Verified public release metadata. Update packages are never installation choices. */
(function (root) {
  'use strict';
  const repo = 'https://github.com/TreyvoPrime/lark';
  const definitions = {
    'LarkDesktopSetup.exe': { platform: 'windows', kind: 'setup', label: 'Windows installer', requirements: '64-bit Windows. Includes Java. Install, then check for updates in Lark.' },
    'lark-executable-windows.zip': { platform: 'windows', kind: 'portable', label: 'Portable Windows ZIP', requirements: 'Extract all files, then open Lark.exe. Keep the bundled app and jdk folders.' },
    'lark-desktop-windows.zip': { platform: 'windows', kind: 'desktop', label: 'Windows desktop ZIP', requirements: 'Extract all files and open Lark Desktop.exe. Includes Java.' },
    'lark-desktop-mac.zip': { platform: 'macos', kind: 'desktop', label: 'macOS desktop ZIP', requirements: 'Intel Mac (x64). Extract, then run Launch Lark Desktop.command. Includes Java. No native Apple Silicon package is verified.' },
    'lark-desktop-linux.zip': { platform: 'linux', kind: 'desktop', label: 'Linux desktop ZIP', requirements: 'Linux x64 with GNU libc. Extract, then run sh start-lark-desktop.sh. Includes Java.' },
    'lark-mobile-mac.zip': { platform: 'macos', kind: 'mobile', label: 'Lark Mobile host for macOS', requirements: 'Intel Mac x64. Java included. LAN execution requires a supported Linux sandbox host.' },
    'lark-mobile-linux.zip': { platform: 'linux', kind: 'mobile', label: 'Lark Mobile host for Linux', requirements: 'Linux x64. Java included. For LAN execution, install bubblewrap and util-linux and enable user namespaces.' },
    'lark-mobile-windows.zip': { platform: 'windows', kind: 'mobile', label: 'Lark Mobile host for Windows', requirements: 'Extract and run Start Lark Mobile. Connect your phone using the pairing URL on the same Wi-Fi.' }
  };
  const audited = [
    ['4.0', 'LarkDesktopSetup.exe', 47622522],
    ['4.0', 'lark-executable-windows.zip', 78936970],
    ['4.0', 'lark-desktop-windows.zip', 79106049],
    ['v3.9.7.36', 'lark-desktop-mac.zip', 69667394],
    ['v3.9.7.36', 'lark-desktop-linux.zip', 82222499],
    ['v3.9.7.36', 'lark-mobile-windows.zip', 77987948]
  ];
  const assetUrl = (tag, name) => repo + '/releases/download/' + encodeURIComponent(tag) + '/' + encodeURIComponent(name);
  const legacyFallback = {
    latest: { tag: 'v4.0.1', version: '4.0.1', url: repo + '/releases/tag/v4.0.1', updateOnly: true },
    packages: audited.map(([tag, name, bytes]) => ({ ...definitions[name], name, bytes, url: assetUrl(tag, name), releaseTag: tag, releaseUrl: repo + '/releases/tag/' + tag,
      // The Windows binaries on release 4.0 are byte-identical to 3.9.7.36.
      // Settings.VERSION in the downloaded Windows/macOS/Linux jars confirms this base version.
      version: '3.9.7.36', packageVersion: '3.9.7.36', architecture: 'x64', verified: true, recommended: name === 'LarkDesktopSetup.exe' })),
    checkedAt: '2026-10-29T00:46:00Z', source: 'verified snapshot', stale: true
  };
  const currentAssets = [["LarkDesktopSetup.exe", 47727909], ["lark-executable-windows.zip", 89212699], ["lark-desktop-windows.zip", 76457490], ["lark-desktop-mac.zip", 67614814], ["lark-desktop-linux.zip", 79364413], ["lark-mobile-windows.zip", 88438254], ["lark-mobile-mac.zip", 121856829], ["lark-mobile-linux.zip", 132403052]];
  const fallback = {
    latest: { tag: 'v4.0.5', version: '4.0.5', url: repo + '/releases/tag/v4.0.5', updateOnly: false },
    packages: currentAssets.map(([name, bytes]) => ({ ...definitions[name], name, bytes, url: assetUrl('v4.0.5', name), releaseTag: 'v4.0.5', releaseUrl: repo + '/releases/tag/v4.0.5', version: '4.0.5', packageVersion: '4.0.5', architecture: 'x64', verified: true, recommended: name === 'LarkDesktopSetup.exe' })),
    checkedAt: '2026-10-31T12:44:16Z', source: 'verified snapshot', stale: true
  };
  function validUrl(value, tag, name) {
    return typeof value === 'string' && value === assetUrl(tag, name);
  }
  function fromReleases(releases) {
    if (!Array.isArray(releases)) throw new Error('Invalid release response');
    const stable = releases.filter(r => r && !r.draft && !r.prerelease && typeof r.tag_name === 'string' && Array.isArray(r.assets))
      .sort((a, b) => Date.parse(b.published_at || '') - Date.parse(a.published_at || ''));
    if (!stable.length) throw new Error('No published releases');
    const found = new Map();
    for (const release of stable) {
      for (const asset of release.assets) {
        if (!asset || !Object.hasOwn(definitions, asset.name) || found.has(asset.name) || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || !validUrl(asset.browser_download_url, release.tag_name, asset.name)) continue;
        const verified = [...fallback.packages, ...legacyFallback.packages].find(p => p.url === asset.browser_download_url && p.bytes === asset.size);
        found.set(asset.name, { ...definitions[asset.name], name: asset.name, bytes: asset.size, url: asset.browser_download_url,
          releaseTag: release.tag_name, releaseUrl: repo + '/releases/tag/' + encodeURIComponent(release.tag_name),
          version: verified?.version || release.tag_name.replace(/^v/, ''), packageVersion: verified?.packageVersion || null, architecture: verified?.architecture || 'Not specified', verified: !!verified, recommended: asset.name === 'LarkDesktopSetup.exe',
          requirements: verified?.requirements || 'Check the release notes for architecture, requirements, and installation instructions.' });
      }
    }
    const latest = stable[0];
    const updateOnly = latest.assets.some(a => /update\.zip$/.test(a.name)) && latest.assets.every(a => /^(lark-(desktop-|executable-|mobile-)?update\.zip|update\.json)$/.test(a.name));
    return { latest: { tag: latest.tag_name, version: latest.tag_name.replace(/^v/, ''), url: repo + '/releases/tag/' + encodeURIComponent(latest.tag_name), updateOnly }, packages: [...found.values()], checkedAt: new Date().toISOString(), source: 'GitHub', stale: false };
  }
  function selectPackages(data, platform, options = {}) {
    const order = { setup: 0, portable: 1, desktop: 2, mobile: 3 };
    return (data?.packages || []).filter(p => p.platform === platform && (options.mobile ? p.kind === 'mobile' : p.kind !== 'mobile')).sort((a, b) => order[a.kind] - order[b.kind]);
  }
  async function fetchReleases(fetcher, timeout = 6000) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const releases = [];
      for (let page = 1; page <= 3; page++) {
        const response = await fetcher('https://api.github.com/repos/TreyvoPrime/lark/releases?per_page=20&page=' + page,
          { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } });
        if (!response.ok) throw new Error('Release service unavailable');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid release data');
        releases.push(...data);
        const catalog = fromReleases(releases);
        const complete = ['windows', 'macos', 'linux'].every(os => selectPackages(catalog, os).length > 0) && catalog.packages.some(p => p.kind === 'mobile');
        if (complete || data.length < 20 || page === 3) return catalog;
      }
    } catch (_) {
      return { ...fallback, stale: true };
    } finally { clearTimeout(timer); }
  }
  let pending;
  function load() { return pending || (pending = fetchReleases(root.fetch.bind(root))); }
  const api = { fallback, load, selectPackages, fromReleases, fetchReleases };
  root.LarkReleases = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
