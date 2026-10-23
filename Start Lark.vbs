' Double-click friendly entry that always shows a console window.
' Prefer this if Start Lark.bat flashes and disappears on your PC.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
bat = folder & "\Start Lark.bat"
If Not fso.FileExists(bat) Then
  MsgBox "Start Lark.bat is missing next to this file." & vbCrLf & folder, 16, "Lark"
  WScript.Quit 1
End If
' /k keeps the window open; --inner runs the real boot logic.
sh.CurrentDirectory = folder
sh.Run "cmd /k call """ & bat & """ --inner", 1, False
