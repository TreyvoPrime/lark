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
