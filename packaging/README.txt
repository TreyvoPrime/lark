Lark 2.1.0 (portable zip)

Prefer the Desktop app? Download lark-desktop-windows.zip (or mac/linux) and run
"Install Lark Desktop" — Start Menu shortcut, no admin, update prompts on launch.

Extract the WHOLE portable zip to a real folder like C:\Users\YOU\Lark.
Do NOT open Start Lark from inside the zip window or from AppData\Local\Temp.

Windows
  1. Right-click lark-windows.zip → Extract All… → C:\Users\YOU\Lark
  2. Open that folder. You must see Start Lark.bat, lark.jar, and jdk\ together.
  3. Double-click "Start Lark.bat" (or "Start Lark.vbs" if the window flashes away).
  4. A black window STAYS OPEN. Your browser opens to Lark.

Cleanup
  - "Stop Lark and Clean Cache.bat" — closes Lark and clears the run cache
  - "Wipe Lark From This PC.bat" — deletes ALL Lark leftovers (cache, temp, .lark data)

Mac
  Double-click "Start Lark.command". If macOS blocks it: right-click → Open → Open.

Linux
  Run: ./start-lark.sh

This zip already includes Java in the jdk folder. No admin password. No extra download.

If something fails, open lark-boot.log in this folder and re-download the FULL zip from:
https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip

Projects live in your user folder under .lark/projects.
