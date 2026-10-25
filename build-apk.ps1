# ============================================================
# ANGELS PG MANAGEMENT - ANDROID APK BUILD SCRIPT
# Produces high-performance, standalone signed Android APK
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   ANGELS PG MANAGEMENT - NATIVE ANDROID APK BUILD   " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Environment and Paths Configuration
$SDK_ROOT = "C:\Users\Aditya Pise\AppData\Local\Android\Sdk"
$BUILD_TOOLS_DIR = "$SDK_ROOT\build-tools\35.0.0"
if (-not (Test-Path $BUILD_TOOLS_DIR)) {
    $BUILD_TOOLS_DIR = "$SDK_ROOT\build-tools\34.0.0"
}
$PLATFORM_JAR = "$SDK_ROOT\platforms\android-34\android.jar"
if (-not (Test-Path $PLATFORM_JAR)) {
    $PLATFORM_JAR = "$SDK_ROOT\platforms\android-36\android.jar"
}

$AAPT2 = "$BUILD_TOOLS_DIR\aapt2.exe"
$D8 = "$BUILD_TOOLS_DIR\d8.bat"
$ZIPALIGN = "$BUILD_TOOLS_DIR\zipalign.exe"
$APKSIGNER = "$BUILD_TOOLS_DIR\apksigner.bat"

$JAVAC = "C:\Program Files\Java\jdk-24\bin\javac.exe"
$KEYTOOL = "C:\Program Files\Java\jdk-24\bin\keytool.exe"

Write-Host "[1/8] Environment verified:" -ForegroundColor Green
Write-Host "  - Build Tools: $BUILD_TOOLS_DIR"
Write-Host "  - Platform JAR: $PLATFORM_JAR"
Write-Host "  - Java Compiler: $JAVAC"

# 2. Sync Web Assets to Android bundle
Write-Host ""
Write-Host "[2/8] Synchronizing web application assets..." -ForegroundColor Yellow
$assetDest = "android\assets\www"
New-Item -ItemType Directory -Force -Path "$assetDest\libs" | Out-Null

$webFiles = @(
    "index.html", "style.css", "responsive.css", "app.js", "cloud-db.js", "supabase-client.js",
    "sounds.js", "data.js", "aadhaar.js", "whatsapp.js", "dashboard.js", "rooms.js",
    "tenants.js", "rent.js", "history.js", "custom-date-picker.js", "expenses.js",
    "map.js", "settings.js", "business-card.js", "agreements.js", "chatbot.js",
    "angel-logo.png", "rudra-logo.png", "demo-logo.jpg"
)

foreach ($f in $webFiles) {
    if (Test-Path $f) {
        Copy-Item -Path $f -Destination "$assetDest\$f" -Force
    }
}
Copy-Item -Path "libs\*" -Destination "$assetDest\libs" -Recurse -Force
if (Test-Path "assets") {
    Copy-Item -Path "assets" -Destination "$assetDest\" -Recurse -Force
}
Write-Host "  Assets synchronized to $assetDest" -ForegroundColor Green

# 3. Clean and prepare build folders
Write-Host ""
Write-Host "[3/8] Preparing build directories..." -ForegroundColor Yellow
$buildDir = "android\build"
if (Test-Path $buildDir) { Remove-Item -Path $buildDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$buildDir\compiled_res", "$buildDir\gen", "$buildDir\classes" | Out-Null

# 4. Compile Resources with AAPT2
Write-Host ""
Write-Host "[4/8] Compiling resources with aapt2..." -ForegroundColor Yellow
& $AAPT2 compile --dir "android\res" -o "$buildDir\compiled_res\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed with exit code $LASTEXITCODE" }

# 5. Link Resources with AAPT2
Write-Host ""
Write-Host "[5/8] Linking manifest and resources..." -ForegroundColor Yellow
$baseApk = "$buildDir\app-base.apk"
& $AAPT2 link -I $PLATFORM_JAR --manifest "android\AndroidManifest.xml" -o $baseApk --java "$buildDir\gen" --auto-add-overlay "$buildDir\compiled_res\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed with exit code $LASTEXITCODE" }

# 6. Compile Java Source Code
Write-Host ""
Write-Host "[6/8] Compiling Android Java wrapper..." -ForegroundColor Yellow
& $JAVAC --release 8 -cp "$PLATFORM_JAR" -d "$buildDir\classes" "$buildDir\gen\com\angelpg\manager\R.java" "android\src\com\angelpg\manager\MainActivity.java"
if ($LASTEXITCODE -ne 0) { throw "javac compilation failed with exit code $LASTEXITCODE" }

# 7. Convert Java Classes to Dalvik Executable (classes.dex)
Write-Host ""
Write-Host "[7/8] Producing classes.dex with D8..." -ForegroundColor Yellow
$classFiles = (Get-ChildItem -Path "$buildDir\classes" -Filter "*.class" -Recurse | Select-Object -ExpandProperty FullName)
& $D8 --min-api 24 --lib $PLATFORM_JAR --output $buildDir $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 conversion failed with exit code $LASTEXITCODE" }

# Inject classes.dex and web assets into APK with normalized POSIX forward slashes
Write-Host "  Injecting classes.dex and assets with normalized POSIX paths..." -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($baseApk, [System.IO.Compression.ZipArchiveMode]::Update)

# Add classes.dex
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$buildDir\classes.dex", "classes.dex") | Out-Null

# Add all files from android\assets with forward slashes
$assetRoot = (Resolve-Path "android\assets").Path
$assetFiles = Get-ChildItem -Path $assetRoot -Recurse -File
foreach ($af in $assetFiles) {
    $rel = $af.FullName.Substring($assetRoot.Length).TrimStart([char]92, [char]47)
    $entryName = "assets/" + $rel.Replace([char]92, [char]47)
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $af.FullName, $entryName) | Out-Null
}
$zip.Dispose()

# 8. Align and Sign APK
Write-Host ""
Write-Host "[8/8] Aligning and signing APK..." -ForegroundColor Yellow
$alignedApk = "$buildDir\app-aligned.apk"
& $ZIPALIGN -f -p 4 $baseApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw "zipalign failed with exit code $LASTEXITCODE" }

$keystore = "android\release.keystore"
if (-not (Test-Path $keystore)) {
    & $KEYTOOL -genkeypair -v -keystore $keystore -alias "angelpg" -keyalg RSA -keysize 2048 -validity 10000 -storepass "angelpg123" -keypass "angelpg123" -dname "CN=AngelPG, OU=Management, O=AngelPG, L=Mumbai, ST=Maharashtra, C=IN"
}

$outputApk = "angel-pg-manager.apk"
& $APKSIGNER sign --ks $keystore --ks-pass "pass:angelpg123" --key-pass "pass:angelpg123" --out $outputApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed with exit code $LASTEXITCODE" }

# Verify Signature
& $APKSIGNER verify -v $outputApk
if ($LASTEXITCODE -ne 0) { throw "apksigner verification failed with exit code $LASTEXITCODE" }

$apkItem = Get-Item $outputApk
$rawLen = $apkItem.Length
$apkSizeMB = [math]::Round($rawLen / 1048576, 2)

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host "   BUILD SUCCESSFUL! (APK Ready for Android)" -ForegroundColor Green
Write-Host "   APK Output: $outputApk" -ForegroundColor Green
Write-Host "   File Size : $apkSizeMB MB ($rawLen bytes)" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
