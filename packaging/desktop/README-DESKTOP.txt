Lark Desktop
============

This is the default installed edition.

Windows (recommended):
  Run LarkDesktopSetup.exe — welcome → folder → install → launch.
  Opens from the Start Menu as "Lark Desktop".
  Installs under %LOCALAPPDATA%\Programs\Lark (no admin password).

After install you mainly see Lark Desktop.exe. The app\ and jdk\ folders
are hidden runtime files — leave them alone.

Security:
  - Bundled JDK only (never PATH java)
  - Jar must stay inside the install folder
  - In-app updates require HTTPS allowlisted hosts + SHA-256
  - Local HTTP API is loopback-only with Origin / X-Lark checks

Mac / Linux payload zip (if present):
  Run start-lark-desktop.sh or Launch Lark Desktop.command from the
  extracted folder (keep jdk/ and app/ beside it).
