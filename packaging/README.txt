Lark 1.6.5

Unzip this folder into Downloads or Documents.
Lark does not install for every user, and it never asks for an administrator password.

Updates: when Lark downloads an update, click Restart Lark — or fully close Lark
and open Start Lark again. On Windows, Lark runs from a copy so the jar can be
replaced without "file is being used by another process".

Windows: double-click "Start Lark.bat"
Mac: double-click "Start Lark.command"
  If macOS blocks it, right-click, choose Open, then Open again.
Linux: open this folder in a terminal and run ./start-lark.sh

The same folder works on Windows, Mac, and Linux. Use the launcher for this computer.

If Java 17 or newer is already installed, Lark uses it.
If not, the launcher downloads a private copy into your user folder (.lark/jdk).
That needs the internet the first time only. It still does not need an admin password.

School networks: if the Java download fails or you see "could not open ...\lib\jvm.cfg",
the JDK copy is incomplete. Start Lark deletes broken copies and retries. You can also:
  - Delete %USERPROFILE%\.lark\jdk (or ~/.lark/jdk) and open Start Lark again, or
  - Drop a full jdk.zip from https://adoptium.net/ beside Start Lark, or
  - Unzip a JDK into a folder named "jdk" so jdk\bin\java.exe and jdk\lib\jvm.cfg exist.
On Windows the launcher uses school-friendly SSL settings and rejects truncated downloads.

When a program asks a question (Y/N), type the answer in the reply box under Output and press Enter.
Do not close Lark while the program is waiting — that is what the reply box is for.

Updates: if this zip included an update-feed.url file, Lark checks for newer builds when it opens
and can download them. You can also paste an update feed under Aa → Updates.
After "Update now", click Restart Lark (or fully close Lark and open Start Lark again).

Connect GitHub from the GitHub button:
1. Click "Create a GitHub token" (classic token with the repo scope).
2. Paste the token that starts with ghp_ into Lark and click Connect.
3. Your repositories appear. Clone any of them, or push the open project.

Projects live in your user folder under .lark/projects.
