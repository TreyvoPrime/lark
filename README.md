# Lark 3

Lark is a focused Java IDE: multi-file projects, live compile feedback, brace guide, small refactors, debugger, JUnit, and GitHub clone/push. Lighter than IntelliJ, more useful than a browser text box — deliberately not bloated.

## Downloads (pick one)

| | **Lark Desktop** | **Portable zip** | **Lark School** | **Lark Mobile** |
| --- | --- | --- | --- | --- |
| **What it is** | Installed app | Unzip folder | Unzip folder, **no .bat** | Touch-first edition |
| **GitHub file** | `lark-desktop-windows.zip` | `lark-windows.zip` | `lark-school-windows.zip` | `lark-mobile-windows.zip` |
| **How to start** | Install script | **Start Lark.bat** | **Lark.exe** | **Start Lark Mobile** |
| **UI** | Full desktop IDE | Full desktop IDE | Full desktop IDE | Bottom-tab Mobile UI |
| **Best for** | Home PC | USB / normal portable | School PCs that block .bat | Tablet + phone pair |

Download site: **[treyvoprime.github.io/lark-download](https://treyvoprime.github.io/lark-download/)**  
Releases: **[github.com/TreyvoPrime/lark/releases/latest](https://github.com/TreyvoPrime/lark/releases/latest)**

### Lark Desktop (recommended for PC)

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-desktop-windows.zip
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-desktop-mac.zip
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-desktop-linux.zip
```

- **Windows:** Extract All → in PowerShell:  
  `powershell -ExecutionPolicy Bypass -File ".\Install Lark Desktop.ps1"`
- **Mac / Linux:** Extract → run `Install Lark Desktop.command`

### Portable zip

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-mac.zip
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-linux.zip
```

- **Windows:** Extract All → `Start Lark.bat`
- **Mac:** `Start Lark.command`
- **Linux:** `./start-lark.sh`

### Lark School (Windows — no .bat)

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-school-windows.zip
```

- Extract All → double-click **Lark.exe**
- Same IDE as portable; built for labs that block batch files
- Keep `Lark.exe`, `lark.jar`, and `jdk\` together

### Lark Mobile (separate edition)

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-mobile-windows.zip
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-mobile-mac.zip
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-mobile-linux.zip
```

- Extract → run **Start Lark Mobile**
- Keep the console open — it prints a **Phone URL** with a pair code
- On your phone (same Wi‑Fi), open that URL for the Mobile UI
- Compile and run stay on the host; the phone is the editor

Do not open launchers from inside a zip preview / Temp folder.

## What’s new in 3.2.4

- Fix line-number gutter CSS; Settings control labeled clearly (`Aa` → title “Settings”)
- Desk / Slate / Studio listed first in the theme menu
- Stop leftover `dist/mobile.marker` from making portable runs load Mobile UI

## What’s new in 3.2.3

- **Security harden** — loopback-based API auth (not spoofable Host), stronger Mobile pair tokens, update URL allowlist + SHA-256 when present, HTTPS-only JDK fetch, CSP headers
- **Line numbers** — visible gutter numbers (Settings → Show line numbers; on by default)
- **Themes** — **Slate** and **Studio**, calm Desk-like production themes

## What’s new in 3.2.2

- **Homework code blocks** — fill/print array, sum/min/max, linear search, count occurrences, sentinel read, menu loop, file I/O, String split, 2D fill, copy/reverse array (Java menu + Ctrl+Space; Mobile Edit/More)

## What’s new in 3.2.1

- **Matrix print auto-block** — Java → Insert matrix print loops (or Ctrl+Space `matrix` / `matblock`) inserts a sample `int[][]` and nested for-loops that print each row; same action on Lark Mobile (Edit / More)

## What’s new in 3.2

- **Lark School** — `lark-school-windows.zip` with **Lark.exe** (no `.bat` required)
- For school computers that block batch files

## What’s new in 3.1

- **Lark Mobile** — touch UI + phone Wi‑Fi pairing
- Layout fixes for long sessions and Scanner input

## What’s in 3.0

- Brace matching / guide, live compile, extract method / introduce variable
- Project search, debug polish, presets, new themes, explorer tray polish

## Run from source

```bash
./lark.sh
./lark.sh --desktop
./lark.sh --mobile
```

## Build packages

```bash
./package.sh
./packaging/make-release.sh    # portable + desktop + mobile zips + update.json
```

## Features

- Multi-file Java projects, outline, compile & run, plain-English problems
- Navigation: go to definition, find usages, rename; split editor (desktop)
- Debugger (jdb) and JUnit test runner (desktop)
- Terminal tab in the project folder (desktop)
- Lark Mobile: projects, files, editor, run, themes, updates
- Themes including Cedar, Inkwell, Porcelain, Hearth, Canopy, Nova, Atelier, and more
- GitHub clone / push with a classic `repo` token

`Ctrl+Enter` runs. `F5` debugs. `Ctrl+Shift+F` searches the project. `Ctrl+M` jumps braces. `Ctrl+P` opens a file or class.

## Other files in this repository

`CrownsOfTheAtlantic` and `DefinitiveNavy` are Age of History II mods — see [MODS.md](MODS.md).

Editor: [CodeMirror 5](web/vendor/codemirror/LICENSE), MIT.
