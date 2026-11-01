# Lark 4

Lark is a focused Java IDE: multi-file projects, live compile feedback, brace guide, small refactors, debugger, JUnit, and GitHub clone/push. Lighter than IntelliJ, more useful than a browser text box — deliberately not bloated.

## Downloads (two supported tracks)

| | **Lark Desktop** (default) | **Lark Executable** |
| --- | --- | --- | --- |
| **What it is** | Setup wizard install | Unzip → double-click **Lark.exe** |
| **GitHub file** | `LarkDesktopSetup.exe` | `lark-executable-windows.zip` |
| **How to start** | Start Menu → **Lark Desktop** | **Lark.exe** only |
| **UI** | Full desktop IDE (app window) | Full desktop IDE |
| **Best for** | Everyday PC, Start Menu | Labs / USB / no `.bat` |

Download site: **[treyvoprime.github.io/lark-download](https://lark.rocks/)**  
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

### Lark Mobile — discontinued

**Lark Mobile was discontinued on November 1, 2026.** Its host-dependent approach did not meet the goal of a standalone, on-device Java IDE. It is no longer an actively developed or recommended edition. Existing source and historical release assets remain available for reference, but no future features, updates, or support are planned for this edition. Desktop and Executable development continues.

Do not open launchers from inside a zip preview / Temp folder.

## What’s new in Lark 4.0

Lark 4 focuses on a smoother Java coding experience, clearer project navigation, and more capable tools without turning the IDE into a heavyweight workspace. The 4.0.x releases continue building on that foundation.

### Faster, smarter Java editing

- **Smoother typing:** Debounced, cancellable Java analysis reduces interruptions from stale background checks and unnecessary editor rerenders.
- **More useful Quick Fixes:** Suggestions prioritize actionable Java and compiler problems rather than distracting, low-value changes.
- **Improved Java assistance:** Completion and inline suggestions help with day-to-day editing, alongside live compile feedback.
- **Brace guides and indentation:** Better handling of matching braces, brackets, parentheses, and multiline edits makes code easier to follow.
- **Minimap and code navigation:** A configurable minimap, project search, and code-structure tools help with larger files and projects.

### Tools for understanding and changing code

- **Refactoring support:** Rename previews and small refactoring actions help make changes more deliberately.
- **UML diagrams:** Improved relationship formatting, ownership, and arrows make class structures easier to visualize.
- **Lark Flow:** Diagram-based views show how program logic moves through code.
- **Run, debug, and test:** Integrated Java execution, debugging, and JUnit support keep core development tasks in one place.
- **Code-image export:** Export full files as themed code images for notes, sharing, or demonstrations.

### A more customizable workspace

- **Expanded themes:** Additional dark and light syntax themes, including new light palettes in later 4.0.x work.
- **More editor fonts:** Extra font options let you tailor how code looks.
- **Flexible toolbar:** Responsive overflow and adjustable toolbar height help Lark fit different window sizes.
- **Clearer project explorer:** Folder icons, updated file-row presentation, and recent-project improvements simplify navigation.
- **Editor preferences:** Adjustable minimap placement, sizing, line wrapping, auto-save, indentation, and other settings.

### Collaboration and connected workflows

- **Lark Share:** Encrypted LAN collaboration with host approval, shared editing, participant presence, live cursors, and Editor/Viewer permissions.
- **Session controls:** Collaboration recovery and permission handling aim to keep shared work manageable if connections change.
- **Git and GitHub:** Clone/push workflows and terminal-based Git commands help work with repositories without leaving the IDE.
- **Built-in terminal:** Run commands in the open project directory; later 4.0.x work adds improved cancellation and input handling.

### 4.0.x release highlights

- **4.0.5 (published):** Continued improvements to Share reliability, Java assistance, and release packaging.
- **4.0.6 (in development):** Selectable bird avatars for Share, participant badges and remote cursor labels, terminal/Git refinements, tray resizing improvements, a default-on minimap, and more light themes. These changes are in source and the draft release; **4.0.6 is not yet a published, verified release**.

> **Availability note:** Feature behavior and supported devices depend on the edition and release. Some cross-device collaboration, installer, and macOS workflows still need broader real-device validation. See the release notes and [GitHub Releases](https://github.com/TreyvoPrime/lark/releases) for available downloads.

## Build from source

```bash
./package.sh
./packaging/make-release.sh
```

Requires JDK 17+, Go (Windows launchers), NSIS (`makensis`) for `LarkDesktopSetup.exe`, and network once to cache portable JDKs.

## Lark Share

Lark 4.1 adds encrypted LAN collaboration to the desktop **Share** control:
private invitations, host approval, concurrent Java editing, live cursors,
participant follow, Editor/Viewer permissions and recovery. No cloud account is
required. Only the host saves canonical files or runs local tools.
See [Lark Share setup, security and platform validation limits](docs/lark-share.md).

## License

See [LICENSE](LICENSE).
