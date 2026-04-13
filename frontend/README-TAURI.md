# Application RFA – version Tauri (Windows)

Version bureau de l'application RFA. Deux modes :

- **Backend Railway (recommandé)** : un seul build, les utilisateurs n'installent que l'app → elle appelle Railway. Fonctionne partout, même pas sur le même réseau.
- **Backend local** : meilleures perfs (latence minimale), mais chaque poste doit lancer le backend.

## Prérequis

- **Node.js** (LTS) et npm
- **Rust** : [rustup](https://rustup.rs/) (`rustup default stable`)
- **Windows** : Visual Studio Build Tools (composants C++ pour la compilation)

## Build pour Railway (le plus simple à diffuser)

1. Dans `frontend/`, copier `.env.example` en `.env` et vérifier:
   - `VITE_USE_REMOTE_API=1`
   - `VITE_API_URL=<URL Railway cible>`
2. Générer les icônes (une fois) : `npm run tauri icon chemin/vers/logo.png`
3. Build :
   ```bash
   cd frontend
   npm run build
   npm run tauri build
   ```
   Les binaires sont dans `src-tauri/target/release/bundle/`. Distribuer le **.msi** : les utilisateurs installent et utilisent l'app, tout part vers Railway (aucun backend à lancer chez eux).

## Lancer en développement

1. Démarrer le backend (depuis la racine du projet) :
   ```bat
   lancer-tauri.bat
   ```
   Ou manuellement :
   - Terminal 1 : `cd backend` puis `python run.py` (ou `venv\Scripts\python run.py`)
   - Terminal 2 : `cd frontend` puis `npm run tauri:dev`

2. L'app s'ouvre dans une fenêtre et appelle le backend sur `http://localhost:8001`. Les données restent sur la machine → **très réactif**.
   (En dev, le mode local est prioritaire tant que `VITE_USE_REMOTE_API` n'est pas à `1`.)

## Build avec backend local (optionnel)

Si tu veux un build où l'app appelle localhost (meilleures perfs, mais l'utilisateur doit lancer le backend) :
mettre `VITE_USE_REMOTE_API=0` dans `.env`, puis `npm run build` et `npm run tauri build`.

Les binaires sont dans :
`frontend/src-tauri/target/release/bundle/`
- **.msi** : installateur Windows
- **.exe** : installateur NSIS

## Diffusion

- Distribuer le **.msi** (ou l'exe d'installation) par lien de téléchargement, partage, etc.
- L'utilisateur installe une fois ; ensuite il lance « RFA Application » comme toute app Windows.
- **Backend Railway** : aucun backend à gérer sur les postes, l'app appelle directement Railway.
- **Backend local** : chaque poste doit aussi lancer le backend (ex. raccourci qui lance backend + Tauri).

## Performances

- **Tauri + backend local** : l'UI et l'API sont sur la même machine → latence minimale, souvent plus fluide que Vercel + Railway.
- **Tauri + backend Railway** : même latence API que le web, mais l'interface est en local (navigation instantanée, pas de rechargement de page).

---

## Mises à jour automatiques

L'app vérifie au démarrage et via **Paramètres → Vérifier les mises à jour** si une nouvelle version est disponible (fichier `latest.json` sur GitHub Releases).

### 1. Générer les clés de signature (une seule fois)

Dans un terminal, à la racine du projet :

```bash
cd frontend
npx tauri signer generate -- -w src-tauri/.tauri-sign.key
```

Entrer un mot de passe (à retenir). Deux fichiers sont créés dans `src-tauri/` :

**Si sous PowerShell tu obtiens l’erreur « stream did not contain valid UTF-8 »** (bug encodage stdin sous Windows), utilise l’un des contournements suivants :

1. **Invite de commandes CMD** : ouvrir **cmd.exe** (et non PowerShell), puis :
   ```bat
   cd /d "C:\Users\marti\Projet rfa 2\frontend"
   npx tauri signer generate -- -w "src-tauri\.tauri-sign.key"
   ```
   Quand on te demande le mot de passe, utilise **uniquement des lettres et chiffres** (pas d’accents) ou appuie sur Entrée pour un mot de passe vide.

2. **Git Bash** (si installé) : même commande que ci-dessus ; l’encodage est en général correct.

3. **PowerShell en UTF-8** : avant la commande, exécuter :
   ```powershell
   [Console]::InputEncoding = [System.Text.Encoding]::UTF8
   [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
   ```
   Puis lancer `npx tauri signer generate ...` et taper un mot de passe **uniquement ASCII** (a-z, 0-9).

**Important :** utilise un **mot de passe non vide** (ex. `rfa2025`). Sous Windows, le mot de passe vide via variable d’environnement ne fonctionne pas. Après génération, crée le fichier `src-tauri/.tauri-sign.password` (une ligne = ton mot de passe) pour que le script de build signé puisse l’utiliser.

- `.tauri-sign.key` : **clé privée** → ne jamais commiter, la sauvegarder en lieu sûr (sans elle tu ne pourras plus publier de mises à jour pour les utilisateurs déjà installés).
- `.tauri-sign.key.pub` : **clé publique**.

Ouvrir `src-tauri/.tauri-sign.key.pub` et **copier tout le contenu** (tout le bloc PEM, de `-----BEGIN` à `-----END`).

Dans `frontend/src-tauri/tauri.conf.json`, section `plugins.updater`, remplacer la valeur de `pubkey` par ce contenu (sur une seule ligne en JSON, avec `\n` pour les retours à la ligne).

### 2. Build avec signature

Le plus simple : depuis `frontend/`, lancer le script qui charge la clé et le mot de passe :

```powershell
cd frontend
.\scripts\build-signed.ps1
```

Le script lit la clé dans `src-tauri/.tauri-sign.key` et le mot de passe dans `src-tauri/.tauri-sign.password` (une ligne). Crée ce fichier `.tauri-sign.password` avec le mot de passe que tu as choisi à l’étape 1 (il est dans le `.gitignore`).

Sinon, en manuel (PowerShell) : définir `TAURI_SIGNING_PRIVATE_KEY` (contenu ou chemin de la clé), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (ton mot de passe), puis `npm run build` et `npm run tauri build`.

Les artefacts de mise à jour sont générés dans `src-tauri/target/release/bundle/` (ex. `msi/` et `nsis/`) : **.msi**, **.msi.sig**, **.exe**, **.exe.sig**.

### 3. Publier une release sur GitHub

1. Créer une **release** (tag, ex. `v0.1.0`) sur le dépôt GitHub (Marsou60/project-rfa-2).
2. Téléverser les fichiers du build :
   - Le **.msi** (ou l’exe NSIS) généré.
   - Le fichier **.sig** correspondant (même nom + `.sig`).
3. Créer un fichier **latest.json** au format suivant (adapter `version`, `url` et `signature`) :

```json
{
  "version": "0.1.0",
  "notes": "Description des changements",
  "pub_date": "2025-01-15T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENU_ENTIER_DU_FICHIER_.msi.sig",
      "url": "https://github.com/Marsou60/project-rfa-2/releases/download/v0.1.0/NOM_DU_FICHIER.msi"
    }
  }
}
```

- **signature** : copier-coller **tout** le contenu du fichier `.msi.sig` (une seule ligne en JSON, avec `\n` si besoin).
- **url** : lien direct vers le .msi (ou .exe) téléversé sur la release (bouton "Upload" des assets de la release, puis clic droit sur le fichier → Copier l’adresse du lien).

4. Téléverser **latest.json** comme asset de la **même** release. Pour générer `latest.json` automatiquement après un build signé : depuis `frontend/`, lancer `node scripts/gen-latest-json.js 0.1.0 https://github.com/Marsou60/project-rfa-2/releases/download/v0.1.0` (adapter version et URL).

L’URL configurée dans l’app est :  
`https://github.com/Marsou60/project-rfa-2/releases/latest/download/latest.json`  
→ il faut que la release marquée comme **Latest release** sur GitHub contienne bien un asset nommé **latest.json**.

### Côté utilisateurs

- Au démarrage, l’app vérifie en arrière-plan si une mise à jour existe.
- Une modale « Mise à jour disponible » s’affiche si une version plus récente est trouvée ; l’utilisateur peut cliquer sur **Installer** (téléchargement puis redémarrage).
- Il peut aussi aller dans **Paramètres** et cliquer sur **Vérifier les mises à jour** à tout moment.
