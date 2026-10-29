# Download audit — October 28, 2026 (America/New_York)

Verified against the GitHub release API and direct HTTP HEAD requests. Every URL below returned **200**, with Content-Length matching the release API. ZIP downloads were inspected without running their contents.

## Published version versus installation packages

The latest stable release is [4.0.1](https://github.com/TreyvoPrime/lark/releases/tag/v4.0.1). It contains update ZIPs and `update.json` only. These are **not complete installations** and are excluded from the website's installation choices.

The Windows full installation files attached to [release 4.0](https://github.com/TreyvoPrime/lark/releases/tag/4.0) are byte-identical (matching SHA-256 digests) to the corresponding 3.9.7.36 files. Inspection of the Windows portable ZIP's `app/lark.jar` reports `Settings.VERSION = "3.9.7.36"`. The macOS and Linux ZIPs also report 3.9.7.36. The website therefore identifies these as **base packages 3.9.7.36**, and identifies 4.0.1 separately as the latest update. Fresh, complete 4.0.1 bundles need to be built and published before the website can describe a full 4.0.1 installer.

## Verified files

| Package | Release attachment | Bytes | Architecture |
| --- | --- | ---: | --- |
| [Windows installer](https://github.com/TreyvoPrime/lark/releases/download/4.0/LarkDesktopSetup.exe) | 4.0 | 47,622,522 | x64 |
| [Windows portable ZIP](https://github.com/TreyvoPrime/lark/releases/download/4.0/lark-executable-windows.zip) | 4.0 | 78,936,970 | x64 |
| [Windows desktop ZIP](https://github.com/TreyvoPrime/lark/releases/download/4.0/lark-desktop-windows.zip) | 4.0 | 79,106,049 | x64 |
| [macOS desktop ZIP](https://github.com/TreyvoPrime/lark/releases/download/v3.9.7.36/lark-desktop-mac.zip) | 3.9.7.36 | 69,667,394 | Intel x64 |
| [Linux desktop ZIP](https://github.com/TreyvoPrime/lark/releases/download/v3.9.7.36/lark-desktop-linux.zip) | 3.9.7.36 | 82,222,499 | x64, GNU libc |
| [Lark Mobile Windows host](https://github.com/TreyvoPrime/lark/releases/download/v3.9.7.36/lark-mobile-windows.zip) | 3.9.7.36 | 77,987,948 | x64 |

The downloaded macOS/Linux `jdk/release` files identify Temurin 21.0.13 and `OS_ARCH="x86_64"`; Linux identifies `LIBC="gnu"`. Windows launchers are built for amd64 and bundled Java is supplied. No native Apple Silicon package was verified. No APK appears in the 20 most recent releases reviewed, so the old `latest/download/LarkMobile-debug.apk` link must not be presented as a verified download.

## Feature and documentation checks

- The 4.0 release notes explicitly describe Java completion, live compilation/Problems, Run/Debug, UML diagrams, code assistance/Quick Fix, project search, rename/refactoring, file/project management, Code Structure, Command Palette, split editor and Scratch.
- 4.0.1 notes describe the minimap, refined UI, improved Assist, full-file code images and debugger/GitHub fixes.
- Lark Flow currently exists in the development checkout and has not been published in these releases. Website screenshots must identify Flow as a development preview.
- Repository license: MIT (`LICENSE`). No contribution-guidelines file was found; repository and Issues links are appropriate.
- Windows setup installs under the user's local application folder. Portable packages require extraction before launch. macOS includes `Launch Lark Desktop.command`; Linux uses `start-lark-desktop.sh`.

## Release component

`releases.js` includes a verified fallback snapshot. It refreshes at most three pages of 20 releases with a six-second deadline, skips drafts/prereleases, permits only known complete-package filenames, validates exact GitHub URLs, separates the latest update from installers, and retains fallback data if the API fails. Future packages with unverified binary metadata have `packageVersion: null` and an unspecified architecture rather than inheriting old architecture claims.

Validation: `node test/site-releases.test.cjs`, `node --check docs/releases.js`, and `git diff --check` passed. Download verification proves that the files are publicly available with the reported sizes; it does not constitute installation testing on Windows, macOS, or Linux.
