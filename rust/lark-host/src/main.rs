//! Phase-zero Rust host for Lark.
//!
//! The browser UI and Java API remain unchanged. This executable takes ownership
//! of launch policy, health probing, port hand-off and opening the IDE window;
//! the existing Java process remains the compatibility backend until API groups
//! move into `lark-server`.

use std::{
    env, fs,
    io::{Read, Write},
    net::{Shutdown, TcpStream},
    path::{Path, PathBuf},
    process::{Command, ExitCode, Stdio},
    thread,
    time::{Duration, Instant},
};

const DEFAULT_PORT: u16 = 43123;
const READY_TIMEOUT: Duration = Duration::from_secs(18);

#[derive(Debug, PartialEq, Eq)]
struct Options {
    port: u16,
    open_window: bool,
    replace: bool,
    java: Option<PathBuf>,
    passthrough: Vec<String>,
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Lark host: {error}");
            ExitCode::from(1)
        }
    }
}

fn run() -> Result<(), String> {
    if env::args()
        .skip(1)
        .any(|arg| arg == "--help" || arg == "-h")
    {
        println!("{}", help_text());
        return Ok(());
    }
    let options = parse_options(env::args().skip(1))?;
    let root = repository_root()?;
    ensure_java_build(&root)?;

    // The Java bridge still owns its legacy lock file during phase zero. The
    // Rust host detects a healthy existing IDE first, asks it to focus, and
    // avoids creating a duplicate process/window in normal launches.
    if !options.replace {
        if let Some(port) = running_instance_port().filter(|port| is_lark_healthy(*port)) {
            request_focus(port);
            println!("Lark is already running at {}", local_url(port));
            return Ok(());
        }
        if is_lark_healthy(options.port) {
            request_focus(options.port);
            println!("Lark is already running at {}", local_url(options.port));
            return Ok(());
        }
    }

    let mut java_args = vec![
        "-cp".to_owned(),
        build_dir(&root).display().to_string(),
        "lark.Lark".to_owned(),
        "--no-browser".to_owned(),
        "--port".to_owned(),
        options.port.to_string(),
    ];
    if options.replace {
        java_args.push("--replace".to_owned());
    }
    java_args.extend(options.passthrough);

    let java = options.java.unwrap_or_else(|| PathBuf::from("java"));
    let mut child = Command::new(java)
        .args(&java_args)
        .current_dir(&root)
        .env("LARK_HOST", "rust")
        .stdin(Stdio::null())
        .spawn()
        .map_err(|error| format!("couldn't start the Java compatibility backend: {error}"))?;

    let active_port = wait_for_lark(options.port, READY_TIMEOUT).ok_or_else(|| {
        let _ = child.kill();
        "the Java compatibility backend did not become healthy in time".to_owned()
    })?;

    let url = local_url(active_port);
    println!("Lark host ready: {url}");
    if options.open_window {
        open_window(&url)?;
    }

    let status = child
        .wait()
        .map_err(|error| format!("couldn't wait for Java backend: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Java compatibility backend exited with {status}"))
    }
}

fn parse_options(args: impl IntoIterator<Item = String>) -> Result<Options, String> {
    let mut port = env::var("LARK_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DEFAULT_PORT);
    let mut open_window = true;
    let mut replace = false;
    let mut java = env::var_os("LARK_JAVA").map(PathBuf::from);
    let mut passthrough = Vec::new();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => return Err(help_text()),
            "--port" => port = parse_port(args.next().ok_or("--port needs a number")?)?,
            "--no-browser" => open_window = false,
            "--replace" => replace = true,
            "--java" => java = Some(PathBuf::from(args.next().ok_or("--java needs a path")?)),
            "--" => {
                passthrough.extend(args);
                break;
            }
            _ => passthrough.push(arg),
        }
    }
    Ok(Options {
        port,
        open_window,
        replace,
        java,
        passthrough,
    })
}

fn parse_port(value: String) -> Result<u16, String> {
    value
        .parse::<u16>()
        .ok()
        .filter(|port| *port != 0)
        .ok_or_else(|| format!("invalid port: {value}"))
}

fn help_text() -> String {
    "Lark Rust host (compatibility bridge)\n\nUsage: lark-host [--port PORT] [--no-browser] [--replace] [--java PATH] [--] [existing Lark options]\n\nThe current release starts the existing Java backend and preserves its HTTP API.\nSet LARK_JAVA to select a Java executable.".to_owned()
}

