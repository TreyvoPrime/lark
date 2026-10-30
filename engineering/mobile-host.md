# Mobile host security and platform support

Start local development with `java -cp lark.jar lark.Mobile --local-only`. Compilation and debugging require a complete JDK 17+, including javac, java, jdb and keytool.

For LAN access, provision a browser-trusted certificate in a PKCS12 keystore with a Subject Alternative Name for the host address. Set `LARK_MOBILE_KEYSTORE_PASSWORD` through your operating system's secret configuration, then launch `java -Dlark.mobile.keystore=/path/to/identity.p12 -cp lark.jar lark.Mobile --lan`. Phone browsers and Android must trust that certificate. Never disable certificate verification. The default is local-only; HTTP LAN is rejected.

Open the private Phone URL on Android, iPhone, iPad or a modern desktop browser. Initial pairing sets an HttpOnly, SameSite cookie (Secure on HTTPS) for same-origin assets and requests. The frontend removes the token from its displayed URL. Keep the console and host running. The token grants trusted-owner access to workspace files and explicit program execution. It is NOT an invitation for untrusted collaborators. Share uses its own authenticated, role-enforced protocol and host approval; Mobile does not bypass that protocol.

Remote clients cannot access GitHub credentials, terminal, updater or recovery-control APIs. Remote Java programs have a 256 MiB heap cap, two reported processors, bounded output and a 60-second run timeout. These are resource controls, NOT an OS security sandbox: programs run with the host account's access. Use a dedicated OS account/container/VM for isolation. This build must not be offered as a public untrusted-code execution service. No automatic collaborator execution is added.

Android native client: source under android/. It connects to the HTTPS host and does not embed a local JVM. Production APK signing and physical Android installation tests remain required. iPhone/iPad use browser access; no native iOS distribution is included. The manifest supports a standalone browser display, but offline compilation is not available.
