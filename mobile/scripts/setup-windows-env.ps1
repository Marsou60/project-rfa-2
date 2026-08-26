# Configure JAVA_HOME + ANDROID_HOME pour Expo / Android (Windows utilisateur)
$ErrorActionPreference = "Stop"

$androidHome = Join-Path $env:LOCALAPPDATA "Android\Sdk"
if (-not (Test-Path $androidHome)) {
    Write-Error "Android SDK introuvable: $androidHome. Ouvre Android Studio une fois pour installer le SDK."
}

$javaHome = Get-ChildItem "C:\Program Files\Microsoft" -Filter "jdk-17*" -Directory -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $javaHome) {
    $studioJbr = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $studioJbr) { $javaHome = $studioJbr }
}
if (-not $javaHome) {
    Write-Error "JDK introuvable. Installe Microsoft OpenJDK 17 (winget install Microsoft.OpenJDK.17)."
}

[Environment]::SetEnvironmentVariable("ANDROID_HOME", $androidHome, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $androidHome, "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "User")

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$toAdd = @(
    (Join-Path $androidHome "platform-tools"),
    (Join-Path $androidHome "emulator"),
    (Join-Path $javaHome "bin")
)
foreach ($p in $toAdd) {
    if ($userPath -notlike "*$p*") {
        $userPath = if ([string]::IsNullOrEmpty($userPath)) { $p } else { "$userPath;$p" }
    }
}
[Environment]::SetEnvironmentVariable("Path", $userPath, "User")

Write-Host "OK — ANDROID_HOME=$androidHome"
Write-Host "OK — JAVA_HOME=$javaHome"
Write-Host "Ferme et rouvre ton terminal / Cursor pour appliquer le PATH."
