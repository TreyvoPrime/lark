# Lark security

Lark is a **local** Java IDE. The HTTP server binds to **127.0.0.1** by default and is not meant to be exposed to the internet.

## Products

| Edition | What you run | Runtime layout |
| --- | --- | --- |
| **Lark Desktop** | `LarkDesktopSetup.exe` → Start Menu | `Lark Desktop.exe` + hidden `app\` + `jdk\` |
| **Lark Executable** | `Lark.exe` after Extract All | Same burial: only the exe is meant to be obvious |
| **Lark Mobile** | `Start Lark Mobile` | Host + phone pair over Wi‑Fi |

Do not replace `jdk/` or `app/lark.jar` with files from untrusted sources.

## Hardening in 3.7+

- Native Windows launchers **refuse PATH java** — only the bundled JDK
- Jar and JDK paths must stay **inside the install folder** (symlink escape rejected)
- Launchers verify **JAR magic bytes** before start
- Runtime folders (`app/`, `jdk/`) are **soft-hidden** on Windows
- Boot logs live under `%LOCALAPPDATA%\Lark\logs`, not next to the exe
- Run-copy jars use a private folder and are removed after exit when possible
- Mutating API calls require the `X-Lark` header and a **loopback / paired Origin**
- Responses send CSP, `X-Frame-Options: DENY`, COOP/CORP, and Permissions-Policy
- In-app updates from the public feed require **HTTPS on allowlisted hosts** and **SHA-256** (unsigned remote feeds are refused)
- Wi‑Fi / phone clients cannot point updates at arbitrary URLs
- Temp / zip-preview / Internet Cache paths are refused at launch

## What “safe” means

No desktop app is literally impossible to attack. Lark aims to be a **safe default install**: local-only, integrity-checked updates, no surprise downloads, minimal attack surface on the loopback API.

Report issues via the GitHub repository security advisories or issues.
