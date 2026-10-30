# Lark Mobile Android client

Build with JDK 17, Android SDK 35 and Gradle 8.9: `gradle -p android assembleDebug lintDebug`.
The resulting development-signed APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Production distribution requires a release signing identity; never publish the development build as a production release.

The app connects to a user-provided HTTPS Lark Mobile host. It does not contain a local JVM. Android must trust the host certificate; certificate errors are never bypassed. The phone link includes a pairing secret; do not share it publicly. No native JavaScript bridge or file access is exposed. Browser clients on iOS/iPadOS use the same HTTPS host link; no native iOS installation is claimed.
