# Lark website

The official download site at **https://lark.rocks/**. This is plain HTML, CSS and JavaScript served from `docs/` by the existing GitHub Pages setup. `CNAME` and `.nojekyll` are preserved. No framework, package installation, build, or bundler is required. IDE source and assets live separately in `web/` and `src/`.

## Preview and checks

From the repository root:

```sh
node test/serve-site.cjs
# http://127.0.0.1:8768/
node --check docs/site.js
node --check docs/releases.js
node --check docs/typing.js
node test/site-releases.test.cjs
node test/site-structure.test.cjs
```

Browser checks, with Playwright CLI available and the preview running:

```sh
playwright-cli -s=lark-site open http://127.0.0.1:8768/
playwright-cli -s=lark-site run-code --filename=test/site-browser.js
```

The browser suite covers 375, 768, 1024, 1440, and 1920px layouts, tab keyboard navigation, mobile menus, OS detection, API failure, reduced motion, images, documentation, and no-JavaScript download links. The site is intentionally dark; there is no inactive theme control.

## Structure

- `index.html`: beginner-focused hero with code typed inside the actual IDE recording, features, Assist/UML spotlights, dedicated Scratch and Flow sections, downloads, getting started, open source, five-person team, Mobile mention, and footer.
- `guide/index.html`: actual installation and first-project instructions at `/guide/`.
- `site.css`: responsive graphite/teal styling, focus states and reduced motion.
- `site.js`: mobile navigation, active section, platform selection, and release rendering.
- `typing.js`: controls the real IDE recording with Play/Pause and Replay. It loads only when visible, pauses offscreen or in a hidden tab, and shows the complete static screenshot for reduced motion, playback errors, or no JavaScript. A text description explains the silent demonstration for screen readers.
- `releases.js`: verified fallback metadata plus bounded GitHub release refresh. Update archives are excluded from installation choices.
- `media/lark-current.png`: the new logo, copied from the IDE favicon; old triangle assets are not referenced by the redesigned pages.
- `media/screenshots/`: distinct, actual IDE captures of a study timer, garden-planner Assist, temperature Scratch experiment, cafe UML, and museum-ticket Flow preview. Originals are captured at 1440px wide, optimized as WebP; dimensions are reserved in HTML. Each screenshot appears once on the homepage.
- `media/screenshots/code-typing.webm`: an authentic silent recording of typing StudyTimer.java, running it, and displaying successful output. The full IDE remains visible; `code.webp` is the matching finished poster. This replaces the separate animated code sample. The clip plays once and uses native browser video decoding, with no animation library.
- `media/social.png`:1200×630 sharing image using the actual new logo.
- `sitemap.xml`, `robots.txt`: homepage and guide discovery.
- `release-audit.md`: URL verification, binary-version findings, and platform limitations.

Homepage navigation uses functional anchors rather than duplicate feature/download/about pages. Changelog and source links lead directly to GitHub.

## Publishing

GitHub Pages publishes `docs/` from `main` to `https://lark.rocks/`. Push the verified website files to `main`, then check the repository's **pages build and deployment** run before verifying the live homepage, guide, downloads, and IDE recording. Preserve `CNAME` and `.nojekyll`; the existing domain configuration does not need to change.

## Release maintenance

The latest release4.0.1 currently has updates only. Existing Windows installers published under tag4.0 contain base app3.9.7.36; macOS/Linux full bundles also contain3.9.7.36. The download UI reports this accurately. See the audit before changing version labels.

When full installers are published, inspect their contents and update the verified fallback snapshot, actual app versions, architectures and sizes in `releases.js`. Live GitHub data updates availability, but unknown binary metadata is explicitly left unspecified. Review the static no-JavaScript links and installation guide at the same time.

Never replace tagged verified links with invented `releases/latest/download` filenames. An update-only latest release does not contain fresh-install packages.

## Asset and release limitations

- The existing website supplied no real team portraits. Its placeholder asset is retained in circular frames with initials; replace the five image paths with approved photographs when supplied. Keep the founder third on desktop. Emilia's role remains Web Systems & Development as requested.
- Lark Flow is a working development feature, not in the published 4.0.1 release. Its standalone section, caption and guide are explicitly labeled preview.
- The screenshots of released tools were captured from the current local4.0.1 workspace; no editor interface was fabricated.
- No native Apple Silicon package or current Android APK was verified. The Mobile guide offers the verified Windows host package.
- Installation on every supported operating system and Lighthouse/Core Web Vitals field measurements are outside the performed checks.
