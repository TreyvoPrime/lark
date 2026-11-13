use std::{
    env,
    io::{self, Read, Write},
    process::{Command, Stdio},
    sync::{
        mpsc::{sync_channel, TrySendError},
        Arc, Mutex,
    },
    thread,
};
const CAP: usize = 400_000;
fn append(buffer: &Arc<Mutex<Vec<u8>>>, bytes: &[u8]) {
    let Ok(mut out) = buffer.lock() else { return };
    out.extend_from_slice(bytes);
    if out.len() > CAP {
        let remove = out.len() - CAP / 2;
        out.drain(..remove);
        out.splice(..0, b"...\n".iter().copied());
    }
}
fn pump<R: Read + Send + 'static>(
    mut reader: R,
    buffer: Arc<Mutex<Vec<u8>>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut data = [0u8; 4096];
        while let Ok(n) = reader.read(&mut data) {
            if n == 0 {
                break;
            }
            append(&buffer, &data[..n]);
        }
    })
}
pub fn run() -> io::Result<()> {
    let mut args = env::args_os().skip(2);
    let program = args
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing shell"))?;
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let mut shell_input = child
        .stdin
        .take()
        .ok_or_else(|| io::Error::other("missing shell stdin"))?;
    let buffer = Arc::new(Mutex::new(Vec::new()));
    let stdout_thread = pump(
        child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("missing shell stdout"))?,
        buffer.clone(),
    );
    let stderr_thread = pump(
        child
            .stderr
            .take()
            .ok_or_else(|| io::Error::other("missing shell stderr"))?,
        buffer.clone(),
    );
    let (tx, rx) = sync_channel::<(bool, Vec<u8>)>(32);
    let echo_buffer = buffer.clone();
    thread::spawn(move || {
        while let Ok((sensitive, line)) = rx.recv() {
            if !sensitive {
                if !cfg!(windows) {
                    append(&echo_buffer, b"$ ");
                }
                append(&echo_buffer, &line);
            }
            if shell_input
                .write_all(&line)
                .and_then(|_| shell_input.flush())
                .is_err()
            {
                append(
                    &echo_buffer,
                    b"\n-- Could not send input to the shell. --\n",
                );
                break;
            }
        }
    });
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    output.write_all(&[0])?;
    output.flush()?;
    loop {
        let mut op = [0];
        if input.read_exact(&mut op).is_err() {
            break;
        }
        match op[0] {
            1 => {
                let alive = child.try_wait()?.is_none()
                    || !stdout_thread.is_finished()
                    || !stderr_thread.is_finished();
                let out = buffer.lock().map_err(|_| io::Error::other("output lock"))?;
                output.write_all(&[if alive { 1 } else { 0 }])?;
                output.write_all(&(out.len() as u32).to_be_bytes())?;
                output.write_all(&out)?;
                output.flush()?;
            }
            2 => {
                let mut header = [0u8; 5];
                input.read_exact(&mut header)?;
                let len = u32::from_be_bytes(header[1..].try_into().unwrap()) as usize;
                if len > 100_000 {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "input too large",
                    ));
                }
                let mut bytes = vec![0; len];
                input.read_exact(&mut bytes)?;
                let status = if child.try_wait()?.is_some() {
                    2
                } else {
                    match tx.try_send((header[0] != 0, bytes)) {
                        Ok(()) => 0,
                        Err(TrySendError::Full(_)) => 1,
                        Err(TrySendError::Disconnected(_)) => 2,
                    }
                };
                output.write_all(&[status])?;
                output.flush()?;
            }
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "unknown terminal operation",
                ))
            }
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    Ok(())
}