fn repository_root() -> Result<PathBuf, String> {
    let root = env::current_dir().map_err(|error| error.to_string())?;
    if root.join("src").join("lark").join("Lark.java").is_file() {
        Ok(root)
    } else {
        Err("run lark-host from the Lark repository root".to_owned())
    }
}

fn build_dir(root: &Path) -> PathBuf {
    root.join("build")
}

fn ensure_java_build(root: &Path) -> Result<(), String> {
    let build = build_dir(root);
    if build.join("lark").join("Lark.class").is_file() {
        return Ok(());
    }
    fs::create_dir_all(&build)
        .map_err(|error| format!("couldn't create build directory: {error}"))?;
    let sources = java_sources(&root.join("src"))?;
    if sources.is_empty() {
        return Err("no Java sources found".to_owned());
    }
    let status = Command::new(env::var_os("LARK_JAVAC").unwrap_or_else(|| "javac".into()))
        .current_dir(root)
        .args(["--release", "17", "-encoding", "UTF-8", "-d"])
        .arg(&build)
        .args(sources)
        .status()
        .map_err(|error| format!("couldn't start javac: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("javac failed with {status}"))
    }
}

fn java_sources(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            files.extend(java_sources(&path)?);
        } else if path
            .extension()
            .is_some_and(|extension| extension == "java")
        {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn wait_for_lark(requested_port: u16, timeout: Duration) -> Option<u16> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        // Server.start may advance to the next free local port. Probe a small,
        // deterministic range rather than assuming the requested port won.
        for port in requested_port..requested_port.saturating_add(8) {
            if is_lark_healthy(port) {
                return Some(port);
            }
        }
        thread::sleep(Duration::from_millis(120));
    }
    None
}

fn is_lark_healthy(port: u16) -> bool {
    http_status(port, "GET", "/api/health").is_some_and(|status| (200..300).contains(&status))
}

fn request_focus(port: u16) {
    let _ = http_status(port, "POST", "/api/focus");
}

fn http_status(port: u16, method: &str, path: &str) -> Option<u16> {
    let mut stream = TcpStream::connect_timeout(
        &(std::net::Ipv4Addr::LOCALHOST, port).into(),
        Duration::from_millis(450),
    )
    .ok()?;
    stream
        .set_read_timeout(Some(Duration::from_millis(650)))
        .ok()?;
    let body = if method == "POST" { "{}" } else { "" };
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-Lark: 1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).ok()?;
    let _ = stream.shutdown(Shutdown::Write);
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    response.split_whitespace().nth(1)?.parse().ok()
}

fn local_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/")
}

/// Read the Java bridge's hand-off file until the Rust host is the sole
/// single-instance authority. This preserves focus behavior across upgrades.
fn running_instance_port() -> Option<u16> {
    let home = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE"))?;
    let value = fs::read_to_string(
        PathBuf::from(home)
            .join(".lark")
            .join("instance")
            .join("portable.port"),
    )
    .ok()?;
    value
        .split_whitespace()
        .next()?
        .parse::<u16>()
        .ok()
        .filter(|port| *port != 0)
}

fn open_window(url: &str) -> Result<(), String> {
    let mut command = if cfg!(target_os = "windows") {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", url]);
        command
    } else if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.arg(url);
        command
    } else {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("couldn't open Lark's window: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_the_existing_portable_launcher() {
        let options = parse_options(Vec::<String>::new()).unwrap();
        assert_eq!(options.port, DEFAULT_PORT);
        assert!(options.open_window);
    }

    #[test]
    fn host_options_are_not_forwarded_to_java() {
        let options = parse_options(
            [
                "--port",
                "44000",
                "--no-browser",
                "--replace",
                "--java",
                "custom-java",
                "--",
                "--future-flag",
            ]
            .map(str::to_owned),
        )
        .unwrap();
        assert_eq!(options.port, 44000);
        assert!(!options.open_window);
        assert!(options.replace);
        assert_eq!(options.java, Some(PathBuf::from("custom-java")));
        assert_eq!(options.passthrough, ["--future-flag"]);
    }

    #[test]
    fn rejects_invalid_ports() {
        assert!(parse_port("0".into()).is_err());
        assert!(parse_port("nope".into()).is_err());
    }
}
