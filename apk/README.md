# Lark Mobile APK

Android shell for the overhauled Lark Mobile IDE (Capacitor + WebView).

## What it is

- Native APK wrapper around `web-mobile/`
- Same Desk themes and engine APIs as Desktop / Executable
- Connects to a **Lark Mobile host** on your Wi‑Fi (pair code) so the phone can write, compile, run, and debug Java

> Compile/run still need a JDK. The phone UI is the IDE; the host PC (or a future on-device engine) is the compiler.

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
