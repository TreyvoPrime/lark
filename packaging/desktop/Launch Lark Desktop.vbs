' Lark Desktop — start without a console flash
Option Explicit
Dim sh, fso, root, bat, log
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
bat = root & "\Launch Lark Desktop.bat"
If Not fso.FileExists(bat) Then
  MsgBox "Launch Lark Desktop.bat is missing next to this script.", 16, "Lark Desktop"
  WScript.Quit 1
End If
sh.CurrentDirectory = root
' 0 = hidden window, False = do not wait
sh.Run """" & bat & """ --inner", 0, False
