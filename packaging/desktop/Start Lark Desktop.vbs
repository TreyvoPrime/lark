' Lark Desktop — silent start (lives in app\; launches ..\Start Lark Desktop.bat)
Option Explicit
Dim sh, fso, here, root, bat
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(here)
bat = root & "\Start Lark Desktop.bat"
If Not fso.FileExists(bat) Then
  MsgBox "Start Lark Desktop.bat is missing in the Lark folder.", 16, "Lark Desktop"
  WScript.Quit 1
End If
sh.CurrentDirectory = root
' 0 = hidden window, False = do not wait
sh.Run """" & bat & """ --inner", 0, False
