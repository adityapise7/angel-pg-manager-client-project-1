AdiNick
# Angel's PG Management System

Premium PG & Hostel Management software with multi-device real-time Supabase cloud synchronization, account authentication, and native Android application support.

---

## 📱 Native Android APK

The production Android APK is built and ready for installation:

- **APK File**: [`angel-pg-manager.apk`](file:///a:/Aditya/Projects/Angel%20PG/angel-pg-manager/angel-pg-manager.apk)
- **Package ID**: `com.angelpg.manager`
- **Application Name**: `Angel's PG Management`
- **Minimum Android Version**: Android 7.0 (API 24 - Nougat)
- **Target Android Version**: Android 14 (API 34)
- **Package Size**: ~2.87 MB

### Features in Android APK
- **100% Self-Contained & Offline-First**: All frontend assets (HTML, CSS, JS, sound engine, icons, and libraries) are bundled directly inside the APK for instantaneous app launch.
- **Real-Time Supabase Cloud Sync**: Live cloud sync and session persistence across devices via Supabase.
- **Native WhatsApp Integration**: One-click tenant rent reminder dispatch opens the official WhatsApp application via native Android intent.
- **Native File & Photo Chooser**: Direct upload support for tenant Aadhaar cards, KYC documents, and backup JSON files from Android gallery or storage.
- **Hardware Back-Button Navigation**: Native double-tap to exit and seamless in-app back navigation.
- **Haptic Feedback**: Web Audio engine and vibration feedback on tap.

---

## 🛠️ Rebuilding the Android APK

To rebuild the APK at any time after making code changes:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
```

The script automatically:
1. Syncs the latest web assets (`*.js`, `*.css`, `*.html`, images, and `libs/`) into `android/assets/www`.
2. Compiles resources and validates AndroidManifest via `aapt2`.
3. Compiles the Java WebView shell via `javac`.
4. Translates bytecode to Dalvik executable (`classes.dex`) via `d8`.
5. Normalizes POSIX file paths and bundles the APK.
6. Optimizes memory alignment via `zipalign`.
7. Signs and verifies the package via `apksigner` with the release keystore.

---

## 🌐 Web & Cloud Deployment
- **Live Vercel URL**: [angel-pg-management.vercel.app](https://angel-pg-management.vercel.app/)
- **Supabase Project**: `https://epgipizdldvrevihxyqf.supabase.co`
- **Authentication**: Email & Password
