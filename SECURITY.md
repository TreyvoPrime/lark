# Lark security

Lark is a **local** Java IDE. The HTTP server binds to **127.0.0.1** by default and is not meant to be exposed to the internet.

## Install layout (Desktop)

After extract you should see:

- `Start Lark Desktop` (bat / command)
- `jdk/` — the only Java Lark Desktop will run
- `app/` — jar, markers, optional helpers (soft-hidden on Windows installs)

Do not replace `jdk/` or `app/lark.jar` with files from untrusted sources.

## Hardening in 3.6+

- Desktop launchers **refuse PATH java** — only the bundled JDK
- Jar path must stay **inside the install folder** (symlink escape rejected)
- Mutating API calls require the `X-Lark` header and a **loopback / paired Origin**
- Responses send CSP, `X-Frame-Options: DENY`, COOP/CORP, and Permissions-Policy
- In-app updates from the public feed require **HTTPS on allowlisted hosts** and **SHA-256** when hashes are published (unsigned remote feeds are refused)
- Wi‑Fi / phone clients cannot point updates at arbitrary URLs

## What “safe” means

No desktop app is literally impossible to attack. Lark aims to be a **safe default install**: local-only, integrity-checked updates, no surprise downloads, minimal attack surface on the loopback API.

Report issues via the GitHub repository security advisories or issues.
