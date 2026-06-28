# Build the Uncord Android APK headlessly, using the local toolchain installed
# under %USERPROFILE%\android-tools (JDK 17 + Android SDK 34). No Android Studio
# required. Produces an installable debug APK (debug-signed) at:
#   mobile/android/app/build/outputs/apk/debug/app-debug.apk
#
# Usage:  pwsh mobile/build-apk.ps1
#         pwsh mobile/build-apk.ps1 -Release   # unsigned release APK (needs a keystore to sign)
param([switch]$Release)

$ErrorActionPreference = 'Stop'

$tools = Join-Path $env:USERPROFILE 'android-tools'
$jdk = Get-ChildItem -Directory $tools -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'jdk-17*' } | Select-Object -First 1

if (-not $jdk) {
  throw "JDK 17 not found under $tools. See NATIVE_SHELLS.md for the one-time toolchain setup."
}

$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = Join-Path $tools 'android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$mobile = Split-Path -Parent $PSCommandPath
$bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
$client = Resolve-Path (Join-Path $mobile '..\apps\client')

# Build the standalone web bundle straight into mobile/www. Run from apps/client
# with `bun run vite` so vite resolves from the client's node_modules (a bare
# `cd ... && vite` from the mobile package fails to find vite, which previously
# left a STALE www packaged into the APK). Hard-fail if the web build fails.
Write-Host "Building standalone web bundle..."
$env:VITE_STANDALONE = 'true'
Push-Location $client
& $bun run vite build --base=./ --outDir ../../mobile/www --emptyOutDir
$webExit = $LASTEXITCODE
Pop-Location
if ($webExit -ne 0) { throw "Web build failed (exit $webExit); aborting APK build." }

Write-Host "Syncing Capacitor..."
Push-Location $mobile
& $bun x cap sync android
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "cap sync failed; aborting." }
Pop-Location

$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Write-Host "Running gradle $task ..."
Push-Location (Join-Path $mobile 'android')
& .\gradlew.bat $task --no-daemon
$gradleExit = $LASTEXITCODE
Pop-Location
if ($gradleExit -ne 0) { throw "Gradle $task failed (exit $gradleExit)." }

$variant = if ($Release) { 'release' } else { 'debug' }
Write-Host "APK: $mobile\android\app\build\outputs\apk\$variant\"
