# Lark

Lark is a small Java IDE: several files and classes, an outline, compile and run, problems that jump to the line, and GitHub clone/push. It is meant to feel lighter than IntelliJ or Eclipse, and more useful than a single browser text box.

No admin install. Platform zips include a portable JDK (`jdk/`). On Windows, `Start Lark.bat` keeps a console open, runs the bundled Java in place, and writes `lark-boot.log`. Double-click `Start Lark.vbs` if a console flashes and disappears. There is no Gradle and no Electron.

## Download

Permanent download site (always online): **[treyvoprime.github.io/lark](https://treyvoprime.github.io/lark-download/)**

Or grab a zip from **[GitHub Releases](https://github.com/TreyvoPrime/lark/releases/latest)** (Windows, Mac, or Linux). Unzip into Downloads or Documents, then:

- Windows: double-click `Start Lark.bat`
- Mac: double-click `Start Lark.command`
- Linux: run `./start-lark.sh`

No administrator password. The same folder works on every OS — use the launcher for your computer.

After the public repo is published, stable links look like:

- `https://github.com/TreyvoPrime/lark/releases/latest`
- `https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip`

Publish or refresh those assets with `./packaging/publish-github.sh` (requires `gh auth login`).

## Take it to any computer

Lark opens in its own window. It does not install into Program Files. Build local zips with `./packaging/make-release.sh`.

## Run from source

```bash
./lark.sh
```

Lark prints a local address, usually [http://127.0.0.1:43123](http://127.0.0.1:43123), and opens it. On Windows, use `lark.bat`.

Your projects are real folders in `~/.lark/projects`. A library sample is created the first time, so you can press Run immediately.

## One jar

```bash
./package.sh
java -jar dist/lark.jar
```

The jar is the editor. Running it still needs a JDK, because that is what compiles your code.

## What you can do

- Keep more than one project, each with packages, classes, interfaces, records, and enums.
- Edit with Java highlighting, bracket matching, find, comment toggle, and completion for names in the project (`Ctrl+Space`).
- Run the main class. Compiler errors show under Problems and open the line.
- Themes: Desk, Daylight, Moss, Ember, and Fog, with IntelliJ-style distinct syntax colors and bundled JetBrains Mono.
- Change editor font size and UI zoom under **Aa**, or with `Ctrl+=` / `Ctrl+-` / `Ctrl+0`.
- Answer interactive programs in the reply box under Output (so `Scanner.nextLine()` works for Y/N prompts).
- Welcome page on first open (new project, recent projects, practice tips).
- Java assist menu: generate getters/setters and constructors, explain `private` / `public` / `static` / `this`, suggest imports, and warn about private fields without accessors.
- Structure panel under Files lists fields, constructors, and methods. Type `/**` for a Javadoc stub. Find/replace with `Ctrl+F` / `Ctrl+H`.
- Check for updates on startup when an update feed is set (`update-feed.url` next to the jar, `LARK_UPDATE_FEED`, or Aa → Updates). “Update now” stages a new jar; click **Restart Lark** (or close and open Start Lark again). On Windows, Lark runs from a copy under `%LOCALAPPDATA%\Lark\run` so the install jar can be replaced without “file is being used by another process.”
- Connect GitHub with a classic personal access token (`repo` scope). Lark lists repositories you can clone, and can push the open project. Browser sign-in is available too; Lark refreshes those tokens when GitHub allows it. Credentials stay in `~/.lark/settings.json` and are only sent to GitHub.
- Import a folder or a zip, and download the project as a zip.

`Ctrl+Enter` runs. `Ctrl+P` opens a file. `Ctrl+S` saves. On a Mac, use Command.

## Other files in this repository

`CrownsOfTheAtlantic` and `DefinitiveNavy` are Age of History II mods. Their guide is in [MODS.md](MODS.md).

The editor inside Lark is [CodeMirror 5](web/vendor/codemirror/LICENSE), MIT licensed.
