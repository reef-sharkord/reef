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

Write-Host "Building standalone web bundle + syncing Capacitor..."
Push-Location $mobile
& $bun run build:web
& $bun x cap sync android
Pop-Location

$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Write-Host "Running gradle $task ..."
Push-Location (Join-Path $mobile 'android')
& .\gradlew.bat $task --no-daemon
Pop-Location

$variant = if ($Release) { 'release' } else { 'debug' }
Write-Host "APK: $mobile\android\app\build\outputs\apk\$variant\"
