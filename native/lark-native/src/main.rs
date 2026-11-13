use std::{
    env, fs,
    io::{self, BufRead, BufReader, Read, Write},
    path::Path,
    process::{Command, Stdio},
};
mod terminal;

// Git emits one line per changed path by default; quoted filenames cannot add lines.
fn summarize<R: BufRead>(mut input: R) -> io::Result<String> {
    let mut line = Vec::new();
    let first = if input.read_until(b'\n', &mut line)? > 0 {
        String::from_utf8_lossy(&line)
            .trim_end_matches(['\r', '\n'])
            .to_owned()
    } else {
        String::new()
    };
    let branch = first.strip_prefix("## ").unwrap_or("repository");
    let mut count = 0usize;
    loop {
        line.clear();
        if input.read_until(b'\n', &mut line)? == 0 {
            break;
        }
        count += 1;
    }
    Ok(if count == 0 {
        format!("{branch} · clean")
    } else {
        format!("{branch} · {count} changed")
    })
}
fn git_status() -> io::Result<()> {
    let mut git = Command::new("git")
        .args([
            "--no-optional-locks",
            "status",
            "--porcelain=v1",
            "--branch",
        ])
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let output = summarize(BufReader::new(git.stdout.take().expect("stdout piped")));
    let status = git.wait()?;
    if status.success() {
        println!("{}", output?);
        Ok(())
    } else {
        Err(io::Error::other("git status failed"))
    }
}
fn shell() -> io::Result<()> {
    let mut args = env::args_os().skip(2);
    let program = args
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing shell"))?;
    let status = Command::new(program)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!("shell exited: {status}")))
    }
}
fn write_file(path: &Path, input: &mut dyn Read) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing parent directory"))?;
    fs::create_dir_all(parent)?;
    let mut temp_name = path.as_os_str().to_os_string();
    temp_name.push(".larktmp");
    let temp = std::path::PathBuf::from(temp_name);
    let mut file = fs::File::create(&temp)?;
    io::copy(input, &mut file)?;
    file.flush()?;
    drop(file);
    fs::rename(temp, path)
}

fn delete_path(path: &Path) -> io::Result<()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    if metadata.file_type().is_symlink() {
        #[cfg(windows)]
        {
            return fs::remove_file(path).or_else(|_| fs::remove_dir(path));
        }
        #[cfg(not(windows))]
        {
            return fs::remove_file(path);
        }
    }
    if metadata.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

#[cfg(windows)]
fn move_new(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileW(source: *const u16, target: *const u16) -> i32;
    }
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe { MoveFileW(source.as_ptr(), target.as_ptr()) } != 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn move_new(source: &Path, target: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let source = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid source"))?;
    let target = CString::new(target.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid target"))?;
    #[cfg(target_os = "linux")]
    let result = {
        extern "C" {
            fn renameat2(
                olddirfd: i32,
                oldpath: *const i8,
                newdirfd: i32,
                newpath: *const i8,
                flags: u32,
            ) -> i32;
        }
        unsafe { renameat2(-100, source.as_ptr(), -100, target.as_ptr(), 1) }
    };
    #[cfg(target_os = "macos")]
    let result = {
        extern "C" {
            fn renamex_np(from: *const i8, to: *const i8, flags: u32) -> i32;
        }
        unsafe { renamex_np(source.as_ptr(), target.as_ptr(), 4) }
    };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn move_new(_source: &Path, _target: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "exclusive rename unsupported",
    ))
}

fn move_path(source: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir_all(
        target
            .parent()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing parent"))?,
    )?;
    move_new(source, target)
}

fn skip_project_path(path: &str) -> bool {
    path.split('/')
        .any(|part| part.starts_with('.') || part == "out" || part == "bin")
        || path.ends_with(".class")
}

