; Lark Desktop — Windows Setup wizard (NSIS Modern UI)
; Built by packaging/make-desktop.sh (payload staged next to this script).

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

!ifndef LARK_VERSION
  !define LARK_VERSION "3.7.0"
!endif
!ifndef LARK_PAYLOAD
  !define LARK_PAYLOAD "payload"
!endif
!ifndef LARK_OUT
  !define LARK_OUT "..\..\release\LarkDesktopSetup.exe"
!endif

Name "Lark Desktop"
OutFile "${LARK_OUT}"
Unicode true
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Lark"
InstallDirRegKey HKCU "Software\LarkDesktop" "InstallDir"
ShowInstDetails show
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_ICON "lark-icon.ico"
!define MUI_UNICON "lark-icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH
!define MUI_FINISHPAGE_RUN "$INSTDIR\Lark Desktop.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Lark Desktop"
!define MUI_FINISHPAGE_NOREBOOTSUPPORT

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${LARK_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Lark Desktop"
VIAddVersionKey /LANG=1033 "FileDescription" "Lark Desktop Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${LARK_VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${LARK_VERSION}"
VIAddVersionKey /LANG=1033 "CompanyName" "Lark"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Lark"

Section "Lark Desktop" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Wipe previous runtime (keep user projects elsewhere).
  RMDir /r "$INSTDIR\jdk"
  RMDir /r "$INSTDIR\app"
  Delete "$INSTDIR\lark.jar"
  Delete "$INSTDIR\Lark Desktop.exe"
  Delete "$INSTDIR\Lark Enterprise.exe"

  File /r "${LARK_PAYLOAD}\*.*"

  ; Bury runtime folders so the install dir stays clear.
  SetFileAttributes "$INSTDIR\app" HIDDEN
  SetFileAttributes "$INSTDIR\jdk" HIDDEN

  WriteRegStr HKCU "Software\LarkDesktop" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "DisplayName" "Lark Desktop"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "DisplayVersion" "${LARK_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "Publisher" "Lark"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "DisplayIcon" "$INSTDIR\Lark Desktop.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop" "EstimatedSize" "$0"

  CreateDirectory "$SMPROGRAMS\Lark"
  CreateShortCut "$SMPROGRAMS\Lark\Lark Desktop.lnk" "$INSTDIR\Lark Desktop.exe" "" "$INSTDIR\app\lark-icon.ico" 0
  CreateShortCut "$SMPROGRAMS\Lark\Uninstall Lark Desktop.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\Lark Desktop.lnk" "$INSTDIR\Lark Desktop.exe" "" "$INSTDIR\app\lark-icon.ico" 0

  ; Stamp System.AppUserModel.ID so the pin groups with the Edge/Chrome --app window.
  ; Must match packaging/desktop/launcher and src/lark/WinTaskbar.java (TreyvoPrime.Lark.Desktop).
  ExecWait 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\app\Stamp-LarkAumid.ps1"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Lark Desktop.lnk"
  RMDir /r "$SMPROGRAMS\Lark"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkDesktop"
  DeleteRegKey HKCU "Software\LarkDesktop"
  RMDir /r "$LOCALAPPDATA\Lark\run-desktop"
SectionEnd
