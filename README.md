# Lark 3

Lark is a focused Java IDE: multi-file projects, live compile feedback, brace guide, small refactors, debugger, JUnit, and GitHub clone/push. Lighter than IntelliJ, more useful than a browser text box — deliberately not bloated.

## Three downloads (pick one)

| | **Lark Desktop** | **Portable zip** | **Lark Mobile** |
| --- | --- | --- | --- |
| **What it is** | Installed app for your user account | A folder you unzip and run | Separate touch-first edition |
| **GitHub file** | `lark-desktop-windows.zip` (or mac / linux) | `lark-windows.zip` (or mac / linux) | `lark-mobile-windows.zip` (or mac / linux) |
| **How to start** | Run **Install Lark Desktop** script | Run **Start Lark** | Run **Start Lark Mobile** |
| **UI** | Full desktop IDE | Full desktop IDE | Bottom-tab Mobile UI |
| **Phone** | — | — | Pair over Wi‑Fi (same network) |
| **Updates** | Prompts you on launch | Check under Aa → Updates | More → Check for updates |
| **Admin password** | Not required | Not required | Not required |
| **Best for** | Everyday use on your PC | USB / shared machines | Tablets, phone editing via host |

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

## What’s new in 3.1

- **Lark Mobile** — completely separate touch UI (Home / Files / Edit / Run / More)
- Phone Wi‑Fi pairing with a one-time pair code
- Dedicated `lark-mobile-*.zip` downloads and mobile update channel

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
