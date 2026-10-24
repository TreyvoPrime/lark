' Quiet double-click helper — opens Start Lark Mobile.bat with a visible console
' so phone pair URLs stay readable.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
bat = dir & "\Start Lark Mobile.bat"
sh.CurrentDirectory = dir
sh.Run "cmd.exe /c """ & bat & """ --inner", 1, False
