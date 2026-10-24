# Lark 3

Lark is a focused Java IDE: multi-file projects, live compile feedback, brace guide, small refactors, debugger, JUnit, and GitHub clone/push. Lighter than IntelliJ, more useful than a browser text box — deliberately not bloated.

## Downloads (three tracks)

| | **Lark Executable** (default) | **Lark Desktop** | **Lark Mobile** |
| --- | --- | --- | --- |
| **What it is** | Unzip → double-click **Lark.exe** | Setup wizard install | Touch-first edition |
| **GitHub file** | `lark-executable-windows.zip` | `LarkDesktopSetup.exe` | `lark-mobile-windows.zip` |
| **How to start** | **Lark.exe** only | Start Menu → **Lark Desktop** | **Start Lark Mobile** |
| **UI** | Native WebView2 shell (DevTools off) | Native WebView2 shell (DevTools off) | Bottom-tab Mobile UI |
| **Best for** | Most Windows PCs (avoids SmartScreen on Setup) | Start Menu / guided install | Tablet + phone pair |

Download site: **[treyvoprime.github.io/lark-download](https://treyvoprime.github.io/lark-download/)**  
Releases: **[github.com/TreyvoPrime/lark/releases/latest](https://github.com/TreyvoPrime/lark/releases/latest)**

### Lark Executable (default — unzip and run)

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-executable-windows.zip
```

- Extract All → double-click **Lark.exe**
- No installer, no `.bat` / `.ps1` — best default while Windows SmartScreen blocks unsigned Setup.exe
- `app\` (jar) and `jdk\` stay beside the exe and are soft-hidden on Windows
- Same IDE as Desktop; own update channel (`executable`, with `school` aliases)

### Lark Desktop (optional Setup install)

```text
https://github.com/TreyvoPrime/lark/releases/latest/download/LarkDesktopSetup.exe
```

- Run **LarkDesktopSetup.exe** — welcome → folder → install → finish / launch
- Installs to `%LOCALAPPDATA%\Programs\Lark` (no admin password)
- Start Menu + Desktop shortcuts; Add/Remove Programs entry
- If SmartScreen blocks the Setup download, use **Executable** instead
- Optional payload zip: `lark-desktop-windows.zip` (same files, no wizard)

Mac / Linux payload zips ship `start-lark-desktop.sh` with the same buried `app/` + `jdk/` layout.

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

## What’s new in 3.8.0

- **Native shell (middle ground)** — Windows Desktop & Executable open in WebView2, not a full Chrome window
- **DevTools off** — no Inspect Element / browser chrome; closing the window stops Lark
- **Fallback** — if WebView2 is missing, hardened Edge/Chrome `--app` with a private profile

## What’s new in 3.7.0

- **Three tracks** — Executable (`Lark.exe`), Desktop (Setup), Mobile
- **Executable = default** — unzip and run; former School + bat Desktop path
- **Desktop = former Enterprise** — optional Setup / Start Menu install
- **Hardened launchers** — path containment, JAR magic check, hidden `app/`+`jdk/`, SHA-256 updates

## What’s new in 3.6.0

- Unified slim Desktop layout and local security hardening (bundled JDK only, CSP/COOP, Origin checks)

## Build from source

```bash
./package.sh
./packaging/make-release.sh
```

Requires JDK 17+, Go (Windows launchers), NSIS (`makensis`) for `LarkDesktopSetup.exe`, and network once to cache portable JDKs.

## License

See [LICENSE](LICENSE).