fn collect_project(
    root: &Path,
    dir: &Path,
    entries: &mut Vec<std::path::PathBuf>,
) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let rel = path.strip_prefix(root).map_err(io::Error::other)?;
        let rel = rel
            .to_str()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "invalid filename"))?
            .replace('\\', "/");
        let file_type = entry.file_type()?;
        if !skip_project_path(&rel) {
            entries.push(path.clone());
        }
        // Java Files.walk does not follow directory symlinks. Do not prune .class
        // directories because their children can still be visible under Java rules.
        if file_type.is_dir()
            && !rel
                .split('/')
                .any(|part| part.starts_with('.') || part == "out" || part == "bin")
        {
            collect_project(root, &path, entries)?;
        }
    }
    Ok(())
}

fn project_read(root: &Path, out: &mut dyn Write) -> io::Result<()> {
    let mut entries = Vec::new();
    collect_project(root, root, &mut entries)?;
    entries.sort();
    for path in entries {
        let rel = path
            .strip_prefix(root)
            .map_err(io::Error::other)?
            .to_str()
            .ok_or_else(|| io::Error::other("invalid filename"))?
            .replace('\\', "/");
        let metadata = fs::metadata(&path)?;
        let (kind, content) = if metadata.is_dir() {
            (1u8, Vec::new())
        } else if metadata.is_file() && metadata.len() > 20_000_000 {
            (3, Vec::new())
        } else if metadata.is_file() {
            let bytes = fs::read(&path)?;
            if std::str::from_utf8(&bytes).is_ok() {
                (2, bytes)
            } else {
                (4, Vec::new())
            }
        } else {
            continue;
        };
        out.write_all(&[kind])?;
        out.write_all(&(u32::try_from(rel.len()).map_err(io::Error::other)?).to_be_bytes())?;
        out.write_all(rel.as_bytes())?;
        if kind == 2 {
            out.write_all(
                &(u32::try_from(content.len()).map_err(io::Error::other)?).to_be_bytes(),
            )?;
            out.write_all(&content)?;
        }
    }
    out.write_all(&[0])
}
fn main() {
    let result = match env::args().nth(1).as_deref() {
        Some("git-status") => git_status(),
        Some("shell") => shell(),
        Some("terminal-session") => terminal::run(),
        Some("mkdir") => match env::args_os().nth(2) {
            Some(path) => fs::create_dir_all(path),
            None => Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "missing directory path",
            )),
        },
        Some("delete") => match env::args_os().nth(2) {
            Some(path) => delete_path(Path::new(&path)),
            None => Err(io::Error::new(io::ErrorKind::InvalidInput, "missing path")),
        },
        Some("move") => match (env::args_os().nth(2), env::args_os().nth(3)) {
            (Some(source), Some(target)) => move_path(Path::new(&source), Path::new(&target)),
            _ => Err(io::Error::new(io::ErrorKind::InvalidInput, "missing paths")),
        },
        Some("project-read") => match env::args_os().nth(2) {
            Some(path) => project_read(Path::new(&path), &mut io::stdout().lock()),
            None => Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "missing project path",
            )),
        },
        Some("write-file") => match env::args_os().nth(2) {
            Some(path) => write_file(Path::new(&path), &mut io::stdin().lock()),
            None => Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "missing file path",
            )),
        },
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "expected git-status",
        )),
    };
    if let Err(error) = result {
        if env::args_os().nth(1).as_deref() == Some(std::ffi::OsStr::new("shell")) {
            eprintln!("Lark terminal: {error}");
        }
        std::process::exit(1);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clean_branch() {
        assert_eq!(summarize("## main\n".as_bytes()).unwrap(), "main · clean");
    }
    #[test]
    fn changed_files() {
        assert_eq!(
            summarize("## feature\n M a\n?? b\n".as_bytes()).unwrap(),
            "feature · 2 changed"
        );
    }
    #[test]
    fn handles_empty() {
        assert_eq!(summarize("".as_bytes()).unwrap(), "repository · clean");
    }
    #[test]
    fn writes_and_replaces_file() {
        let root = env::temp_dir().join(format!("lark-rust-write-{}", std::process::id()));
        let path = root.join("nested/file.txt");
        write_file(&path, &mut "first".as_bytes()).unwrap();
        write_file(&path, &mut "updated é".as_bytes()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "updated é");
        assert!(!path.with_file_name("file.txt.larktmp").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
