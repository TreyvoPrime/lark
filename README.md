# Lark

Lark is a small Java IDE: several files and classes, an outline, compile and run, problems that jump to the line, and GitHub clone/push. Lighter than IntelliJ, more useful than a browser text box.

## Two downloads (pick one)

| | **Lark Desktop** | **Portable zip** |
| --- | --- | --- |
| **What it is** | Installed app for your user account | A folder you unzip and run |
| **GitHub file** | `lark-desktop-windows.zip` (or mac / linux) | `lark-windows.zip` (or mac / linux) |
| **How to start** | Run **Install Lark Desktop** script | Run **Start Lark** |
| **Shortcut** | Start Menu / Desktop / Applications | Only the launcher in the folder |
| **Updates** | Prompts you on launch | Check under Aa → Updates |
| **Admin password** | Not required | Not required |
| **Best for** | Everyday use on your PC | USB / shared machines / no install |

Download site: **[treyvoprime.github.io/lark-download](https://treyvoprime.github.io/lark-download/)**  
Releases: **[github.com/TreyvoPrime/lark/releases/latest](https://github.com/TreyvoPrime/lark/releases/latest)**

### Lark Desktop (recommended)

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

Do not open Start Lark from inside the zip preview / Temp folder.

## What’s new in 2.2

- Autosave as you type (toggle + delay under **Aa**)
- Editor settings: font family, ligatures, indent size, tabs vs spaces, line wrap
- Themes: **Obsidian** and **Glacier**
- Clearer Desktop vs portable download pages

## Run from source

```bash
./lark.sh
./lark.sh --desktop
```

## Build packages

```bash
./package.sh
./packaging/make-release.sh    # portable + desktop zips + update.json
```

## Features

- Multi-file Java projects, outline, compile & run, plain-English problems
- Terminal tab in the project folder
- Suggestion autofill; `Ctrl+Space` for snippets
- Themes including Nova, Atelier, Obsidian, Glacier, and more
- GitHub clone / push with a classic `repo` token

`Ctrl+Enter` runs. `Ctrl+S` saves. `Ctrl+P` opens a file.

## Other files in this repository

`CrownsOfTheAtlantic` and `DefinitiveNavy` are Age of History II mods — see [MODS.md](MODS.md).

Editor: [CodeMirror 5](web/vendor/codemirror/LICENSE), MIT.
