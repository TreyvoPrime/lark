"""Exercise the packaged Mobile host with a fresh workspace and real javac/java."""
import json, os, pathlib, socket, ssl, subprocess, tempfile, time, urllib.request
root = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='lark-mobile-test-') as home:
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
    env = dict(os.environ, LARK_HOME=home)
    lan_address = socket.gethostbyname(socket.gethostname()) if os.environ.get('LARK_SMOKE_LAN') == '1' else None
    options = []
    scheme = 'http'
    if os.environ.get('LARK_SMOKE_TLS') == '1':
        store = str(pathlib.Path(home)/'identity.p12'); cert = str(pathlib.Path(home)/'identity.pem')
        password = 'test-only-ephemeral-password'
        subprocess.run(['keytool','-genkeypair','-alias','mobile','-keyalg','EC','-groupname','secp256r1','-storetype','PKCS12','-keystore',store,'-storepass',password,'-dname','CN=localhost','-ext','SAN=ip:127.0.0.1,dns:localhost'+(',ip:'+lan_address if lan_address else ''),'-validity','1','-noprompt'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['keytool','-exportcert','-rfc','-alias','mobile','-keystore',store,'-storepass',password,'-file',cert],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=cert))))
        env['LARK_MOBILE_KEYSTORE_PASSWORD'] = password
        options = ['-Dlark.mobile.keystore='+store]; scheme = 'https'
    process = subprocess.Popen(['java', *options, '-Dlark.ui=jar', '-cp', str(root/'dist/lark.jar'), 'lark.Mobile', '--lan' if lan_address else '--local-only', '--no-browser', '--port', str(port)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    def api(path, body=None, method=None, headers=None):
        request = urllib.request.Request(scheme+'://127.0.0.1:'+str(port)+path, data=None if body is None else json.dumps(body).encode(), method=method or ('POST' if body is not None else 'GET'), headers={'Content-Type':'application/json','X-Lark':'1', **(headers or {})})
        with urllib.request.urlopen(request, timeout=10) as response: return json.load(response)
    try:
        for attempt in range(100):
            try: health=api('/api/health'); break
            except OSError: time.sleep(.1)
        else: raise AssertionError('Mobile startup failed')
        assert health['mobile'] and health['lan'] == bool(lan_address)
        if lan_address:
            assert scheme == 'https'
            info = api('/api/mobile/info')
            remote = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=cert)))
            address = 'https://'+lan_address+':'+str(port)
            try:
                remote.open(address+'/api/health', timeout=5)
                raise AssertionError('Unpaired LAN request was allowed')
            except urllib.error.HTTPError as error:
                assert error.code == 403
            headers={'X-Lark-Pair':info['pair'], 'X-Lark':'1','Content-Type':'application/json'}
            with remote.open(urllib.request.Request(address+'/api/health',headers=headers)) as response:
                assert json.load(response)['ok']
            try:
                remote.open(urllib.request.Request(address+'/api/github/status',headers=headers))
                raise AssertionError('Remote client accessed host GitHub API')
            except urllib.error.HTTPError as error:
                assert error.code == 403
            print('HTTPS LAN pairing checks passed: unauthenticated denial, authenticated access, host credential API denial.')
        for body, headers, expected in [({'action':'status'}, {}, 400), ({'action':'host'}, {'X-Lark-Share-Client':'a'*64}, 403)]:
            try:
                api('/api/mobile/share', body, headers=headers)
                raise AssertionError('Mobile Share guard failed')
            except urllib.error.HTTPError as error:
                assert error.code == expected
        assert not api('/api/mobile/share', {'action':'status'}, headers={'X-Lark-Share-Client':'a'*64})['joined']
        project=api('/api/projects' , {'name':'Mobile smoke','template':'empty'})['id']
        source='public class Main { public static void main(String[] args) { java.util.Scanner s = new java.util.Scanner(System.in); System.out.println("MOBILE:" + s.nextLine()); } }'
        api('/api/projects/'+project+'/file', {'path':'src/Main.java','content':source}, 'PUT')
        assert any(f['path']=='src/Main.java' for f in api('/api/projects/'+project)['project']['files'])
        job=api('/api/run', {'project':project,'mainClass':'Main','stdin':'verified'})['id']
        for attempt in range(200):
            snap=api('/api/run/'+job)
            if snap['done']: break
            time.sleep(.1)
        assert snap['done'] and snap['exit']==0 and 'MOBILE:verified' in snap['output'], snap
        api('/api/projects/'+project+'/file', {'path':'src/Main.java','content':source}, 'PUT')
        live=api('/api/run', {'project':project,'mainClass':'Main'})['id']
        for attempt in range(100):
            live_snap=api('/api/run/'+live)
            if live_snap.get('acceptsInput'): break
            time.sleep(.1)
        api('/api/run/'+live+'/input', {'text':'live-input\n'})
        for attempt in range(100):
            live_snap=api('/api/run/'+live)
            if live_snap['done']: break
            time.sleep(.1)
        assert live_snap['done'] and 'MOBILE:live-input' in live_snap['output'], live_snap
        api('/api/projects/'+project+'/file', {'path':'src/Main.java','content':'public class Main { public static void main(String[] args) { while(true) {} } }'}, 'PUT')
        running=api('/api/run', {'project':project,'mainClass':'Main'})['id']
        api('/api/run/'+running+'/stop', {})
        for attempt in range(100):
            stopped=api('/api/run/'+running)
            if stopped['done']: break
            time.sleep(.1)
        assert stopped['done'], stopped
        debug_source='public class Main {\n public static void main(String[] args) {\n int count = 7;\n System.out.println(count);\n }\n}\n'
        api('/api/projects/'+project+'/file', {'path':'src/Main.java','content':debug_source}, 'PUT')
        debug=api('/api/debug', {'project':project,'mainClass':'Main','breakpoints':[{'file':'src/Main.java','line':4}]})['id']
        for attempt in range(100):
            debug_snap=api('/api/debug/'+debug)
            if debug_snap.get('currentLine') or debug_snap.get('done'): break
            time.sleep(.1)
        assert debug_snap.get('currentLine') == 4, debug_snap
        api('/api/debug/'+debug+'/command', {'command':'locals'})
        api('/api/debug/'+debug+'/stop', {})
        api('/api/projects/'+project+'/file', {'path':'src/Main.java','content':'public class Main { INVALID }'}, 'PUT')
        job=api('/api/run', {'project':project,'mainClass':'Main'})['id']
        for attempt in range(100):
            snap=api('/api/run/'+job)
            if snap['done']: break
            time.sleep(.1)
        assert snap['done'] and snap['exit']!=0 and 'error' in snap['output'], snap
        print('Mobile packaged-host smoke passed: project/file APIs, real compile/run, initial/live stdin, stop, debugger breakpoint and compiler errors (' + scheme + ').')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
