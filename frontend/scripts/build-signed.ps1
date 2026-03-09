# Build Tauri avec signature (mises à jour auto)
# Mot de passe : mettre le mot de passe de la clé dans src-tauri/.tauri-sign.password (une ligne, pas de retour à la ligne en trop)
$ErrorActionPreference = "Stop"
$srcTauri = Join-Path $PSScriptRoot "..\src-tauri"
$keyPath = Join-Path $srcTauri ".tauri-sign.key"
$passwordPath = Join-Path $srcTauri ".tauri-sign.password"
if (-not (Test-Path $keyPath)) {
    Write-Error "Fichier clé introuvable: $keyPath. Lance d'abord: npx tauri signer generate -- -w src-tauri/.tauri-sign.key"
}
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).TrimEnd()
if (Test-Path $passwordPath) {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content $passwordPath -Raw).TrimEnd()
} else {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
}
Set-Location (Join-Path $PSScriptRoot "..")
npm run build
npm run tauri build
Write-Host "Build signé terminé. Fichiers dans src-tauri/target/release/bundle/"
