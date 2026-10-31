"""Run the actual native app and bundled compiler; never substitute a mock launcher."""
import hashlib, json, os, pathlib, socket, subprocess, tempfile, time, urllib.request
app = pathlib.Path('release/macos/Lark.app').resolve()
if not app.is_dir(): raise SystemExit('Build Lark.app on macOS first')
def digest():
    return {str(p.relative_to(app)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in app.rglob('*') if p.is_file() and not p.is_symlink()}
before = digest()
with tempfile.TemporaryDirectory(prefix='lark-mac-smoke-') as home:
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
    process = subprocess.Popen([str(app/'Contents/MacOS/Lark'), '--no-browser', '--port', str(port)],
                               env=dict(os.environ, LARK_HOME=home), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    base = 'http://127.0.0.1:' + str(port)
    def api(path, body=None, method=None):
        req = urllib.request.Request(base+path, data=None if body is None else json.dumps(body).encode(),
            method=method or ('GET' if body is None else 'POST'), headers={'Content-Type':'application/json','X-Lark':'1'})
        with urllib.request.urlopen(req,timeout=10) as response: return json.load(response)
    try:
        for _ in range(150):
            try: assert api('/api/health')['ok']; break
            except OSError:
                if process.poll() is not None: raise AssertionError(process.stderr.read().decode())
                time.sleep(.1)
        else: raise AssertionError('Native launcher did not start')
        project = api('/api/projects', {'name':'Mac app smoke','template':'empty'})['id']
        api('/api/projects/'+project+'/file', {'path':'src/Main.java','content':'public class Main { public static void main(String[] a) { System.out.println("MAC_APP_OK"); } }'}, 'PUT')
        job = api('/api/run',{'project':project,'mainClass':'Main'})['id']
        for _ in range(200):
            snap = api('/api/run/'+job)
            if snap['done']: break
            time.sleep(.1)
        assert snap['done'] and snap['exit']==0 and 'MAC_APP_OK' in snap['output'], snap
    finally:
        process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
assert digest() == before, 'Launching/compiling modified the app bundle and would invalidate its signature'
print('Native Mac app, bundled compiler/runtime and bundle immutability passed.')
