# Lark Mobile APK

Android shell for the overhauled Lark Mobile IDE (Capacitor + WebView).

## What it is

- Native APK wrapper around `web-mobile/`
- Same Desk themes and engine APIs as Desktop / Executable
- **On-device engine:** downloads an Android OpenJDK JRE (~40 MB), ships ECJ for compile, runs `lark.Mobile` on `127.0.0.1`
- **Fallback:** Wi‑Fi host pairing when Android blocks executing a downloaded JDK (common on Android 10+)

### First-run (on-device)

1. Install the APK  
2. Tap **Install JDK on phone** (one-time download)  
3. Tap **Start on-device**  
4. Code as usual  

If start fails with a permission error, use host pairing instead.

## Build a debug APK

Requires Node 20+, JDK 17+, Android SDK / command-line tools.

```bash
cd apk
npm install
npm run sync-www
npx cap add android   # first time only
npm run build:apk
```

Debug APK path:

```text
apk/android/app/build/outputs/apk/debug/app-debug.apk
```

Install:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## First run on a phone

1. On a PC: start **Lark Mobile** (`java -cp lark.jar lark.Mobile` or the Mobile zip).
2. Copy the **Phone URL / pair code** from the host Home screen.
3. In the APK: paste host URL (`http://LAN-IP:port`) and pair code → **Connect**.
4. Create or open a project and code.

## Release signing

Sign `app-release.apk` with your Android keystore before Play Store / school MDM distribution.
