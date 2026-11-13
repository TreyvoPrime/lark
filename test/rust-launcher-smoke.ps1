param([switch]$Desktop)
$ErrorActionPreference = 'Stop'
$channel = if ($Desktop) { 'desktop' } else { 'executable' }
$exeName = if ($Desktop) { 'Lark Desktop.exe' } else { 'Lark.exe' }
$entryClass = if ($Desktop) { 'lark.Desktop' } else { 'lark.Executable' }
$repo = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $repo 'build/rust-launcher-smoke'
New-Item -ItemType Directory -Force (Join-Path $fixture 'app'), (Join-Path $fixture 'jdk/bin'), (Join-Path $fixture 'jdk/lib'), (Join-Path $fixture 'local') | Out-Null
Copy-Item (Join-Path $repo 'packaging/executable/launcher/target/release/lark-executable-launcher.exe') (Join-Path $fixture $exeName) -Force
$javaSource = Join-Path $fixture 'fake-java.rs'
@'
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::fs::write(std::env::var_os("LARK_LAUNCH_CAPTURE").unwrap(), args.join("\n")).unwrap();
}
'@ | Set-Content -Encoding utf8 $javaSource
& rustc $javaSource -o (Join-Path $fixture 'jdk/bin/java.exe')
if ($LASTEXITCODE -ne 0) { throw 'Could not compile fake Java' }
[System.IO.File]::WriteAllBytes((Join-Path $fixture 'jdk/bin/javac.exe'), [byte[]](1))
Set-Content (Join-Path $fixture 'jdk/lib/jvm.cfg') 'test'
[System.IO.File]::WriteAllBytes((Join-Path $fixture 'app/lark.jar'), [byte[]](80,75,3,4))
[System.IO.File]::WriteAllBytes((Join-Path $fixture 'app/lark.jar.pending'), [byte[]](80,75,3,4,42))
Set-Content (Join-Path $fixture 'app/lark-native.exe.pending') 'new helper'
$previousLocal = $env:LOCALAPPDATA
$previousCapture = $env:LARK_LAUNCH_CAPTURE
try {
  $env:LOCALAPPDATA = Join-Path $fixture 'local'
  $env:LARK_LAUNCH_CAPTURE = Join-Path $fixture 'arguments.txt'
  Remove-Item -LiteralPath $env:LARK_LAUNCH_CAPTURE -Force -ErrorAction SilentlyContinue
  $p = Start-Process (Join-Path $fixture $exeName) -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -ne 0 -or !(Test-Path $env:LARK_LAUNCH_CAPTURE)) { throw 'Launcher did not invoke Java' }
  $args = Get-Content $env:LARK_LAUNCH_CAPTURE
  foreach ($expected in @("-Dlark.$channel=true", "-Dlark.channel=$channel", '-Dlark.ui=jar', '-cp', $entryClass)) {
    if ($expected -notin $args) { throw "Missing launch argument: $expected" }
  }
  if ((Get-Item (Join-Path $fixture 'app/lark.jar')).Length -ne 5) { throw 'Pending update was not applied' }
  if ((Get-Content (Join-Path $fixture 'app/lark-native.exe') -Raw).Trim() -ne 'new helper') { throw 'Native helper update was not applied' }
  if (Test-Path (Join-Path $fixture "local/Lark/run-$channel/lark.jar")) { throw 'Temporary run copy was not cleaned up' }
  if (Get-ChildItem (Join-Path $fixture "local/Lark/run-$channel") -Filter 'lark-*.jar' -ErrorAction SilentlyContinue) { throw 'Unique run copy was not cleaned up' }
  Write-Output 'Rust launcher smoke test passed: pending update, Java invocation, arguments, and cleanup.'
} finally {
  $env:LOCALAPPDATA = $previousLocal
  $env:LARK_LAUNCH_CAPTURE = $previousCapture
}
