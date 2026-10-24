Lark packaging notes
====================

Tracks (see root README.md):

  Lark Desktop     → LarkDesktopSetup.exe  (default install)
  Lark Executable  → lark-executable-windows.zip  (Lark.exe only)
  Lark Mobile      → lark-mobile-*.zip

Build everything:

  ./packaging/make-release.sh

Windows launchers need Go. Setup.exe needs NSIS (makensis).
Portable JDKs are cached under release/.jdk-cache/.
