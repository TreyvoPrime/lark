"""Validate a complete local release, including embedded jar equality and updater hashes."""
import hashlib
import io
import json
import os
import shutil
import subprocess
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
release = root / 'release'

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()

expected = digest(root / 'dist/lark.jar')
required = [
    'lark-desktop-windows.zip', 'lark-desktop-mac.zip', 'lark-desktop-linux.zip',
    'lark-executable-windows.zip', 'lark-mobile-windows.zip', 'lark-mobile-mac.zip',
    'lark-mobile-linux.zip', 'lark-desktop-update.zip', 'lark-executable-update.zip',
    'lark-mobile-update.zip', 'lark-windows.zip', 'lark-mac.zip', 'lark-linux.zip',
    'lark.zip', 'lark-mobile.zip', 'lark-update.zip',
]
for name in required:
    with zipfile.ZipFile(release / name) as archive:
        assert archive.testzip() is None, name + ': archive CRC failure'
        jars = [entry for entry in archive.namelist() if entry.endswith('lark.jar')]
        assert jars, name + ': application jar missing'
        for entry in jars:
            payload = archive.read(entry)
            assert hashlib.sha256(payload).hexdigest() == expected, name + ': stale application jar'
            with zipfile.ZipFile(io.BytesIO(payload)) as app:
                for asset in ['lark/ShareDocument.class', 'lark/ShareStore.class', 'lark/ShareDiscovery.class',
                              'web/js/share-document.js', 'web/js/share-editor.js', 'web/js/share.js', 'web/js/share-birds.js', 'web/birds.html', 'web/css/share.css']:
                    assert asset in app.namelist(), name + ': missing ' + asset
                assert b'4.0.6' in app.read('lark/Settings.class'), name + ': wrong app version'
        bundled = [entry for entry in archive.namelist() if entry.endswith('jdk/bin/java') or entry.endswith('jdk/bin/java.exe')]
        if bundled:
            assert any(entry.endswith('jdk/bin/keytool') or entry.endswith('jdk/bin/keytool.exe') for entry in archive.namelist()), name + ': keytool missing'
    print(name + ': CRC, embedded app and dependencies verified')

setup = release / 'LarkDesktopSetup.exe'
with setup.open('rb') as stream:
    header = stream.read(64)
    assert header[:2] == b'MZ', 'Installer is not a Windows PE file'
    offset = int.from_bytes(header[60:64], 'little')
    stream.seek(offset)
    assert stream.read(4) == b'PE\0\0', 'Invalid installer PE header'
assert setup.stat().st_size > 1024 * 1024, 'Installer payload missing'
sevenzip = os.environ.get('SEVENZIP') or shutil.which('7zz') or shutil.which('7z')
assert sevenzip, 'Set SEVENZIP to 7-Zip to inspect the actual NSIS installer payload'
installed_jar = subprocess.run([sevenzip, 'x', '-so', str(setup), 'app/lark.jar'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
assert hashlib.sha256(installed_jar).hexdigest() == expected, 'Installer embedded a stale jar'

metadata = json.loads((release / 'update.json').read_text())
assert metadata['version'] == '4.0.6'
for key, value in metadata['sha256'].items():
    filename = key if (release / key).is_file() else metadata.get('downloads', {}).get(key, '').rsplit('/', 1)[-1]
    assert filename and (release / filename).is_file(), 'Unknown hash target: ' + key
    assert digest(release / filename) == value, 'Updater checksum mismatch: ' + key
print('Windows installer, all 16 archives and updater hashes verified. App SHA-256: ' + expected)
