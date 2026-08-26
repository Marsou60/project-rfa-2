# Guide débutant — App mobile RFA (Windows)

Ce dossier `mobile/` est l’app **Expo** (Android + iOS) en **consultation seulement**.
Elle parle à la **même API Railway** que le site web. On ne recrée pas le métier.

## Version Expo (important)

Le projet est en **Expo SDK 54**, aligné avec **Expo Go du Play Store / App Store**.
Les SDK plus récents (55+) ne marchent souvent **pas** avec Expo Go du store — ce n’est pas un bug de ton téléphone.

## Déjà installé sur ta machine (session d’installation)

| Outil | Statut |
|-------|--------|
| Node.js + npm | OK (v22) |
| Git | OK |
| Android Studio + SDK | OK (déjà présent) |
| Microsoft OpenJDK 17 | Installé via winget |
| Projet Expo `mobile/` | Créé |

## À faire **une fois** : variables d’environnement Windows

1. Ouvre PowerShell **en tant qu’utilisateur normal** (pas besoin admin si déjà installé).
2. Depuis la racine du repo, lance :

```powershell
cd "C:\Users\marti\Projet rfa 2\mobile"
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-env.ps1
```

3. **Ferme et rouvre** Cursor / le terminal pour que `JAVA_HOME` et `ANDROID_HOME` soient pris en compte.

Vérification :

```powershell
java -version
adb version
echo $env:ANDROID_HOME
```

## Configurer l’URL de l’API

1. Copie le fichier d’exemple :

```powershell
cd "C:\Users\marti\Projet rfa 2\mobile"
copy .env.example .env
```

2. Ouvre `.env` et mets l’URL Railway du backend (la même que `VITE_API_URL` du frontend web), **sans** `/api` à la fin :

```env
EXPO_PUBLIC_API_URL=https://TON-SERVICE.up.railway.app
```

## Lancer l’app (le plus simple : téléphone réel)

### Sur ton téléphone

1. Installe **Expo Go** :
   - Android : [Google Play — Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - iPhone : App Store — « Expo Go »
2. Téléphone et PC sur le **même Wi‑Fi**.

### Sur le PC

```powershell
cd "C:\Users\marti\Projet rfa 2\mobile"
npm start
```

Un QR code s’affiche :
- **Android** : ouvre Expo Go → Scan
- **iPhone** : appareil photo → ouvre dans Expo Go

Tu dois voir l’écran de login RFA.

## Alternative : émulateur Android

1. Ouvre **Android Studio** → Device Manager → crée/lance un Pixel (API 34+).
2. Puis :

```powershell
cd "C:\Users\marti\Projet rfa 2\mobile"
npm run android
```

## iPhone / App Store

- **Pas besoin de Mac** pour développer avec Expo Go + builds cloud (EAS) plus tard.
- Compte Apple Developer (~99 €/an) seulement quand tu voudras publier sur l’App Store.

## Build APK (test interne, sans Expo Go)

Prérequis : compte gratuit sur [expo.dev](https://expo.dev).

```powershell
cd "C:\Users\marti\Projet rfa 2\mobile"
npx eas login
npx eas build:configure
npx eas build -p android --profile preview
```

Le profil `preview` produit un **APK**. Lien de téléchargement sur expo.dev → installer sur le téléphone (autoriser sources inconnues si besoin).

API Railway déjà dans `eas.json`. Icône = logo Groupement Union.

## Ce qu’on ne fait PAS dans `mobile/`

- Pas d’import Excel / pas d’export
- Pas d’admin contrats / users
- Pas de second Railway
- Ne pas modifier `frontend/` dans une session « mobile » sauf accord

## En cas de blocage

Dis à Cursor : **« session mobile »** et colle le message d’erreur complet du terminal.
