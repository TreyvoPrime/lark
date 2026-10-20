# Lark

Lark is a small Java IDE: several files and classes, an outline, compile and run, problems that jump to the line, and GitHub clone/push. It is meant to feel lighter than IntelliJ or Eclipse, and more useful than a single browser text box.

Two ways to get it:

1. **Lark Desktop** (recommended) — per-user install, Start Menu / Applications shortcut, bundled JDK, **prompts you to update** when a release ships. No admin password.
2. **Portable zip** — unzip a folder and run `Start Lark`. Same IDE, no install step.

There is no Gradle and no Electron.

## Download

Permanent download site: **[treyvoprime.github.io/lark-download](https://treyvoprime.github.io/lark-download/)**

Or grab assets from **[GitHub Releases](https://github.com/TreyvoPrime/lark/releases/latest)**:

| Track | Windows | Mac | Linux |
| --- | --- | --- | --- |
| Desktop | `lark-desktop-windows.zip` | `lark-desktop-mac.zip` | `lark-desktop-linux.zip` |
| Portable | `lark-windows.zip` | `lark-mac.zip` | `lark-linux.zip` |

### Lark Desktop

- **Windows:** unzip → right-click `Install Lark Desktop.ps1` → Run with PowerShell. Installs under `%LOCALAPPDATA%\Programs\Lark`, creates shortcuts, opens Lark.
- **Mac / Linux:** unzip → run `Install Lark Desktop.command` (or `./Install\ Lark\ Desktop.command`). Lives in `~/Applications/Lark Desktop`.

When an update is published, Desktop shows a prompt on launch. Choose **Update now**, then **Restart Lark**.

### Portable

Unzip into Downloads or Documents, then:

- Windows: double-click `Start Lark.bat`
- Mac: double-click `Start Lark.command`
- Linux: run `./start-lark.sh`

Extract All to a real folder (not the zip preview / Temp). You must see `Start Lark`, `lark.jar`, and `jdk\` together.

## Run from source

```bash
./lark.sh
# or desktop mode:
./lark.sh --desktop
```

Lark prints a local address, usually [http://127.0.0.1:43123](http://127.0.0.1:43123), and opens an app window when possible.

## Build packages

```bash
./package.sh                          # dist/lark.jar
./packaging/make-release.sh           # portable zips + desktop zips + update.json
./packaging/make-desktop.sh           # desktop packages only (also called by make-release)
```

In-app updates download `lark-update.zip` (portable) or `lark-desktop-update.zip` (Desktop).

Publish with `./packaging/publish-github.sh` (requires `gh auth login`).

## What you can do

- Keep more than one project, each with packages, classes, interfaces, records, and enums.
- Edit with Java highlighting, bracket matching, find, comment toggle, and suggestion-style autofill (`Ctrl+Space` for building blocks like `main`, `fori`, `sout`).
- **Terminal** tab runs a real shell in the open project folder.
- Run the main class. Compiler and runtime problems show in plain English with a fix hint.
- Themes include Nova, Atelier, Lagoon, Rosewood, and the full Desk/Daylight set — IntelliJ-style syntax with JetBrains Mono.
- Change editor font size and UI zoom under **Aa**, or with `Ctrl+=` / `Ctrl+-` / `Ctrl+0`.
- Connect GitHub with a classic personal access token (`repo` scope).
- Import a folder or a zip, and download the project as a zip.

`Ctrl+Enter` runs. `Ctrl+P` opens a file. `Ctrl+S` saves. On a Mac, use Command.

## Other files in this repository

`CrownsOfTheAtlantic` and `DefinitiveNavy` are Age of History II mods. Their guide is in [MODS.md](MODS.md).

The editor inside Lark is [CodeMirror 5](web/vendor/codemirror/LICENSE), MIT licensed.
