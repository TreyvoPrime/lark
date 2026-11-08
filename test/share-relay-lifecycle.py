"""Exercise cold-start retry, duplicate initialization and cancellation against local TLS mocks."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time

repo = Path(__file__).resolve().parents[1]
build = (repo / "build").resolve()
build.mkdir(exist_ok=True)
openssl = shutil.which("openssl")
if not openssl and os.name == "nt":
    candidate = Path(r"C:\Program Files\Git\usr\bin\openssl.exe")
    if candidate.is_file(): openssl = str(candidate)
if not openssl: raise RuntimeError("OpenSSL is required for the local TLS mock")

def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

with tempfile.TemporaryDirectory(prefix="relay-test-", dir=build) as temporary:
    root = Path(temporary).resolve()
    assert root.is_relative_to(build)
    cert, key, store = root / "cert.pem", root / "key.pem", root / "trust.p12"
    subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key), "-out", str(cert), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["keytool", "-importcert", "-noprompt", "-alias", "relay", "-file", str(cert), "-keystore", str(store), "-storetype", "PKCS12", "-storepass", "testpass123"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    port1, port2, port3 = free_port(), free_port(), free_port()
    script = root / "mock.cjs"
    script.write_text('''const h=require("node:https"),f=require("node:fs"); let count=0;
const opts={key:f.readFileSync(process.argv[2]),cert:f.readFileSync(process.argv[3])};
h.createServer(opts,(q,r)=>{count++;r.writeHead(count>2?200:503,{"content-type":"application/json"});r.end(count>2?JSON.stringify({ok:true}):"{}")}).listen(Number(process.argv[4]),"127.0.0.1");
h.createServer(opts,(q,r)=>{r.writeHead(503);r.end("{}")}).listen(Number(process.argv[5]),"127.0.0.1");
const relay=require(process.argv[7]), handler=relay.createServer().listeners("request")[0];
const actual=h.createServer(opts,(q,r)=>{if(q.url==="/test/reset"){relay.rooms.clear();r.writeHead(200);r.end("ok");setTimeout(()=>actual.closeAllConnections(),100)}else handler(q,r)});
actual.listen(Number(process.argv[6]),"127.0.0.1");''', encoding="utf-8")
    env = os.environ.copy(); env["LARK_HOME"] = str(root / "home")
    server = subprocess.Popen(["node", str(script), str(key), str(cert), str(port1), str(port2), str(port3), str(repo / "relay" / "server.js")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        time.sleep(0.5)
        subprocess.run(["javac", "--release", "17", "-encoding", "UTF-8", "-cp", "build", "-d", "build", "test/ShareRelayLifecycleCheck.java", "test/ShareRelayRecoveryCheck.java"], cwd=repo, env=env, check=True)
        subprocess.run(["java", "-Djavax.net.ssl.trustStore=" + str(store), "-Djavax.net.ssl.trustStorePassword=testpass123", "-cp", "build", "lark.ShareRelayLifecycleCheck", f"https://127.0.0.1:{port1}", f"https://127.0.0.1:{port2}"], cwd=repo, env=env, check=True, timeout=40)
        subprocess.run(["java", "-Djavax.net.ssl.trustStore=" + str(store), "-Djavax.net.ssl.trustStorePassword=testpass123", "-cp", "build", "lark.ShareRelayRecoveryCheck", f"https://127.0.0.1:{port3}"], cwd=repo, env=env, check=True, timeout=45)
    finally:
        server.terminate(); server.wait(timeout=10)
