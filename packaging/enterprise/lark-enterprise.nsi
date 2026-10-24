; Lark Enterprise — Windows Setup wizard (NSIS Modern UI)
; Built by packaging/make-enterprise.sh (payload staged next to this script).

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

!ifndef LARK_VERSION
  !define LARK_VERSION "3.4.0"
!endif
!ifndef LARK_PAYLOAD
  !define LARK_PAYLOAD "payload"
!endif
!ifndef LARK_OUT
  !define LARK_OUT "..\..\release\LarkEnterpriseSetup.exe"
!endif

Name "Lark Enterprise"
OutFile "${LARK_OUT}"
Unicode true
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Lark Enterprise"
InstallDirRegKey HKCU "Software\LarkEnterprise" "InstallDir"
ShowInstDetails show
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_ICON "lark-icon.ico"
!define MUI_UNICON "lark-icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH
!define MUI_FINISHPAGE_RUN "$INSTDIR\Lark Enterprise.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Lark Enterprise"
!define MUI_FINISHPAGE_NOREBOOTSUPPORT

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${LARK_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Lark Enterprise"
VIAddVersionKey /LANG=1033 "FileDescription" "Lark Enterprise Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${LARK_VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${LARK_VERSION}"
VIAddVersionKey /LANG=1033 "CompanyName" "Lark"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Lark"

Section "Lark Enterprise" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Wipe previous files in the install dir (keep user projects elsewhere).
  RMDir /r "$INSTDIR\jdk"
  Delete "$INSTDIR\lark.jar"
  Delete "$INSTDIR\Lark Enterprise.exe"

  File /r "${LARK_PAYLOAD}\*.*"

  WriteRegStr HKCU "Software\LarkEnterprise" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "DisplayName" "Lark Enterprise"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "DisplayVersion" "${LARK_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "Publisher" "Lark"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "DisplayIcon" "$INSTDIR\Lark Enterprise.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise" "EstimatedSize" "$0"

  CreateDirectory "$SMPROGRAMS\Lark Enterprise"
  CreateShortCut "$SMPROGRAMS\Lark Enterprise\Lark Enterprise.lnk" "$INSTDIR\Lark Enterprise.exe" "" "$INSTDIR\lark-icon.ico" 0
  CreateShortCut "$SMPROGRAMS\Lark Enterprise\Uninstall Lark Enterprise.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\Lark Enterprise.lnk" "$INSTDIR\Lark Enterprise.exe" "" "$INSTDIR\lark-icon.ico" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Lark Enterprise.lnk"
  RMDir /r "$SMPROGRAMS\Lark Enterprise"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LarkEnterprise"
  DeleteRegKey HKCU "Software\LarkEnterprise"
  RMDir /r "$LOCALAPPDATA\Lark Enterprise\run"
SectionEnd
