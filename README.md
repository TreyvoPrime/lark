# Lark

Lark is a small Java IDE: several files and classes, an outline, compile and run, problems that jump to the line, and GitHub clone/push. It is meant to feel lighter than IntelliJ or Eclipse, and more useful than a single browser text box.

The only install is a JDK 17 or newer. There is no Gradle, no Electron, and no plugin download. If Java is missing, the portable launcher downloads a private copy into your user folder. That step does not ask for an administrator password.

## Take it to any computer

Unzip the portable folder into Downloads or Documents. The same folder works on Windows, Mac, and Linux.

- Windows: double-click `Start Lark.bat`
- Mac: double-click `Start Lark.command`
- Linux: run `./start-lark.sh`

Lark opens in its own window. It does not install into Program Files, and it does not need an administrator username or password. Build the zips with `./packaging/make-release.sh`.

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
- Check for updates on startup when an update feed is set (`update-feed.url` next to the jar, `LARK_UPDATE_FEED`, or Aa → Updates). “Update now” stages a new jar; the next Start Lark applies it.
- Connect GitHub with a classic personal access token (`repo` scope). Lark lists repositories you can clone, and can push the open project. Browser sign-in is available too; Lark refreshes those tokens when GitHub allows it. Credentials stay in `~/.lark/settings.json` and are only sent to GitHub.
- Import a folder or a zip, and download the project as a zip.

`Ctrl+Enter` runs. `Ctrl+P` opens a file. `Ctrl+S` saves. On a Mac, use Command.

## Other files in this repository

`CrownsOfTheAtlantic` and `DefinitiveNavy` are Age of History II mods. Their guide is in [MODS.md](MODS.md).

The editor inside Lark is [CodeMirror 5](web/vendor/codemirror/LICENSE), MIT licensed.
