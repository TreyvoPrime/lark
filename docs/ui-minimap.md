# Desktop UI polish and code minimap

Lark keeps its existing workspace and CodeMirror 5 editor. The shared desktop styling in `web/css/ide-polish.css` gives toolbars, menus, Explorer, tabs, Assist, output/debug/test controls, dialogs, and settings consistent spacing, borders, focus states, and compact dimensions. Graphite & Teal and Daylight have balanced text and syntax colors. The existing theme catalog remains available.

Panel dividers support arrow keys (Shift makes larger changes). Explorer, console, and outline sizes keep their existing persistence. The editor split now also remembers its proportion and supports keyboard resizing. Split editors stay within the available width, including with minimaps enabled. Menu arrows move focus; Escape closes a menu and returns focus to its trigger.

## Minimap

Open **Settings → Editor → Code minimap**. Options are saved with Lark's editor preferences:

- Show or hide the minimap (off by default; enabled in the development preview).
- Width: 64, 96, or 128 pixels.
- Position: left or right.
- Syntax colors on or off.
- Error and warning markers on or off. Search matches remain independent.

Click to jump, drag the viewport to scroll, or focus the minimap and use arrows, Page Up/Down, Home, and End. The ordinary editor scrollbar remains available. Each split editor tracks its own document, diagnostics, search query, and viewport.

CodeMirror 5 has no bundled native minimap. `web/js/minimap.js` reuses its tokenizer, document, search cursor, and scrolling APIs. The overview is a canvas of miniature character strokes. It compresses the complete file into the available height and paints offscreen before swapping frames. Editing is debounced; rendering and search marking yield between short animation-frame slices. Scrolling only moves the viewport indicator. Switching documents cancels stale work and clears old diagnostics. Hiding editors cancels work; disposing a minimap removes listeners and observers.

Very long individual lines (over 4,000 characters) use a short plain-color sample to bound tokenizer work. As with other minimaps, horizontal detail is limited to the chosen width. Existing code folding and wrapping remain editor features; the overview represents source lines.

## Verification

Checked on Windows in Chromium, October 28, 2026:

- All Java sources compile with `javac --release 17`.
- `node --check web/js/app.js`, `node --check web/js/minimap.js`, and `node test/java-parse.test.js` pass.
- Existing `lark.Check` Java assertions pass.
- `test/assist-browser.html`: 25 integration assertions pass, including insertion, Undo/Redo, drag cleanup, and large-file placement.
- `test/minimap-browser.html`: 18 assertions pass, including click/drag/keyboard navigation, settings, diagnostics, search, theme changes, document changes, edits, large-file rendering, and disposal.
- A 10,002-line synthetic document rendered in about 55–72 ms total CPU across short frames; maximum measured slice was 4.1–4.3 ms. In the last 60-edit run, synchronous edit time p95 was 1.4 ms with the minimap off and 1.8 ms with it on. These are local measurements, not a guarantee for all hardware; the default remains opt-in.
- Actual server: compiler diagnostics appear and clear; sample Run exits 0; Debug pauses at a breakpoint, steps, and continues to completion. This check found and fixed an existing breakpoint issue: packaged source files now send their qualified class name to jdb.
- Actual server: minimap click and native pointer drag, search matches, tab/split synchronization, settings persistence, keyboard panel resizing, and split proportion persistence checked.
- Visual inspection and screenshots at 1440×960, 900×700, and 720×800, in Graphite & Teal, Slate, and Daylight. Checked menus, settings, configuration dialog, context menu, output/debug panels, and split editors.

To run the browser integration checks, serve the repository as static files on localhost and open each HTML page under `test/`, then click **Run checks**. The actual IDE still requires its Java server.
