Lark Desktop
============

After Extract All, you should see only:

  Start Lark Desktop.bat   (Windows)  — double-click to run
  Start Lark Desktop.command (Mac) / start-lark-desktop.sh (Linux)
  jdk\                     — bundled Java (required)
  app\                     — Lark runtime (jar, helpers). Soft-hidden on Windows installs.

Do not run from inside a zip preview or Temp folder.

Optional (inside app\):
  Install Lark Desktop.ps1 — copies to %LOCALAPPDATA%\Programs\Lark + Start Menu
  Uninstall Lark Desktop.ps1
  Stop / Wipe helpers

Security
--------
- Uses the bundled JDK only (never downloads a random java from PATH for Desktop).
- Local IDE server listens on 127.0.0.1 only (not the public internet).
- In-app updates require HTTPS on GitHub Releases and SHA-256 when the feed provides hashes.
- Keep app\ intact — that is the trusted runtime.

Updates
-------
Lark Desktop checks the public update feed and can install a new jar into app\
while you are running, then asks you to restart.
