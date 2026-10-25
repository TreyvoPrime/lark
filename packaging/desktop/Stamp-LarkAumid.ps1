#Requires -Version 5.0
<#
.SYNOPSIS
  Stamps System.AppUserModel.ID on Lark Desktop shortcuts so the taskbar pin
  groups with the Edge/Chrome --app window (same ID as Lark Desktop.exe).
#>
[CmdletBinding()]
param(
  [string]$AppId = "TreyvoPrime.Lark.Desktop",
  [string[]]$Paths = @()
)

$ErrorActionPreference = "SilentlyContinue"

if (-not $Paths -or $Paths.Count -eq 0) {
  $programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
  $desktop = [Environment]::GetFolderPath("Desktop")
  $taskbar = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
  $Paths = @(
    (Join-Path $programs "Lark Desktop.lnk"),
    (Join-Path $programs "Lark\Lark Desktop.lnk"),
    (Join-Path $desktop "Lark Desktop.lnk"),
    (Join-Path $taskbar "Lark Desktop.lnk"),
    (Join-Path $taskbar "Lark.lnk")
  )
}

$code = @"
using System;
using System.Runtime.InteropServices;
public static class LarkAumidStamp {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  static extern void SHGetPropertyStoreFromParsingName(string pszPath, IntPtr pbc, uint flags, ref Guid riid, out IPropertyStore ppv);
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    void GetCount(out uint cProps);
    void GetAt(uint iProp, out PropertyKey pkey);
    void GetValue(ref PropertyKey key, out PropVariant pv);
    void SetValue(ref PropertyKey key, ref PropVariant pv);
    void Commit();
  }
  [StructLayout(LayoutKind.Sequential, Pack=4)] struct PropertyKey { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] struct PropVariant {
    public ushort vt; public ushort w1; public ushort w2; public ushort w3;
    public IntPtr pointerValue; public int i1; public int i2;
  }
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant pvar);
  public static void Set(string path, string appId) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore store;
    SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 2, ref iid, out store);
    var key = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    var pv = new PropVariant(); pv.vt = 31; pv.pointerValue = Marshal.StringToCoTaskMemUni(appId);
    try { store.SetValue(ref key, ref pv); store.Commit(); } finally { PropVariantClear(ref pv); }
  }
}
"@

try {
  if (-not ("LarkAumidStamp" -as [type])) {
    Add-Type -TypeDefinition $code
  }
} catch {
  exit 0
}

foreach ($p in $Paths) {
  if (-not $p) { continue }
  if (-not (Test-Path -LiteralPath $p)) { continue }
  try {
    [LarkAumidStamp]::Set($p, $AppId)
  } catch {}
}
