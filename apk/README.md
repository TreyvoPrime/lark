# Lark Mobile APK

Android shell for the Lark Mobile IDE (Capacitor + WebView) that **runs Java on the phone**.

## What it is

- Native APK around `web-mobile/`
- Same Desk themes and engine APIs as Desktop / Executable
- **On-device engine (default):** bundled Android OpenJDK natives (`liblarkjava.so` + JRE `.so` in `jniLibs`) plus ECJ compile — tap **Start on this phone**
- **Fallback:** Wi‑Fi host pairing if a device still blocks local Java

### First run on a phone

1. Install `LarkMobile-debug.apk` (allow unknown sources)
2. Open **Lark Mobile**
3. Wait for **Start on this phone** (auto-starts when the JRE is bundled) or tap it once
4. Create a project and Run — no PC required

## Build a debug APK

Requires Node 20+, JDK 17+, Android SDK, and network once (to fetch the Android JRE into `jniLibs`).

```bash
# From repo root: build lark.jar + ECJ into apk assets
./package.sh   # or your usual jar build, then copy dist/lark.jar → apk/android/app/src/main/assets/engine/

cd apk
npm install
npm run build:apk   # prepare-jre → sync www → assembleDebug
```

Debug APK path:

```text
apk/android/app/build/outputs/apk/debug/app-debug.apk
```

Install:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## How on-device Java works

Android 10+ blocks executing binaries from writable app storage. Lark ships the JVM launcher as `liblarkjava.so` under `jniLibs` so it is extracted to the app’s **native library directory** (executable). `JAVA_HOME` support files unpack from `assets/engine/jre-<abi>.tar.xz` on first start. Compile uses ECJ when `javac` is absent.

## Release signing

Sign `app-release.apk` with your Android keystore before Play Store / school MDM distribution.
