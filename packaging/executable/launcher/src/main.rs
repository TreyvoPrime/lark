#![cfg_attr(not(test), windows_subsystem = "windows")]

use std::os::windows::{ffi::OsStrExt, process::CommandExt};
use std::{
    env, fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::Duration,
};

const DESKTOP: bool = cfg!(feature = "desktop");
const APP_ID: &str = if DESKTOP {
    "TreyvoPrime.Lark.Desktop"
} else {
    "TreyvoPrime.Lark.Executable"
};
const CHANNEL: &str = if DESKTOP { "desktop" } else { "executable" };
const EXE: &str = if DESKTOP {
    "Lark Desktop.exe"
} else {
    "Lark.exe"
};
const CLASS: &str = if DESKTOP {
    "lark.Desktop"
} else {
    "lark.Executable"
};
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[link(name = "shell32")]
extern "system" {
    fn SetCurrentProcessExplicitAppUserModelID(id: *const u16) -> i32;
}
#[link(name = "user32")]
extern "system" {
    fn MessageBoxW(window: isize, text: *const u16, title: *const u16, kind: u32) -> i32;
}
#[link(name = "kernel32")]
extern "system" {
    fn GetFileAttributesW(path: *const u16) -> u32;
    fn SetFileAttributesW(path: *const u16, attributes: u32) -> i32;
}
fn wide(s: &std::ffi::OsStr) -> Vec<u16> {
    s.encode_wide().chain(Some(0)).collect()
}
fn alert(message: &str) {
    unsafe {
        MessageBoxW(
            0,
            wide(message.as_ref()).as_ptr(),
            wide(if DESKTOP { "Lark Desktop" } else { "Lark" }.as_ref()).as_ptr(),
            0x10,
        );
    }
}
fn log(path: &Path, msg: &str) {
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{msg}");
    }
}
fn local_dir() -> PathBuf {
    env::var_os("LOCALAPPDATA")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
}
fn unsafe_install_path(path: &Path) -> bool {
    let path = path.to_string_lossy().to_lowercase();
    [
        "\\temp\\",
        ".zip.",
        "\\inetcache\\",
        "\\temporary internet files\\",
    ]
    .iter()
    .any(|part| path.contains(part))
}
fn ensure_inside(root: &Path, path: &Path) -> io::Result<()> {
    let root = fs::canonicalize(root)?;
    let path = fs::canonicalize(path)?;
    // Windows paths are case insensitive; canonicalize also resolves junctions and symlinks.
    let root = root.to_string_lossy().to_lowercase();
    let path = path.to_string_lossy().to_lowercase();
    if path == root
        || path
            .strip_prefix(&root)
            .is_some_and(|rest| rest.starts_with('\\'))
    {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "path outside install",
        ))
    }
}
fn jar_valid(path: &Path) -> io::Result<()> {
    let mut header = [0; 4];
    fs::File::open(path)?.read_exact(&mut header)?;
    if &header[..2] == b"PK" {
        Ok(())
    } else {
        Err(io::Error::new(io::ErrorKind::InvalidData, "invalid jar"))
    }
}
fn append_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(suffix);
    PathBuf::from(value)
}
fn apply_pending(target: &Path, log_path: &Path) -> io::Result<()> {
    let pending = append_suffix(target, ".pending");
    let backup = append_suffix(target, ".bak");
    if !pending.is_file() {
        return Ok(());
    }
    for attempt in 1..=40 {
        log(
            log_path,
            &format!("Applying pending update try {attempt}/40"),
        );
        let _ = fs::remove_file(&backup);
        if target.is_file() && fs::rename(target, &backup).is_err() {
            thread::sleep(Duration::from_millis(400));
            continue;
        }
        if fs::rename(&pending, target).is_ok() {
            let _ = fs::remove_file(&backup);
            log(log_path, "Update applied");
            return Ok(());
        }
        if backup.is_file() && !target.exists() {
            let _ = fs::rename(&backup, target);
        }
        thread::sleep(Duration::from_millis(400));
    }
    Err(io::Error::other("could not apply pending update"))
}
fn hide(path: &Path) {
    let name = wide(path.as_os_str());
    unsafe {
        let attributes = GetFileAttributesW(name.as_ptr());
        if attributes != u32::MAX {
            SetFileAttributesW(name.as_ptr(), attributes | 2);
        }
    }
}
fn run() -> Result<(), String> {
    unsafe {
        SetCurrentProcessExplicitAppUserModelID(wide(APP_ID.as_ref()).as_ptr());
    }
    let exe = env::current_exe().map_err(|e| e.to_string())?;
    let root = exe.parent().ok_or("Could not find Lark.exe location.")?;
    let log_dir = local_dir().join("Lark").join("logs");
    let _ = fs::create_dir_all(&log_dir);
    let log_path = log_dir.join(format!("{CHANNEL}-boot.log"));
    log(
        &log_path,
        &format!(
            "Lark {CHANNEL} boot\nROOT={}\nAUMID={APP_ID}",
            root.display()
        ),
    );
    if unsafe_install_path(root) {
        return Err(if DESKTOP { "Do not run Lark Desktop from a Temp or zip preview folder. Install with LarkDesktopSetup.exe, then open it from the Start Menu." } else { "Do not run Lark from a Temp or zip preview folder. Extract the complete ZIP to a permanent folder, then open Lark.exe." }.into());
    }
    hide(&root.join("app"));
    hide(&root.join("jdk"));
    if let Err(e) = apply_pending(&root.join(EXE), &log_path) {
        log(&log_path, &format!("exe pending: {e}"));
    }
    if DESKTOP {
        if let Err(e) = apply_pending(&root.join("Lark Enterprise.exe"), &log_path) {
            log(&log_path, &format!("prior exe pending: {e}"));
        }
    }
    if let Err(e) = apply_pending(&root.join("app/lark-native.exe"), &log_path) {
        log(&log_path, &format!("native helper pending: {e}"));
    }
    let jar = [root.join("app/lark.jar"), root.join("lark.jar")]
        .into_iter()
        .find(|p| p.is_file())
        .ok_or(if DESKTOP {
            "lark.jar is missing. Re-run LarkDesktopSetup.exe."
        } else {
            "lark.jar is missing under app next to Lark.exe. Extract the FULL executable zip."
        })?;
    if let Err(e) = apply_pending(&jar, &log_path) {
        log(&log_path, &format!("jar pending: {e}"));
    }
    ensure_inside(root, &jar)
        .map_err(|e| format!("lark.jar must stay inside the Lark folder. {e}"))?;
    jar_valid(&jar).map_err(|_| {
        if DESKTOP {
            "lark.jar looks damaged. Re-run LarkDesktopSetup.exe."
        } else {
            "lark.jar looks damaged or was replaced. Re-download and extract the executable zip."
        }
    })?;
    let javaw = root.join("jdk/bin/javaw.exe");
    let java = root.join("jdk/bin/java.exe");
    let javac = root.join("jdk/bin/javac.exe");
    let jvmcfg = root.join("jdk/lib/jvm.cfg");
    if !javac.is_file() || !jvmcfg.is_file() || (!javaw.is_file() && !java.is_file()) {
        return Err(if DESKTOP { "The bundled JDK is missing or incomplete. Re-run LarkDesktopSetup.exe." } else { "The bundled JDK is missing or incomplete. Extract the complete ZIP and keep the jdk folder with Lark.exe." }.into());
    }
    for path in [&javaw, &java, &javac, &jvmcfg] {
        if path.exists() {
            ensure_inside(root, path)
                .map_err(|e| format!("Bundled JDK path escaped the install folder: {e}"))?;
        }
    }
    let launcher = if javaw.is_file() { javaw } else { java };
    let run_dir = local_dir().join(format!("Lark/run-{CHANNEL}"));
    fs::create_dir_all(&run_dir).map_err(|e| format!("Could not create run folder: {e}"))?;
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let copy = run_dir.join(format!("lark-{}-{unique}.jar", std::process::id()));
    let copied = fs::copy(&jar, &copy).is_ok();
    let run_jar = if copied {
        &copy
    } else {
        log(&log_path, "Run copy failed; using install jar");
        &jar
    };
    log(
        &log_path,
        &format!(
            "Launching {} -cp {} {CLASS}",
            launcher.display(),
            run_jar.display()
        ),
    );
    let boot_log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok();
    let stdout = boot_log
        .as_ref()
        .and_then(|f| f.try_clone().ok())
        .map(Stdio::from)
        .unwrap_or_else(Stdio::null);
    let stderr = boot_log.map(Stdio::from).unwrap_or_else(Stdio::null);
    let result = Command::new(&launcher)
        .arg(format!("-Dlark.install={}", root.display()))
        .arg(format!("-Dlark.{CHANNEL}=true"))
        .arg(format!("-Dlark.channel={CHANNEL}"))
        .args(["-Dlark.ui=jar", "-cp"])
        .arg(run_jar)
        .arg(CLASS)
        .current_dir(root)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(stdout)
        .stderr(stderr)
        .status();
    if copied {
        let _ = fs::remove_file(&copy);
    }
    match result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => {
            log(&log_path, &format!("java exit: {status}"));
            Err(format!(
                "Lark stopped with {status}. See %LOCALAPPDATA%\\Lark\\logs\\{CHANNEL}-boot.log"
            ))
        }
        Err(e) => Err(format!(
            "Could not start Java: {e}. See %LOCALAPPDATA%\\Lark\\logs\\{CHANNEL}-boot.log"
        )),
    }
}
fn main() {
    if let Err(e) = run() {
        alert(&e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("lark-rust-launcher-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    #[test]
    fn detects_temporary_install_paths() {
        assert!(unsafe_install_path(Path::new(
            r"C:\Users\x\AppData\Local\Temp\foo"
        )));
        assert!(unsafe_install_path(Path::new(r"C:\x\INETCACHE\foo")));
        assert!(!unsafe_install_path(Path::new(r"C:\Users\x\Lark")));
    }
    #[test]
    fn checks_jar_header() {
        let dir = fixture("jar");
        let jar = dir.join("lark.jar");
        fs::write(&jar, b"PK\x03\x04").unwrap();
        assert!(jar_valid(&jar).is_ok());
        fs::write(&jar, b"oops").unwrap();
        assert!(jar_valid(&jar).is_err());
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn applies_pending_update() {
        let dir = fixture("update");
        let target = dir.join("lark.jar");
        fs::write(&target, b"old").unwrap();
        fs::write(append_suffix(&target, ".pending"), b"new").unwrap();
        apply_pending(&target, &dir.join("log")).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert!(!append_suffix(&target, ".bak").exists());
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn rejects_sibling_path() {
        let dir = fixture("paths");
        let root = dir.join("install");
        let sibling = dir.join("install-other");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&sibling).unwrap();
        assert!(ensure_inside(&root, &root).is_ok());
        assert!(ensure_inside(&root, &sibling).is_err());
        let _ = fs::remove_dir_all(dir);
    }
}
