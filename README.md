# Lark 3

Lark is a focused Java IDE: multi-file projects, live compile feedback, brace guide, small refactors, debugger, JUnit, and GitHub clone/push. Lighter than IntelliJ, more useful than a browser text box — deliberately not bloated.

## Downloads (three tracks)

| | **Lark Desktop** (default) | **Lark Executable** | **Lark Mobile** |
| --- | --- | --- | --- |
| **What it is** | Setup wizard install | Unzip → double-click **Lark.exe** | Touch-first edition |
| **GitHub file** | `LarkDesktopSetup.exe` | `lark-executable-windows.zip` | `lark-mobile-windows.zip` |
| **How to start** | Start Menu → **Lark Desktop** | **Lark.exe** only | **Start Lark Mobile** |
| **UI** | Full desktop IDE (app window) | Full desktop IDE | Bottom-tab Mobile UI |
| **Best for** | Everyday PC, Start Menu | Labs / USB / no `.bat` | Tablet + phone pair |

Download site: **[treyvoprime.github.io/lark-download](https://treyvoprime.github.io/lark-download/)**  
Releases: **[github.com/TreyvoPrime/lark/releases/latest](https://github.com/TreyvoPrime/lark/releases/latest)**

### Lark Desktop (default — Setup install)

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/LarkDesktopSetup.exe
```

- Run **LarkDesktopSetup.exe** — welcome → folder → install → finish / launch
- Installs to `%LOCALAPPDATA%\Programs\Lark` (no admin password)
- Start Menu + Desktop shortcuts; Add/Remove Programs entry
- After install you mainly see **Lark Desktop.exe** — `app\` and `jdk\` are hidden runtime
- Optional payload zip: `lark-desktop-windows.zip` (same files, no wizard)

Mac / Linux payload zips ship `start-lark-desktop.sh` with the same buried `app/` + `jdk/` layout.

### Lark Executable

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-executable-windows.zip
```

- Extract All → double-click **Lark.exe**
- No `.bat` / `.ps1` required
- `app\` (jar) and `jdk\` stay beside the exe and are soft-hidden on Windows
- Same IDE as Desktop; own update channel (`executable`)

### Lark Mobile (separate edition)

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-mobile-windows.zip
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-mobile-mac.zip
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-mobile-linux.zip
```

- Extract → run **Start Lark Mobile**
- Keep the console open — it prints a **Phone URL** with a pair code
- On your phone (same Wi‑Fi), open that URL for the Mobile UI

Do not open launchers from inside a zip preview / Temp folder.

## What’s new in 3.9.7.27

- **Revert Lua Java engine** — beautify, brace helpers, diagnostics, and snippets are back on the fast JS path. The Lua highlighter from 3.9.7.25 stays; the engine that made the IDE sluggish is removed.

## What’s new in 3.9.7.26

- **Lua Java engine** — indent/beautify, brace matching, unused-import & brace diagnostics, and Assist snippet expansion (reverted in 3.9.7.27 for speed).

## What’s new in 3.9.7.25

- **Lua Java highlighter** — the editor’s Java syntax colors come from a real tokenizer written in Lua (`web/lua/java_tokenizer.lua`), running in-browser via Fengari and feeding CodeMirror. Keywords, strings, comments, numbers, operators, annotations, and identifiers are classified in Lua—not just CSS theme tweaks.

## What’s new in 3.9.7.24

- **One Windows taskbar icon** — clicking the pinned Lark opens/focuses that window instead of leaving a second Lark on the taskbar. Shared AppUserModelID groups the launcher with the editor window. If you still see two icons after updating, unpin Lark once and pin it again from the Start Menu.

## What’s new in 3.9.7.23

- **Resizable Outline tray** — drag the bar above Project/Outline up or down to give the file tree or Outline more room (double-click resets).

## What’s new in 3.9.7.22

- **Shorter outlines setting copy** — Settings → Display describes outlined tiles as “Borders around Explorer rows.”

## What’s new in 3.9.7.21

- **Explorer New menu** — the tray header is a quiet Explorer label plus one **+** button (Class / File / Folder), instead of three text actions.

## What’s new in 3.9.7.20

- **Outlined file tiles on by default** — Explorer bordered rows are the default again; turn them off in Settings → Display if you want the quieter tree-line-only tray.

## What’s new in 3.9.7.19

- **Explorer outlines are optional** — tray can use bordered tiles or a quieter vertical tree line. Setting lives under Settings → Display → **Outlined file tiles**.

## What’s new in 3.9.7.18

- **Tree guides** — open folders draw a light L-shaped rail into their children so the tray reads as a hierarchy, not a stack of separate tiles.

## What’s new in 3.9.7.17

- **Folder outlines** — explorer folders use the same outlined row treatment as files so the hierarchy stays easy to scan.

## What’s new in 3.9.7.16

- **Desktop always opens a window** — after an update, a second click no longer exits quietly when the old window is gone. Lark raises the existing window when it can, and otherwise opens a new one (with a one-shot retry if Chromium’s profile was still locked).

## What’s new in 3.9.7.15

- **Clearer copy** — project picker subtitle is “Pick a Project to open”; Executable download blurb is “Extract All, then double-click Lark.exe. No batch files & No Installer.”

## What’s new in 3.9.7.14

- **File tray** — each file row has a light outline so adjacent entries stay distinct; the project name sits above Outline with room to show the full title.

## What’s new in 3.9.7.13

- **Raise existing Desktop window** — second launch / tray Open asks the OS to foreground the Lark window (Windows/macOS/Linux), not only `window.focus()`.
- **Stronger Quick Fix** — missing return, `throws`, make-static, and lossy-conversion casts; Extract / Introduce / Rename are more reliable; debugger stack jumps resolve packages and inner classes.
- **Mobile Quick Fix** — editor shows a Quick fix action when the open file has a fixable warning.

## What’s new in 3.9.7.12

- **Quick fix works** — Problems → Quick fix keeps fix metadata, finds the right line even if code moved a bit, and inserts accessors at the real class close (ignoring braces in strings). Also adds imports for “cannot find symbol” class errors, `==` → `.equals`, empty `if/for/while;`, unused imports, `@Override`, and missing semicolons.

## What’s new in 3.9.7.11

- **Java file icon** — explorer uses the classic Java logo (orange cup + blue steam), not a letter “J”.

## What’s new in 3.9.7.10

- **One Desktop window** — opening Lark again focuses the running window instead of adding another taskbar entry.
- **Project previews** — project tiles show a code snippet from the project.
- **File icons** — Java files use a coffee-cup logo; `.md` and `.txt` use a document icon.

## What’s new in 3.9.7.9

- **Project picker** — switch projects from a Themes-style tile overlay instead of a dropdown.

## What’s new in 3.9.7.8

- **Folder icons** — explorer folders use real open/closed folder glyphs instead of chevrons.

## What’s new in 3.9.7.7

- **Close outdated window** — after an update, Close window actually retires the old tab (browsers block a silent `window.close()`).

## What’s new in 3.9.7.6

- **GitHub drawer** — flatter, quieter layout: no logo badge, flat repo list with separators, lock icons for private repos, teal actions, UI font for chrome.

## What’s new in 3.9.7.5

- **One instance** — a second launch focuses the running Lark instead of starting another JVM; Restart reuses the same port.
- **Crash recovery** — after a kill, crash, or closed tab, unsaved buffers and the open project come back on the next launch.
- **Distinct themes** — a Distinct filter in Themes for looks where keywords, strings, numbers, and types are clearly different colors.
- **GitHub drawer** — refreshed layout aligned with current Lark.
- **Editor fonts** — 10+ clearly different monospace choices (Fira, Source Code Pro, Plex, VT323, and more).
- **Quieter highlights** — softer active-line and brace matching; right-click offers Copy and Paste only.

## What’s new in 3.9.7.4

- **Post-update restart** — the previous-version Lark tab closes when the new window opens.
- **Slate default** — first install opens on Slate.
- **Five vivid themes** — Prism, Volt, Flare, Reef, and Magma with distinct colors for every syntax token.

## What’s new in 3.9.7.3

- **Core tracks only** — Desktop, Executable, and Mobile. School and Enterprise packaging removed.
- **Scratch output** — Scratch runs print into a pad-attached output terminal (not the main console).
- **Scratch create above pad** — New/rename dialogs appear over the open scratch pad.

## Build from source

```bash
./package.sh
./packaging/make-release.sh
```

Requires JDK 17+, Go (Windows launchers), NSIS (`makensis`) for `LarkDesktopSetup.exe`, and network once to cache portable JDKs.

## License

See [LICENSE](LICENSE).
